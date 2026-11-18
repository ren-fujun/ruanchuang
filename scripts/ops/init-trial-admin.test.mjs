import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import {verifyPassword} from '../../server/trial-auth.js'

test('offline bootstrap preserves source, hashes secrets and refuses reinitialization',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'trial-bootstrap-'))
 try {
  const source=path.join(dir,'source.json'), output=path.join(dir,'output.json'), next=path.join(dir,'next.json')
  const original={users:[],tickets:[]};await writeFile(source,JSON.stringify(original))
  const input=JSON.stringify({id:'test-admin',account:'test-admin',name:'虚构管理员',password:'fictional-password-123',expiresAt:new Date(Date.now()+86400000).toISOString()})
  const run=(a,b)=>spawnSync(process.execPath,['scripts/ops/init-trial-admin.mjs',a,b],{input,encoding:'utf8'})
  const result=run(source,output);assert.equal(result.status,0);assert.ok(!result.stdout.includes('fictional-password'))
  assert.deepEqual(JSON.parse(await readFile(source,'utf8')),original)
  const admin=JSON.parse(await readFile(output,'utf8')).users[0]
  assert.equal(admin.trialAdmin,true);assert.equal(admin.mustChangePassword,true);assert.equal(admin.password,undefined);assert.ok(verifyPassword('fictional-password-123',admin.passwordHash))
  assert.notEqual(run(output,next).status,0);assert.notEqual(run(source,output).status,0);assert.notEqual(run(source,source).status,0)
 }finally{await rm(dir,{recursive:true,force:true})}
})
