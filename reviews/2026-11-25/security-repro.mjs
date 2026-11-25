import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bTrialFixture } from '../../scripts/fixtures/b-trial.mjs'
import { hashPassword } from '../../server/trial-auth.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = await mkdtemp(path.join(os.tmpdir(), 'skill-security-'))
const store = path.join(work, 'store.json')
const db = bTrialFixture()
const pwd = 'review-fixture-pass-2026'
for (const user of db.users) { user.passwordHash = hashPassword(pwd); delete user.password }
const studentA = db.users.find(x => x.id === 'stu-lin')
const studentB = { ...studentA, id:'review-student-b', account:'review-student-b', name:'隔离学生B', counselorIds:['review-counselor-b'], classAdvisorIds:[] }
const counselor = db.users.find(x => x.id === 'cou-chen')
counselor.studentIds = [studentA.id]
const outsider = { ...counselor, id:'review-counselor-b', account:'review-counselor-b', name:'隔离辅导员B', studentIds:['review-student-b'] }
const logistics = { id:'review-logistics', account:'review-logistics', name:'隔离后勤', role:'logistics', campus:'南校区', repairScopes:['南校区'] }
const admin = { id:'review-admin', account:'review-admin', name:'隔离试用管理员', role:'counselor', trialAdmin:true }
for (const u of [studentB, outsider, logistics, admin]) { u.passwordHash=hashPassword(pwd); u.expiresAt=new Date(Date.now()+86400000).toISOString() }
db.users.push(studentB, outsider, logistics, admin)
db.users.find(x=>x.id===studentA.id).campus='北校区'
db.repairs=[]
db.b.cases.push({id:'case-b',studentId:studentB.id,studentName:studentB.name,college:studentB.college,mentorId:'mentor-demo',counselorId:'review-counselor-b',course:'测试课程',status:'pending_contact',version:1,records:[],result:null,createdAt:new Date().toISOString()})
db.b.cases.push({...db.b.cases.find(x=>x.id==='case-b'),id:'case-terminal',status:'completed',records:[]})
db.b.leaves=[]
await writeFile(store,JSON.stringify(db))
await mkdir(path.join(root,'.tmp','skill-security'),{recursive:true})
const port=24000+Math.floor(Math.random()*12000), base=`http://127.0.0.1:${port}`
const child=spawn(process.execPath,['server/index.js'],{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,PORT:String(port),TRIAL_MODE:'true',ZHIHUI_DATA_FILE:store,DEEPSEEK_API_KEY:''}})
let serverErrors=''
child.stderr?.on('data',chunk=>serverErrors+=chunk.toString())
const outcomes=[]
const verify=(label,pass)=>{outcomes.push({label,kind:'response_assertion',pass:Boolean(pass)});if(!pass)throw Error(label)}
const call=async(method,url,token,body,expected,label)=>{
  const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(7000)})
  const data=await r.json().catch(()=>({})); outcomes.push({label,method,url,status:r.status,expected,pass:r.status===expected});
  if(r.status!==expected) throw Error(`${label}: expected ${expected}, got ${r.status}: ${JSON.stringify(data)}`)
  return data
}
try {
  let ready=false; for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,100))}
  if(!ready) throw Error(`isolated server did not become ready: ${serverErrors}`)
  const login=async account=>(await call('POST','/api/auth/login',null,{account,password:pwd},200,`login ${account}`)).token
  const a=await login(studentA.account), b=await login(studentB.account), c=await login(counselor.account), o=await login(outsider.account), l=await login(logistics.account), ad=await login(admin.account), ac=await login('academic')
  const created=await call('POST','/api/repairs',a,{repairType:'其他',location:'北校区隔离楼',description:'合成测试报修',requestId:'repro-create-1'},201,'学生A创建报修')
  const repairId=created.repair.id
  await call('GET',`/api/repairs/${repairId}`,b,undefined,403,'学生B读取学生A报修')
  await call('POST',`/api/repairs/${repairId}/feedback`,b,{decision:'satisfied',version:1,requestId:'cross-write'},403,'学生B写学生A报修反馈')
  await call('GET',`/api/repairs/${repairId}`,o,undefined,403,'非关联辅导员读取报修')
  await call('POST',`/api/repairs/${repairId}/claim`,l,{version:1,requestId:'claim-out-scope'},403,'后勤校区范围越界领取')
  const oldTicket=db.tickets.find(x=>x.studentId===studentA.id)
  if(!oldTicket)throw Error('旧工单fixture缺失')
  await call('GET',`/api/tickets/${oldTicket.id}`,b,undefined,403,'旧工单拒绝其他学生读取')
  await call('GET',`/api/tickets/${oldTicket.id}`,o,undefined,403,'旧工单拒绝非关联辅导员读取')
  await call('GET','/api/trial/admin/accounts',c,undefined,403,'非管理员读取账号列表')
  await call('POST','/api/trial/admin/accounts/lookup',c,{ids:[studentA.id]},403,'非管理员查账号')
  const leave=await call('POST','/api/b/leaves',a,{approverId:counselor.id,startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),reason:'合成请假校验',requestId:'leave-a-001'},201,'学生A提交授权请假')
  await call('POST','/api/b/leaves',a,{approverId:counselor.id,startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),reason:'确定不同的合成请求内容',requestId:'leave-a-001'},409,'请假重复键不同内容冲突')
  await call('POST',`/api/b/leaves/${leave.item.id}/decision`,o,{version:1,action:'approved',note:'越权测试',requestId:'decision-other-001'},403,'非关联辅导员审批请假')
  const academicList=await call('GET','/api/b/cases',ac,undefined,200,'教务读取授权范围内学业名单')
  verify('教务响应不包含未授权学生B',!academicList.items.some(x=>x.studentId===studentB.id))
  await call('POST','/api/b/cases',ac,{studentId:studentB.id,mentorId:'mentor-demo',counselorId:'review-counselor-b',course:'测试课程'},400,'教务跨范围创建学业事项')
  const counselorList=await call('GET','/api/b/cases',o,undefined,200,'辅导员读取关联事项')
  verify('辅导员响应包含学生B且不包含学生A',counselorList.items.some(x=>x.studentId===studentB.id)&&!counselorList.items.some(x=>x.studentId===studentA.id))
  await call('POST','/api/b/cases/case-b/events',c,{type:'contact',text:'不应成功',version:1,requestId:'cross-event-001'},403,'非关联辅导员写他人事项')
  const terminalResponse=await call('POST','/api/b/cases/case-terminal/events',o,{type:'contact',text:'终态回写',version:1,requestId:'terminal-event-001'},409,'学业事项终态拒绝追加动作')
  verify('拒绝确实来自终态校验',terminalResponse.message==='已结束任务不能追加办理动作')
  await call('POST','/api/b/leaves',a,{approverId:outsider.id,startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),reason:'非授权审批人',requestId:'leave-invalid-001'},403,'请假选择非关联辅导员')
  await writeFile(path.join(root,'.tmp','skill-security','security-repro-results.json'),JSON.stringify({mode:'TRIAL_MODE=true',fixture:'synthetic bTrialFixture-derived local store',network:'127.0.0.1 only',externalModel:'disabled',checks:outcomes},null,2))
  console.log(JSON.stringify({checks:outcomes.length,passed:outcomes.filter(x=>x.pass).length,results:outcomes},null,2))
} finally { if(child.exitCode===null){const exited=once(child,'exit');child.kill();await exited}await rm(work,{recursive:true,force:true}) }
