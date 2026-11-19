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
import {hashPassword} from '../../server/trial-auth.js'
const dir=await mkdtemp(path.join(os.tmpdir(),'admin-ui-')),data=seedData()
data.users.push({id:'admin-ui',account:'admin-ui',name:'测试管理员',role:'counselor',trialAdmin:true,passwordHash:hashPassword('admin-password-123')})
data.users.push({id:'normal-ui',account:'normal-ui',name:'普通账号',role:'counselor',passwordHash:hashPassword('normal-password-123')})
data.users.push({id:'academic-ui',account:'academic-ui',name:'测试教务',role:'academic',college:'测试学院',academicStudentIds:[],passwordHash:hashPassword('normal-password-123')})
const file=path.join(dir,'data.json');await writeFile(file,JSON.stringify(data))
async function port(){const s=createNetServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p}
const apiPort=await port(),api=`http://127.0.0.1:${apiPort}`
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,TRIAL_MODE:'true',PORT:String(apiPort),ZHIHUI_DATA_FILE:file},stdio:'ignore',windowsHide:true})
let vite,browser
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(api+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}if(!ready)throw new Error('后端未启动')
 process.env.PORTAL_API_URL=api;vite=await createViteServer({configFile:'apps/academic/vite.config.mjs',server:{port:await port(),open:false}});await vite.listen()
 const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);if(!edge)throw new Error('未找到 Edge')
 browser=await chromium.launch({executablePath:edge,headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${vite.config.server.port}/?admin=1`)
 await page.getByLabel('账号',{exact:true}).fill('normal-ui');await page.getByLabel('密码',{exact:true}).fill('normal-password-123');await page.getByRole('button',{name:'登录'}).click();await page.getByText('无权管理试用账号。').waitFor();assert.equal(await page.getByRole('heading',{name:'创建账号'}).count(),0)
 await page.getByRole('button',{name:'退出登录'}).click();await page.getByLabel('账号',{exact:true}).fill('admin-ui');await page.getByLabel('密码',{exact:true}).fill('admin-password-123');await page.getByRole('button',{name:'登录'}).click();await page.getByRole('heading',{name:'创建账号'}).waitFor()
 await page.getByLabel('人员编号',{exact:true}).fill('ui-student');await page.getByLabel('登录账号').fill('ui-student');await page.getByLabel('姓名').fill('虚构学生');await page.getByLabel('初始密码').fill('temporary-password-123');await page.getByLabel('有效期至').fill('2099-01-01T12:00');await page.getByLabel('学院（教务、导师和学生按实际填写）').fill('测试学院');await page.getByRole('button',{name:'创建账号'}).click();await page.getByText('账号已创建，首次登录须修改密码。').waitFor()
 await page.getByLabel('搜索学生',{exact:true}).fill('ui-student');await page.getByRole('radio',{name:'虚构学生（ui-student）'}).check();await page.getByRole('button',{name:'保存关系'}).click();await page.getByText('学生关系已更新。').waitFor()
 await page.getByLabel('搜索教务',{exact:true}).fill('academic-ui');await page.getByRole('radio',{name:'测试教务（academic-ui）'}).check()
 await page.getByLabel('搜索教务范围学生').fill('ui-student');await page.getByRole('checkbox',{name:'虚构学生（ui-student）'}).check();await page.getByRole('button',{name:'保存教务范围'}).click();await page.getByText('教务学生范围已更新。').waitFor()
 await page.getByLabel('搜索教务范围学生').fill('没有匹配');await page.getByText('虚构学生（ui-student）',{exact:false}).first().waitFor()
 await page.reload();await page.getByRole('heading',{name:'创建账号'}).waitFor();await page.getByLabel('搜索教务',{exact:true}).fill('academic-ui');await page.getByRole('radio',{name:'测试教务（academic-ui）'}).check();await page.getByLabel('搜索教务范围学生').fill('ui-student');await page.getByRole('checkbox',{name:'虚构学生（ui-student）'}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'虚构学生（ui-student）'}).isChecked(),true)
 const row=page.locator('article').filter({hasText:'ui-student'});await row.getByRole('button',{name:'重置密码'}).click();await page.getByLabel('新临时密码').fill('changed-password-123');await page.getByRole('button',{name:'确认重置'}).click();await page.getByText('密码已重置，原会话已失效。').waitFor()
 page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'停用'}).click();await page.getByText('账号状态已更新。').waitFor();assert.equal(await row.getByText('已停用').count(),1)
 console.log('PASS 管理员网页：权限、创建、关系、重置、停用')
}finally{await browser?.close();await vite?.close();child.kill();await new Promise(r=>setTimeout(r,100));await rm(dir,{recursive:true,force:true})}
