import test from 'node:test'
import assert from 'node:assert/strict'
import { createIssueBundle } from './issue-bundles.js'
const tickets = [{id:'t1',status:'pending_review'},{id:'t2',status:'pending_review'}]
const make = (extra={}) => createIssueBundle({ticketIds:['t1','t2'],tickets,actorId:'c1',...extra})
test('creates a draft and preserves input tickets', () => {
 const before=structuredClone(tickets); const bundle=make(); assert.equal(bundle.status,'draft'); assert.deepEqual(bundle.ticketIds,['t1','t2']); assert.deepEqual(tickets,before)
})
test('rejects duplicate, missing, and already processed tickets', () => {
 assert.throws(()=>make({ticketIds:['t1','t1']}),/重复/)
 assert.throws(()=>make({ticketIds:['unknown']}),/不存在/)
 assert.throws(()=>make({tickets:[{id:'t1',status:'completed'}],ticketIds:['t1']}),/待审核/)
})
test('prevents a ticket being added to two drafts', () => {
 assert.throws(()=>make({bundles:[{status:'draft',ticketIds:['t1']}]}),/已经存在/)
})
test('validates input and remarks', () => {
 assert.throws(()=>make({ticketIds:[]}),/1至100/); assert.throws(()=>make({note:'x'.repeat(501)}),/备注/)
})
