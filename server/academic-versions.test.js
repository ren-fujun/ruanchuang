import test from 'node:test'
import assert from 'node:assert/strict'
import { createAcademicVersion, canReadAcademicVersion } from './academic-versions.js'
const users = [{ id:'s',role:'student' },{ id:'m',role:'mentor' },{ id:'c',role:'counselor' }]
const user = { id:'a', role:'academic', academicStudentIds:['s'] }
const rows = [{ studentId:'s',course:'数学',mentorId:'m',counselorId:'c' }]
const create = (overrides={}) => createAcademicVersion({ user, rows, users, ...overrides })
test('corrections preserve previous version and reject stale updates', () => {
 const first=create().batch; const second=create({previous:first,expectedVersion:1,rows:[{...rows[0],course:'英语'}]}).batch
 assert.equal(first.items[0].course,'数学'); assert.equal(second.version,2); assert.equal(second.previousId,first.id); assert.equal(second.seriesId,first.seriesId)
 assert.throws(()=>create({previous:first,expectedVersion:0}),/版本冲突/)
})
test('only authorized academic users can create or read versions', () => {
 const batch=create().batch
 assert.equal(canReadAcademicVersion(user,batch),true)
 assert.equal(canReadAcademicVersion({...user,academicStudentIds:[]},batch),false)
 assert.throws(()=>create({user:{...user,role:'mentor'}}),/无权/)
 assert.throws(()=>create({user:{...user,academicStudentIds:[]}}),/无权/)
 assert.throws(()=>create({user:{...user,id:'other'},previous:batch,expectedVersion:1}),/无权/)
})
test('rejects invalid assignments without producing a batch', () => {
 const result=create({rows:[{...rows[0],mentorId:'c'}]}); assert.equal(result.valid,false); assert.match(result.errors[0].messages[0],/导师/)
})
