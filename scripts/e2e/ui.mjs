import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8788'
const directory = 'screenshots/e2e'
fs.mkdirSync(directory, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = []

async function login(role, name, viewport) {
  const context = await browser.newContext({ viewport, locale: 'zh-CN' })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base + '/login')
  await page.getByRole('button', { name }).click()
  await page.waitForURL('**/' + role + '/home')
  return page
}

async function api(page, path, method = 'GET', data, status = 200) {
  const token = await page.evaluate(() => localStorage.getItem('zhihui_token'))
  const response = await page.request.fetch(base + '/api' + path, {
    method, data, headers: { Authorization: 'Bearer ' + token },
  })
  assert.equal(response.status(), status, method + ' ' + path)
  const payload = await response.json()
  if (status === 200) assert.equal(payload.code, 0)
  return payload.data
}

try {
  const student = await login('student', /学生视角/, { width: 390, height: 844 })
  await student.goto(base + '/student/new')
  await student.locator('textarea').fill('宿舍洗手台水龙头一直漏水，柜子里都是积水，请安排维修人员上门处理。')
  await student.getByRole('button', { name: /让 AI 先看看/ }).click()
  await student.getByText('AI 预检完成').waitFor()
  await student.screenshot({ path: directory + '/01-ai-review.png' })
  await student.getByRole('button', { name: /确认提交|仍要提交/ }).click()
  await student.getByText('已经接住了。').waitFor()
  await student.screenshot({ path: directory + '/02-submitted.png' })
  await student.getByRole('button', { name: /查看办理进度/ }).click()
  await student.waitForURL('**/student/tickets/**')
  const id = new URL(student.url()).pathname.split('/').pop()
  const path = '/tickets/' + id
  const teacher = await login('counselor', /辅导员视角/, { width: 1440, height: 1000 })
  await teacher.locator('.command-hero').waitFor()
  await teacher.screenshot({ path: directory + '/00-teacher-desktop.png' })
  const click = name => teacher.getByRole('button', { name, exact: true }).click()
  await teacher.goto(base + '/counselor/tickets?status=pending_review')
  await click('搜索')
  const search = teacher.getByPlaceholder('搜索工单、学生、类型或编号')
  await search.fill(id)
  await Promise.all([
    teacher.waitForResponse(r => r.url().includes('q=' + id) && r.ok()),
    search.press('Enter'),
  ])
  await teacher.locator('button.ticket-card').click()
  await teacher.waitForURL('**/counselor' + path)
  await click('审核并分派')
  await click('一键采纳')
  await teacher.screenshot({ path: directory + '/03-review-sheet.png' })
  await click('确认分派')
  await teacher.getByText('已分派，等待部门接单', { exact: true }).waitFor()
  assert.equal((await api(student, path)).ticket.status, 'assigned')
  await api(teacher, path + '/progress', 'PATCH', { action: 'resolve', result: '提前办结' }, 409)
  await api(teacher, path + '/review', 'PATCH', {}, 409)
  await api(student, path + '/note', 'POST', { text: '越权' }, 403)

  const internal = '仅辅导员可见的回访安排 ' + id
  await click('添加一条内部跟进备注')
  await teacher.getByPlaceholder('记录电话沟通、线下介入或部门反馈…').fill(internal)
  await click('保存备注')
  await teacher.locator('.note-row').getByText(internal).waitFor()
  await teacher.reload()
  await teacher.locator('.note-row').getByText(internal).waitFor()
  for (const route of [path, '/tickets?q=' + id, '/student/home']) {
    assert.ok(!JSON.stringify(await api(student, route)).includes(internal), route)
  }

  const urge = '请维修组反馈预计到场时间。'
  await click('催办')
  await teacher.locator('textarea.review-note:visible').fill(urge)
  await Promise.all([
    teacher.waitForResponse(response => response.url().endsWith(path + '/urge') && response.ok()),
    click('发送催办'),
  ])
  await teacher.getByRole('button', { name: '发送催办' }).waitFor({state: 'hidden'})
  assert.ok((await api(student, path)).ticket.timeline.some(event => event.type === 'urge' && event.desc === urge))
  await click('记录部门接单')
  await click('确认接单')
  await teacher.getByText('协同处理中', { exact: true }).waitFor()
  assert.equal((await api(student, path)).ticket.status, 'processing')
  await teacher.setViewportSize({width: 390, height: 844})
  const result = '已更换水龙头并检查连接处，试水后无渗漏。'
  await click('录入处置结果')
  await teacher.locator('textarea.review-note:visible').fill(result)
  await teacher.screenshot({ path: directory + '/04-mobile-resolution.png' })
  await click('完成并通知学生')
  await teacher.getByText('已办结，等待学生确认', { exact: true }).waitFor()
  await teacher.screenshot({ path: directory + '/04-resolved.png' })
  await student.reload()
  await student.getByText(result, { exact: true }).first().waitFor()
  const notices = (await api(student, '/notifications')).notifications.filter(item => item.ticketId === id)
  for (const title of ['工单已分派', '部门已接单', '老师已为你催办', '办理结果待确认']) {
    assert.ok(notices.some(item => item.title === title), title)
  }
  await student.getByRole('button', { name: '确认办结', exact: true }).click()
  await student.getByRole('button', { name: '确认办结并评价' }).click()
  await student.getByText('这件事，已收尾。', { exact: true }).waitFor()
  await student.screenshot({path: directory + '/05-student-completed.png'})
  const final = (await api(teacher, path)).ticket
  assert.equal(final.status, 'completed')
  assert.equal(final.rating.score, 5)
  assert.deepEqual(errors, [])
  console.log('PASS', id, '审核分派、内部备注隔离、催办、接单、处置、通知、学生确认及评价均已验证')
} finally {
  await browser.close()
}
