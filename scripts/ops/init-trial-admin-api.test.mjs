import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {once} from 'node:events'
import {createServer} from 'node:net'
import path from 'node:path'
import os from 'node:os'
import {seedData} from '../../server/seed.js'

test('bootstrapped administrator must change password before managing accounts',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'trial-bootstrap-api-'))
 let child
 try {
  const source=path.join(dir,'source.json'), output=path.join(dir,'new.json')
  await writeFile(source,JSON.stringify(seedData()))
  const input=JSON.stringify({id:'test-admin',account:'test-admin',name:'虚构管理员',password:'fictional-password-123',expiresAt:new Date(Date.now()+86400000).toISOString()})
  assert.equal(spawnSync(process.execPath,['scripts/ops/init-trial-admin.mjs',source,output],{input,encoding:'utf8'}).status,0)
  const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r))
  const base=`http://127.0.0.1:${port}`
  child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(port),TRIAL_MODE:'true',ZHIHUI_DATA_FILE:output},stdio:'ignore',windowsHide:true})
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready)
  const call=(url,body,token)=>fetch(base+url,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined})
  const login=await call('/api/auth/login',{account:'test-admin',password:'fictional-password-123'});assert.equal(login.status,200);const {token}=await login.json()
  assert.equal((await call('/api/trial/admin/accounts',null,token)).status,403)
  assert.equal((await call('/api/auth/change-password',{currentPassword:'fictional-password-123',newPassword:'fictional-updated-123'},token)).status,200)
  assert.equal((await call('/api/trial/admin/accounts',null,token)).status,200)
 } finally {if(child){child.kill();await new Promise(r=>setTimeout(r,100))}await rm(dir,{recursive:true,force:true})}
})
