import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareTrialAccounts} from './trial-admin.js'
import {verifyPassword} from './trial-auth.js'
const expiry=new Date(Date.now()+86400000).toISOString()
const rows=[{id:'c1',account:'c1',name:'辅导员',role:'counselor',password:'test-password-123',expiresAt:expiry,studentIds:['s1']},{id:'s1',account:'s1',name:'学生',role:'student',password:'test-password-456',expiresAt:expiry,educationLevel:'undergraduate',counselorIds:['c1']}]
test('creates only password hashes and keeps relationships',()=>{const result=prepareTrialAccounts([],rows);assert.equal(result[0].password,undefined);assert.equal(result[0].mustChangePassword,true);assert.equal(verifyPassword('test-password-123',result[0].passwordHash),true);assert.deepEqual(result[1].counselorIds,['c1'])})
test('rejects unknown fields, duplicates and unauthorized relationships',()=>{
 assert.throws(()=>prepareTrialAccounts([],[{...rows[0],trialAdmin:true}]))
 assert.throws(()=>prepareTrialAccounts([], [rows[0],{...rows[1],id:'c1'}]))
 assert.throws(()=>prepareTrialAccounts([],[{...rows[1],counselorIds:['missing']}]))
 assert.throws(()=>prepareTrialAccounts([],[{...rows[1],role:'mentor'}]))
})
