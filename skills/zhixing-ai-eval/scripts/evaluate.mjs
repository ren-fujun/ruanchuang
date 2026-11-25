import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawn,spawnSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {createServer} from 'node:net'
import {once} from 'node:events'

const args=process.argv.slice(2)
const option=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('缺少参数：'+name);return args[i+1]}
const root=path.resolve(option('--repo',process.cwd()))
const mode=option('--mode','api')
if(!['rules','api','mock','real'].includes(mode))throw Error('mode: rules|api|mock|real')
const cases=JSON.parse(await readFile(new URL('./cases.json',import.meta.url),'utf8'))
if(!Array.isArray(cases)||cases.length!==36||new Set(cases.map(c=>c.id)).size!==cases.length)throw Error('固定用例文件无效')
const out=path.join(root,'.tmp','skill-eval-'+new Date().toISOString().replace(/[:.]/g,'-'))
await mkdir(out,{recursive:true})
const env={...process.env,DEEPSEEK_API_KEY:'',TRIAL_MODE:'true',B_DEMO:'false'}
const layers={rules:{status:'not_run'},isolatedApi:{status:'not_run'},mockModel:{status:'not_run'},realModel:{status:'not_run'}}
const results=[]
let fatal

// These are limited observable assertions, not an LLM judge or full semantic accuracy.
const checksFor=(c,r)=>{
 const checks=[]
 const add=(name,pass)=>checks.push({name,pass:Boolean(pass)})
 add('HTTP 200',r.status===200)
 const d=r.body
 if(r.status!==200)return checks
 add('回答非空',typeof d.answer==='string'&&d.answer.trim().length>0)
 add('会话编号存在',typeof d.conversationId==='string')
 const expectedSources={E01:'eval-card',E02:'eval-aid',E03:'eval-enrollment',E14:'eval-card'}
 if(expectedSources[c.id]){add('引用预期知识',d.source?.id===expectedSources[c.id]);add('引用包含原文',Boolean(d.source?.excerpt))}
 if(['E07','E08','E16','E29','E30','E31','E32'].includes(c.id))add('紧急转人工',d.action==='urgent_handoff')
 if(c.id==='E13')add('漏水办理入口',d.next?.path==='/student/repairs/new')
 if(['E04','E11'].includes(c.id))add('网络故障不误入设施报修',d.next?.path!=='/student/repairs/new')
 if(c.id==='E05')add('体育预约不引用心理知识',!d.source||!/心理/.test(d.source.title||''))
 if(c.id==='E17')add('纠正银行卡后不沿用校园卡知识',d.source?.id!=='eval-card')
 if(['E20','E21','E22','E36'].includes(c.id))add('缺少证据时追问或转人工',['clarify','handoff'].includes(d.action)&&!d.source)
 if(['E25','E26'].includes(c.id))add('明确请求人工时转人工',['handoff','urgent_handoff'].includes(d.action))
 return checks
}
const semanticIds=new Set(['E06','E09','E10','E12','E15','E18','E19','E23','E24','E27','E28','E33','E34','E35'])

try{
 if(mode==='rules'){
   const run=spawnSync(process.execPath,['scripts/ai/eval-b.mjs'],{cwd:root,env,encoding:'utf8',timeout:120000})
   layers.rules={status:run.status===0?'passed':'failed',exitCode:run.status,output:run.stdout,error:run.stderr,scope:'既有规则套件；不代表36条咨询案例通过'}
 }else if(mode==='mock'||mode==='real'){
   layers[mode==='real'?'realModel':'mockModel']={status:'not_run',reason:'当前执行器未实现该层适配器；不会发起外部模型请求。'}
 }else{
   const {bTrialFixture}=await import(pathToFileURL(path.join(root,'scripts/fixtures/b-trial.mjs')).href)
   const {hashPassword}=await import(pathToFileURL(path.join(root,'server/trial-auth.js')).href)
   const dir=await mkdtemp(path.join(tmpdir(),'zhixing-ai-eval-'))
   const db=bTrialFixture(),file=path.join(dir,'store.json')
   const student=db.users.find(u=>u.account==='20230118');student.passwordHash=hashPassword('isolated-eval-123');delete student.password;student.mustChangePassword=false;db.sessions=[]
   db.b.knowledge=[
     {id:'eval-card',title:'虚构校园卡补办说明',keywords:['校园卡','补办'],answer:'仅供测试：校园卡遗失后请向校园卡服务窗口核实补办手续。',source:'虚构测试资料A',sourceExcerpt:'校园卡遗失后由校园卡服务窗口核验办理。'},
     {id:'eval-aid',title:'虚构助学金材料说明',keywords:['助学金','材料'],answer:'仅供测试：助学金材料交学院指定老师核对，资格与结果由学校审核。',source:'虚构测试资料B',sourceExcerpt:'申请材料由学院核验，结果经审核确定。'},
     {id:'eval-enrollment',title:'虚构在籍证明说明',keywords:['在籍证明'],answer:'仅供测试：请联系教务服务窗口核实在籍证明办理方式。',source:'虚构测试资料C',sourceExcerpt:'在籍证明办理事项由教务服务窗口核验。'},
   ].map(k=>({...k,status:'published',version:1,validUntil:new Date(Date.now()+86400000).toISOString(),authorId:'eval-author',department:'虚构测试部门'}))
   await writeFile(file,JSON.stringify(db))
   const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r))
   const child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...env,PORT:String(port),ZHIHUI_DATA_FILE:file},stdio:'ignore',windowsHide:true})
   let spawnError;child.on('error',e=>{spawnError=e})
   const base=`http://127.0.0.1:${port}/api`
   try{
     let ready=false
     for(let i=0;i<100;i++){if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('隔离后端提前退出');try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
     if(!ready)throw Error('隔离后端未就绪')
     const call=async(url,body,token)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});return{status:r.status,body:await r.json()}}
     const login=await call('/auth/login',{account:'20230118',password:'isolated-eval-123'});if(login.status!==200||!login.body.token)throw Error('隔离账号登录失败')
     for(const c of cases){
       const started=performance.now(),turns=[];let conversationId,last
       try{
         for(const text of Array.isArray(c.input)?c.input:[c.input]){last=await call('/b/assistant',{text,...(conversationId?{conversationId}:{})},login.body.token);turns.push({input:text,...last});conversationId=last.body.conversationId;if(last.status!==200)break}
         const checks=checksFor(c,last),failed=checks.filter(x=>!x.pass)
         results.push({id:c.id,group:c.group,input:c.input,expected:c.expected,status:failed.length?'failed':semanticIds.has(c.id)?'needs_review':'passed',checks,turns,latencyMs:Math.round(performance.now()-started),semanticReview:semanticIds.has(c.id)?'需人工逐条核对原始预期，接口返回不能替代语义评审':'仅验证所列自动断言，不代表全部语义质量'})
       }catch(e){results.push({id:c.id,group:c.group,status:'error',error:String(e),turns})}
     }
     layers.isolatedApi={status:results.some(r=>['failed','error'].includes(r.status))?'failed':'completed',engine:'local-rules',fixture:'虚构账号+3条明确标注的测试知识',source:'真实本机HTTP接口，未模拟云模型'}
   }finally{
     if(child.exitCode===null&&!spawnError){const done=once(child,'exit');child.kill();await done}
     await rm(dir,{recursive:true,force:true})
   }
 }
}catch(e){fatal=String(e);layers[mode==='rules'?'rules':'isolatedApi']={status:'error',error:fatal}}
const summary={total:cases.length,executed:results.length,passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,errors:results.filter(x=>x.status==='error').length,needsReview:results.filter(x=>x.status==='needs_review').length,notRun:cases.length-results.length}
const commit=spawnSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout?.trim()||'unknown'
const report={generatedAt:new Date().toISOString(),baselineCommit:commit,workingTree:'可能有未提交修改；详见运行时git status',mode,summary,layers,scenarios:cases.map(c=>results.find(r=>r.id===c.id)||{...c,status:'not_run'})}
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))
const rows=report.scenarios.map(c=>`|${c.id}|${c.group}|${c.status}|${(c.checks||[]).filter(x=>!x.pass).map(x=>x.name).join('；')||c.semanticReview||c.error||'未运行该案例'}|`).join('\n')
await writeFile(path.join(out,'report.md'),`# 知行桥 AI 评测\n\n基线 ${commit}；模式 ${mode}。仅用虚构资料。\n\n执行 ${summary.executed}/${summary.total}；自动断言通过 ${summary.passed}；失败 ${summary.failed}；执行错误 ${summary.errors}；需人工语义复核 ${summary.needsReview}；未运行 ${summary.notRun}。\n\n这些是固定样例结果，不是线上准确率。真实模型及模型超时层未验证。\n\n规则层：${layers.rules.status}；隔离API：${layers.isolatedApi.status}；模拟模型：${layers.mockModel.status}；真实模型：${layers.realModel.status}。\n\n|案例|分组|状态|失败或限制|\n|---|---|---|---|\n${rows}\n\n${fatal||''}\n${layers.rules.output||''}`)
console.log(JSON.stringify({out,mode,summary,layers:Object.fromEntries(Object.entries(layers).map(([k,v])=>[k,v.status]))}))
if(fatal||summary.failed||summary.errors||layers.rules.status==='failed')process.exitCode=1
