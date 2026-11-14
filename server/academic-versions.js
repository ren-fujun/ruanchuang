import crypto from 'node:crypto'
import { prepareAcademicBatch } from './academic-batch.js'

// Pure domain functions; callers own authentication, authorization data and persistence.
const denied = () => { throw new Error('无权操作名单') }
function authorize(user, rows) {
  if (user?.role !== 'academic' || !user.id || !Array.isArray(user.academicStudentIds)) denied()
  const scope = new Set(user.academicStudentIds)
  if (rows.some(row => !scope.has(row.studentId))) denied()
}
function validateAssignments(rows, users) {
  if (!Array.isArray(users)) throw new Error('用户数据无效')
  const ids = new Map(users.map(user => [user.id, user.role]))
  return rows.flatMap((row, i) => {
    const messages = []
    if (ids.get(row.studentId) !== 'student') messages.push('学生不存在')
    if (ids.get(row.mentorId) !== 'mentor') messages.push('导师不存在')
    if (ids.get(row.counselorId) !== 'counselor') messages.push('辅导员不存在')
    return messages.length ? [{ row: i + 1, messages }] : []
  })
}
export function createAcademicVersion({ user, rows, users, previous = null, expectedVersion = 0 }) {
  const checked = prepareAcademicBatch(rows, { previousVersion: 0 })
  if (!checked.valid) return checked
  authorize(user, checked.batch.items)
  const errors = validateAssignments(checked.batch.items, users)
  if (errors.length) return { valid: false, errors }
  if (previous) {
    if (previous.ownerId !== user.id || !Array.isArray(previous.items)) denied()
    // A correction cannot be used to remove students outside the current scope.
    authorize(user, previous.items)
    if (!Number.isSafeInteger(previous.version) || previous.version < 1 || previous.version >= Number.MAX_SAFE_INTEGER || expectedVersion !== previous.version) throw new Error('名单版本冲突')
  } else if (expectedVersion !== 0) throw new Error('名单版本冲突')
  return { valid: true, batch: {
    id: crypto.randomUUID(), seriesId: previous ? previous.seriesId : crypto.randomUUID(),
    previousId: previous ? previous.id : null, ownerId: user.id,
    version: previous ? previous.version + 1 : 1, createdAt: new Date().toISOString(),
    items: checked.batch.items,
  } }
}
export function canReadAcademicVersion(user, batch) {
  try { if (batch?.ownerId !== user?.id || !Array.isArray(batch.items)) return false; authorize(user, batch.items); return true } catch { return false }
}
