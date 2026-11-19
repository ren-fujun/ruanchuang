// Only untouched cases can be reassigned automatically; all other corrections require manual review.
export function planAcademicCorrection(previous, next, cases, reason) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new Error('请填写更正原因。')
  if (!Array.isArray(previous.caseIds) || previous.caseIds.length !== previous.items.length || next.items.length !== previous.items.length) throw new Error('仅支持更正未办理事项的导师或辅导员，不支持增删名单。')
  const changes=[]
  for (let i=0;i<previous.items.length;i++) {
    const old=previous.items[i], item=next.items.find(row=>row.studentId===old.studentId && row.course===old.course)
    const c=cases.find(entry=>entry.id===previous.caseIds[i])
    if (!item || !c || c.studentId!==old.studentId || c.course!==old.course || c.mentorId!==old.mentorId || c.counselorId!==old.counselorId) throw new Error('名单或事项已变化，请人工核对。')
    if (c.status!=='pending_contact' || c.result || c.records?.length || c.collaboration?.history?.length || c.collaboration?.status === 'proposed' || c.collaboration?.status === 'agreed') throw new Error('存在已开展的跟进，请人工核对，不可自动更正。')
    changes.push({caseItem:c, item})
  }
  if (!changes.some(({caseItem,item})=>caseItem.mentorId!==item.mentorId || caseItem.counselorId!==item.counselorId)) throw new Error('名单没有人员变更。')
  return changes
}
