import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareTrialAccounts,configureStudentRelations} from './trial-admin.js'
import {verifyPassword} from './trial-auth.js'
const expiry=new Date(Date.now()+86400000).toISOString()
const rows=[{id:'c1',account:'c1',name:'辅导员',role:'counselor',password:'test-password-123',expiresAt:expiry,studentIds:['s1']},{id:'s1',account:'s1',name:'学生',role:'student',password:'test-password-456',expiresAt:expiry,educationLevel:'undergraduate',counselorIds:['c1']}]
test('creates only password hashes and keeps relationships',()=>{const result=prepareTrialAccounts([],rows);assert.equal(result[0].password,undefined);assert.equal(result[0].mustChangePassword,true);assert.equal(verifyPassword('test-password-123',result[0].passwordHash),true);assert.deepEqual(result[1].counselorIds,['c1'])})
test('rejects unknown fields, duplicates and unauthorized relationships',()=>{
 assert.throws(()=>prepareTrialAccounts([],[{...rows[0],trialAdmin:true}]))
 assert.throws(()=>prepareTrialAccounts([], [rows[0],{...rows[1],id:'c1'}]))
 assert.throws(()=>prepareTrialAccounts([],[{...rows[1],counselorIds:['missing']}]))
 assert.throws(()=>prepareTrialAccounts([],[{...rows[1],role:'mentor'}]))
 assert.throws(()=>prepareTrialAccounts([],[rows[0],{...rows[1],counselorIds:[]}]),/双向一致/)
})
test('updates both sides atomically and validates class advisors',()=>{
 const users=[{id:'s',role:'student',counselorIds:['c1']},{id:'c1',role:'counselor',studentIds:['s','other']},{id:'c2',role:'counselor',studentIds:[]},{id:'m',role:'mentor',classAdvisor:true},{id:'ordinary',role:'mentor'}]
 const original=structuredClone(users)
 assert.throws(()=>configureStudentRelations(users,'s',{educationLevel:'postgraduate',counselorIds:['c2'],classAdvisorIds:['ordinary']}))
 assert.deepEqual(users,original)
 configureStudentRelations(users,'s',{educationLevel:'postgraduate',counselorIds:['c2'],classAdvisorIds:['m']})
 assert.deepEqual(users[0].counselorIds,['c2']);assert.deepEqual(users[0].classAdvisorIds,['m'])
 assert.deepEqual(users[1].studentIds,['other']);assert.deepEqual(users[2].studentIds,['s'])
})
