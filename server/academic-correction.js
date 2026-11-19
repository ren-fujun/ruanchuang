// Plan first; no records are modified until every change has been validated.
export function planAcademicCorrection(previous, next, cases, reason) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new Error('请填写更正原因。')
  if (!Array.isArray(previous.caseIds) || previous.caseIds.length !== previous.items.length) throw new Error('原名单与事项不一致，请人工核对。')
  const key = row => JSON.stringify([row.studentId, row.course])
  const oldKeys = new Set(previous.items.map(key)), nextByKey = new Map(next.items.map(row => [key(row), row]))
  const retained = [], removed = []
  for (let i = 0; i < previous.items.length; i++) {
    const old = previous.items[i], item = nextByKey.get(key(old)), c = cases.find(entry => entry.id === previous.caseIds[i])
    if (!c || c.studentId !== old.studentId || c.course !== old.course || c.mentorId !== old.mentorId || c.counselorId !== old.counselorId || c.correctionCancelled) throw new Error('名单或事项已变化，请人工核对。')
    const changed = !item || c.mentorId !== item.mentorId || c.counselorId !== item.counselorId
    if (changed && (c.status !== 'pending_contact' || c.result || c.records?.length || c.collaboration?.history?.length || c.collaboration?.status === 'proposed' || c.collaboration?.status === 'agreed')) throw new Error('变更涉及已开展的跟进，请人工核对。')
    if (item) retained.push({caseItem:c, item, changed})
    else removed.push(c)
  }
  const added = next.items.filter(row => !oldKeys.has(key(row)))
  for (const row of added) if (cases.some(c => c.studentId === row.studentId && c.course === row.course && c.status !== 'completed')) throw new Error('新增名单中存在尚未结束的同课程任务。')
  if (!added.length && !removed.length && !retained.some(entry => entry.changed)) throw new Error('名单没有变更。')
  return {retained, removed, added}
}
