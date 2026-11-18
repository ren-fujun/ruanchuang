import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {seedData} from './seed.js'
import {hashPassword} from './trial-auth.js'
const dir=await mkdtemp(path.join(os.tmpdir(),'trial-auth-'))
const file=path.join(dir,'store.json'), data=seedData()
data.users.push({id:'trial-user',role:'student',name:'测试学生',account:'trial-user',passwordHash:hashPassword('testing-pass-123'),mustChangePassword:true})
data.users.push({id:'disabled-user',role:'student',name:'测试停用',account:'disabled-user',passwordHash:hashPassword('testing-pass-123'),disabled:true})
data.users.push({id:'trial-admin',role:'counselor',name:'测试管理员',account:'trial-admin',passwordHash:hashPassword('admin-pass-123'),trialAdmin:true})
data.users.push({id:'trial-counselor',role:'counselor',name:'测试辅导员',account:'trial-counselor',passwordHash:hashPassword('staff-pass-123')})
data.sessions.push({token:'old-session',userId:'trial-user',at:new Date().toISOString()})
await writeFile(file,JSON.stringify(data))
const port=20000+Math.floor(Math.random()*20000),base=`http://127.0.0.1:${port}`
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,TRIAL_MODE:'true',PORT:String(port),ZHIHUI_DATA_FILE:file},stdio:'ignore'})
const call=async(path,body,token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}}
try {
 let ready=false;for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}if(!ready)throw new Error('服务启动失败')
 await test('trial mode denies demos, old sessions and plaintext users',async()=>{
  assert.equal((await call('/api/auth/demo',{role:'student'})).status,403)
  assert.equal((await call('/api/me',null,'old-session')).status,401)
  assert.equal((await call('/api/auth/login',{account:'20230118',password:'123456'})).status,401)
  assert.equal((await call('/api/auth/login',{account:'disabled-user',password:'testing-pass-123'})).status,401)
  const ok=await call('/api/auth/login',{account:'trial-user',password:'testing-pass-123'})
  assert.equal(ok.status,200);assert.equal(ok.body.user.passwordHash,undefined)
  assert.equal((await call('/api/me',null,ok.body.token)).status,200)
  assert.equal((await call('/api/tickets',null,ok.body.token)).status,403)
  assert.equal((await call('/api/auth/change-password',{currentPassword:'wrong',newPassword:'replacement-pass-123'},ok.body.token)).status,401)
  assert.equal((await call('/api/auth/change-password',{currentPassword:'testing-pass-123',newPassword:'replacement-pass-123'},ok.body.token)).status,200)
  assert.equal((await call('/api/tickets',null,ok.body.token)).status,200)
  const feedback={type:'problem',description:'测试页面反馈',rating:3,pagePath:'/student/home',requestId:'feedback-test',actorId:'forged'}
  const saved=await call('/api/trial/feedback',feedback,ok.body.token);assert.equal(saved.status,201)
  assert.equal((await call('/api/trial/feedback',feedback,ok.body.token)).body.item.id,saved.body.item.id)
  assert.equal((await call('/api/trial/feedback',{...feedback,description:'不同内容'},ok.body.token)).status,409)
  assert.equal((await call('/api/trial/feedback',null,ok.body.token)).status,403)
  const staff=(await call('/api/auth/login',{account:'trial-counselor',password:'staff-pass-123'})).body.token
  assert.equal((await call('/api/trial/feedback',null,staff)).status,403)
  const admin=(await call('/api/auth/login',{account:'trial-admin',password:'admin-pass-123'})).body.token
  const list=await call('/api/trial/feedback',null,admin);assert.equal(list.body.items.length,1);assert.equal(list.body.items[0].actorId,'trial-user')
  const expiresAt=new Date(Date.now()+86400000).toISOString()
  const accounts=[{id:'test-c1',account:'test-c1',name:'虚构辅导员',role:'counselor',password:'temporary-pass-123',expiresAt,studentIds:['test-s1']},{id:'test-s1',account:'test-s1',name:'虚构学生',role:'student',password:'temporary-pass-456',expiresAt,educationLevel:'undergraduate',counselorIds:['test-c1']}]
  assert.equal((await call('/api/trial/admin/accounts',{accounts},staff)).status,403)
  assert.equal((await call('/api/trial/admin/accounts',{accounts:[{...accounts[1],id:'test-invalid',trialAdmin:true}]},admin)).status,400)
  const created=await call('/api/trial/admin/accounts',{accounts},admin);assert.equal(created.status,201);assert.equal(JSON.stringify(created.body).includes('temporary-pass'),false)
  assert.equal((await call('/api/trial/admin/accounts',{accounts},admin)).status,400)
  const relations={educationLevel:'undergraduate',counselorIds:['test-c1'],classAdvisorIds:[]}
  assert.equal((await call('/api/trial/admin/accounts',null,staff)).status,403)
  const listing=await call('/api/trial/admin/accounts?offset=0&limit=100',null,admin)
  assert.equal(listing.status,200);assert.equal(JSON.stringify(listing.body).includes('passwordHash'),false);assert.equal(JSON.stringify(listing.body).includes('temporary-pass'),false)
  assert.equal((await call('/api/trial/admin/accounts?limit=101',null,admin)).status,400)
  assert.equal((await call('/api/trial/admin/accounts/test-s1/relations',relations,staff)).status,403)
  assert.equal((await call('/api/trial/admin/accounts/test-s1/relations',{...relations,counselorIds:['missing']},admin)).status,400)
  assert.equal((await call('/api/trial/admin/accounts/test-s1/relations',relations,admin)).status,200)
  const newStudent=await call('/api/auth/login',{account:'test-s1',password:'temporary-pass-456'});assert.equal(newStudent.status,200);assert.equal((await call('/api/tickets',null,newStudent.body.token)).status,403)
  assert.equal((await call('/api/trial/admin/accounts/test-s1/reset-password',{password:'replacement-pass-789'},admin)).status,200)
  assert.equal((await call('/api/me',null,newStudent.body.token)).status,401)
  assert.equal((await call('/api/trial/admin/accounts/test-s1/status',{disabled:true},admin)).status,200)
  assert.equal((await call('/api/auth/login',{account:'test-s1',password:'replacement-pass-789'})).status,401)
  assert.equal((await call('/api/auth/login',{account:'trial-user',password:'testing-pass-123'})).status,401)
  assert.equal((await call('/api/auth/login',{account:'trial-user',password:'replacement-pass-123'})).status,200)
  for (let i=0;i<10;i++) assert.equal((await call('/api/auth/login',{account:'trial-user',password:'incorrect'})).status,401)
  assert.equal((await call('/api/auth/login',{account:'trial-user',password:'replacement-pass-123'})).status,429)
 })
}finally{child.kill();await new Promise(r=>setTimeout(r,100));await rm(dir,{recursive:true,force:true})}
