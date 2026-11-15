import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer as netServer } from 'node:net'
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { fivePortalFixture, scenarios } from '../fixtures/five-portals.mjs'

process.chdir(fileURLToPath(new URL('../../', import.meta.url)))
await mkdir('.tmp/five-portals', { recursive: true })
const out = await mkdtemp(path.resolve('.tmp/five-portals/run-'))
const file = path.join(out, 'store.json')
await writeFile(file, JSON.stringify(fivePortalFixture(), null, 2))
await writeFile(path.join(out, 'scenarios.json'), JSON.stringify(scenarios, null, 2))
async function freePort() {
  const probe = netServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  return port
}
const port = await freePort()
const base = `http://127.0.0.1:${port}`
const servers = [], results = [], timings = [], tickets = []
const gaps = [
  '教务处独立页面仍为骨架，成绩导入及正式结果回写尚未接入该页面；本测试通过真实教务身份 API 验证导师流转。',
  '后勤端仍为骨架，没有后勤身份接单和完工接口；工单接单/办结目前由辅导员代录，不能认定后勤独立闭环。',
  '学生、辅导员入口仍复用原应用；五个网址可访问不等于五个角色业务全部贯通。',
]
const child = spawn(process.execPath, ['server/index.js'], { windowsHide: true,
  env: { ...process.env, PORT: String(port), B_DEMO: 'true', ZHIHUI_DATA_FILE: file, DEEPSEEK_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'] })
let browser, logs = ''
child.stdout.on('data', b => { logs += b })
child.stderr.on('data', b => { logs += b })
const record = async (name, fn) => {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log('PASS', name) }
  catch (e) { results.push({ name, status: 'FAIL', error: e.message }); throw e }
}
async function call(url, token, body, method, expected = 200, origin = base) {
  const start = performance.now()
  const r = await fetch(origin + '/api' + url, { method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
  const data = await r.json()
  timings.push({ url, ms: Math.round(performance.now() - start), status: r.status })
  assert.equal(r.status, expected, `${url}: ${data.message || '状态码不符'}`)
  return typeof data.code === 'number' ? data.data : data
}
const login = async account => (await call('/auth/login', null, { account, password: '123456' })).token
let failure
try {
  await record('隔离后端启动', async () => {
    const end = Date.now() + 15000
    while (!logs.includes('已启动')) {
      if (child.exitCode !== null || Date.now() > end) throw Error(logs || '启动超时')
      await new Promise(r => setTimeout(r, 100))
    }
  })
  process.env.PORTAL_API_URL = base
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const origins = {}
  for (const role of ['student', 'counselor', 'academic', 'logistics', 'mentor']) {
    await record(`${role} 页面加载、前端运行及 API 代理`, async () => {
      const server = await createServer({ configFile: `apps/${role}/vite.config.mjs`, server: { port: await freePort(), open: false } })
      servers.push(server)
      await server.listen()
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`
      origins[role] = origin
      const page = await browser.newPage(), errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(origin, { waitUntil: 'networkidle' })
      await page.locator('#root').locator(':scope > *').first().waitFor()
      if (['academic', 'logistics'].includes(role)) await page.getByText('开发骨架预览', { exact: false }).waitFor()
      await page.screenshot({ path: path.join(out, `${role}.png`), fullPage: true })
      assert.deepEqual(errors, [])
      const who = role === 'student' ? 'test01' : role === 'mentor' ? 'mentor' : role === 'academic' ? 'academic' : 'chenyuan'
      // 后勤仅验证代理可达，不以辅导员登录冒充后勤身份。
      assert((await call('/auth/login', null, { account: who, password: '123456' }, null, 200, origin)).token)
      await page.close()
    })
  }
  const counselor = await login('chenyuan'), academic = await login('academic'), mentor = await login('mentor')
  const tokens = new Map()
  await record('12名虚构学生提交 → 辅导员可见 → 分派 → 代录办理 → 学生确认', async () => {
    for (const s of scenarios) {
      const token = await login(s.account); tokens.set(s.id, token)
      const created = await call('/tickets', token, { description: '[虚构联调] ' + s.description,
        category: s.category, location: '虚构测试楼101', urgency: 'normal' }, null, 201, origins.student)
      const id = created.ticket.id; tickets.push(id)
      assert.equal(created.ticket.status, 'pending_review')
      assert.equal((await call('/tickets/' + id, counselor, null, null, 200, origins.counselor)).ticket.studentId, s.id)
      assert.equal((await call(`/tickets/${id}/review`, counselor, { departmentIds: [s.department], note: '测试分派' }, 'PATCH')).ticket.status, 'assigned')
      assert.equal((await call(`/tickets/${id}/progress`, counselor, { action: 'accept' }, 'PATCH')).ticket.status, 'processing')
      assert.equal((await call(`/tickets/${id}/progress`, counselor, { action: 'resolve', result: '虚构测试：已核实处理' }, 'PATCH')).ticket.status, 'awaiting_confirm')
      assert.equal((await call(`/tickets/${id}/confirm`, token, { score: 5, comment: '测试确认', tags: [] })).ticket.status, 'completed')
    }
  })
  await record('跨学生隔离、学生越权与未登录拦截', async () => {
    await call('/tickets/' + tickets[0], tokens.get('synthetic-2'), null, null, 403)
    await call('/counselor/dashboard', tokens.get('synthetic-1'), null, null, 403)
    await call('/b/cases', null, null, null, 401)
  })
  await record('教务建任务 → 导师联系/面谈 → 辅导员脱敏查看 → 教务未通过续跟/通过结束', async () => {
    let c = (await call('/b/cases', academic, { studentId: 'synthetic-1', mentorId: 'mentor-demo', counselorId: 'cou-chen', course: '虚构联调高等数学' }, null, 201)).item
    for (const type of ['contact', 'interview', 'remind', 'referral']) c = (await call(`/b/cases/${c.id}/events`, mentor,
      { type, text: '私密测试记录-仅导师可读', version: c.version })).item
    for (const token of [academic, counselor]) assert(!JSON.stringify(await call('/b/cases', token)).includes('私密测试记录'))
    await call(`/b/cases/${c.id}/events`, mentor, { type: 'contact', text: '重复旧版本', version: 1 }, null, 409)
    for (const result of ['failed', 'passed']) {
      c = (await call(`/b/cases/${c.id}/result`, academic, { result, source: '虚构教务测试名单', version: c.version }, 'PATCH')).item
      assert.equal(c.status, result === 'passed' ? 'completed' : 'pending_contact')
      assert.equal((await call('/b/cases', mentor)).items.find(x => x.id === c.id).status, c.status)
    }
  })
  await record('知识草稿 → 独立审核 → 学生带来源回答 → 未知问题追问转人工', async () => {
    const reviewer = await login('reviewer'), student = tokens.get('synthetic-1')
    const k = (await call('/b/knowledge', counselor, { title: '虚构测试实验室预约', answer: '测试流程：提交预约后等待管理员确认。',
      keywords: ['实验室', '预约'], source: 'AI虚构测试资料，不代表学校制度', department: '教务处', validUntil: '2099-01-01' }, null, 201)).item
    assert.equal((await call('/b/assistant', student, { text: '实验室如何预约' })).action, 'clarify')
    await call(`/b/knowledge/${k.id}/review`, reviewer, { action: 'publish', note: '仅测试样本' })
    const answer = await call('/b/assistant', student, { text: '实验室如何预约' })
    assert.equal(answer.action, 'answer'); assert.equal(answer.source.version, 1)
    let reply = await call('/b/assistant', student, { text: '虚构未知业务如何办理' })
    for (const text of ['没有对应的已知类型', '需要老师协助核实']) reply = await call('/b/assistant', student, { text, conversationId: reply.conversationId })
    assert.equal(reply.action, 'handoff')
  })
  await record('浏览器真实登录：学生/辅导员查看同一办结单、导师查看教务结果', async () => {
    for (const role of ['student', 'counselor', 'mentor']) {
      const page = await browser.newPage(), errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(origins[role], { waitUntil: 'networkidle' })
      if (role === 'mentor') {
        await page.getByLabel('账号', { exact: true }).fill('mentor')
        await page.getByLabel('密码', { exact: true }).fill('123456')
        await page.getByRole('button', { name: '登录', exact: true }).click()
        await page.locator('.case-row').filter({ hasText: '虚构学生01' }).click()
        await page.getByText('状态：已完成', { exact: false }).waitFor()
      } else {
        if (role === 'student') {
          await page.getByLabel('学号', { exact: true }).fill('test01')
          await page.getByLabel('密码', { exact: true }).fill('123456')
          await page.getByRole('button', { name: '进入学生端', exact: true }).click()
        } else await page.getByRole('button', { name: /辅导员视角/ }).click()
        await page.waitForURL(`**/${role}/home`)
        await page.goto(`${origins[role]}/${role}/tickets/${tickets[0]}`, { waitUntil: 'networkidle' })
        await page.getByText('虚构测试：已核实处理', { exact: false }).first().waitFor()
      }
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(out, `${role}-connected.png`), fullPage: true })
      await page.close()
    }
  })
  await record('数据持久化与12个工单最终状态', async () => {
    await new Promise(r => setTimeout(r, 100))
    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(saved.tickets.filter(t => tickets.includes(t.id) && t.status === 'completed').length, 12)
    assert(saved.b.audit.length > 0)
  })
} catch (e) { failure = e; console.error(e) }
finally {
  await browser?.close()
  await Promise.allSettled(servers.map(s => s.close()))
  if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped }
  const sorted = timings.map(t => t.ms).sort((a,b) => a-b)
  const report = { generatedAt: new Date().toISOString(), scope: '本地功能联调，非负载测试；云模型关闭',
    overall: failure ? 'FAIL' : 'PARTIAL_READY', results, gaps,
    requestCount: timings.length, p95ms: sorted[Math.max(0, Math.ceil(sorted.length * .95)-1)], timings,
    failure: failure?.message }
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(out, 'report.md'), `# 五端模拟联调报告\n\n总体：${report.overall}（不代表五端业务全通）\n\n` +
    results.map(r => `- ${r.status}：${r.name}${r.error ? '：' + r.error : ''}`).join('\n') +
    '\n\n## 尚未接通\n\n' + gaps.map(g => '- ' + g).join('\n') +
    `\n\n本地请求 ${timings.length} 次，P95 ${report.p95ms ?? '-'} ms；非并发压测。\n`)
  console.log('报告及独立数据：' + out)
  if (failure || process.argv.includes('--require-complete')) process.exitCode = 1
}
