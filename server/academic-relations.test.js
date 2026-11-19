import test from 'node:test'
import assert from 'node:assert/strict'
import {academicRelationsValid} from './academic-relations.js'
test('academic assignments require active authorized and mutually linked people',()=>{
 const user={college:'虚构学院'}, rows=[{studentId:'s',mentorId:'m',counselorId:'c'}]
 const users=[{id:'s',role:'student',college:'虚构学院',counselorIds:['c']},{id:'m',role:'mentor',college:'虚构学院'},{id:'c',role:'counselor',studentIds:['s']}]
 assert.equal(academicRelationsValid(user,rows,users),true)
 for(const index of [0,1,2]) {
  for(const change of [{disabled:true},{expiresAt:'2000-01-01'},{expiresAt:'invalid'}]) {
   const modified=structuredClone(users);Object.assign(modified[index],change)
   assert.equal(academicRelationsValid(user,rows,modified),false)
  }
 }
 const modified=structuredClone(users);modified[2].studentIds=[]
 assert.equal(academicRelationsValid(user,rows,modified),false)
})
