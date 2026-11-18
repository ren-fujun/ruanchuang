import test from 'node:test'
import assert from 'node:assert/strict'
import { planStudentTicketChange } from './c-student.js'

const ticket = (status = 'awaiting_confirm') => ({ id: 't1', studentId: 's1', status, updatedAt: 'v1', timeline: [] })
const bundle = () => ({ status: 'dispatched', version: 1, items: [{ ticketId: 't1', status: 'resolved', history: [] }] })
const args = (overrides = {}) => ({ ticket: ticket(), bundle: bundle(), actorId: 's1', action: 'reopen', text: '问题仍然没有得到解决', expectedUpdatedAt: 'v1', requestId: 'r1', now: 'v2', ...overrides })

test('requires matching student ownership', () => assert.equal(planStudentTicketChange(args({ actorId: 's2' })).status, 404))
test('validates text, version, and request id', () => {
  assert.equal(planStudentTicketChange(args({ text: ' ' })).status, 400)
  assert.equal(planStudentTicketChange(args({ expectedUpdatedAt: 'stale' })).status, 409)
  assert.equal(planStudentTicketChange(args({ requestId: '' })).status, 400)
})
test('reopens with atomic ticket and bundle plans without mutating input', () => {
  const source = ticket(), sourceBundle = bundle()
  const result = planStudentTicketChange(args({ ticket: source, bundle: sourceBundle }))
  assert.equal(result.ticket.status, 'pending_review')
  assert.equal(result.bundle.version, 2)
  assert.equal(source.status, 'awaiting_confirm')
  assert.equal(sourceBundle.items[0].status, 'resolved')
})
test('replays idempotently and rejects request id reuse', () => {
  const first = planStudentTicketChange(args())
  assert.equal(planStudentTicketChange(args({ ticket: first.ticket })).replay, true)
  assert.equal(planStudentTicketChange(args({ ticket: first.ticket, text: '这是不同的反馈内容' })).status, 409)
})
test('supplements eligible tickets only', () => {
  assert.equal(planStudentTicketChange(args({ action: 'supplement' })).ok, true)
  assert.equal(planStudentTicketChange(args({ action: 'supplement', ticket: ticket('processing') })).ok, true)
  const result=planStudentTicketChange(args({ action:'supplement' }))
  assert.equal(result.bundle.version,2)
  assert.equal(result.bundle.items[0].history[0].action,'supplement')
})
test('reopens completed tickets and preserves prior rating', () => {
  const old={...ticket('completed'), rating:{score:5}}
  const result=planStudentTicketChange(args({ticket:old,bundle:null}))
  assert.equal(result.ticket.status,'pending_review')
  assert.equal(result.ticket.rating,null)
  assert.equal(result.ticket.previousRatings[0].score,5)
  assert.equal(old.rating.score,5)
})
