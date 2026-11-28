import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createConsultService, mountConsult } from './consult.js'
import { mountAppointments } from '../appointments.js'

const user = { id: 's', role: 'student', college: '计算机学院', grade: '2023级' }
const evidence = { id: 'p1', title: '测试条款（合成）', excerpt: '学生可以提交综测复核申请。', source: 'https://example.org/policy', scope: { school: '中南大学', college: '计算机学院' } }
function harness(overrides = {}) {
  const db = { users: [user, { id: 'teacher', role: 'counselor', studentIds: ['s'] }] }
  const generate = async ({ prompt }) => ({ ok: true, data: prompt.id.endsWith('understand') ? { query: '综测复核', topic: '综测复核' } : { insufficient: false, claims: [{ text: '可以提交复核申请。', citationIds: ['p1'] }], questions: ['请老师确认办理期限'] }, meta: { model: 'test-mock', usage: { prompt_tokens: 10, completion_tokens: 5 } } })
  const options = { db, save: () => {}, retrieve: async () => ({ citations: [evidence], engine: 'hybrid' }), generate, ...overrides }
  return { ...options, service: createConsultService(options) }
}
test('grounded claims cite retrieved evidence and draft never creates appointment', async () => {
  const { service, db } = harness()
  const result = await service.consult(user, { text: '我的综测分有误怎么办' })
  assert.equal(result.engine, 'hybrid-rag'); assert.equal(result.citations[0].id, 'p1')
  assert.match(result.answer, /\[1\]/); assert.equal(result.actionDraft.minutes, 15)
  assert.equal(db.appointments, undefined); assert.equal(db.aiConsultUsage.length, 2)
  assert.equal(db.aiConsultUsage[0].pricingStatus, 'missing-rates-or-usage')
  assert.equal(service.owned({ id: 'other' }, result.sessionId), undefined)
})
test('no evidence produces no policy assertion or invented source', async () => {
  const { service } = harness({ retrieve: async () => ({ citations: [], engine: 'unavailable', reason: 'index-not-imported' }) })
  const result = await service.consult(user, { text: '今年奖学金多少钱' })
  assert.equal(result.engine, 'insufficient-evidence'); assert.deepEqual(result.citations, []); assert.match(result.answer, /没有足够/)
})
test('model cannot invent citation IDs', async () => {
  const { service } = harness({ generate: async ({ prompt }) => ({ ok: true, data: prompt.id.endsWith('understand') ? { query: '综测' } : { insufficient: false, claims: [{ text: '保证批准', citationIds: ['fake'] }] } }) })
  const result = await service.consult(user, { text: '综测申诉' })
  assert.equal(result.engine, 'insufficient-evidence'); assert.deepEqual(result.citations, [])
})
test('invented deadlines and guarantees are rejected even with a valid citation ID', async () => {
  const { service } = harness({ generate: async ({ prompt }) => ({ ok: true, data: prompt.id.endsWith('understand') ? { query: '综测' } : { insufficient: false, claims: [{ text: '保证3天内发放1000元。', citationIds: ['p1'] }] } }) })
  const result = await service.consult(user, { text: '综测申诉' })
  assert.equal(result.engine, 'insufficient-evidence'); assert.deepEqual(result.citations, [])
})
test('explicitly different college triggers clarification instead of applying current policy', async () => {
  const { service } = harness({ retrieve: async () => { throw new Error('must not retrieve') } })
  const result = await service.consult(user, { text: '我不是计算机学院的，可以照这个政策办理吗' })
  assert.equal(result.engine, 'model-clarification'); assert.match(result.clarification, /不能直接用于其他学院/)
})
test('risk handoff does not send content to model or retrieval', async () => {
  const { service } = harness({ generate: () => { throw new Error('must not call') }, retrieve: () => { throw new Error('must not call') } })
  const result = await service.consult(user, { text: '宿舍着火了救命' })
  assert.equal(result.action, 'urgent_handoff'); assert.equal(result.actionDraft, null)
  const followup = await service.consult(user, { sessionId: result.sessionId, text: '帮我预约十五分钟' })
  assert.equal(followup.action, 'urgent_handoff'); assert.equal(followup.actionDraft, null)
})
test('multi-turn passes correction and keeps immutable user scope', async () => {
  const inputs = [], scopes = []
  const { service } = harness({ generate: async ({ payload }) => { inputs.push(payload); return { ok: true, data: { query: payload.text || '新的综测问题', topic: '综测' } } }, retrieve: async (_, { scope }) => { scopes.push(scope); return { citations: [] } } })
  const first = await service.consult(user, { text: '我想问就业' })
  await service.consult(user, { sessionId: first.sessionId, text: '不是就业，是综测' })
  assert.equal(inputs[1].history[0].text, '我想问就业'); assert.equal(inputs[1].text, '不是就业，是综测')
  assert.equal(scopes[1].college, '计算机学院')
  await assert.rejects(service.consult({ id: 'other' }, { sessionId: first.sessionId, text: '查看' }), /无权/)
})
test('broken model and retrieval degrade without pretending vector success', async () => {
  const { service } = harness({ generate: async () => ({ ok: false, reason: 'timeout' }), retrieve: async () => { throw new Error('offline') } })
  const result = await service.consult(user, { text: '综测怎么办' })
  assert.equal(result.engine, 'insufficient-evidence'); assert.equal(result.telemetry.retrieval.reason, 'retrieval-unavailable')
})
test('actual HTTP routes enforce roles ownership and link confirmed summary to appointment', async t => {
  const options = harness(), app = express(); app.use(express.json())
  const requireAuth = (req, res, next) => { req.user = options.db.users.find(u => u.id === req.headers['x-user']); return req.user ? next() : res.sendStatus(401) }
  mountConsult(app, { ...options, requireAuth }); mountAppointments(app, { ...options, requireAuth })
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close())
  const call = async (route, who = 's', body) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-user': who }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, data: await r.json().catch(() => null) } }
  assert.equal((await call('/ai/consult', 'teacher', { text: 'hello' })).status, 403)
  const result = (await call('/ai/consult', 's', { text: '综测复核怎么做' })).data
  assert.equal((await call(`/ai/consult/${result.sessionId}`, 'teacher')).status, 403)
  assert.equal((await call(`/ai/consult/${result.sessionId}`, 's')).data.id, result.sessionId)
  assert.equal((await call(`/ai/consult/${result.sessionId}/feedback`, 's', { helpful: true })).status, 200)
  assert.equal((await call(`/ai/consult/${result.sessionId}/feedback`, 's', { helpful: 'yes' })).status, 400)
  const start = Math.ceil((Date.now() + 3600000) / 300000) * 300000
  const slot = (await call('/appointments/slots', 'teacher', { startsAt: new Date(start).toISOString(), endsAt: new Date(start + 3600000).toISOString() })).data.item
  const body = { topic: '我已确认的综测复核问题', consultationSummary: '这是学生编辑并确认的完整陈述。', minutes: 15, requestId: 'once', slotIds: [slot.id], consultationSessionId: result.sessionId }
  const booked = await call('/appointments', 's', body)
  assert.equal(booked.status, 201); assert.equal(booked.data.item.consultationSummary.studentStatement, body.consultationSummary)
  assert.equal(booked.data.item.consultationSummary.policyReferences[0].title, evidence.title)
  assert.equal((await call('/appointments', 's', { ...body, consultationSessionId: undefined })).status, 409)
  assert.equal((await call('/appointments', 's', { ...body, consultationSummary: '改过的陈述' })).status, 409)
})
