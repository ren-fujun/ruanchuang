import test from 'node:test'
import assert from 'node:assert/strict'
import {planAcademicCorrection} from './academic-correction.js'
test('correction permits untouched reassignment and rejects changed or active cases',()=>{
 const row={studentId:'s',course:'数学',mentorId:'m',counselorId:'c'}, next={...row,mentorId:'m2'}
 const batch={items:[row],caseIds:['case']}, c={id:'case',...row,status:'pending_contact',records:[],version:1}
 assert.equal(planAcademicCorrection(batch,{items:[next]},[c],'更正').length,1)
 assert.throws(()=>planAcademicCorrection(batch,{items:[{...next,course:'其他'}]},[c],'更正'))
 assert.throws(()=>planAcademicCorrection(batch,{items:[next]},[{...c,records:[{text:'记录'}]}],'更正'))
 assert.throws(()=>planAcademicCorrection(batch,{items:[next]},[{...c,collaboration:{status:'proposed',history:[]}}],'更正'))
 assert.throws(()=>planAcademicCorrection(batch,{items:[next]},[c],''))
 assert.equal(c.mentorId,'m')
})
