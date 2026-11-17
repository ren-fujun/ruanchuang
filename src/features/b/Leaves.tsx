import { useEffect, useState } from 'react'
import type { BCall } from './Collaboration'
import './leaves.css'
const labels: Record<string, string> = { pending: '待审批', approved: '已同意', rejected: '已驳回' }
function Decision({ item, call, refresh }: { item: any; call: BCall; refresh: () => Promise<void> }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const act = async (action: string) => {
    setBusy(true); setError('')
    try { await call(`/b/leaves/${item.id}/decision`, { action, note, version: item.version, requestId: crypto.randomUUID() }); await refresh() }
    catch (e: any) { setError(e.message); await refresh().catch(() => {}) }
    finally { setBusy(false) }
  }
  return <div><label>审批意见<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<div className="b-actions">
      <button disabled={busy || !note.trim()} onClick={() => void act('approved')}>同意请假</button>
      <button disabled={busy || !note.trim()} onClick={() => void act('rejected')}>驳回申请</button>
    </div></div>
}
export function LeavePanel({ role, call }: { role: string; call: BCall }) {
  const [items, setItems] = useState<any[]>([]), [options, setOptions] = useState<any[]>([]),
    [level, setLevel] = useState(''), [approverId, setApprover] = useState(''),
    [startsAt, setStart] = useState(''), [endsAt, setEnd] = useState(''), [reason, setReason] = useState(''),
    [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false)
  const refresh = async () => { setItems((await call('/b/leaves')).items) }
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const list = await call('/b/leaves')
        const settings = role === 'student' ? await call('/b/leaves/approvers') : null
        if (!active) return
        setItems(list.items)
        if (settings) { setOptions(settings.items); setLevel(settings.educationLevel); setApprover(settings.items[0]?.id || '') }
        setLoaded(true)
      } catch (e: any) { if (active) setError(e.message) }
    })()
    return () => { active = false }
  }, [role])
  return <div className="b-leaves">
    <h2>{role === 'student' ? '我的请假' : '请假审批'}</h2>
    <p>{role === 'student' ? level === 'undergraduate' ? '本科生请假 · 由所选辅导员审批' : level === 'postgraduate' ? '研究生请假 · 由所选班导师审批' : '尚未配置学生类型，请联系管理员。' : '仅展示分配给你且仍在授权范围内的申请。'}</p>
    {error && <p role="alert">{error}</p>}
    {!loaded && !error && <p>正在加载…</p>}
    {role === 'student' && loaded && !options.length && <p>暂无可选审批人，请联系管理员配置对应关系。</p>}
    {role === 'student' && options.length > 0 && <form onSubmit={e => {
      e.preventDefault(); setBusy(true); setError('')
      void (async () => {
        try {
          await call('/b/leaves', { approverId, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), reason, requestId: crypto.randomUUID() })
          setReason(''); await refresh()
        } catch (err: any) { setError(err.message) } finally { setBusy(false) }
      })()
    }}>
      <label>审批人<select value={approverId} onChange={e => setApprover(e.target.value)}>{options.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label>开始时间<input required type="datetime-local" value={startsAt} onChange={e => setStart(e.target.value)} /></label>
      <label>结束时间<input required type="datetime-local" value={endsAt} onChange={e => setEnd(e.target.value)} /></label>
      <label>请假原因<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={busy}>提交请假申请</button>
    </form>}
    {loaded && !items.length && <p>暂无请假记录。</p>}
    {items.map(item => <article className="b-leave-card" key={item.id}>
      <h3>{item.studentName} · {labels[item.status]}</h3>
      <p>{item.educationLevel === 'undergraduate' ? '本科生' : '研究生'} · 审批人：{item.approverName}</p>
      <p>{new Date(item.startsAt).toLocaleString()} 至 {new Date(item.endsAt).toLocaleString()}</p>
      <p>原因：{item.reason}</p>
      {item.decision && <p>审批意见：{item.decision.note}</p>}
      {role !== 'student' && item.status === 'pending' && <Decision item={item} call={call} refresh={refresh} />}
    </article>)}
  </div>
}
