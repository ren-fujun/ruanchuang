import test from 'node:test'
import assert from 'node:assert/strict'
import {dispatchBundle,applyLogisticsAction} from './logistics-workflow.js'
const counselor={id:'c',role:'counselor',studentIds:['s1','s2']}, recipient={id:'l',role:'logistics'}
const tickets=[{id:'1',studentId:'s1',status:'pending_review'},{id:'2',studentId:'s2',status:'pending_review'}]
const draft={id:'b',createdBy:'c',status:'draft',ticketIds:['1','2']}
test('dispatch checks scope and current state',()=>{
 assert.throws(()=>dispatchBundle({bundle:draft,counselor:{...counselor,studentIds:['s1']},recipient,tickets}),/负责范围/)
 assert.throws(()=>dispatchBundle({bundle:draft,counselor,recipient:{id:'x',role:'mentor'},tickets}),/后勤/)
 assert.throws(()=>dispatchBundle({bundle:draft,counselor,recipient,tickets:[{...tickets[0],status:'completed'},tickets[1]]}),/状态/)
})
test('only assigned logistics staff can record individual results',()=>{
 const b=dispatchBundle({bundle:draft,counselor,recipient,tickets})
 assert.throws(()=>applyLogisticsAction({bundle:b,recipient:{...recipient,id:'other'},ticketId:'1',action:'accept'}),/无权/)
 assert.throws(()=>applyLogisticsAction({bundle:b,recipient,ticketId:'1',action:'resolve',result:'ok'}),/先接收/)
 const accepted=applyLogisticsAction({bundle:b,recipient,ticketId:'1',action:'accept'})
 assert.throws(()=>applyLogisticsAction({bundle:accepted,recipient,ticketId:'1',action:'accept'}),/不能接收/)
 const done=applyLogisticsAction({bundle:accepted,recipient,ticketId:'1',action:'resolve',result:'已维修'})
 assert.equal(done.items[0].status,'resolved'); assert.equal(done.items[1].status,'sent'); assert.equal(b.items[0].status,'sent')
})
test('return requires a reason and does not modify other items',()=>{
 const b=dispatchBundle({bundle:draft,counselor,recipient,tickets})
 assert.throws(()=>applyLogisticsAction({bundle:b,recipient,ticketId:'1',action:'return',result:' '}),/说明/)
 const returned=applyLogisticsAction({bundle:b,recipient,ticketId:'1',action:'return',result:'地点不明确'})
 assert.equal(returned.items[0].status,'returned')
 assert.equal(returned.items[1].status,'sent')
 assert.equal(returned.items[0].history.at(-1).result,'地点不明确')
})
