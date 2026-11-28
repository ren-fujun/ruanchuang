import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mountConsult } from './consult.js'

test('feedback updates the requested turn, defaults to latest, validates turns and enforces ownership', async t => {
  const session = { id: 'session-1', userId: 'student-1', turns: [{}, {}, {}] }
  const db = { aiConsultations: [session] }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.user = { id: req.headers['x-user'] || 'student-1', role: req.headers['x-role'] || 'student' }; next() })
  mountConsult(app, { db, save() {}, requireAuth: (_req, _res, next) => next(), retrieve: async () => ({ citations: [] }) })
  const server = app.listen(0, '127.0.0.1')
  t.after(() => server.close())
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  const post = async (body, headers = {}) => fetch(`http://127.0.0.1:${address.port}/api/ai/consult/session-1/feedback`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  assert.equal((await post({ helpful: true, turn: 1 })).status, 200)
  assert.equal(session.feedback[0].turn, 1)
  assert.equal((await post({ helpful: false, reason: '修改', turn: 1 })).status, 200)
  assert.equal(session.feedback.length, 1)
  assert.equal(session.feedback[0].helpful, false)
  assert.equal(session.feedback[0].reason, '修改')
  assert.equal((await post({ helpful: true })).status, 200)
  assert.equal(session.feedback[1].turn, 3)
  assert.equal((await post({ helpful: true, turn: 0 })).status, 400)
  assert.equal((await post({ helpful: true, turn: 4 })).status, 400)
  assert.equal((await post({ helpful: true, turn: 1.5 })).status, 400)
  assert.equal((await post({ helpful: true }, { 'x-user': 'other' })).status, 404)
  assert.equal((await post({ helpful: true }, { 'x-role': 'counselor' })).status, 403)
})
