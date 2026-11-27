// Same synthetic payloads against 2254f53 and current route modules.
// Calls route handlers in memory; does not measure HTTP latency or user efficiency.
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mountAppointments } from '../../server/appointments.js'

await mkdir('.tmp/appointment-comparison',{recursive:true})
const dir=await mkdtemp(path.resolve('.tmp/appointment-comparison/run-'))
const baseline=execFileSync('git',['show','2254f53:server/appointments.js'],{encoding:'utf8'})
const moduleFile=path.join(dir,'baseline.mjs')
await writeFile(moduleFile,baseline.replace("'./b/appointment-advice.js'",JSON.stringify(pathToFileURL(path.resolve('server/b/appointment-advice.js')).href)))
const oldMount=(await import(pathToFileURL(moduleFile))).mountAppointments
function run(mount){
  const routes=new Map(),app=Object.fromEntries(['get','post','patch'].map(method=>[method,(url,...handlers)=>routes.set(method+url,handlers.at(-1))]))
  const students=Array.from({length:20},(_,i)=>({id:`s${i}`,role:'student'})),teacher={id:'c',role:'counselor',studentIds:students.map(s=>s.id)},db={users:[teacher,...students]}
  mount(app,{db,save(){},requireAuth(){}})
  const call=(method,url,user,body={})=>{let result,status=200;routes.get(method+url)({user,body,params:{}},{json(value){result=value;return this},status(value){status=value;return this},sendStatus(value){status=value}});if(status>=400)throw Error(url+': '+status);return result}
  const t=Math.ceil((Date.now()+86400000)/300000)*300000
  const slots=[0,60].map(offset=>call('post','/api/appointments/slots',teacher,{startsAt:new Date(t+offset*60000).toISOString(),endsAt:new Date(t+(offset+30)*60000).toISOString()}).item)
  for(const s of students)call('post','/api/appointments',s,{slotId:slots[0].id,slotIds:slots.map(x=>x.id),topic:'同题签字测试',minutes:5,requestId:s.id})
  call('post','/api/appointments/batch',teacher,{slotId:slots[0].id})
  const confirmed=db.appointments.filter(a=>a.status==='scheduled')
  return {requests:20,confirmed:confirmed.length,waitlisted:db.appointments.filter(a=>a.status==='waitlisted').length,allocatedMinutes:confirmed.reduce((n,a)=>n+a.minutes,0),duplicateOccupancies:confirmed.flatMap((a,i)=>confirmed.slice(i+1).filter(b=>Date.parse(a.startsAt)<Date.parse(b.endsAt)&&Date.parse(a.endsAt)>Date.parse(b.startsAt))).length}
}
try{
  const report={baselineCommit:'2254f53',currentFileSha256:createHash('sha256').update(await readFile('server/appointments.js')).digest('hex'),scope:'相同20个合成请求，每项5分钟，提供两个30分钟意向窗口；旧模块仅支持slotId，新模块支持slotIds。内存路由对照，不是HTTP性能或真实用户结果。',baseline:run(oldMount),current:run(mountAppointments)}
  await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dir,...report}))
}finally{await rm(moduleFile)}
