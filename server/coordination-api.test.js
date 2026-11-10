import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { seedData } from './seed.js'

test('协同记录仅辅导员可见，学生可查看工单进度', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhihui-test-'))
  const seed = seedData()
  seed.tickets.forEach((ticket) => { ticket.risk = 'low'; ticket.dueAt = new Date(Date.now() + 24 * 60 * 60000).toISOString() })
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
    const student = await call('/auth/login', { body: { account: '20230118', password: '123456', role: 'student' } })
    const counselor = await call('/auth/login', { body: { account: 'chenyuan', password: '123456', role: 'counselor' } })
    const precheck = await call('/ai/precheck', { token: student.token, body: { text: '图书馆空调持续故障' } })
    assert.equal(precheck.engine, 'local-rules')
    const dashboard = await call('/counselor/dashboard', { token: counselor.token })
    assert.ok(dashboard.urgent.some((ticket) => ticket.id === 'TEST-DUE-SOON'), '临期工单应出现在督办列表')
    const created = await call('/tickets', { token: student.token, body: { description: '图书馆空调故障持续影响同学', location: '图书馆二楼' } })
    const id = created.ticket.id
    const assigned = await call(`/tickets/${id}/review`, { method: 'PATCH', token: counselor.token, body: { departmentIds: ['library', 'logistics'], note: '私人审核备注' } })
    assert.equal(assigned.ticket.status, 'assigned')
    await call(`/tickets/${id}/note`, { token: counselor.token, body: { text: '协同部门：后勤；沟通情况：内部跟进；下一步：明天核实' } })
    const counselorView = await call(`/tickets/${id}`, { token: counselor.token })
    assert.match(JSON.stringify(counselorView.ticket.notes), /内部跟进/)
    const studentView = await call(`/tickets/${id}`, { token: student.token })
    assert.equal(studentView.ticket.status, 'assigned')
    assert.deepEqual(studentView.ticket.notes, [])
    assert.doesNotMatch(JSON.stringify(studentView), /私人审核备注|内部跟进/)
    const list = await call('/tickets', { token: student.token })
    const home = await call('/student/home', { token: student.token })
    assert.doesNotMatch(JSON.stringify({ list, home }), /私人审核备注|内部跟进/)
  } finally {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
