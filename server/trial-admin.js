import crypto from 'node:crypto'
import {hashPassword} from './trial-auth.js'

const roles = new Set(['student','counselor','academic','mentor','logistics'])
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
const arrays = {studentIds:'counselor',academicStudentIds:'academic',counselorIds:'student',classAdvisorIds:'student',repairScopes:'logistics'}
export function prepareTrialAccounts(existing, input) {
  if (!Array.isArray(existing) || !Array.isArray(input) || input.length<1 || input.length>50) throw new Error('每次可创建1至50个账号。')
  const allowed=new Set(['id','account','name','role','password','expiresAt','college','campus','educationLevel','classAdvisor',...Object.keys(arrays)])
  const ids=new Set(existing.map(user=>user.id)), accounts=new Set(existing.map(user=>String(user.account||'').toLowerCase()))
  const checked=input.map(raw=>{
    if (!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(key=>!allowed.has(key))) throw new Error('账号含有不允许的字段。')
    const {id,account,name,role,password,expiresAt}=raw
    if(!validId(id)||!validId(account)||typeof name!=='string'||!name.trim()||name.trim().length>80||!roles.has(role)) throw new Error('账号、姓名或角色无效。')
    if(ids.has(id)||accounts.has(account.toLowerCase())) throw new Error('账号或人员编号重复。')
    ids.add(id);accounts.add(account.toLowerCase())
    if(typeof password!=='string'||password.length<10||password.length>256) throw new Error('初始密码长度须为10至256字符。')
    if(typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw new Error('请提供未来的账号失效时间。')
    for(const [key,neededRole] of Object.entries(arrays)) if(raw[key]!==undefined && (role!==neededRole || !Array.isArray(raw[key]) || raw[key].length>1000 || raw[key].some(item=>key==='repairScopes' ? typeof item!=='string'||!item.trim()||item.length>100 : !validId(item)) || new Set(raw[key]).size!==raw[key].length)) throw new Error('人员或责任范围配置无效。')
    if(raw.educationLevel!==undefined && (role!=='student'||!['undergraduate','postgraduate'].includes(raw.educationLevel)))throw new Error('学历类型配置无效。')
    if(raw.classAdvisor!==undefined && (role!=='mentor'||typeof raw.classAdvisor!=='boolean'))throw new Error('班导师能力配置无效。')
    for(const key of ['college','campus'])if(raw[key]!==undefined && (typeof raw[key]!=='string'||!raw[key].trim()||raw[key].trim().length>100))throw new Error('学院或校区配置无效。')
    return raw
  })
  const all=[...existing,...checked]
  for(const raw of checked) for(const [field,needed] of [['studentIds','student'],['academicStudentIds','student'],['counselorIds','counselor'],['classAdvisorIds','mentor']]) {
    for(const id of raw[field]||[]) { const person=all.find(item=>item.id===id); if(!person || person.disabled || (person.expiresAt && (!Number.isFinite(Date.parse(person.expiresAt)) || Date.parse(person.expiresAt)<=Date.now())) || person.role!==needed || (field==='classAdvisorIds' && person.classAdvisor!==true)) throw new Error('人员关系指向不存在或无权的账号。') }
  }
  return checked.map(({password,...raw})=>({...raw,name:raw.name.trim(),passwordHash:hashPassword(password),mustChangePassword:true,disabled:false,createdAt:new Date().toISOString()}))
}
export function mountTrialAdmin(app,{db,save,requireAuth,trialMode}) {
  const guard=[requireAuth,(req,res,next)=>{if(!trialMode)return res.status(404).json({message:'服务未启用。'});if(req.user.trialAdmin!==true)return res.status(403).json({message:'无权管理试用账号。'});next()}]
  const audit=(actor,action,targets)=>{db.trialAudit ||= [];db.trialAudit.push({id:crypto.randomUUID(),actor,action,targets,at:new Date().toISOString()})}
  app.post('/api/trial/admin/accounts',...guard,(req,res)=>{
    try{const created=prepareTrialAccounts(db.users,req.body?.accounts);db.users.push(...created);audit(req.user.id,'accounts_created',created.map(user=>user.id));save();return res.status(201).json({items:created.map(({id,account,role,expiresAt})=>({id,account,role,expiresAt}))})}catch(error){return res.status(400).json({message:error.message})}
  })
  app.post('/api/trial/admin/accounts/:id/reset-password',...guard,(req,res)=>{
    const target=db.users.find(user=>user.id===req.params.id)
    if(!target||target.trialAdmin===true)return res.status(404).json({message:'账号不存在或不可操作。'})
    let passwordHash;try{passwordHash=hashPassword(req.body?.password)}catch(error){return res.status(400).json({message:error.message})}
    target.passwordHash=passwordHash;delete target.password;target.mustChangePassword=true;db.sessions=db.sessions.filter(session=>session.userId!==target.id);audit(req.user.id,'password_reset',[target.id]);save();return res.json({ok:true})
  })
  app.post('/api/trial/admin/accounts/:id/status',...guard,(req,res)=>{
    const target=db.users.find(user=>user.id===req.params.id)
    if(!target||target.trialAdmin===true)return res.status(404).json({message:'账号不存在或不可操作。'})
    if(typeof req.body?.disabled!=='boolean')return res.status(400).json({message:'账号状态无效。'})
    target.disabled=req.body.disabled;if(target.disabled)db.sessions=db.sessions.filter(session=>session.userId!==target.id);audit(req.user.id,'account_status_changed',[target.id]);save();return res.json({ok:true})
  })
}
