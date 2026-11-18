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
const artifactRoot = join(process.cwd(), 'artifacts', `critical-${timestamp()}`)
mkdirSync(artifactRoot, { recursive: true })

const results = []
const browser = await chromium.launch({ channel: browserChannel, headless: true })

async function runCheck({ id, severity, name, page, expectFailure = false }, action) {
  const startedAt = Date.now()
  try {
    const evidence = await action()
    const elapsedMs = Date.now() - startedAt
    let screenshot = null
    if (page) {
      screenshot = join(artifactRoot, `${id}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {})
    }
    if (expectFailure) {
      results.push({ id, severity, name, ok: false, elapsedMs, evidence, screenshot, expected: '应拦截但未拦截' })
      console.error(`FAIL  ${id} [${severity}] ${name}: ${evidence}`)
    } else {
      results.push({ id, severity, name, ok: true, elapsedMs, evidence, screenshot })
      console.log(`PASS  ${id} [${severity}] ${name}: ${evidence}`)
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    let screenshot = null
    if (page) {
      screenshot = join(artifactRoot, `${id}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-failed.png`)
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {})
    }
    results.push({ id, severity, name, ok: false, elapsedMs, evidence: error.message, screenshot })
    console.error(`FAIL  ${id} [${severity}] ${name}: ${error.message}`)
  }
}

async function loginByApi(role) {
  const response = await fetch(`${baseUrl}/api/auth/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  const body = await response.json()
  assert(response.status === 200 && body.code === 0, `登录失败 HTTP ${response.status}`)
  return body.data.token
}

async function quickLogin(page, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: role === 'student' ? /学生视角/ : /辅导员视角/ }).click()
  await page.waitForURL(role === 'student' ? '**/student/home' : '**/counselor/home')
}

const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
const guestPage = await guestContext.newPage()
const studentPage = await studentContext.newPage()

const consoleErrors = []
for (const page of [guestPage, studentPage]) {
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text())
    }
  })
}

await runCheck({ id: 'P0-01', severity: 'P0', name: '无 Token 接口返回 401', page: null }, async () => {
  const response = await fetch(`${baseUrl}/api/tickets`)
  const body = await response.json()
  assert(response.status === 401, `期望 HTTP 401，实际 ${response.status}`)
  assert(body.code === 40101, `期望 code=40101，实际 ${body.code}`)
  assert(body.data === null, '错误响应 data 必须为 null')
  return `HTTP 401；code=40101；data=null`
})

await runCheck({ id: 'P0-02', severity: 'P0', name: '未登录页面跳转登录', page: guestPage }, async () => {
  await guestPage.goto(`${baseUrl}/student/home`, { waitUntil: 'domcontentloaded' })
  await guestPage.waitForURL('**/login', { timeout: 10000 })
  return `student/home → ${new URL(guestPage.url()).pathname}`
})

await runCheck({ id: 'P0-03', severity: 'P0', name: '学生调用辅导员接口返回 403', page: null }, async () => {
  const token = await loginByApi('student')
  const response = await fetch(`${baseUrl}/api/counselor/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await response.json()
  assert(response.status === 403, `期望 HTTP 403，实际 ${response.status}`)
  assert(body.code === 40301, `期望 code=40301，实际 ${body.code}`)
  return `HTTP 403；code=40301`
})

await runCheck({ id: 'P0-06', severity: 'P0', name: '学生访问他人工单返回 403', page: null }, async () => {
  const studentToken = await loginByApi('student')
  const counselorToken = await loginByApi('counselor')
  const listResponse = await fetch(`${baseUrl}/api/tickets?status=all&pageSize=50`, {
    headers: { Authorization: `Bearer ${counselorToken}` },
  })
  const listBody = await listResponse.json()
  assert(listResponse.status === 200 && listBody.code === 0, `工单列表 HTTP ${listResponse.status}`)
  const foreignTicket = listBody.data.tickets.find((ticket) => ticket.studentId !== 'stu-lin')
  assert(foreignTicket, '没有找到其他学生的工单，无法执行越权检查')
  const response = await fetch(`${baseUrl}/api/tickets/${encodeURIComponent(foreignTicket.id)}`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  })
  const body = await response.json()
  assert(response.status === 403, `访问 ${foreignTicket.id} 期望 HTTP 403，实际 ${response.status}`)
  assert(body.code === 40301, `期望 code=40301，实际 ${body.code}`)
  assert(body.data === null, '越权响应不得返回工单数据')
  return `目标工单=${foreignTicket.id}；归属=${foreignTicket.studentName}；HTTP 403`
})

await runCheck({ id: 'P0-04', severity: 'P0', name: '无模型 Key 时 AI 本地兜底', page: null }, async () => {
  const token = await loginByApi('student')
  const response = await fetch(`${baseUrl}/api/ai/precheck`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: '图书馆四楼空调温度太低，想反馈一下。', location: '图书馆' }),
  })
  const body = await response.json()
  assert(response.status === 200 && body.code === 0, `预检失败 HTTP ${response.status}`)
  assert(body.data.engine === 'local-rules', `期望 local-rules，实际 ${body.data.engine}`)
  assert(body.data.analysis?.summary, '预检缺少 analysis.summary')
  return `engine=${body.data.engine}；risk=${body.data.analysis.risk}`
})

await runCheck({ id: 'P0-05', severity: 'P0', name: '高风险必须转人工工单', page: studentPage }, async () => {
  await quickLogin(studentPage, 'student')
  await studentPage.goto(`${baseUrl}/student/new`, { waitUntil: 'domcontentloaded' })
  await studentPage.getByPlaceholder(/比如：宿舍热水/).fill('我最近情绪崩溃，真的不想活了，已经想好怎么自杀。')
  await studentPage.getByRole('button', { name: '让 AI 先看看' }).click()
  await studentPage.getByText('这需要被优先看见。').waitFor({ state: 'visible', timeout: 30000 })
  assert(await studentPage.getByText('高风险', { exact: true }).isVisible(), '页面未显示“高风险”')
  assert((await studentPage.getByRole('button', { name: '按指引已解决' }).count()) === 0, '高风险仍允许自助关闭')
  assert(await studentPage.getByRole('button', { name: '确认提交' }).isVisible(), '未提供转工单入口')
  const pageText = await studentPage.locator('body').innerText()
  assert(pageText.includes('紧急救援') || pageText.includes('心理援助'), '缺少紧急求助提示')
  return '风险=高风险；自助关闭=不可用；提交入口=可用'
})

await runCheck({ id: 'P1-01', severity: 'P1', name: '重复提交拦截', page: null, expectFailure: true }, async () => {
  const token = await loginByApi('student')
  const text = `重复提交检测 ${Date.now().toString(36)}，宿舍门锁松动，需要维修。`
  const payload = JSON.stringify({
    description: text,
    title: text.slice(0, 24),
    category: '宿舍生活',
    location: '学生公寓 3 号楼 412',
    urgency: 'normal',
  })
  const send = () => fetch(`${baseUrl}/api/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: payload,
  })
  const first = await send()
  const firstBody = await first.json()
  const second = await send()
  const secondBody = await second.json()
  const firstId = firstBody?.data?.ticket?.id || '未知'
  const secondId = secondBody?.data?.ticket?.id || '未知'
  assert(first.status === 201, `首次提交 HTTP ${first.status}`)
  assert(second.status === 409, `第二次提交未被拦截：HTTP ${second.status}，工单 ${secondId}`)
  return `首次=${firstId}；第二次=HTTP ${second.status}`
})

await runCheck({ id: 'P1-02', severity: 'P1', name: '360px 学生端无横向溢出', page: studentPage }, async () => {
  await studentPage.setViewportSize({ width: 360, height: 844 })
  const checks = []
  for (const path of ['/student/home', '/student/new', '/student/tickets']) {
    await studentPage.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' })
    await studentPage.waitForTimeout(600)
    const size = await studentPage.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    checks.push(`${path}:${size.scrollWidth}/${size.innerWidth}`)
    assert(size.scrollWidth <= size.innerWidth, `${path} 横向溢出 ${size.scrollWidth} > ${size.innerWidth}`)
  }
  return checks.join('；')
})

await runCheck({ id: 'P1-03', severity: 'P1', name: '浏览器控制台无未捕获异常', page: studentPage }, async () => {
  assert(consoleErrors.length === 0, consoleErrors.join(' | '))
  return '未捕获异常=0'
})

const p0Failures = results.filter((item) => item.severity === 'P0' && !item.ok)
const p1Failures = results.filter((item) => item.severity === 'P1' && !item.ok)
const reportPath = join(artifactRoot, 'report.md')
const lines = [
  '# Day 5 关键风险检查',
  '',
  `- 执行时间：${new Date().toISOString()}`,
  `- 前端：${baseUrl}`,
  `- 结果：${results.filter((item) => item.ok).length} 项通过，${results.filter((item) => !item.ok).length} 项未通过`,
  `- P0 未通过：${p0Failures.length}；P1 未通过：${p1Failures.length}`,
  '',
  '| ID | 优先级 | 检查项 | 结果 | 证据 | 截图 |',
  '| --- | --- | --- | --- | --- | --- |',
  ...results.map((item) => `| ${item.id} | ${item.severity} | ${item.name} | ${item.ok ? '已通' : '未通过'} | ${String(item.evidence).replaceAll('|', '\\|')} | ${item.screenshot ? `[查看](${relative(artifactRoot, item.screenshot).replaceAll('\\', '/')})` : '—'} |`),
  '',
  '## 结论',
  '',
  p0Failures.length ? '- 仍有 P0 阻塞，不能进入验收。' : '- 所有已执行 P0 检查通过。',
  p1Failures.length ? '- 存在 P1 缺陷，主链路可演示但需在 Day 6 前修复。' : '- 所有已执行 P1 检查通过。',
  '',
]
writeFileSync(reportPath, lines.join('\n'), 'utf8')
console.log(`REPORT ${reportPath}`)

await guestContext.close()
await studentContext.close()
await browser.close()

if (p0Failures.length) process.exitCode = 1
