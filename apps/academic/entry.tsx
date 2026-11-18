import { TrialFeedback } from '../../src/features/c/TrialFeedback'
import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './academic.css'

type Row = { studentId:string; course:string; mentorId:string; counselorId:string }
type Batch = { id:string; version:number; createdAt:string; dispatchedAt?:string; items:Row[] }
function Academic() {
  const [token,setToken]=useState(localStorage.getItem('academic_token') || '')
  const [account,setAccount]=useState(''), [password,setPassword]=useState('')
  const [mustChange,setMustChange]=useState(false), [currentPassword,setCurrentPassword]=useState(''), [newPassword,setNewPassword]=useState('')
  const [batches,setBatches]=useState<Batch[]>([]), [csv,setCsv]=useState(''), [preview,setPreview]=useState<Row[] | null>(null)
  const [message,setMessage]=useState(''), [busy,setBusy]=useState(false)
  const api=useCallback(async(path:string,init:RequestInit={})=>{
    const response=await fetch('/api'+path,{...init,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...init.headers}})
    const data=await response.json().catch(()=>({message:'服务器响应无法解析。'}))
    if(!response.ok){const details=Array.isArray(data.errors)?data.errors.map((e:{row:number;messages:string[]})=>`第${e.row}条：${e.messages.join('、')}`).join('；'):'';throw new Error([data.message||`请求失败（${response.status}）`,details].filter(Boolean).join(' '))}
    return data
  },[token])
  const refresh=useCallback(async()=>{const data=await api('/academic/batches');setBatches(data.items||[])},[api])
  useEffect(()=>{if(!token)return; let active=true; void (async()=>{try{const data=await api('/me');if(data.user?.role!=='academic')throw new Error('该账号不是教务账号。');if(!active)return;setMustChange(data.user.mustChangePassword===true);if(!data.user.mustChangePassword)await refresh()}catch(e){if(active)setMessage((e as Error).message)}})();return()=>{active=false}},[token,api,refresh])
  async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage('');try{const data=await api('/auth/login',{method:'POST',body:JSON.stringify({account,password,role:'academic'})});if(data.user?.role!=='academic')throw new Error('该账号不是教务账号。');localStorage.setItem('academic_token',data.token);setToken(data.token);setPassword('');setMessage('登录成功。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  async function logout(){try{await api('/auth/logout',{method:'POST'})}catch{setMessage('服务端退出失败，请稍后检查会话。');return}localStorage.removeItem('academic_token');setToken('');setBatches([]);setPreview(null);setCsv('');setMessage('已退出。')}
  async function changePassword(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});setCurrentPassword('');setNewPassword('');setMustChange(false);await refresh();setMessage('密码已修改。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  async function checkCsv(){setBusy(true);setPreview(null);try{const data=await api('/academic/batches/preview',{method:'POST',body:JSON.stringify({csv})});setPreview(data.items);setMessage('服务器校验通过，请核对后保存。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  async function submit(){if(!preview)return;setBusy(true);try{const data=await api('/academic/batches',{method:'POST',body:JSON.stringify({rows:preview})});setMessage(`已保存版本 ${data.item.version}，共 ${data.item.items.length} 条；尚未分发。`);setCsv('');setPreview(null);await refresh()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  async function dispatch(batch:Batch){if(!window.confirm(`确认分发版本 ${batch.version} 的 ${batch.items.length} 条任务？已分发名单目前不能在此更正。`))return;setBusy(true);try{const data=await api(`/academic/batches/${encodeURIComponent(batch.id)}/dispatch`,{method:'POST',body:JSON.stringify({version:batch.version})});setMessage(`分发成功，创建 ${data.createdCount} 条任务。`);await refresh()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  if(!token)return <main><h1>教务处端</h1><form onSubmit={login}><label>账号<input required value={account} onChange={e=>setAccount(e.target.value)} autoComplete="username"/></label><label>密码<input required type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label><button disabled={busy}>登录</button></form><p role="status">{message}</p></main>
  return <main><TrialFeedback tokenKey="academic_token"/><header><h1>教务处 · 名单批次</h1><button onClick={()=>void logout()}>退出登录</button></header>{mustChange?<form onSubmit={changePassword}><h2>修改初始密码</h2><label>当前密码<input required type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password"/></label><label>新密码<input required type="password" minLength={10} maxLength={256} value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password"/></label><button disabled={busy}>修改密码</button></form>:<><section><h2>名单 CSV 校验</h2><p>表头须依次为 studentId,course,mentorId,counselorId。请使用已授权的测试数据。</p><label>CSV 内容<textarea value={csv} onChange={e=>{setCsv(e.target.value);setPreview(null)}} placeholder="studentId,course,mentorId,counselorId"/></label><button disabled={busy||!csv.trim()} onClick={()=>void checkCsv()}>服务器校验并预览</button>{preview&&<><p>待核对：{preview.length} 条。此时尚未保存或分发。</p><ul>{preview.map((row,i)=><li key={i}>{row.studentId} · {row.course} · 导师 {row.mentorId} · 辅导员 {row.counselorId}</li>)}</ul><button disabled={busy} onClick={()=>void submit()}>确认保存名单</button></>}</section><section><h2>已有批次</h2>{batches.length?batches.map(batch=><article key={batch.id}><strong>版本 {batch.version}</strong> · {batch.items.length} 条 · {new Date(batch.createdAt).toLocaleString()}<p>{batch.dispatchedAt?'已分发':'待分发'}</p>{!batch.dispatchedAt&&<button disabled={busy} onClick={()=>void dispatch(batch)}>手动分发</button>}</article>):<p>暂无可查看的批次。</p>}</section></>}<p role="status">{message}</p></main>
}
createRoot(document.getElementById('root')!).render(<Academic />)
