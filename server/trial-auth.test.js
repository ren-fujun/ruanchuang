import test from 'node:test'
import assert from 'node:assert/strict'
import {hashPassword,verifyPassword,createLoginLimiter} from './trial-auth.js'
test('salted password hashes verify without exposing the password',()=>{
 const a=hashPassword('sample-pass-123'),b=hashPassword('sample-pass-123')
 assert.notEqual(a,b); assert.equal(a.includes('sample-pass-123'),false)
 assert.equal(verifyPassword('sample-pass-123',a),true); assert.equal(verifyPassword('wrong',a),false); assert.equal(verifyPassword('x','scrypt$bad$bad'),false)
})
test('rate limit expires without sharing counters between clients',()=>{
 let time=0; const limiter=createLoginLimiter({limit:2,windowMs:100,clock:()=>time})
 limiter.fail('a'); limiter.fail('a'); assert.equal(limiter.allowed('a'),false); assert.equal(limiter.allowed('b'),true)
 time=101; assert.equal(limiter.allowed('a'),true)
})
