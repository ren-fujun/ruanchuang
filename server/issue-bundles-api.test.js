import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const dir = await mkdtemp(path.join(os.tmpdir(), 'bundle-api-'))
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
  const tickets=(await request('/api/tickets',counselor)).body.tickets
  const id=tickets.find(t=>t.status==='pending_review')?.id; assert.ok(id)
  assert.equal((await request('/api/issue-bundles',student,{ticketIds:[id]})).status,403)
  assert.equal((await request('/api/issue-bundles',null,{ticketIds:[id]})).status,401)
  const created=await request('/api/issue-bundles',counselor,{ticketIds:[id]}); assert.equal(created.status,201); assert.equal(created.body.bundle.status,'draft')
  assert.equal((await request('/api/issue-bundles',counselor,{ticketIds:[id]})).status,400)
  assert.equal((await request('/api/issue-bundles',counselor)).body.bundles.length,1)
  assert.equal((await request(`/api/tickets/${id}`,counselor)).body.ticket.status,'pending_review')
  assert.equal((await request(`/api/tickets/${id}/review`,counselor,{departmentIds:['logistics']},'PATCH')).status,409)
  const bundleId=created.body.bundle.id
  assert.equal((await request(`/api/issue-bundles/${bundleId}`,student,{note:'x'},'PATCH')).status,403)
  assert.equal((await request(`/api/issue-bundles/${bundleId}`,counselor,{note:'已核对'},'PATCH')).body.bundle.note,'已核对')
  assert.equal((await request(`/api/issue-bundles/${bundleId}/cancel`,counselor,{})).body.bundle.status,'cancelled')
  assert.equal((await request(`/api/issue-bundles/${bundleId}/cancel`,counselor,{})).status,409)
  assert.equal((await request('/api/issue-bundles',counselor,{ticketIds:[id]})).status,201)
 })
} finally {
 child.kill(); await new Promise(r=>setTimeout(r,100)); await rm(dir,{recursive:true,force:true})
}

