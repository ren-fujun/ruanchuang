import test from 'node:test'
import assert from 'node:assert/strict'
import {leaveApprovers} from './leaves.js'

test('students cannot select disabled, expired or unqualified approvers',()=>{
 const future=new Date(Date.now()+60000).toISOString(), past=new Date(Date.now()-60000).toISOString()
 const db={users:[{id:'ok',role:'counselor',expiresAt:future},{id:'expired',role:'counselor',expiresAt:past},{id:'invalid',role:'counselor',expiresAt:'bad'},{id:'disabled',role:'counselor',disabled:true},{id:'mentor',role:'mentor'},{id:'advisor',role:'mentor',classAdvisor:true}]}
 const student={educationLevel:'undergraduate',counselorIds:['ok','expired','invalid','disabled']}
 assert.deepEqual(leaveApprovers(db,student).map(u=>u.id),['ok'])
 assert.deepEqual(leaveApprovers(db,{educationLevel:'postgraduate',classAdvisorIds:['mentor','advisor']}).map(u=>u.id),['advisor'])
})
