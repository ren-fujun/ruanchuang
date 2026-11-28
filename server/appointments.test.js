import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountAppointments } from './appointments.js'

test('预约草稿轮次过期拒绝提交；有效快照不会被后续咨询改写', async () => {
  const handlers = new Map(), app = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, (path, ...fns) => handlers.set(`${method} ${path}`, fns.at(-1))]))
  const teacher = { id: 'c', role: 'counselor', studentIds: ['s'] }, student = { id: 's', role: 'student' }
  const start = Math.ceil((Date.now() + 3600000) / 300000) * 300000
  const session = { id: 'session', userId: 's', turns: [{ result: { action: 'guidance' } }, { result: { action: 'guidance', citations: [{ id: 'p', title: '合成依据', source: 'https://example.org', documentId: 'doc', policyVersion: 'test' }], questions: ['老师确认'], context: { facts: [{ text: '新诉求', sourceTurn: 2 }] } } }] }
  const db = { users: [teacher, student], aiConsultations: [session], appointmentSlots: [{ id: 'slot', counselorId: 'c', startsAt: new Date(start).toISOString(), endsAt: new Date(start + 3600000).toISOString() }] }
  mountAppointments(app, { db, save() {}, requireAuth() {} })
  const call = body => { let code = 200, data; const res = { status(n) { code = n; return this }, json(v) { data = v; return this } }; handlers.get('post /api/appointments')({ user: student, body }, res); return { code, data } }
  const body = { topic: '复核', minutes: 15, slotIds: ['slot'], requestId: 'once', consultationSessionId: 'session', consultationSummary: '学生已确认', consultationTurn: 1 }
  assert.equal(call(body).code, 409)
  assert.deepEqual(db.appointments, [])
  assert.equal(call({ ...body, consultationTurn: '2' }).code, 400)
  const created = call({ ...body, consultationTurn: 2 })
  assert.equal(created.code, 201)
  assert.equal(created.data.item.consultationSummary.sourceTurn, 2)
  session.turns[1].result.questions[0] = '被修改的新问题'
  session.turns.push({ result: { action: 'guidance' } })
  assert.deepEqual(created.data.item.consultationSummary.questions, ['老师确认'])
  assert.equal(call({ ...body, consultationTurn: 2 }).code, 200)
  assert.equal(call({ ...body, consultationTurn: 1 }).code, 409)
})

test('开放窗口内排班、候补、补位、幂等与访问范围', async () => {
  const handlers = new Map(), app = { get: (p, ...f) => handlers.set('GET '+p, f.at(-1)), post: (p, ...f) => handlers.set('POST '+p, f.at(-1)), patch: (p, ...f) => handlers.set('PATCH '+p, f.at(-1)) }
  const teacher = { id: 'c', role: 'counselor', studentIds: ['s1','s2','s3','s4'] }, students = teacher.studentIds.map(id => ({id, role: 'student'}))
  const db = { users: [teacher, ...students, {id: 'other', role:'student'}] }
  mountAppointments(app, {db, save() {}, requireAuth() {}})
  const call = async (key, user, body = {}, params = {}) => { let code = 200, data; const res = { status(n) { code=n; return this }, sendStatus(n) { code=n; return this }, json(v) { data=v; return this } }; await handlers.get(key)({user, body, params}, res); return {code,data} }
  const start = Math.ceil((Date.now() + 86400000) / 300000) * 300000
  const s = await call('POST /api/appointments/slots', teacher, {startsAt:new Date(start).toISOString(),endsAt:new Date(start+1800000).toISOString()})
  assert.equal(s.code, 201)
  const slotId = s.data.item.id
  const created = []
  for (const [i, minutes] of [5,5,20,20].entries()) created.push((await call('POST /api/appointments',students[i],{slotId,minutes,topic:'测试',requestId:'r'+i})).data.item)
  assert.equal((await call('POST /api/appointments', students[0], {slotId,minutes:5,topic:'测试',requestId:'r0'})).data.item.id,created[0].id)
  assert.equal((await call('POST /api/appointments', db.users.at(-1), {slotId,minutes:5,topic:'测试',requestId:'x'})).code,404)
  await call('POST /api/appointments/batch',teacher,{slotId})
  assert.deepEqual(db.appointments.map(x=>x.status), ['scheduled','scheduled','scheduled','waitlisted'])
  await call('POST /api/appointments/batch',teacher,{slotId})
  assert.equal(db.appointments.length,4)
  assert.equal((await call('POST /api/appointments/:id/cancel',students[0],{}, {id:created[2].id})).code,404)
  await call('POST /api/appointments/:id/cancel',students[2],{}, {id:created[2].id})
  assert.equal(db.appointments[3].status,'scheduled')
  assert.equal(db.appointments[3].startsAt,db.appointments[2].startsAt)
})
