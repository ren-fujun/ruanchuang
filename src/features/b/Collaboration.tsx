import { useState } from 'react'
import './collaboration.css'

export type BCall = (path: string, body?: unknown, method?: string) => Promise<any>
const statuses = { planned: '待开始', in_progress: '进行中', completed: '已完成' }
type ScheduleItem = { id: string; at: string; ownerId: string; title: string; status: keyof typeof statuses }
export type CaseItem = {
  id: string; version: number; status: string; mentorId: string; counselorId: string;
  followUp?: { statusLabel: string; reason: string; at: string } | null;
  collaboration?: {
    status: 'unassigned' | 'proposed' | 'agreed'; assigneeId?: string; plan?: string; nextAt?: string;
    items?: ScheduleItem[];
    history: { id: string; at: string; actor: string; action: string; plan?: string; items?: ScheduleItem[]; status?: keyof typeof statuses }[];
  }
}
const stateLabels = { unassigned: '待协商', proposed: '待对方确认', agreed: '已确认安排' }
const eventLabels: Record<string, string> = { propose: '提出安排', accept: '确认安排', decline: '暂不接受', update_item: '更新行动状态' }
const displayAt = (at: string) => new Date(at).toLocaleString('zh-CN', { hour12: false })
const createItem = (ownerId: string): ScheduleItem => ({ id: crypto.randomUUID(), at: '', ownerId, title: '', status: 'planned' })

export function AcademicCollaboration({ item, userId, call, refresh }: {
  item: CaseItem; userId: string; call: BCall; refresh: () => Promise<void>;
}) {
  const [assigneeId, setAssigneeId] = useState(userId)
  const [draft, setDraft] = useState(() => [createItem(userId)])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const c = item.collaboration
  const owner = (id: string) => id === item.mentorId ? '导师' : id === item.counselorId ? '辅导员' : id
  const ownerOptions = [item.mentorId, item.counselorId].map(id => <option key={id} value={id}>
    {owner(id)}{id === userId ? '（我）' : ''}
  </option>)
  const statusOptions = Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)
  const act = async (action: string, fields: Record<string, unknown> = {}) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await call(`/b/cases/${item.id}/collaboration`, { action, ...fields, version: item.version, requestId: crypto.randomUUID() })
      await refresh()
      if (action === 'propose') setDraft([createItem(userId)])
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试。')
      await refresh().catch(() => {})
    } finally { setBusy(false) }
  }
  const change = (id: string, patch: Partial<ScheduleItem>) =>
    setDraft(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row))

  return <div className="b-collaboration">
    <h3>协商跟进安排</h3>
    <p>由关联导师与辅导员协商行动安排，被指定人确认后生效。</p>
    <p role="status">协商状态：{stateLabels[c?.status ?? 'unassigned']}</p>
    {!!c?.items?.length && <div className="collaboration-table-wrap" role="region" aria-label="已提交的跟进日程" tabIndex={0}>
      <table className="collaboration-table">
        <thead><tr><th scope="col">时间</th><th scope="col">负责人</th><th scope="col">事项</th><th scope="col">状态</th></tr></thead>
        <tbody>{c.items.map(row => <tr key={row.id}>
          <td>{displayAt(row.at)}</td><td>{owner(row.ownerId)}</td><td>{row.title}</td>
          <td>{c.status === 'agreed' && item.status !== 'completed' && row.ownerId === userId ? <select
            aria-label={`${row.title}状态`} value={row.status} disabled={busy}
            onChange={e => void act('update_item', { itemId: row.id, status: e.target.value })}>{statusOptions}</select> : statuses[row.status]}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {c?.plan && <p>原安排：{c.plan}{c.nextAt && ` · 下一步 ${displayAt(c.nextAt)}`}</p>}
    {!!c?.history?.length && <details><summary>协商历史（{c.history.length}）</summary>
      <ul>{c.history.map(entry => <li key={entry.id}>
        {displayAt(entry.at)} · {owner(entry.actor)} · {eventLabels[entry.action] || entry.action}
        {entry.plan && ` · ${entry.plan}`}
        {entry.status && ` · ${statuses[entry.status]}`}
        {!!entry.items?.length && <ul>{entry.items.map(row => <li key={row.id}>
          {displayAt(row.at)} · {owner(row.ownerId)} · {row.title} · {statuses[row.status]}
        </li>)}</ul>}
      </li>)}</ul>
    </details>}
    {error && <p role="alert">{error}</p>}
    {item.status !== 'completed' && <>
      <form onSubmit={event => {
        event.preventDefault()
        if (draft.some(row => !row.title.trim() || !Number.isFinite(Date.parse(row.at)))) {
          setError('请填写每条行动的时间和事项。')
          return
        }
        void act('propose', { assigneeId, items: draft.map(({ at, ownerId, title, status }) =>
          ({ at: new Date(at).toISOString(), ownerId, title, status })) })
      }}>
        <label>本次牵头人<select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} disabled={busy}>{ownerOptions}</select></label>
        <div className="collaboration-draft">
          {draft.map((row, index) => <fieldset key={row.id} disabled={busy}>
            <legend>行动项 {index + 1}</legend>
            <div className="collaboration-fields">
              <label>时间<input type="datetime-local" aria-label={`行动项 ${index + 1} 时间`} required value={row.at} onChange={e => change(row.id, { at: e.target.value })} /></label>
              <label>负责人<select value={row.ownerId} onChange={e => change(row.id, { ownerId: e.target.value })}>{ownerOptions}</select></label>
              <label>事项<input required maxLength={200} aria-label={`行动项 ${index + 1} 事项`} value={row.title} onChange={e => change(row.id, { title: e.target.value })} /></label>
              <label>状态<select value={row.status} onChange={e => change(row.id, { status: e.target.value as ScheduleItem['status'] })}>{statusOptions}</select></label>
              {draft.length > 1 && <button type="button" aria-label={`删除行动项 ${index + 1}`} onClick={() => setDraft(rows => rows.filter(entry => entry.id !== row.id))}>删除</button>}
            </div>
          </fieldset>)}
        </div>
        <div className="b-actions">
          <button type="button" disabled={busy || draft.length >= 20} onClick={() => setDraft(rows => [...rows, createItem(userId)])}>添加行动项</button>
          <button type="submit" disabled={busy}>提交协商安排</button>
        </div>
      </form>
      {c?.status === 'proposed' && c.assigneeId === userId && <div className="b-actions">
        <button disabled={busy} onClick={() => void act('accept')}>接受安排</button>
        <button disabled={busy} onClick={() => void act('decline')}>暂不接受</button>
      </div>}
    </>}
  </div>
}
