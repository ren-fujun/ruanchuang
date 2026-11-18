import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { chromium } from 'playwright'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = value
    index += 1
  }
  return args
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
}

const args = parseArgs(process.argv.slice(2))
const baseUrl = (args['base-url'] || process.env.E2E_BASE_URL || 'http://127.0.0.1:5180').replace(/\/$/, '')
const browserChannel = args.browser || process.env.E2E_BROWSER_CHANNEL || 'msedge'
const artifactRoot = join(process.cwd(), 'artifacts', `e2e-${timestamp()}`)
mkdirSync(artifactRoot, { recursive: true })

const results = []
const consoleErrors = []
let studentId = ''
let ticketId = ''
let ticketTitle = ''

const browser = await chromium.launch({ channel: browserChannel, headless: true })
const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
const counselorContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
const studentPage = await studentContext.newPage()
const counselorPage = await counselorContext.newPage()

for (const [role, page] of [['student', studentPage], ['counselor', counselorPage]]) {
  page.on('pageerror', (error) => consoleErrors.push(`[${role}] ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`[${role}] ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      consoleErrors.push(`[${role}] HTTP ${response.status()} ${response.url()}`)
    }
  })
}

async function step(name, page, action) {
  const startedAt = Date.now()
  console.log(`START ${name}`)
  try {
    const evidence = await action()
    const elapsedMs = Date.now() - startedAt
    const screenshot = join(artifactRoot, `${String(results.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    results.push({ name, ok: true, elapsedMs, evidence, screenshot })
    console.log(`PASS  ${name} (${elapsedMs} ms) ${evidence || ''}`)
    return evidence
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    const screenshot = join(artifactRoot, `${String(results.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-failed.png`)
    try {
      await page.screenshot({ path: screenshot, fullPage: true })
    } catch {
      // Keep the original failure.
    }
    results.push({ name, ok: false, elapsedMs, evidence: error.message, screenshot })
    console.error(`FAIL  ${name}: ${error.stack || error.message}`)
    throw error
  }
}

async function quickLogin(page, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  const label = role === 'student' ? /学生视角/ : /辅导员视角/
  await page.getByRole('button', { name: label }).click()
  await page.waitForURL(role === 'student' ? '**/student/home' : '**/counselor/home')
}

async function readTicketFromApi(page, id) {
  return page.evaluate(async (ticketIdToRead) => {
    const token = localStorage.getItem('zhihui_token')
    const response = await fetch(`/api/tickets/${encodeURIComponent(ticketIdToRead)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return { status: response.status, body: await response.json() }
  }, id)
}

let failure = null
try {
  await step('学生登录', studentPage, async () => {
    await quickLogin(studentPage, 'student')
    const me = await studentPage.evaluate(async () => {
      const token = localStorage.getItem('zhihui_token')
      const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
      return response.json()
    })
    studentId = me.data.user.id
    return `user.id=${studentId}；role=${me.data.user.role}`
  })

  ticketTitle = `宿舍水管漏水 ${Date.now().toString(36)}`
  await step('学生提交工单', studentPage, async () => {
    await studentPage.goto(`${baseUrl}/student/new`, { waitUntil: 'domcontentloaded' })
    await studentPage.getByPlaceholder(/比如：宿舍热水/).fill(
      `${ticketTitle}。卫生间水管一直滴水，地面已经有积水，需要维修师傅尽快上门处理。`,
    )
    await studentPage.getByPlaceholder('楼栋 / 教室 / 线上').fill('学生公寓 3 号楼 412')
    await studentPage.getByRole('button', { name: '让 AI 先看看' }).click()
    const submitButton = studentPage.getByRole('button', { name: /^(确认提交|仍要提交|核对后提交草稿)$/ })
    await submitButton.waitFor({ state: 'visible', timeout: 30000 })
    await submitButton.click()
    await studentPage.getByText('已经接住了。').waitFor({ state: 'visible', timeout: 20000 })
    const idText = await studentPage.getByText(/提交编号 ·/).innerText()
    ticketId = idText.split('·').at(-1).trim()
    assert(/^ZX\d+$/.test(ticketId), `无法识别工单号: ${idText}`)
    await studentPage.getByRole('button', { name: '查看办理进度' }).click()
    await studentPage.waitForURL(`**/student/tickets/${ticketId}`)
    const detail = await readTicketFromApi(studentPage, ticketId)
    assert(detail.status === 200, `详情接口 HTTP ${detail.status}`)
    assert(detail.body.code === 0, `详情接口 code=${detail.body.code}`)
    assert(detail.body.data.ticket.status === 'pending_review', `新工单状态=${detail.body.data.ticket.status}`)
    assert(detail.body.data.ticket.studentId === studentId, '新工单不属于当前学生')
    return `ticketId=${ticketId}；status=pending_review；studentId=${studentId}`
  })

  await step('辅导员登录', counselorPage, async () => {
    await quickLogin(counselorPage, 'counselor')
    await counselorPage.goto(`${baseUrl}/counselor/tickets/${ticketId}`, { waitUntil: 'domcontentloaded' })
    await counselorPage.getByRole('button', { name: '审核并分派' }).waitFor({ state: 'visible', timeout: 20000 })
    return `已打开工单 ${ticketId}`
  })

  await step('辅导员审核分派', counselorPage, async () => {
    await counselorPage.getByRole('button', { name: '审核并分派' }).click()
    const dialog = counselorPage.getByRole('dialog', { name: '审核并分派' })
    await dialog.waitFor({ state: 'visible' })
    const adopt = dialog.getByRole('button', { name: '一键采纳' })
    if (await adopt.isVisible().catch(() => false)) await adopt.click()
    await dialog.getByRole('button', { name: '确认分派' }).click()
    await counselorPage.getByRole('button', { name: '记录部门接单' }).waitFor({ state: 'visible', timeout: 20000 })
    const detail = await readTicketFromApi(counselorPage, ticketId)
    assert(detail.body.data.ticket.status === 'assigned', `分派后状态=${detail.body.data.ticket.status}`)
    return `status=assigned；departments=${detail.body.data.ticket.departments.map((item) => item.short).join('、')}`
  })

  await step('部门接单', counselorPage, async () => {
    await counselorPage.getByRole('button', { name: '记录部门接单' }).click()
    const dialog = counselorPage.getByRole('dialog', { name: '记录部门接单' })
    await dialog.getByRole('button', { name: '确认接单' }).click()
    await counselorPage.getByRole('button', { name: '录入处置结果' }).waitFor({ state: 'visible', timeout: 20000 })
    const detail = await readTicketFromApi(counselorPage, ticketId)
    assert(detail.body.data.ticket.status === 'processing', `接单后状态=${detail.body.data.ticket.status}`)
    return 'status=processing'
  })

  await step('录入处置结果', counselorPage, async () => {
    await counselorPage.getByRole('button', { name: '录入处置结果' }).click()
    const dialog = counselorPage.getByRole('dialog', { name: '录入处置结果' })
    await dialog.locator('textarea').fill('维修师傅已更换水管接头并清理积水，现场测试不再漏水。')
    await dialog.getByRole('button', { name: '完成并通知学生' }).click()
    await counselorPage.getByRole('button', { name: '提醒学生确认' }).waitFor({ state: 'visible', timeout: 20000 })
    const detail = await readTicketFromApi(counselorPage, ticketId)
    assert(detail.body.data.ticket.status === 'awaiting_confirm', `处置后状态=${detail.body.data.ticket.status}`)
    return 'status=awaiting_confirm'
  })

  await step('学生确认并评价', studentPage, async () => {
    await studentPage.goto(`${baseUrl}/student/tickets/${ticketId}`, { waitUntil: 'domcontentloaded' })
    await studentPage.getByRole('button', { name: '确认办结' }).waitFor({ state: 'visible', timeout: 20000 })
    await studentPage.getByRole('button', { name: '确认办结' }).click()
    const dialog = studentPage.getByRole('dialog', { name: '这次办理，解决问题了吗？' })
    await dialog.getByRole('button', { name: '处理到位' }).click()
    await dialog.locator('textarea.rating-comment').fill('维修很及时，处理完还帮忙清理了积水。')
    await dialog.getByRole('button', { name: '确认办结并评价' }).click()
    await studentPage.getByText(/你为这次服务打了 5 星/).waitFor({ state: 'visible', timeout: 20000 })
    const detail = await readTicketFromApi(studentPage, ticketId)
    const ticket = detail.body.data.ticket
    assert(ticket.status === 'completed', `确认后状态=${ticket.status}`)
    assert(ticket.rating?.score === 5, `评价分数=${ticket.rating?.score}`)
    assert(ticket.rating?.comment.includes('维修很及时'), '评价内容未保存')
    assert(ticket.timeline.some((event) => event.type === 'completed'), '时间线缺少学生确认事件')
    return `status=completed；rating=${ticket.rating.score} 星；timeline=${ticket.timeline.length} 条`
  })

  await step('移动端无横向溢出', studentPage, async () => {
    const overflow = await studentPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    assert(overflow.scrollWidth <= overflow.innerWidth, `页面横向溢出: ${overflow.scrollWidth} > ${overflow.innerWidth}`)
    return `${overflow.innerWidth}px 视口；scrollWidth=${overflow.scrollWidth}`
  })
} catch (error) {
  failure = error
}

const passed = results.filter((item) => item.ok).length
const failed = results.length - passed
const reportPath = join(artifactRoot, 'report.md')
const lines = [
  '# Day 5 全链路 E2E 报告',
  '',
  `- 执行时间：${new Date().toISOString()}`,
  `- 前端：${baseUrl}`,
  `- 浏览器：Microsoft Edge（Playwright，390 × 844）`,
  `- 工单号：${ticketId || '未创建'}`,
  `- 结果：${passed} 项通过，${failed} 项失败`,
  '',
  '| 步骤 | 结果 | 耗时 | 证据 | 截图 |',
  '| --- | --- | ---: | --- | --- |',
  ...results.map((item) => `| ${item.name} | ${item.ok ? '已通' : '失败'} | ${item.elapsedMs} ms | ${String(item.evidence).replaceAll('|', '\\|')} | [查看](${relative(artifactRoot, item.screenshot).replaceAll('\\', '/')}) |`),
  '',
  '## 控制台异常',
  '',
  consoleErrors.length ? consoleErrors.map((item) => `- ${item}`).join('\n') : '- 无',
  '',
]
writeFileSync(reportPath, lines.join('\n'), 'utf8')
console.log(`REPORT ${reportPath}`)

await studentContext.close()
await counselorContext.close()
await browser.close()

if (failure) {
  console.error(`E2E FAILED: ${failure.message}`)
  process.exitCode = 1
}
