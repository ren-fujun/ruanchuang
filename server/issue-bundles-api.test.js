import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { seedData } from './seed.js'

const dir = await mkdtemp(path.join(os.tmpdir(), 'bundle-api-'))
const data = seedData()
data.users.find(user => user.role === 'counselor').studentIds = [...new Set(data.tickets.map(ticket => ticket.studentId))]
data.users.find(user => user.role === 'counselor').logisticsRecipientId = 'test-logistics'
data.users.push({id:'test-logistics',role:'logistics',name:'后勤测试',account:'log-test',password:'test'}, {id:'test-other',role:'logistics',name:'其他后勤',account:'other-test',password:'test'}, {id:'test-unscoped',role:'counselor',name:'未分配辅导员',account:'no-scope',password:'test'})
await writeFile(path.join(dir, 'data.json'), JSON.stringify(data))
const port = 20000 + Math.floor(Math.random()*20000)
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server/index.js'], { env: {...process.env, PORT:String(port), ZHIHUI_DATA_FILE:path.join(dir,'data.json')}, stdio:'inherit' })
async function request(url, token, body, method) {
 const response = await fetch(base+url,{method:method || (body ? 'POST':'GET'),headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,body:await response.json()}
}
try {
 let ready=false
 for(let i=0;i<100;i++) { try { if((await fetch(base+'/api/health')).ok) {ready=true;break} } catch {} await new Promise(r=>setTimeout(r,100)) }
 if (!ready) throw new Error('API did not start')
 await test('counselor creates draft; student and duplicate requests are rejected', async () => {
  const counselor=(await request('/api/auth/demo',null,{role:'counselor'})).body.token
  const student=(await request('/api/auth/demo',null,{role:'student'})).body.token
  const unscoped=(await request('/api/auth/login',null,{account:'no-scope',password:'test'})).body.token
  const tickets=(await request('/api/tickets',counselor)).body.tickets
  const id=tickets.find(t=>t.status==='pending_review' && t.studentId==='stu-lin')?.id; assert.ok(id)
  const own = (await request(`/api/tickets/${id}`,student)).body.ticket
  const supplement = { text:'补充说明楼层及地点', expectedUpdatedAt:own.updatedAt, requestId:'supplement-one' }
  assert.equal((await request(`/api/tickets/${id}/supplements`,student,supplement)).status,200)
  assert.equal((await request(`/api/tickets/${id}/supplements`,student,supplement)).status,200)
  assert.equal((await request(`/api/tickets/${id}/supplements`,student,{...supplement,text:'另一条完全不同的说明'})).status,409)
  assert.equal((await request('/api/issue-bundles',student,{ticketIds:[id]})).status,403)
  assert.equal((await request('/api/issue-bundles',null,{ticketIds:[id]})).status,401)
  assert.equal((await request('/api/issue-bundles',unscoped,{ticketIds:[id]})).status,403)
  const input={ticketIds:[id],title:'宿舍维修',departmentId:'logistics',reviewed:true,requestId:'create-test'}
  const created=await request('/api/issue-bundles',counselor,input); assert.equal(created.status,201); assert.equal(created.body.bundle.status,'draft')
  assert.equal((await request('/api/issue-bundles',counselor,input)).body.item.id,created.body.item.id)
  assert.equal((await request('/api/issue-bundles',counselor,{...input,title:'不同标题'})).status,409)
  assert.equal(created.body.item.title,'宿舍维修'); assert.equal(created.body.item.items[0].ticketId,id)
  assert.equal((await request('/api/issue-bundles',counselor,{ticketIds:[id]})).status,400)
  assert.equal((await request('/api/issue-bundles',counselor)).body.bundles.length,1)
  assert.equal((await request('/api/issue-bundles',counselor)).body.items[0].title,'宿舍维修')
  assert.equal((await request(`/api/issue-bundles/${created.body.bundle.id}`,counselor)).body.item.items.length,1)
  assert.equal((await request(`/api/issue-bundles/${created.body.bundle.id}`,unscoped)).status,404)
  assert.equal((await request(`/api/tickets/${id}`,counselor)).body.ticket.status,'pending_review')
  assert.equal((await request(`/api/tickets/${id}/review`,counselor,{departmentIds:['logistics']},'PATCH')).status,409)
  const bundleId=created.body.bundle.id
  assert.equal((await request(`/api/issue-bundles/${bundleId}`,student,{note:'x'},'PATCH')).status,403)
  assert.equal((await request(`/api/issue-bundles/${bundleId}`,counselor,{note:'已核对'},'PATCH')).body.bundle.note,'已核对')
  assert.equal((await request(`/api/issue-bundles/${bundleId}/cancel`,counselor,{})).body.bundle.status,'cancelled')
  assert.equal((await request(`/api/issue-bundles/${bundleId}/cancel`,counselor,{})).status,409)
  const second=(await request('/api/issue-bundles',counselor,{ticketIds:[id]})); assert.equal(second.status,201)
  const b=second.body.bundle.id
  const send={version:1,reviewed:true,reason:'已经核对',requestId:'send-test'}
  assert.equal((await request(`/api/issue-bundles/${b}/send`,counselor,send)).status,200)
  assert.equal((await request(`/api/issue-bundles/${b}/send`,counselor,send)).status,200)
  assert.equal((await request(`/api/issue-bundles/${b}/urge`,counselor,{version:1,reason:'请处理',requestId:'urge-old'})).status,409)
  assert.equal((await request(`/api/issue-bundles/${b}/dispatch`,counselor,{recipientId:'test-logistics'})).status,400)
  const log=(await request('/api/auth/login',null,{account:'log-test',password:'test'})).body.token
  const other=(await request('/api/auth/login',null,{account:'other-test',password:'test'})).body.token
  assert.equal((await request('/api/logistics/work-orders',other)).body.items.length,0)
  assert.equal((await request(`/api/logistics/work-orders/${b}/${id}`,other,{action:'accept'})).status,404)
  assert.equal((await request(`/api/logistics/work-orders/${b}/${id}`,log,{action:'resolve',result:'处理完成'})).status,409)
  assert.equal((await request(`/api/logistics/work-orders/${b}/${id}`,log,{action:'accept'})).status,200)
  assert.equal((await request(`/api/logistics/work-orders/${b}/${id}`,log,{action:'resolve',result:'处理完成'})).status,200)
  assert.equal((await request(`/api/tickets/${id}`,counselor)).body.ticket.status,'awaiting_confirm')
  const resolved=(await request(`/api/tickets/${id}`,student)).body.ticket
  const reopen={text:'处理后问题仍然没有解决',expectedUpdatedAt:resolved.updatedAt,requestId:'reopen-one'}
  assert.equal((await request(`/api/tickets/${id}/reopen`,student,reopen)).status,200)
  assert.equal((await request(`/api/tickets/${id}/reopen`,student,reopen)).status,200)
  assert.equal((await request(`/api/tickets/${id}/reopen`,student,{...reopen,requestId:'reopen-two'})).status,409)
  assert.equal((await request(`/api/issue-bundles/${b}/${id}/redispatch`,counselor,{})).status,200)
  assert.equal((await request(`/api/logistics/work-orders/${b}/${id}`,log,{action:'accept'})).status,200)
  assert.equal((await request(`/api/logistics/work-orders/${b}/${id}`,log,{action:'resolve',result:'再次处理'})).status,200)
  assert.equal((await request(`/api/tickets/${id}/confirm`,student,{})).body.ticket.status,'completed')
 })
} finally {
 child.kill(); await new Promise(r=>setTimeout(r,100)); await rm(dir,{recursive:true,force:true})
}

