import test from 'node:test'
import assert from 'node:assert/strict'
import { organizeOutcome } from './outcome-draft.js'
import { mountAppointments } from '../appointments.js'

test('organization retains each original point exactly once and records usage', async () => {
  const db = {}
  const result = await organizeOutcome({ notes: '已告知复核渠道；学生准备成绩单', db, save() {}, generate: async () => ({ ok: true, data: { order: [1, 0] }, meta: { usage: { prompt_tokens: 10, completion_tokens: 5 }, model: 'test-mock' } }) })
  assert.equal(result.draft, '1. 学生准备成绩单\n2. 已告知复核渠道')
  assert.equal(db.aiConsultUsage[0].purpose, 'appointment.outcome-organize')
  assert.equal(db.aiConsultUsage[0].usage.prompt_tokens, 10)
})
test('invalid model order or outage preserves notes without invented conclusions', async () => {
  const notes = '已说明渠道；待学生补充材料'
  for (const generate of [async () => ({ ok: true, data: { order: [0, 0], draft: '申请已经批准' } }), async () => { throw new Error('offline') }]) {
    const result = await organizeOutcome({ notes, db: {}, save() {}, generate })
    assert.equal(result.draft, notes); assert.equal(result.engine, 'original-notes')
  }
})
test('budget stops model calls and keeps editable original notes', async () => {
  const old = process.env.RAG_MAX_GENERATION_CALLS
  process.env.RAG_MAX_GENERATION_CALLS = '0'
  try { const result = await organizeOutcome({ notes: '甲；乙', db: {}, save() {}, generate() { throw new Error('must not call') } }); assert.equal(result.reason, 'budget-or-call-limit') }
  finally { if (old === undefined) delete process.env.RAG_MAX_GENERATION_CALLS; else process.env.RAG_MAX_GENERATION_CALLS = old }
})
function harness(generate) {
  const handlers = new Map(), app = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, (path, ...fns) => handlers.set(`${method} ${path}`, fns.at(-1))]))
  const teacher = { id: 'c', role: 'counselor', studentIds: ['s'] }
  const appointment = { id: 'a', studentId: 's', counselorId: 'c', version: 1, status: 'scheduled' }
  const db = { users: [teacher], appointments: [appointment] }
  mountAppointments(app, { db, save() {}, requireAuth() {}, generate })
  const call = async (user = teacher, body = { notes: '说明渠道；等待材料', version: 1 }) => {
    let status = 200, data
    const res = { status(code) { status = code; return this }, sendStatus(code) { status = code; return this }, json(value) { data = value; return this } }
    await handlers.get('post /api/appointments/:id/outcome-draft')({ user, body, params: { id: 'a' } }, res, error => { throw error })
    return { status, data }
  }
  return { call, teacher, appointment, db }
}
test('only owning teacher can organize scheduled appointments; draft does not complete or notify', async () => {
  const { call, teacher, appointment, db } = harness(async () => ({ ok: true, data: { order: [0, 1] } }))
  assert.equal((await call({ id: 's', role: 'student' })).status, 403)
  assert.equal((await call({ ...teacher, id: 'other' })).status, 404)
  assert.equal((await call(teacher, { notes: '甲；乙', version: 9 })).status, 409)
  assert.equal((await call(teacher, { notes: '', version: 1 })).status, 400)
  assert.equal((await call()).status, 200)
  assert.equal(appointment.status, 'scheduled'); assert.equal(appointment.version, 1)
  assert.equal(appointment.outcome, undefined); assert.equal(db.notifications, undefined)
  appointment.status = 'completed'
  assert.equal((await call()).status, 409)
})
test('state changes during generation discard stale draft', async () => {
  let release
  const { call, appointment } = harness(() => new Promise(resolve => { release = resolve }))
  const pending = call()
  assert.equal((await call()).status, 409)
  appointment.version++
  release({ ok: true, data: { order: [0, 1] } })
  assert.equal((await pending).status, 409)
  assert.equal(appointment.outcome, undefined)
})
