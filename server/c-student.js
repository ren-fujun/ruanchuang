import crypto from 'node:crypto'

// Pure student-side ticket change planner. The caller owns persistence and must
// apply the returned ticket/bundle changes atomically.
export function planStudentTicketChange({ ticket, bundle, actorId, text, expectedUpdatedAt, requestId, action = 'supplement', now = new Date().toISOString() }) {
  if (!ticket || typeof ticket !== 'object' || !actorId || ticket.studentId !== actorId) return failure(404, '工单不存在或无权访问。')
  if (typeof text !== 'string' || text.trim().length < 6 || text.trim().length > 2000) return failure(400, '请填写6至2000字的内容。')
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 200) return failure(400, '请求参数无效。')
  const prior = (ticket.studentChanges || []).find(entry => entry.requestId === requestId)
  if (prior) return prior.text === text.trim() && prior.action === action && prior.expectedUpdatedAt === expectedUpdatedAt ? { ok: true, replay: true, ticket } : failure(409, 'requestId已用于其他请求。')
  if (ticket.updatedAt !== expectedUpdatedAt) return failure(409, '工单已更新，请刷新后重试。')
  if (action === 'reopen') {
    if (!['awaiting_confirm', 'completed'].includes(ticket.status)) return failure(409, '当前状态不能反馈未解决。')
    if (ticket.status === 'awaiting_confirm' && (!bundle || bundle.status !== 'dispatched' || !bundle.items?.some(item => item.ticketId === ticket.id && item.status === 'resolved'))) return failure(409, '当前工单尚不支持此操作。')
    if (bundle && (bundle.status !== 'dispatched' || !bundle.items?.some(item => item.ticketId === ticket.id && item.status === 'resolved'))) return failure(409, '问题包状态已变化。')
  } else if (action === 'supplement') {
    if (!['pending_review', 'assigned', 'processing', 'awaiting_confirm'].includes(ticket.status)) return failure(409, '当前状态不能补充说明。')
  } else return failure(400, '操作类型无效。')
  const next = structuredClone(ticket)
  const entry = { id: crypto.randomUUID(), action, text: text.trim(), requestId, expectedUpdatedAt, actorId, at: now }
  next.studentChanges = [...(next.studentChanges || []), entry]
  next.updatedAt = now
  next.timeline = [...(next.timeline || []), { id: entry.id, type: action === 'reopen' ? 'reopened' : 'student_supplement', title: action === 'reopen' ? '学生反馈尚未解决' : '学生补充说明', desc: entry.text, actor: actorId, at: now }]
  let nextBundle
  if (action === 'reopen') {
    next.status = 'pending_review'
    if (next.rating) { next.previousRatings = [...(next.previousRatings || []), next.rating]; next.rating = null }
    if (bundle) {
      nextBundle = structuredClone(bundle)
      const item = nextBundle.items.find(item => item.ticketId === ticket.id)
      item.status = 'disputed'
      item.history = [...(item.history || []), { id: entry.id, action: 'disputed', actorId, at: now, reason: entry.text, requestId }]
      nextBundle.version = (nextBundle.version || 1) + 1
      nextBundle.updatedAt = now
    }
  }
  if (action === 'supplement' && bundle?.status === 'dispatched') {
    nextBundle = structuredClone(bundle)
    const item = nextBundle.items.find(item => item.ticketId === ticket.id)
    if (!item) return failure(409, '问题包状态已变化。')
    item.history = [...(item.history || []), { id:entry.id, action:'supplement', actorId, at:now, text:entry.text }]
    nextBundle.version = (nextBundle.version || 1) + 1
    nextBundle.updatedAt = now
  }
  return { ok: true, replay: false, ticket: next, ...(nextBundle ? { bundle: nextBundle } : {}) }
}

function failure(status, message) { return { ok: false, status, message } }
