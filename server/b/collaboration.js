import crypto from 'node:crypto'
import { operation, notice } from './operations.js'

const itemStatuses = ['planned', 'in_progress', 'completed']
const isActive = user => user && !user.disabled && (!user.expiresAt || Date.parse(user.expiresAt) > Date.now())

export const canCounselorViewCase = (item, user) =>
  item.counselorId === user.id && Array.isArray(user.studentIds) && user.studentIds.includes(item.studentId)

const latestOfficialRecord = item => item.records?.findLast(record => record.type === 'official_result')

export function academicFollowUp(item, userId, now = Date.now()) {
  if (item.status === 'completed' || item.correctionCancelled ||
    ![item.mentorId, item.counselorId].includes(userId)) return null
  const plan = item.collaboration
  if (plan?.status === 'proposed') {
    return plan.assigneeId === userId ? {
      statusLabel: '待确认', reason: '有一项学业协商安排等你确认',
      at: plan.history?.at(-1)?.at || item.createdAt,
    } : null
  }
  if (plan?.status === 'agreed') {
    const open = (plan.items || []).filter(action => action.status !== 'completed')
    const mine = open.filter(action => action.ownerId === userId)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    const first = mine[0]
    if (first) return {
      statusLabel: Date.parse(first.at) < now ? '计划时间已过' : '待跟进',
      reason: mine.length > 1 ? `${first.title}（另有 ${mine.length - 1} 项待跟进）` : first.title,
      at: first.at,
    }
    if (open.length) return null
    if (item.result?.value === 'failed') {
      const officialRecordId = latestOfficialRecord(item)?.id
      const accepted = plan.history?.findLast(event => event.action === 'accept')
      const hasFollowUpPlan = plan.followedResultId
        ? officialRecordId === plan.followedResultId
        : Date.parse(accepted?.at) > Date.parse(item.result.at)
      if (hasFollowUpPlan) return null
    }
  }
  return item.result?.value === 'failed' ? {
    statusLabel: '待续跟', reason: '教务已回写未通过，请协商下一轮帮扶安排',
    at: item.result.at || item.createdAt,
  } : null
}

function normalizeItems(items, c, db) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) return null
  const entries = []
  for (const item of items) {
    if (!item || typeof item.at !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(item.at) ||
      !Number.isFinite(Date.parse(item.at)) ||
      ![c.mentorId, c.counselorId].includes(item.ownerId) || !isActive(db.users.find(user => user.id === item.ownerId)) ||
      typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200 ||
      !itemStatuses.includes(item.status) || (item.status === 'planned' && Date.parse(item.at) <= Date.now())) return null
    entries.push({ id: crypto.randomUUID(), at: new Date(item.at).toISOString(), ownerId: item.ownerId,
      title: item.title.trim(), status: item.status })
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at))
}

export function caseView(c, user) {
  const participant = [c.mentorId, c.counselorId].includes(user.id)
  return { ...c,
    ...(participant && { followUp: academicFollowUp(c, user.id) }),
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
    const { action, assigneeId, plan, nextAt, items, itemId, status } = req.body
    const old = c.collaboration || { status: 'unassigned', history: [] }
    let next
    if (action === 'propose') {
      if (![c.mentorId, c.counselorId].includes(assigneeId) || !isActive(db.users.find(x => x.id === assigneeId))) {
        return fail('只能选择本事项关联且有效的导师或辅导员')
      }
      if (items !== undefined) {
        const schedule = normalizeItems(items, c, db)
        if (!schedule) return fail('请填写 1 至 20 条有效行动项，待开始行动的时间须在未来，负责人须为关联导师或辅导员。')
        next = { status: 'proposed', assigneeId, proposerId: req.user.id, items: schedule }
      } else {
        // Older clients can still submit and view a text arrangement.
        if (typeof plan !== 'string' || !plan.trim() || plan.length > 1000 ||
          (nextAt && (!Number.isFinite(Date.parse(nextAt)) || Date.parse(nextAt) <= Date.now()))) return fail('请填写协商安排，下一步时间须在未来')
        next = { status: 'proposed', assigneeId, proposerId: req.user.id, plan: plan.trim(), nextAt: nextAt || null }
      }
    } else if (['accept', 'decline'].includes(action)) {
      if (old.status !== 'proposed' || old.assigneeId !== req.user.id) return fail('仅被指定人可确认待接受的安排', 403)
      next = { ...old, status: action === 'accept' ? 'agreed' : 'unassigned' }
      if (action === 'accept' && c.result?.value === 'failed') {
        next.followedResultId = latestOfficialRecord(c)?.id
      }
    } else if (action === 'update_item') {
      if (old.status !== 'agreed') return fail('接受协商安排后才能更新行动状态。', 409)
      const item = old.items?.find(entry => entry.id === itemId)
      if (!item || item.ownerId !== req.user.id) return fail('仅行动负责人可更新状态。', 403)
      if (!itemStatuses.includes(status)) return fail('请选择有效的行动状态。')
      next = { ...old, items: old.items.map(entry => entry.id === itemId ? { ...entry, status } : entry) }
    } else return fail('不支持的协商动作')
    const event = { id: crypto.randomUUID(), action, actor: req.user.id, at: new Date().toISOString(),
      assigneeId: next.assigneeId, plan: next.plan, nextAt: next.nextAt,
      items: action === 'propose' ? next.items : undefined, itemId, status }
    c.collaboration = { ...next, history: [...old.history, event] }
    c.version++
    const recipient = req.user.id === c.mentorId ? c.counselorId : c.mentorId
    notice(db, recipient, '学业协商安排已更新', '请查看对应学业事项并确认后续安排。')
    audit(req, 'collaboration_' + action, c.id)
    finish({ item: caseView(c, req.user) }); save()
  })
}
