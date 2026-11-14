import crypto from 'node:crypto'

// Import is deliberately separated from authorization and persistence: callers must
// enforce the academic role and approved student scope before storing a batch.
export function prepareAcademicBatch(rows, { previousVersion = 0 } = {}) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
    throw new Error('名单必须包含 1 至 1000 行')
  }
  if (!Number.isSafeInteger(previousVersion) || previousVersion < 0 || previousVersion >= Number.MAX_SAFE_INTEGER) {
    throw new Error('版本号无效')
  }
  const errors = []
  const seen = new Set()
  const items = Array.from(rows, (row, index) => {
    const studentId = typeof row?.studentId === 'string' ? row.studentId.trim() : ''
    const course = typeof row?.course === 'string' ? row.course.trim() : ''
    const mentorId = typeof row?.mentorId === 'string' ? row.mentorId.trim() : ''
    const counselorId = typeof row?.counselorId === 'string' ? row.counselorId.trim() : ''
    const problems = []
    if (!studentId || !course || !mentorId || !counselorId) problems.push('学生、课程、导师和辅导员均为必填项')
    if ([studentId, course, mentorId, counselorId].some((v) => v.length > 100)) problems.push('字段长度不能超过100字')
    const key = JSON.stringify([studentId, course])
    if (studentId && course && seen.has(key)) problems.push('学生和课程重复')
    seen.add(key)
    if (problems.length) errors.push({ row: index + 1, messages: problems })
    return { studentId, course, mentorId, counselorId }
  })
  if (errors.length) return { valid: false, errors }
  return { valid: true, batch: { id: crypto.randomUUID(), version: previousVersion + 1, createdAt: new Date().toISOString(), items } }
}
