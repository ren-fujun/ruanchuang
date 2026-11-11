import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { seedData } from './seed.js'

test('协同记录仅辅导员可见，学生可查看工单进度', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhihui-test-'))
  const seed = seedData()
  seed.tickets.forEach((ticket) => {
    ticket.risk = 'low'
    ticket.dueAt = new Date(Date.now() + 24 * 60 * 60000).toISOString()
    ticket.rating = null
    ticket.timeline = ticket.timeline.filter((event) => event.type !== 'assigned')
  })
  const dueSoon = { ...seed.tickets[0], id: 'TEST-DUE-SOON', risk: 'low', status: 'processing', dueAt: new Date(Date.now() + 30 * 60000).toISOString() }
  seed.tickets.unshift(dueSoon)
  await writeFile(path.join(dir, 'store.json'), JSON.stringify(seed))
  const listener = net.createServer()
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  const env = { ...process.env, PORT: String(port), ZHIHUI_DATA_FILE: path.join(dir, 'store.json') }
  delete env.DEEPSEEK_API_KEY
  const child = spawn(process.execPath, ['server/index.js'], { env, stdio: 'ignore' })
  const base = `http://127.0.0.1:${port}/api`
  const call = async (route, { token, body, method } = {}) => {
    const response = await fetch(base + route, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await response.json()
    assert.equal(response.ok, true, JSON.stringify(json))
    assert.equal(json.code, 0)
    return json.data
  }
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) { ready = true; break } } catch {}
      await delay(50)
    }
    assert.ok(ready, '测试服务未启动')
    const malformed = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5180' }, body: '{invalid' })
    assert.equal(malformed.status, 400)
    assert.equal(malformed.headers.get('access-control-allow-origin'), 'http://localhost:5180')
    assert.deepEqual(await malformed.json(), { code: 40001, msg: '请求内容不是有效的 JSON。', data: null })
    const student = await call('/auth/login', { body: { account: '20230118', password: '123456', role: 'student' } })
    const counselor = await call('/auth/login', { body: { account: 'chenyuan', password: '123456', role: 'counselor' } })
    const precheck = await call('/ai/precheck', { token: student.token, body: { text: '图书馆空调持续故障' } })
    assert.equal(precheck.engine, 'local-rules')
    const dashboard = await call('/counselor/dashboard', { token: counselor.token })
    assert.ok(dashboard.urgent.some((ticket) => ticket.id === 'TEST-DUE-SOON'), '临期工单应出现在督办列表')
    assert.equal(dashboard.stats.closureRate, Math.round(seed.tickets.filter((ticket) => ticket.status === 'completed').length / seed.tickets.length * 100))
    assert.equal(dashboard.stats.satisfaction, null)
    assert.equal(dashboard.stats.avgResponse, null)
    const insights = await call('/counselor/insights', { token: counselor.token })
    assert.equal(insights.summary.closureRate, dashboard.stats.closureRate)
    assert.equal(insights.summary.satisfaction, null)
    assert.equal(insights.summary.avgResponse, null)
    const created = await call('/tickets', { token: student.token, body: { description: '图书馆空调故障持续影响同学', location: '图书馆二楼' } })
    const id = created.ticket.id
    const assigned = await call(`/tickets/${id}/review`, { method: 'PATCH', token: counselor.token, body: { departmentIds: ['library', 'logistics'], note: '私人审核备注' } })
    assert.equal(assigned.ticket.status, 'assigned')
    await call(`/tickets/${id}/urge`, { method: 'PATCH', token: counselor.token, body: { note: '督办内部说明' } })
    await call(`/tickets/${id}/note`, { token: counselor.token, body: { text: '协同部门：后勤；沟通情况：内部跟进；下一步：明天核实' } })
    const counselorView = await call(`/tickets/${id}`, { token: counselor.token })
    assert.match(JSON.stringify(counselorView.ticket.notes), /内部跟进/)
    assert.match(JSON.stringify(counselorView.ticket.timeline), /督办内部说明/)
    const studentView = await call(`/tickets/${id}`, { token: student.token })
    assert.equal(studentView.ticket.status, 'assigned')
    assert.deepEqual(studentView.ticket.notes, [])
    assert.doesNotMatch(JSON.stringify(studentView), /私人审核备注|内部跟进|督办内部说明/)
    const list = await call('/tickets', { token: student.token })
    const home = await call('/student/home', { token: student.token })
    assert.doesNotMatch(JSON.stringify({ list, home }), /私人审核备注|内部跟进|督办内部说明/)
    const accepted = await call(`/tickets/${id}/progress`, { method: 'PATCH', token: counselor.token, body: { action: 'accept' } })
    assert.equal(accepted.ticket.status, 'processing')
    const resolved = await call(`/tickets/${id}/progress`, { method: 'PATCH', token: counselor.token, body: { action: 'resolve', result: '设备已修复' } })
    assert.equal(resolved.ticket.status, 'awaiting_confirm')
    const confirmed = await call(`/tickets/${id}/confirm`, { token: student.token, body: { score: 5, comment: '已确认' } })
    assert.equal(confirmed.ticket.status, 'completed')
    assert.doesNotMatch(JSON.stringify(confirmed), /私人审核备注|内部跟进|督办内部说明/)
  } finally {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('生产模式关闭一键演示登录', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhihui-auth-test-'))
  const listener = net.createServer()
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), ZHIHUI_DATA_FILE: path.join(dir, 'store.json') }, stdio: 'ignore' })
  const base = `http://127.0.0.1:${port}/api`
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) { ready = true; break } } catch {}
      await delay(50)
    }
    assert.ok(ready, '测试服务未启动')
    const result = await fetch(`${base}/auth/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'counselor' }) })
    assert.equal(result.status, 403)
  } finally {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('.env 中的数据文件路径在存储初始化前生效', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhihui-env-test-'))
  const dataFile = path.join(dir, 'isolated-store.json')
  const listener = net.createServer()
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  await writeFile(path.join(dir, '.env'), `ZHIHUI_DATA_FILE=${dataFile.replaceAll('\\', '/')}\nPORT=${port}\n`)
  const env = { ...process.env }
  delete env.PORT
  delete env.ZHIHUI_DATA_FILE
  const child = spawn(process.execPath, [path.resolve('server/index.js')], { cwd: dir, env, stdio: 'ignore' })
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { ready = true; break } } catch {}
      await delay(50)
    }
    assert.ok(ready, '测试服务未使用 .env 中的端口启动')
    await access(dataFile)
  } finally {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
