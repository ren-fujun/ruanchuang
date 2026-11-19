import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createServer as createNetServer} from 'node:net'
import {createServer as createViteServer} from 'vite'
import {chromium} from 'playwright'
import {seedData} from '../../server/seed.js'
const dir=await mkdtemp(path.join(os.tmpdir(),'academic-live-'))
const data=seedData()
data.users.push({id:'academic-test',role:'academic',name:'测试教务',account:'academic-test',password:'test-password',college:'信息工程学院',academicStudentIds:['stu-lin']},{id:'mentor-test',role:'mentor',name:'测试导师',account:'mentor-test',password:'test-password',college:'信息工程学院'})
data.users.push({id:'mentor-other-test',role:'mentor',name:'另一虚构导师',account:'mentor-other-test',password:'test-password',college:'信息工程学院'})
const file=path.join(dir,'data.json');await writeFile(file,JSON.stringify(data))
async function port(){const server=createNetServer();server.listen(0,'127.0.0.1');await once(server,'listening');const value=server.address().port;await new Promise(r=>server.close(r));return value}
const apiPort=await port(),api=`http://127.0.0.1:${apiPort}`
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(apiPort),ZHIHUI_DATA_FILE:file,DEEPSEEK_API_KEY:''},stdio:'ignore',windowsHide:true})
let vite,browser
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(api+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}if(!ready)throw new Error('后端未能启动')
 process.env.PORTAL_API_URL=api
 vite=await createViteServer({configFile:'apps/academic/vite.config.mjs',server:{port:await port(),open:false}});await vite.listen()
 const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
 if(!edge)throw new Error('未找到 Edge')
 browser=await chromium.launch({executablePath:edge,headless:true});const page=await browser.newPage()
 await page.goto(`http://127.0.0.1:${vite.config.server.port}`)
 await page.getByLabel('账号').fill('academic-test');await page.getByLabel('密码').fill('test-password');await page.getByRole('button',{name:'登录',exact:true}).click()
 await page.getByRole('heading',{name:'教务处 · 名单批次'}).waitFor()
 await page.getByLabel('选择 CSV 文件').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from([0xff,0xfe])})
 await page.getByText('文件读取失败，请使用 UTF-8 编码的 CSV。').waitFor()
 await page.getByLabel('选择 CSV 文件').setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from('studentId,course,mentorId,counselorId\nstu-lin,联调数学,mentor-test,cou-chen')})
 await page.getByText('文件已读取，请校验并预览。').waitFor()
 await page.getByRole('button',{name:'服务器校验并预览'}).click()
 await page.getByText('服务器校验通过，请核对后保存。').waitFor()
 await page.getByRole('button',{name:'确认保存名单'}).click()
 await page.getByText('待分发',{exact:true}).waitFor()
 await page.getByRole('button',{name:'更正名单'}).click()
 await page.getByText('正在更正版本 1', {exact:false}).first().waitFor()
 await page.getByLabel('CSV 内容').fill('studentId,course,mentorId,counselorId\nstu-lin,更正后数学,mentor-test,cou-chen')
 await page.getByRole('button',{name:'服务器校验并预览'}).click()
 await page.getByRole('button',{name:'确认保存名单'}).click()
 await page.getByText('已有更新版本',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'手动分发'}).count(),1)
 page.once('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'手动分发'}).click()
 await page.getByText('已分发',{exact:true}).waitFor()
 await page.getByRole('button',{name:'更正名单'}).click()
 await page.getByLabel('CSV 内容').fill('studentId,course,mentorId,counselorId\nstu-lin,更正后数学,mentor-other-test,cou-chen')
 await page.getByLabel('更正原因',{exact:false}).fill('虚构导师关系更正')
 await page.getByRole('button',{name:'服务器校验并预览'}).click()
 page.once('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'确认保存名单'}).click()
 await page.getByText('名单更正已应用。',{exact:false}).waitFor()
 const choice=page.getByLabel('学业事项').locator('option').filter({hasText:'更正后数学'})
 await choice.waitFor({state:'attached'})
 await page.getByLabel('学业事项').selectOption(await choice.getAttribute('value'))
 await page.getByLabel('正式结果').selectOption('passed')
 await page.getByLabel('结果来源').fill('虚构教务成绩记录')
 await page.getByRole('button',{name:'回写正式结果'}).click()
 await page.getByText('正式结果已回写。').waitFor()
 const academicToken=await page.evaluate(()=>localStorage.getItem('academic_token'))
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${academicToken}`}
 const batches=await (await fetch(api+'/api/academic/batches',{headers})).json()
 const newest=batches.items.find(item=>item.version===3)
 const correction=await fetch(`${api}/api/academic/batches/${newest.id}/correct`,{method:'POST',headers,body:JSON.stringify({version:3,reason:'再次更正',rows:[{studentId:'stu-lin',course:'更正后数学',mentorId:'mentor-test',counselorId:'cou-chen'}]})})
 assert.equal(correction.status,409)
 const login=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'mentor-other-test',password:'test-password'})})
 const {token}=await login.json();const result=await fetch(api+'/api/b/cases',{headers:{Authorization:`Bearer ${token}`}})
 const updated=(await result.json()).items.filter(item=>item.course==='更正后数学')
 assert.equal(updated.length,1);assert.equal(updated[0].result?.value,'passed');assert.equal(updated[0].result?.source,'虚构教务成绩记录');assert.equal(updated[0].assignmentHistory.length,1)
 const oldLogin=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'mentor-test',password:'test-password'})})
 const oldToken=(await oldLogin.json()).token
 const oldCases=await fetch(api+'/api/b/cases',{headers:{Authorization:`Bearer ${oldToken}`}})
 assert.ok(!(await oldCases.json()).items.some(item=>item.course==='更正后数学'))
 // An unrelated finished case is retained; a new course can be added and then replaced.
 const rows=[{studentId:'stu-lin',course:'更正后数学',mentorId:'mentor-other-test',counselorId:'cou-chen'},{studentId:'stu-lin',course:'新增课程',mentorId:'mentor-test',counselorId:'cou-chen'}]
 const add=await fetch(`${api}/api/academic/batches/${newest.id}/correct`,{method:'POST',headers,body:JSON.stringify({version:3,reason:'补充遗漏课程',rows})})
 assert.equal(add.status,201);const added=(await add.json()).item
 const addedCase=added.caseIds[1]
 const replacement=await fetch(`${api}/api/academic/batches/${added.id}/correct`,{method:'POST',headers,body:JSON.stringify({version:added.version,reason:'课程录入错误',rows:[rows[0],{...rows[1],course:'修正课程'}]})})
 assert.equal(replacement.status,201);const revised=(await replacement.json()).item
 const allCases=(await (await fetch(api+'/api/b/cases',{headers})).json()).items
 const cancelled=allCases.find(item=>item.id===addedCase);assert.equal(cancelled.correctionCancelled.reason,'课程录入错误')
 const blocked=await fetch(`${api}/api/b/cases/${addedCase}/result`,{method:'PATCH',headers,body:JSON.stringify({version:cancelled.version,result:'passed',source:'test'})});assert.equal(blocked.status,409)
 const stale=await fetch(`${api}/api/academic/batches/${added.id}/correct`,{method:'POST',headers,body:JSON.stringify({version:added.version,reason:'重复',rows})});assert.equal(stale.status,409)
 assert.equal(revised.caseIds.length,2)
 console.log('PASS 教务页面登录、预览、更正、分发、结果回写及导师读取')
}finally{await browser?.close();await vite?.close();child.kill();await new Promise(r=>setTimeout(r,100));await rm(dir,{recursive:true,force:true})}
