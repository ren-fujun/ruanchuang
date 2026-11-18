import {useState, type FormEvent} from 'react'

export function TrialPasswordGate({tokenKey}:{tokenKey:string}) {
 const [currentPassword,setCurrent]=useState(''), [newPassword,setNew]=useState(''), [confirm,setConfirm]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false)
 async function submit(event:FormEvent){
  event.preventDefault();setError('')
  if(newPassword!==confirm){setError('两次输入的新密码不一致。');return}
  setBusy(true)
  try{
   const response=await fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem(tokenKey)||''}`},body:JSON.stringify({currentPassword,newPassword})})
   const data=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(data.message||'修改失败，请重试。')
   setCurrent('');setNew('');setConfirm('');window.location.reload()
  }catch(cause){setError(cause instanceof Error?cause.message:'修改失败，请重试。')}finally{setBusy(false)}
 }
 return <main style={{maxWidth:480,margin:'48px auto',padding:24}}><h1>请先修改初始密码</h1><p>修改成功后即可继续使用。</p><form onSubmit={submit}>
  <label>当前密码<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrent(e.target.value)}/></label>
  <label>新密码<input required type="password" autoComplete="new-password" minLength={10} maxLength={256} value={newPassword} onChange={e=>setNew(e.target.value)}/></label>
  <label>确认新密码<input required type="password" autoComplete="new-password" minLength={10} maxLength={256} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}<button disabled={busy}>{busy?'正在修改…':'确认修改'}</button>
 </form></main>
}
