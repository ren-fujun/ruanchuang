import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAcademicCsv} from './academic-csv.js'
const header='studentId,course,mentorId,counselorId\n'
test('parses BOM, quoted commas and escaped quotes',()=>{
 const rows=parseAcademicCsv('\uFEFF'+header+'001,"课程,\"\"进阶\"\"",m1,c1\r\n')
 assert.equal(rows[0].studentId,'001'); assert.equal(rows[0].course,'课程,"进阶"')
})
test('rejects malformed, empty, oversized and unexpected columns',()=>{
 assert.throws(()=>parseAcademicCsv(header+'001,"未闭合,m,c'))
 assert.throws(()=>parseAcademicCsv(header))
 assert.throws(()=>parseAcademicCsv(header+'001,a,m'))
 assert.throws(()=>parseAcademicCsv('name,course,mentorId,counselorId\n001,a,m,c'))
 assert.throws(()=>parseAcademicCsv('x'.repeat(1024*1024+1)))
 assert.throws(()=>parseAcademicCsv(header+Array(1001).fill('001,a,m,c').join('\n')))
})
