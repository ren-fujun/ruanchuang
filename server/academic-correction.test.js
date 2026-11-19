import test from 'node:test'
import assert from 'node:assert/strict'
import {planAcademicCorrection} from './academic-correction.js'
test('correction plans changes without modifying existing records',()=>{
 const row={studentId:'s',course:'数学',mentorId:'m',counselorId:'c'}, next={...row,mentorId:'m2'}
 const batch={items:[row],caseIds:['case']}, c={id:'case',...row,status:'pending_contact',records:[],version:1}
 assert.equal(planAcademicCorrection(batch,{items:[next]},[c],'更正').retained[0].changed,true)
 const plan=planAcademicCorrection(batch,{items:[{...next,course:'其他'}]},[c],'更正')
 assert.equal(plan.removed[0],c);assert.equal(plan.added.length,1)
 assert.throws(()=>planAcademicCorrection(batch,{items:[next]},[{...c,records:[{text:'记录'}]}],'更正'))
 assert.throws(()=>planAcademicCorrection(batch,{items:[next]},[{...c,collaboration:{status:'proposed',history:[]}}],'更正'))
 assert.throws(()=>planAcademicCorrection(batch,{items:[next]},[c],''))
 assert.throws(()=>planAcademicCorrection(batch,{items:[row,{...row,course:'其他'}]},[c,{...c,id:'other',course:'其他'}],'更正'))
 assert.equal(c.mentorId,'m')
})
