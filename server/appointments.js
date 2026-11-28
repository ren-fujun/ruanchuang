import crypto from 'node:crypto'
import { appointmentAdvice } from './b/appointment-advice.js'
import { organizeOutcome } from './ai/outcome-draft.js'

export function mountAppointments(app, { db, save, requireAuth, generate }) {
  const outcomeLocks = new Set()
  const slots = () => db.appointmentSlots ||= [], items = () => db.appointments ||= [], messages = () => db.appointmentMessages ||= []
  const owns = (u, a) => u.role === 'student' ? a.studentId === u.id : u.role === 'counselor' && a.counselorId === u.id && (u.studentIds || []).includes(a.studentId)
  const related = (u, s) => u.role === 'counselor' ? s.counselorId === u.id : u.role === 'student' && (db.users.find(x => x.id === s.counselorId)?.studentIds || []).includes(u.id)
  const bad = (res, message, status = 400) => res.status(status).json({ message })
  const overlap = (a, b) => Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(a.endsAt) > Date.parse(b.startsAt)
  const view = (a, user) => ({ ...a, ownerName: db.users.find(x => x.id === a.counselorId)?.name || '辅导员', studentName: db.users.find(x => x.id === a.studentId)?.name || '学生', unread: user ? messages().filter(m => m.appointmentId === a.id && m.fromId !== user.id && !m.readAt).length : 0 })
  const notify = (userId, type, appointmentId, body) => { (db.notifications ||= []).push({ id: crypto.randomUUID(), userId, type, appointmentId, title: '预约通知', body, tone: 'blue', at: new Date().toISOString(), read: false }) }
  const priority = (a,b) => Date.parse(a.confirmDeadlineAt||'9999-12-31')-Date.parse(b.confirmDeadlineAt||'9999-12-31') || Number(!a.waitlistedAt)-Number(!b.waitlistedAt) || a.createdAt.localeCompare(b.createdAt) || items().indexOf(a)-items().indexOf(b) || a.id.localeCompare(b.id)
  const slotView = s => {
    const booked = items().filter(a => ['scheduled','completed'].includes(a.status) && a.counselorId === s.counselorId && overlap(a,s)).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))
    let cursor = Math.max(Date.parse(s.startsAt), Math.ceil(Date.now()/300000)*300000), largest = 0
    for (const a of booked) { largest = Math.max(largest,Date.parse(a.startsAt)-cursor); cursor = Math.max(cursor,Date.parse(a.endsAt)) }
    largest = Math.max(largest,Date.parse(s.endsAt)-cursor)
    return { ...s, available: Date.parse(s.endsAt)>Date.now(), full: largest<300000, ownerName: db.users.find(x=>x.id===s.counselorId)?.name||'辅导员' }
  }
  app.get('/api/appointments/slots', requireAuth, (req, res) => res.json({ items: slots().filter(s => related(req.user, s)).map(slotView) }))
  app.post('/api/appointments/slots', requireAuth, (req, res) => {
    if (req.user.role !== 'counselor') return res.sendStatus(403)
    const start = Date.parse(req.body?.startsAt), end = Date.parse(req.body?.endsAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start || end-start > 12*3600000 || start%300000 || end%300000) return bad(res,'请选择未来的时间窗口，起止时间需按5分钟对齐。')
    const slot={id:crypto.randomUUID(),counselorId:req.user.id,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()}
    if(slots().some(s=>s.counselorId===req.user.id&&overlap(s,slot))) return bad(res,'开放时段冲突。',409)
    slots().push(slot);save();res.status(201).json({item:slot})
  })
  app.get('/api/appointments', requireAuth, (req,res)=>res.json({items:items().filter(a=>owns(req.user,a)).map(a=>view(a,req.user))}))
  app.post('/api/appointments/advice', requireAuth, async(req,res)=>{if(req.user.role!=='student')return res.sendStatus(403);const text=req.body?.text;if(typeof text!=='string'||!text.trim()||text.length>1000)return bad(res,'请填写1至1000字的事项。');res.json({item:await appointmentAdvice(text.trim())})})
  app.post('/api/appointments', requireAuth, (req,res)=>{
    if(req.user.role!=='student')return res.sendStatus(403)
    const {topic,minutes,requestId}=req.body||{}; const ids=Array.isArray(req.body?.slotIds)?req.body.slotIds:(req.body?.slotId?[req.body.slotId]:[])
    if(!ids.length||ids.length>2||new Set(ids).size!==ids.length)return bad(res,'请选择1至2个意向时段。')
    if(typeof topic!=='string'||!topic.trim()||topic.length>1000||!Number.isInteger(minutes)||minutes<5||minutes>120||minutes%5||typeof requestId!=='string'||!requestId||requestId.length>128)return bad(res,'请填写事项、5分钟为单位的时长和请求标识。')
    const consultationSessionId = req.body.consultationSessionId
    const consultationTurn = req.body.consultationTurn
    if (consultationTurn !== undefined && (!consultationSessionId || !Number.isInteger(consultationTurn) || consultationTurn < 1)) return bad(res, '咨询轮次无效。')
    const consultation = consultationSessionId ? (db.aiConsultations || []).find(s => s.id === consultationSessionId && s.userId === req.user.id) : null
    const confirmedSummary = req.body.consultationSummary === undefined ? topic.trim() : req.body.consultationSummary
    if (typeof confirmedSummary !== 'string' || !confirmedSummary.trim() || confirmedSummary.length > 2000) return bad(res, '确认摘要须为1至2000字。')
    if (consultationSessionId && (!consultation || !consultation.turns.length || consultation.turns.at(-1).result.action === 'urgent_handoff')) return bad(res, '咨询会话不可用于此预约。', 400)
    const existing=items().find(a=>a.studentId===req.user.id&&a.requestId===requestId);if(existing){const matched=JSON.stringify(existing.slotIds||[existing.slotId])===JSON.stringify(ids)&&existing.topic===topic.trim()&&existing.minutes===minutes&&(existing.consultationSessionId||null)===(consultationSessionId||null)&&(!consultation || existing.consultationSummary?.studentStatement===confirmedSummary.trim())&&(consultationTurn===undefined||existing.consultationSummary?.sourceTurn===consultationTurn);return matched?res.json({item:view(existing,req.user)}):bad(res,'请求标识已用于其他申请内容。',409)}
    if (consultationTurn !== undefined && consultationTurn !== consultation.turns.length) return bad(res, '咨询内容已更新，请返回咨询页核对最新草稿后再预约。', 409)
    const selected=ids.map(id=>slots().find(s=>s.id===id&&related(req.user,s)&&Date.parse(s.endsAt)>Date.now()))
    if(selected.some(x=>!x)||selected.some(s=>s.counselorId!==selected[0].counselorId))return bad(res,'时段不可用或不属于同一辅导员。',404)
    const item={id:crypto.randomUUID(),slotIds:ids,slotId:ids[0],studentId:req.user.id,counselorId:selected[0].counselorId,topic:topic.trim(),minutes,requestId,status:'pending',createdAt:new Date().toISOString(),version:1}
    if (consultation) {
      const result = consultation.turns.at(-1).result
      item.consultationSessionId = consultation.id
      item.consultationSummary = structuredClone({ studentStatement: confirmedSummary.trim(), policyReferences: (result.citations || []).map(c => ({ id: c.id, title: c.title, source: c.source, documentId: c.documentId, policyVersion: c.policyVersion })), questions: result.questions || [], materials: result.materials || [], facts: result.context?.facts || [], sourceTurn: consultation.turns.length, status: 'student-confirmed-draft' })
    }
    items().push(item);notify(item.counselorId,'appointment_request',item.id,'收到新的预约申请');save();res.status(201).json({item:view(item,req.user)})
  })
  const place=a=>{
    for(const slotId of a.slotIds||[a.slotId]){const slot=slots().find(s=>s.id===slotId&&s.counselorId===a.counselorId);if(!slot)continue
      const occupied=items().filter(x=>x.id!==a.id&&['scheduled','completed'].includes(x.status)&&(x.counselorId===a.counselorId||x.studentId===a.studentId))
      for(let t=Math.max(Date.parse(slot.startsAt),Math.ceil(Date.now()/300000)*300000);t+a.minutes*60000<=Math.min(Date.parse(slot.endsAt),Date.parse(a.confirmDeadlineAt||'9999-12-31'));t+=300000){const c={startsAt:new Date(t).toISOString(),endsAt:new Date(t+a.minutes*60000).toISOString()};if(!occupied.some(x=>overlap(x,c))){Object.assign(a,c,{slotId,status:'scheduled',version:a.version+1});return true}}
    } if(a.status!=='waitlisted'){a.status='waitlisted';a.version++;a.waitlistedAt=new Date().toISOString()} return false
  }
  app.post('/api/appointments/batch',requireAuth,(req,res)=>{if(req.user.role!=='counselor')return res.sendStatus(403);const slot=slots().find(s=>s.id===req.body?.slotId&&s.counselorId===req.user.id);if(!slot)return res.sendStatus(404)
    const cand=items().filter(a=>(a.slotIds||[a.slotId]).includes(slot.id)&&a.counselorId===req.user.id&&(req.user.studentIds||[]).includes(a.studentId)&&['pending','waitlisted'].includes(a.status)).sort(priority)
    cand.forEach(a=>{const old=a.status;place(a);if(a.status!==old)notify(a.studentId,a.status==='scheduled'?'appointment_scheduled':'appointment_waitlisted',a.id,a.status==='scheduled'?'预约已安排时间':'预约已加入候补')});save();res.json({items:cand.map(a=>view(a,req.user))})
  })
  app.patch('/api/appointments/:id/confirm-deadline',requireAuth,(req,res)=>{const a=items().find(x=>x.id===req.params.id&&owns(req.user,x));if(!a)return res.sendStatus(404);if(req.user.role!=='counselor')return res.sendStatus(403);if(req.body?.version!==a.version)return bad(res,'预约版本已更新。',409);if(!['pending','waitlisted'].includes(a.status))return bad(res,'当前状态不能设置办理期限。',409);const d=Date.parse(req.body?.deadlineAt);if(!Number.isFinite(d)||d<=Date.now())return bad(res,'办理期限需为未来时间。');a.confirmDeadlineAt=new Date(d).toISOString();a.version++;notify(a.studentId,'confirmation_deadline',a.id,'辅导员更新了事项办理期限');save();res.json({item:view(a,req.user)})})
  app.post('/api/appointments/:id/outcome-draft', requireAuth, async (req, res, next) => {
    if (req.user.role !== 'counselor') return res.sendStatus(403)
    const a = items().find(x => x.id === req.params.id && owns(req.user, x))
    if (!a) return res.sendStatus(404)
    if (req.body?.version !== a.version || a.status !== 'scheduled') return bad(res, '预约状态已更新，请刷新后重试。', 409)
    const notes = req.body?.notes
    if (typeof notes !== 'string' || !notes.trim() || notes.length > 1000) return bad(res, '请填写1至1000字的处理要点。')
    if (outcomeLocks.has(a.id)) return bad(res, '正在整理，请稍候。', 409)
    const version = a.version
    outcomeLocks.add(a.id)
    try {
      const item = await organizeOutcome({ notes: notes.trim(), db, save, generate })
      if (a.version !== version || a.status !== 'scheduled') return bad(res, '预约状态已更新，草稿未应用。', 409)
      return res.json({ item })
    } catch (error) { return next(error) }
    finally { outcomeLocks.delete(a.id) }
  })
  app.patch('/api/appointments/:id/complete',requireAuth,(req,res)=>{const a=items().find(x=>x.id===req.params.id&&owns(req.user,x));if(!a)return res.sendStatus(404);if(req.user.role!=='counselor')return res.sendStatus(403);if(req.body?.version!==a.version)return bad(res,'预约版本已更新。',409);if(a.status!=='scheduled')return bad(res,'只有已确认预约可以完成。',409);const outcome=req.body?.outcome;if(typeof outcome!=='string'||!outcome.trim()||outcome.length>2000)return bad(res,'请填写帮扶结果。');a.status='completed';a.outcome=outcome.trim();a.completedAt=new Date().toISOString();a.version++;notify(a.studentId,'appointment_completed',a.id,'辅导员已完成帮扶记录');save();res.json({item:view(a,req.user)})})
  app.post('/api/appointments/:id/cancel',requireAuth,(req,res)=>{const a=items().find(x=>x.id===req.params.id&&owns(req.user,x));if(!a)return res.sendStatus(404);if(req.body?.version!==undefined&&req.body.version!==a.version)return bad(res,'预约版本已更新。',409);if(!['pending','scheduled','waitlisted'].includes(a.status))return bad(res,'预约当前无法取消。',409);const wasScheduled=a.status==='scheduled';const reason=req.body?.reason;if(reason!==undefined&&(typeof reason!=='string'||reason.length>200))return bad(res,'取消说明不能超过200字。');a.status='cancelled';a.version++;notify(req.user.id===a.studentId?a.counselorId:a.studentId,'appointment_cancelled',a.id,'预约已取消');a.cancelledAt=new Date().toISOString();a.cancelReason=reason?.trim()||'';if(wasScheduled){const waiting=items().filter(x=>x.counselorId===a.counselorId&&x.status==='waitlisted'&&(x.slotIds||[x.slotId]).includes(a.slotId)&&(db.users.find(u=>u.id===a.counselorId)?.studentIds||[]).includes(x.studentId)).sort(priority);for(const next of waiting)if(place(next)){notify(next.studentId,'appointment_scheduled',next.id,'空出的时段已安排给你')}}save();res.json({item:view(a,req.user)})})
  app.get('/api/appointments/:id/messages',requireAuth,(req,res)=>{const a=items().find(x=>x.id===req.params.id&&owns(req.user,x));if(!a)return res.sendStatus(404);const found=messages().filter(m=>m.appointmentId===a.id);found.filter(m=>m.fromId!==req.user.id&&!m.readAt).forEach(m=>m.readAt=new Date().toISOString());save();res.json({items:found.map(m=>({...m,senderName:db.users.find(u=>u.id===m.fromId)?.name||'参与者'}))})})
  app.post('/api/appointments/:id/messages',requireAuth,(req,res)=>{const a=items().find(x=>x.id===req.params.id&&owns(req.user,x));if(!a)return res.sendStatus(404);const text=req.body?.text;if(typeof text!=='string'||!text.trim()||text.length>2000)return bad(res,'留言须为1至2000字。');const item={id:crypto.randomUUID(),appointmentId:a.id,fromId:req.user.id,text:text.trim(),at:new Date().toISOString(),readAt:null};messages().push(item);notify(req.user.id===a.studentId?a.counselorId:a.studentId,'appointment_message',a.id,'收到新的预约留言');save();res.status(201).json({item})})
}
