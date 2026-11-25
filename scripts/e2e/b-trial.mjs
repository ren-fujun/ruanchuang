import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer as netServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import path from 'node:path'
import { bTrialFixture } from '../fixtures/b-trial.mjs'
await mkdir('.tmp/b-trial-tests', { recursive: true })
const dir = await mkdtemp(path.resolve('.tmp/b-trial-tests/run-')), file = path.join(dir, 'store.json')
await writeFile(file, JSON.stringify(bTrialFixture()))
async function freePort() {
  for (;;) {
    const s = netServer();
    s.listen(0, '127.0.0.1');
    await once(s, 'listening');
    const port = s.address().port;
    await new Promise(r => s.close(r));
    if (port >= 10000) return port;
  }
}
const port = await freePort(), base = `http://127.0.0.1:${port}/api`
const child = spawn(process.execPath, ['server/index.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), B_DEMO: 'false', ZHIHUI_DATA_FILE: file, DEEPSEEK_API_KEY: '' } })
let logs = '', checks = 0, browser
const servers = []
child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b)
const ok = (value, message) => { assert(value, message); checks++ }
const rid = () => crypto.randomUUID()
async function call(url, token, body, status = 200, method = 'POST') {
  const r = await fetch(base + url, { method: body === undefined ? 'GET' : method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) })
  const data = await r.json(); assert.equal(r.status, status, url + ': ' + JSON.stringify(data)); checks++; return data
}
const login = async account => (await call('/auth/login', null, { account, password: '123456' })).token
try {
  const end = Date.now() + 10000
  while (!logs.includes('已启动')) { if (Date.now() > end || child.exitCode !== null) throw Error(logs || '启动超时'); await new Promise(r => setTimeout(r, 100)) }
  const student = await login('20230118'), graduate = await login('graduate'), counselor = await login('chenyuan'),
    mentor = await login('mentor'), other = await login('mentor-other'), academic = await login('academic'), unknown = await login('unconfigured')
  await call('/b/leaves', null, undefined, 401)
  await call('/b/leaves', academic, undefined, 403)
  ok((await call('/b/leaves/approvers', student)).items[0].id === 'cou-chen')
  ok((await call('/b/leaves/approvers', graduate)).items[0].id === 'mentor-demo')
  ok((await call('/b/leaves/approvers', unknown)).items.length === 0)
  const form = { approverId: 'cou-chen', startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 90000000).toISOString(), reason: '虚构请假测试', requestId: rid() }
  await call('/b/leaves', student, { ...form, approverId: 'mentor-demo' }, 403)
  await call('/b/leaves', graduate, { ...form, approverId: 'mentor-other' }, 403)
  await call('/b/leaves', student, { ...form, endsAt: form.startsAt }, 400)
  let leave = (await call('/b/leaves', student, { ...form, educationLevel: 'postgraduate' }, 201)).item
  ok(leave.educationLevel === 'undergraduate', '不能伪造学历')
  ok((await call('/b/leaves', student, { ...form, educationLevel: 'postgraduate' }, 201)).item.id === leave.id, '创建幂等')
  await call('/b/leaves', student, { ...form, reason: '改内容' }, 409)
  await call('/b/leaves', student, { ...form, requestId: rid() }, 409)
  ok((await call('/b/leaves', graduate)).items.length === 0)
  ok((await call('/b/leaves', mentor)).items.length === 0)
  await call(`/b/leaves/${leave.id}/decision`, mentor, { action: 'approved', note: '越权', version: 1, requestId: rid() }, 403)
  const decision = { action: 'approved', note: '同意测试申请', version: 1, requestId: rid() }
  const decisions = await Promise.all([call(`/b/leaves/${leave.id}/decision`, counselor, decision), call(`/b/leaves/${leave.id}/decision`, counselor, decision)])
  ok(decisions.every(x => x.item.version === 2), '并发重试仅审批一次')
  await call(`/b/leaves/${leave.id}/decision`, counselor, { ...decision, requestId: rid() }, 409)
  ok((await call('/b/leaves', student)).items[0].status === 'approved')
  const gradLeave = (await call('/b/leaves', graduate, { ...form, approverId: 'mentor-demo', requestId: rid() }, 201)).item
  await call(`/b/leaves/${gradLeave.id}/decision`, counselor, decision, 403)
  await call(`/b/leaves/${gradLeave.id}/decision`, mentor, { ...decision, action: 'rejected', requestId: rid() })
  ok((await call('/b/leaves', graduate)).items[0].status === 'rejected')
  console.log('PASS 双路径请假、越权、重复、时间、学历伪造')
  let c = (await call('/b/cases', mentor)).items[0]
  const otherAcademic=await login('academic-other')
  ok((await call('/b/cases',otherAcademic)).items.length===0,'同学院但不在授权学生范围不能查看')
  await call(`/b/cases/${c.id}/result`,otherAcademic,{version:c.version,result:'passed',source:'越权'},403,'PATCH')
  await call('/b/cases',otherAcademic,{studentId:'stu-lin',mentorId:'mentor-demo',counselorId:'cou-chen',course:'越权课程'},400)
  const event = () => ({ type: 'interview', text: '私密测试正文', summary: '已沟通下一步安排', visibility: 'private', version: c.version, requestId: rid() })
  await call(`/b/cases/${c.id}/events`, mentor, event(), 409)
  await call(`/b/cases/${c.id}/collaboration`, other, { action: 'propose', version: c.version, requestId: rid() }, 403)
  c = (await call(`/b/cases/${c.id}/collaboration`, mentor, { action: 'propose', assigneeId: 'cou-chen', plan: '辅导员本次联系，导师协助', version: c.version, requestId: rid() })).item
  await call(`/b/cases/${c.id}/collaboration`, mentor, { action: 'accept', version: c.version, requestId: rid() }, 403)
  c = (await call(`/b/cases/${c.id}/collaboration`, counselor, { action: 'accept', version: c.version, requestId: rid() })).item
  c = (await call(`/b/cases/${c.id}/events`, counselor, event())).item
  ok(c.status === 'interviewed', '不固定必须导师先联系')
  const mentorView = (await call('/b/cases', mentor)).items[0]
  ok(!JSON.stringify(mentorView).includes('私密测试正文'))
  ok(JSON.stringify(mentorView).includes('已沟通下一步安排'))
  ok(!JSON.stringify(await call('/b/cases', academic)).includes('已沟通下一步安排'))
  await call(`/b/cases/${c.id}/events`, mentor, { ...event(), version: 1 }, 409)
  c = (await call(`/b/cases/${c.id}/events`, mentor, { ...event(), visibility: 'shared', text: '双方可见的行动记录' })).item
  ok(JSON.stringify(await call('/b/cases', counselor)).includes('双方可见的行动记录'))
  c = (await call(`/b/cases/${c.id}/collaboration`, counselor, { action: 'propose', assigneeId: 'mentor-demo', plan: '改由导师联系', version: c.version, requestId: rid() })).item
  await call(`/b/cases/${c.id}/events`, counselor, event(), 409)
  c = (await call(`/b/cases/${c.id}/collaboration`, mentor, { action: 'decline', version: c.version, requestId: rid() })).item
  ok(c.collaboration.status === 'unassigned' && c.collaboration.history.length === 4)
  await call(`/b/cases/${c.id}/result`, mentor, { version: c.version, result: 'passed', source: '伪造结果' }, 403, 'PATCH')
  c = (await call(`/b/cases/${c.id}/result`, academic, { version: c.version, result: 'passed', source: '虚构正式结果' }, 200, 'PATCH')).item
  await call(`/b/cases/${c.id}/collaboration`, mentor, { action: 'propose', version: c.version, requestId: rid() }, 409)
  console.log('PASS 学业协商、双方行动、隐私、版本、正式结果')
  for (const [token, text, match] of [[student, '请假找谁审批', '辅导员'], [graduate, '请假找谁审批', '班导师'], [student, '宿舍报修不满意', '后勤'], [student, '学业预警谁联系', '协商']]) {
    const a = await call('/b/assistant', token, { text }); ok(a.action === 'guidance' && a.answer.includes(match))
  }
  ok((await call('/b/assistant', student, { text: '报修消防通道堆满杂物，有严重火灾隐患' })).action === 'urgent_handoff')
  console.log('PASS 新流程AI提示与高风险优先')
  const precheck = await call('/ai/precheck', student, { text: '宿舍水龙头持续漏水需要报修', useLlm: false })
  ok(precheck.graph.primaryDept === 'logistics' && precheck.graph.dispatchPath[0].actor === '待确认')
  ok(precheck.answer.includes('后勤') && !precheck.analysis.draft.includes('已联系'))
  const uiCase = (await call('/b/cases', academic, { studentId: 'stu-lin', mentorId: 'mentor-demo', counselorId: 'cou-chen', course: '浏览器协商课程' }, 201)).item
  process.env.PORTAL_API_URL = base.slice(0, -4)
  const origins = {}
  for (const role of ['student', 'counselor', 'mentor']) { const s = await createServer({ configFile: `apps/${role}/vite.config.mjs`, server: { port: await freePort() } }); servers.push(s); await s.listen(); origins[role] = `http://127.0.0.1:${s.httpServer.address().port}` }
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(origins.student + '/login')
  await page.getByLabel('账号', { exact: true }).fill('graduate')
  await page.getByLabel('密码', { exact: true }).fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/student/home')
  await page.getByRole('link', { name: '我的请假', exact: true }).first().click()
  await page.getByLabel('开始时间').fill('2098-01-01T09:00')
  await page.getByLabel('结束时间').fill('2098-01-01T12:00')
  await page.getByLabel('请假原因').fill('浏览器申请研究生请假')
  await page.getByRole('button', { name: '提交请假申请', exact: true }).click()
  await page.getByText('原因：浏览器申请研究生请假', { exact: true }).waitFor()
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '手机无横向溢出')
  await page.screenshot({ path: path.join(dir, 'student-leave.png'), fullPage: true })
  const staff = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  staff.on('pageerror', e => errors.push(e.message))
  await staff.goto(origins.mentor)
  await staff.getByLabel('账号', { exact: true }).fill('mentor')
  await staff.getByLabel('密码', { exact: true }).fill('123456')
  await staff.getByRole('button', { name: '登录', exact: true }).click()
  await staff.getByRole('button', { name: '请假审批', exact: true }).click()
  const card = staff.locator('article').filter({ hasText: '浏览器申请研究生请假' })
  await card.getByLabel('审批意见').fill('浏览器同意申请')
  await card.getByRole('button', { name: '同意请假' }).click()
  await card.getByText('审批意见：浏览器同意申请', { exact: true }).waitFor()
  await staff.screenshot({ path: path.join(dir, 'mentor-leave.png'), fullPage: true })
  await page.reload()
  await page.getByText('审批意见：浏览器同意申请', { exact: true }).waitFor()
  await staff.getByRole('button', { name: '学业跟进', exact: true }).click()
  await staff.locator('.case-row').filter({ hasText: uiCase.course }).click()
  await staff.getByLabel('协商安排', { exact: true }).fill('浏览器协商：本次导师牵头，双方协助')
  await staff.getByRole('button', { name: '提交协商安排', exact: true }).click()
  await staff.getByRole('button', { name: '接受安排', exact: true }).click()
  await staff.getByLabel('必要工作记录', { exact: true }).fill('浏览器跟进记录')
  await staff.getByRole('button', { name: '保存记录', exact: true }).click()
  await staff.getByText('浏览器跟进记录', { exact: true }).waitFor()
  await staff.screenshot({ path: path.join(dir, 'mentor-collaboration.png'), fullPage: true })
  const under = await browser.newPage(), cou = await browser.newPage()
  for (const p of [under, cou]) p.on('pageerror', e => errors.push(e.message))
  await under.goto(origins.student + '/login')
  await under.getByLabel('账号', { exact: true }).fill('20230118')
  await under.getByLabel('密码', { exact: true }).fill('123456')
  await under.getByRole('button', { name: '登录', exact: true }).click()
  await under.waitForURL('**/student/home')
  await under.getByRole('link', { name: '我的请假', exact: true }).first().click()
  await under.getByLabel('开始时间').fill('2098-02-01T09:00')
  await under.getByLabel('结束时间').fill('2098-02-01T12:00')
  await under.getByLabel('请假原因').fill('浏览器申请本科请假')
  await under.getByRole('button', { name: '提交请假申请', exact: true }).click()
  await under.getByText('原因：浏览器申请本科请假', { exact: true }).waitFor()
  await cou.goto(origins.counselor + '/login')
  await cou.getByLabel('账号', { exact: true }).fill('chenyuan')
  await cou.getByLabel('密码', { exact: true }).fill('123456')
  await cou.getByRole('button', { name: '登录', exact: true }).click()
  await cou.waitForURL('**/counselor/home')
  await cou.goto(origins.counselor + '/counselor/leaves')
  const underCard = cou.locator('article').filter({ hasText: '浏览器申请本科请假' })
  await underCard.getByLabel('审批意见').fill('辅导员浏览器同意')
  await underCard.getByRole('button', { name: '同意请假' }).click()
  await underCard.getByText('审批意见：辅导员浏览器同意', { exact: true }).waitFor()
  await under.reload()
  await under.getByText('审批意见：辅导员浏览器同意', { exact: true }).waitFor()
  await cou.screenshot({ path: path.join(dir, 'counselor-leave.png'), fullPage: true })
  ok(errors.length === 0, errors.join('\n'))
  console.log('PASS 浏览器两种请假跨端审批、学生结果、协商确认与行动记录')
  await new Promise(r => setTimeout(r, 100))
  const saved = JSON.parse(await readFile(file, 'utf8'))
  ok(saved.b.leaves.length === 4 && saved.b.audit.some(x => x.action === 'leave_approved'))
  ok(saved.b.operations.length > 0)
  await writeFile(path.join(dir, 'report.json'), JSON.stringify({ checks, status: 'PASS', cloudModel: false, artifacts: dir }, null, 2))
  console.log(`B_TRIAL_OK ${checks} checks; ${dir}`)
} finally {
  await browser?.close(); await Promise.allSettled(servers.map(s => s.close()))
  if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped }
}
