import crypto from 'node:crypto'
import { operation, notice } from './operations.js'

export function caseView(c, user) {
  const participant = [c.mentorId, c.counselorId].includes(user.id)
  return { ...c,
    collaboration: participant ? c.collaboration || { status: 'unassigned', history: [] } :
      { status: c.collaboration?.status || 'unassigned', assigneeId: c.collaboration?.assigneeId },
    records: c.records.map(r => participant && (r.actor === user.id || r.visibility === 'shared') ? r :
      { id: r.id, type: r.type, at: r.at, actor: r.actor, summary: participant ? r.summary : undefined }) }
}

export function mountCollaboration(r, { db, state, save, visible, audit }) {
  r.post('/cases/:id/collaboration', (req, res) => {
    const fail = (message, status = 400) => res.status(status).json({ message })
    const c = state.cases.find(x => x.id === req.params.id && visible(x, req.user))
    if (!['mentor', 'counselor'].includes(req.user.role) || !c) return fail('无权协商该事项', 403)
    const finish = operation(req, res, state, 'collaboration:' + c.id); if (!finish) return
    if (c.status === 'completed' || c.version !== req.body.version) return fail('事项已结束或版本冲突，请刷新', 409)
    const { action, assigneeId, plan, nextAt } = req.body
    const old = c.collaboration || { status: 'unassigned', history: [] }
    let next
    if (action === 'propose') {
      if (![c.mentorId, c.counselorId].includes(assigneeId) || !db.users.some(x => x.id === assigneeId && !x.disabled)) return fail('只能选择本事项关联且有效的导师或辅导员')
      if (typeof plan !== 'string' || !plan.trim() || plan.length > 1000 ||
        (nextAt && (!Number.isFinite(Date.parse(nextAt)) || Date.parse(nextAt) <= Date.now()))) return fail('请填写协商安排，下一步时间须在未来')
      next = { status: 'proposed', assigneeId, proposerId: req.user.id, plan: plan.trim(), nextAt: nextAt || null }
    } else if (['accept', 'decline'].includes(action)) {
      if (old.status !== 'proposed' || old.assigneeId !== req.user.id) return fail('仅被指定人可确认待接受的安排', 403)
      next = { ...old, status: action === 'accept' ? 'agreed' : 'unassigned' }
    } else return fail('不支持的协商动作')
    const event = { id: crypto.randomUUID(), action, actor: req.user.id, at: new Date().toISOString(),
      assigneeId: next.assigneeId, plan: next.plan, nextAt: next.nextAt }
    c.collaboration = { ...next, history: [...old.history, event] }
    c.version++
    const recipient = req.user.id === c.mentorId ? c.counselorId : c.mentorId
    notice(db, recipient, '学业协商安排已更新', '请查看对应学业事项并确认后续安排。')
    audit(req, 'collaboration_' + action, c.id)
    finish({ item: caseView(c, req.user) }); save()
  })
}
