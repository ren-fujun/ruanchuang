import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createServer as netServer} from 'node:net'
import {createServer as viteServer} from 'vite'
import {chromium} from 'playwright'
import {seedData} from '../../server/seed.js'
import {hashPassword} from '../../server/trial-auth.js'
const dir=await mkdtemp(path.join(os.tmpdir(),'trial-password-ui-')),file=path.join(dir,'data.json'),data=seedData()
for(const role of ['student','counselor','academic','logistics','mentor'])data.users.push({id:`ui-${role}`,account:`ui-${role}`,name:`测试${role}`,role,passwordHash:hashPassword('initial-password-123'),mustChangePassword:true,studentIds:[],academicStudentIds:[],repairScopes:[]})
await writeFile(file,JSON.stringify(data))
async function port(){const s=netServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p}
const n=await port(),base=`http://127.0.0.1:${n}`
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,TRIAL_MODE:'true',PORT:String(n),ZHIHUI_DATA_FILE:file,DEEPSEEK_API_KEY:''},stdio:'ignore',windowsHide:true})
let browser;const servers=[]
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}if(!ready)throw new Error('后端未启动')
 process.env.PORTAL_API_URL=base
 const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);if(!edge)throw new Error('未找到 Edge')
 browser=await chromium.launch({executablePath:edge,headless:true})
 for(const role of ['student','counselor','academic','logistics','mentor']){
  const v=await viteServer({configFile:`apps/${role}/vite.config.mjs`,server:{port:await port(),open:false}});await v.listen();servers.push(v)
  const context=await browser.newContext();const page=await context.newPage();await page.goto(`http://127.0.0.1:${v.config.server.port}/login`)
  await page.getByLabel('账号',{exact:true}).fill(`ui-${role}`);await page.getByLabel('密码',{exact:true}).fill('initial-password-123')
  await page.getByRole('button',{name:role==='logistics'?'进入后勤维修台':'登录',exact:true}).click()
  await page.getByText(role==='academic'?'修改初始密码':'请先修改初始密码',{exact:true}).waitFor()
  await page.getByLabel('当前密码',{exact:true}).fill('initial-password-123');await page.getByLabel('新密码',{exact:true}).fill('replacement-password-456')
  if(role!=='academic')await page.getByLabel('确认新密码',{exact:true}).fill('replacement-password-456')
  await page.getByRole('button',{name:role==='academic'?'修改密码':'确认修改',exact:true}).click()
  await page.getByText(role==='academic'?'密码已修改。':'请先修改初始密码',{exact:true}).waitFor({state:role==='academic'?'visible':'hidden'})
  const token=await page.evaluate(key=>localStorage.getItem(key),role==='academic'?'academic_token':role==='mentor'?'b_portal_token':'zhihui_token')
  const me=await fetch(base+'/api/me',{headers:{Authorization:`Bearer ${token}`}});const payload=await me.json();assert.equal(me.status,200);assert.equal(payload.user.mustChangePassword,false)
  await context.close();console.log(`PASS ${role} 首次改密`)
 }
}finally{await browser?.close();await Promise.allSettled(servers.map(s=>s.close()));child.kill();await new Promise(r=>setTimeout(r,100));await rm(dir,{recursive:true,force:true})}
