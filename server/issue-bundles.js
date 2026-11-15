import crypto from 'node:crypto'

// A bundle is a counselor-reviewed grouping, not a department dispatch.
export function createIssueBundle({ ticketIds, tickets, bundles = [], actorId, note = '' }) {
  if (!actorId || !Array.isArray(tickets) || !Array.isArray(bundles)) throw new Error('数据无效')
  if (!Array.isArray(ticketIds) || ticketIds.length < 1 || ticketIds.length > 100 || ticketIds.some(id => typeof id !== 'string' || !id.trim())) throw new Error('请选择1至100条工单')
  const ids = ticketIds.map(id => id.trim())
  if (new Set(ids).size !== ids.length) throw new Error('工单不能重复')
  if (typeof note !== 'string' || note.trim().length > 500) throw new Error('备注不能超过500字')
  const selected = ids.map(id => tickets.find(ticket => ticket.id === id))
  if (selected.some(ticket => !ticket)) throw new Error('工单不存在')
  if (selected.some(ticket => ticket.status !== 'pending_review')) throw new Error('只能打包待审核工单')
  if (bundles.some(bundle => bundle.status === 'draft' && bundle.ticketIds.some(id => ids.includes(id)))) throw new Error('工单已经存在于待转交问题包')
  return { id: crypto.randomUUID(), status: 'draft', ticketIds: ids, note: note.trim(), createdBy: actorId, createdAt: new Date().toISOString() }
}
