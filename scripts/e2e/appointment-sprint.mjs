import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { bTrialFixture } from '../fixtures/b-trial.mjs'

await mkdir('.tmp/appointment-sprint', { recursive: true })
const dir = await mkdtemp(path.resolve('.tmp/appointment-sprint/run-'))
const file = path.join(dir, 'store.json'), fixture = bTrialFixture()
const counselor = fixture.users.find(u => u.id === 'cou-chen')
const students = Array.from({length:20}, (_,i)=>({id:`sprint-${i}`,account:`sprint-${i}`,password:'123456',name:`虚构同学${i}`,role:'student',college:'模拟学院A',educationLevel:'undergraduate',counselorIds:[counselor.id]}))
counselor.studentIds.push(...students.map(s=>s.id))
fixture.users.push(...students,{id:'sprint-other',account:'sprint-other',password:'123456',name:'模拟学院B老师',college:'模拟学院B',role:'counselor',studentIds:[]})
await writeFile(file,JSON.stringify(fixture))
const probe=createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r))
const base=`http://127.0.0.1:${port}/api`;let child,logs='',checks=0
async function freePort(){const s=createServer().listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p}
async function start(){logs='';child=spawn(process.execPath,['server/index.js'],{windowsHide:true,env:{...process.env,PORT:String(port),ZHIHUI_DATA_FILE:file,B_DEMO:'false',DEEPSEEK_API_KEY:'',APPOINTMENT_ADVICE_LLM:'false'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);const until=Date.now()+15000;while(!logs.includes('已启动')){if(child.exitCode!==null||Date.now()>until)throw Error(logs||'启动超时');await new Promise(r=>setTimeout(r,50))}}
async function stop(){if(child&&child.exitCode===null){const p=once(child,'exit');child.kill();await p}}
const call=async(url,token,body,expected=200,method)=>{const r=await fetch(base+url,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const text=await r.text();assert.equal(r.status,expected,`${url}: ${text}`);checks++;return r.headers.get('content-type')?.includes('application/json')?JSON.parse(text):text}
const login=async(account)=>(await call('/auth/login',null,{account,password:'123456'})).token
let report
try{
  await start();let teacher=await login('chenyuan'),other=await login('sprint-other');const tokens=await Promise.all(students.map(s=>login(s.account)))
  const t=Math.ceil((Date.now()+86400000)/300000)*300000
  const open=async(offset,length)=>(await call('/appointments/slots',teacher,{startsAt:new Date(t+offset*60000).toISOString(),endsAt:new Date(t+(offset+length)*60000).toISOString()},201)).item
  const a=await open(0,30),b=await open(60,30)
  const request={slotIds:[a.id,b.id],topic:'虚构测试签字',minutes:5,requestId:crypto.randomUUID()}
  const duplicates=await Promise.all(Array.from({length:8},()=>fetch(base+'/appointments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tokens[0]}`},body:JSON.stringify(request)}).then(async r=>{assert([200,201].includes(r.status));return (await r.json()).item.id})))
  assert.equal(new Set(duplicates).size,1);checks++
  for(let i=1;i<20;i++)await call('/appointments',tokens[i],{...request,requestId:crypto.randomUUID()},201)
  await call('/appointments/batch',other,{slotId:a.id},404)
  await Promise.all(Array.from({length:5},()=>call('/appointments/batch',teacher,{slotId:a.id})))
  let all=(await call('/appointments',teacher)).items.filter(x=>x.topic==='虚构测试签字')
  const confirmed=all.filter(x=>x.status==='scheduled'),waiting=all.filter(x=>x.status==='waitlisted')
  assert.equal(confirmed.length,12);assert.equal(waiting.length,8);checks+=2
  const conflicts=confirmed.flatMap((x,i)=>confirmed.slice(i+1).filter(y=>Date.parse(x.startsAt)<Date.parse(y.endsAt)&&Date.parse(x.endsAt)>Date.parse(y.startsAt)))
  assert.equal(conflicts.length,0);checks++
  const own=all.find(x=>x.studentId===students[0].id)
  await call(`/appointments/${own.id}/messages`,tokens[1],{text:'越权'},404)
  await call(`/appointments/${own.id}/messages`,tokens[0],{text:'同学的虚构留言'},201)
  assert((await call('/appointments',teacher)).items.find(x=>x.id===own.id).unread>0);checks++
  assert((await call(`/appointments/${own.id}/messages`,teacher)).items.some(x=>x.text==='同学的虚构留言'));checks++
  await call(`/appointments/${own.id}/messages`,teacher,{text:'老师的虚构回复'},201)
  const preserved=confirmed.filter(x=>x.id!==own.id).map(x=>[x.id,x.startsAt])
  await call(`/appointments/${own.id}/cancel`,tokens[0],{version:own.version,reason:'虚构取消测试'})
  all=(await call('/appointments',teacher)).items.filter(x=>x.topic==='虚构测试签字')
  assert.equal(all.filter(x=>x.status==='scheduled').length,12);checks++
  for(const [id,start] of preserved){assert.equal(all.find(x=>x.id===id).startsAt,start);checks++}
  const mixed=await open(120,30), mixedItems=[]
  for(const [i,minutes] of [5,5,20,20].entries())mixedItems.push((await call('/appointments',tokens[i],{slotIds:[mixed.id],topic:'混合时长测试',minutes,requestId:crypto.randomUUID()},201)).item)
  await call('/appointments/batch',teacher,{slotId:mixed.id})
  let mixedList=(await call('/appointments',teacher)).items.filter(x=>x.topic==='混合时长测试')
  assert.deepEqual(mixedList.map(x=>x.status),['scheduled','scheduled','scheduled','waitlisted']);checks++
  await call(`/appointments/${mixedList[2].id}/cancel`,tokens[2],{version:mixedList[2].version})
  mixedList=(await call('/appointments',teacher)).items.filter(x=>x.topic==='混合时长测试')
  assert.equal(mixedList[3].status,'scheduled');checks++
  const completed=(await call(`/appointments/${mixedList[0].id}/complete`,teacher,{version:mixedList[0].version,outcome:'虚构帮扶结果：材料已核对'},200,'PATCH')).item
  assert.equal(completed.status,'completed');checks++
  await call(`/appointments/${mixedList[0].id}/complete`,teacher,{version:mixedList[0].version,outcome:'旧版本重复'},409,'PATCH')
  const prioritySlot=await open(180,20), priorityItems=[]
  for(let i=0;i<2;i++)priorityItems.push((await call('/appointments',tokens[i],{slotIds:[prioritySlot.id],topic:'期限优先测试',minutes:20,requestId:crypto.randomUUID()},201)).item)
  await call(`/appointments/${priorityItems[1].id}/confirm-deadline`,teacher,{version:priorityItems[1].version,deadlineAt:new Date(t+240*60000).toISOString()},200,'PATCH')
  await call('/appointments/batch',teacher,{slotId:prioritySlot.id})
  const prioritized=(await call('/appointments',teacher)).items.find(x=>x.id===priorityItems[1].id)
  assert.equal(prioritized.status,'scheduled');checks++
  await new Promise(r=>setTimeout(r,100));await stop();await start();teacher=await login('chenyuan');const token=await login(students[0].account)
  assert.equal((await call('/appointments',teacher)).items.filter(x=>x.topic==='虚构测试签字').length,20);checks++
  assert.equal((await call(`/appointments/${own.id}/messages`,token)).items.length,2);checks++
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.appointments.filter(x=>x.topic==='虚构测试签字').length,20);checks++
  if(process.argv.includes('--ui')){
    await open(300,30)
    const {createServer: createVite}=await import('vite'),{chromium}=await import('playwright')
    process.env.PORTAL_API_URL=`http://127.0.0.1:${port}`
    const web=await createVite({configFile:'apps/student/vite.config.mjs',server:{port:await freePort(),open:false}}), teacherWeb=await createVite({configFile:'apps/counselor/vite.config.mjs',server:{port:await freePort(),open:false}});let browser
    try{
      await web.listen();const origin=`http://127.0.0.1:${web.httpServer.address().port}`
      browser=await chromium.launch({channel:'msedge',headless:true})
      const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:path.join(dir,'video'),size:{width:390,height:844}}})
      const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message))
      await page.goto(origin);await page.evaluate(token=>localStorage.setItem('zhihui_token',token),token);await page.goto(origin+'/student/appointments');await page.getByLabel('预约事项').waitFor()
      await page.getByLabel('预约事项').fill('浏览器签字预约');await page.getByRole('button',{name:'获取事项建议',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('input[type=number]')?.value==='5')
      await page.locator('.c-appointment-slot').last().click();await page.getByRole('button',{name:/提交申请/}).click();await page.getByText('浏览器签字预约',{exact:true}).waitFor()
      for(const width of [390,412]){await page.setViewportSize({width,height:844});await page.screenshot({path:path.join(dir,`student-${width}.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'页面横向溢出');checks++}
      const appointment=(await call('/appointments',token)).items.find(x=>x.topic==='浏览器签字预约')
      await teacherWeb.listen();const teacherOrigin=`http://127.0.0.1:${teacherWeb.httpServer.address().port}`
      const teacherPage=await context.newPage();await teacherPage.goto(teacherOrigin);await teacherPage.evaluate(token=>localStorage.setItem('zhihui_token',token),teacher);await teacherPage.goto(teacherOrigin+'/counselor/appointments');await teacherPage.setViewportSize({width:1440,height:1000})
      const entry=teacherPage.locator('.c-appointment-entry').filter({hasText:'浏览器签字预约'})
      await entry.getByLabel('办理截止时间').fill(new Date(t+360*60000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));await entry.getByRole('button',{name:'确认办理期限',exact:true}).click();await teacherPage.getByText('办理期限已设置',{exact:true}).waitFor()
      await call('/appointments/batch',teacher,{slotId:appointment.slotId});await teacherPage.reload();await entry.getByLabel('帮扶结果').fill('浏览器验证：已核对材料');await entry.getByRole('button',{name:'完成并记录结果',exact:true}).click();await teacherPage.getByText('帮扶结果已记录',{exact:true}).waitFor()
      await entry.locator('summary').click();await entry.getByLabel('留言',{exact:true}).fill('浏览器老师留言');await entry.getByRole('button',{name:'发送',exact:true}).click();await entry.getByText('留言已发送',{exact:true}).waitFor()
      await teacherPage.screenshot({path:path.join(dir,'counselor.png'),fullPage:true})
      // Context localStorage is shared, so restore the student session before reloading.
      await page.evaluate(token=>localStorage.setItem('zhihui_token',token),token);await page.reload();const studentEntry=page.locator('.c-appointment-entry').filter({hasText:'浏览器签字预约'});await studentEntry.getByText('帮扶结果：浏览器验证：已核对材料',{exact:true}).waitFor();await studentEntry.locator('summary').click();await studentEntry.getByText(/浏览器老师留言/).waitFor();await studentEntry.getByLabel('留言',{exact:true}).fill('浏览器学生回复');await studentEntry.getByRole('button',{name:'发送',exact:true}).click();await studentEntry.getByText('留言已发送',{exact:true}).waitFor();assert.deepEqual(errors,[]);checks++
      await context.close();report={ui:true}
    }finally{await browser?.close();await web.close();await teacherWeb.close()}
  }
  report={...report,status:'passed',checks,requests:20,confirmedBeforeCancel:12,waitlistedBeforeCancel:8,allocatedMinutes:60,duplicateOccupancies:0,concurrentBatchCalls:5,duplicateRequests:8,persistence:true,mixedDuration:true,deadlinePriority:true,outcome:true,note:'合成请求、两个30分钟窗口。无历史旧版对比，不能推断真实效率提升。'}
  console.log('APPOINTMENT_SPRINT_OK',JSON.stringify(report),dir)
}catch(e){report={status:'failed',checks,error:e.message,logs};throw e}finally{await stop();await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2))}
