import { useState } from 'react'
export type BCall = (path: string, body?: unknown, method?: string) => Promise<any>
export function AcademicCollaboration({ item, userId, call, refresh }: { item: any; userId: string; call: BCall; refresh: () => Promise<void> }) {
  const [assigneeId, setAssigneeId] = useState(userId), [plan, setPlan] = useState(''),
    [nextAt, setNextAt] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const c = item.collaboration || { status: 'unassigned', history: [] }
  const act = async (action: string) => {
    setBusy(true); setError('')
    try {
      await call(`/b/cases/${item.id}/collaboration`, { action, assigneeId, plan,
        nextAt: nextAt ? new Date(nextAt).toISOString() : null, version: item.version, requestId: crypto.randomUUID() })
      await refresh()
    } catch (e: any) { setError(e.message); await refresh().catch(() => {}) }
    finally { setBusy(false) }
  }
  return <div className="b-collaboration">
    <h3>协商跟进安排</h3>
    <p>由关联导师与辅导员协商行动安排，被指定人确认后生效。</p>
    <p role="status">协商状态：{{ unassigned: '待协商', proposed: '待对方确认', agreed: '已确认安排' }[c.status as string] || c.status}</p>
    {c.plan && <p>当前安排：{c.plan}{c.nextAt && ` · 下一步 ${new Date(c.nextAt).toLocaleString()}`}</p>}
    {c.history?.length > 0 && <details><summary>协商历史（{c.history.length}）</summary><ul>{c.history.map((h: any) => <li key={h.id}>{new Date(h.at).toLocaleString()} · {h.actor} · {h.action === 'propose' ? '提出安排' : h.action === 'accept' ? '确认安排' : '暂不接受'} · {h.plan}</li>)}</ul></details>}
    {error && <p role="alert">{error}</p>}
    {item.status !== 'completed' && <>
      <form onSubmit={e => { e.preventDefault(); void act('propose') }}>
        <label>本次牵头人<select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
          <option value={item.mentorId}>关联导师{item.mentorId === userId ? '（我）' : ''}</option>
          <option value={item.counselorId}>关联辅导员{item.counselorId === userId ? '（我）' : ''}</option>
        </select></label>
        <label>协商安排<textarea required maxLength={1000} value={plan} onChange={e => setPlan(e.target.value)} placeholder="填写行动、分工和后续安排，不填写敏感面谈详情" /></label>
        <label>下一步时间（选填）<input type="datetime-local" value={nextAt} onChange={e => setNextAt(e.target.value)} /></label>
        <button disabled={busy}>提交协商安排</button>
      </form>
      {c.status === 'proposed' && c.assigneeId === userId && <div className="b-actions">
        <button disabled={busy} onClick={() => void act('accept')}>接受安排</button>
        <button disabled={busy} onClick={() => void act('decline')}>暂不接受</button>
      </div>}
    </>}
  </div>
}
