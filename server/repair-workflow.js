import crypto from 'node:crypto'

export const REPAIR_STATUS = Object.freeze({
  PENDING_ASSIGNMENT: 'pending_assignment',
  PROCESSING: 'processing',
  AWAITING_FEEDBACK: 'awaiting_feedback',
  OBJECTION_PENDING_RESPONSE: 'objection_pending_response',
  PENDING_COORDINATION: 'pending_coordination',
  SATISFIED: 'satisfied',
  COORDINATED_CLOSED: 'coordinated_closed',
})

export const REPAIR_STATUS_LABELS = Object.freeze({
  pending_assignment: '待后勤分配',
  processing: '处理中',
  awaiting_feedback: '待学生反馈',
  objection_pending_response: '异议待后勤回应',
  pending_coordination: '待辅导员协调',
  satisfied: '已修复并确认',
  coordinated_closed: '协调结案',
})

export class RepairWorkflowError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'RepairWorkflowError'
    this.status = status
  }
}

const cleanText = (value, max, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RepairWorkflowError(`请填写${field}`)
  }
  const text = value.trim()
  if (text.length > max) {
    throw new RepairWorkflowError(`${field}不能超过${max}字`)
  }
  return text
}

const ensureVersion = (repair, version) => {
  if (!Number.isInteger(version) || version !== repair.version) {
    throw new RepairWorkflowError('事项已被更新，请刷新后再操作', 409)
  }
}

const historyEntry = (action, actor, details = {}) => ({
  id: crypto.randomUUID(),
  action,
  actorId: actor.id,
  actorName: actor.name,
  at: new Date().toISOString(),
  ...details,
})

export function nextRepairId(repairs, date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const prefix = `WX${ymd}`
  const todayCount = repairs.filter((repair) => repair.id.startsWith(prefix)).length
  return `${prefix}${String(todayCount + 1).padStart(3, '0')}`
}

export function createRepair({
  repairs,
  student,
  counselorId = null,
  repairType,
  location,
  description,
  campus,
  requestId,
  claimMinutes = 30,
}) {
  if (student?.role !== 'student') {
    throw new RepairWorkflowError('只有学生可以提交报修', 403)
  }
  const idempotencyKey = cleanText(requestId, 100, '请求编号')
  const existing = repairs.find((repair) =>
    repair.history.some((entry) => entry.requestId === idempotencyKey),
  )
  if (existing) {
    if (existing.studentId !== student.id) {
      throw new RepairWorkflowError('请求编号已被使用', 409)
    }
    return existing
  }

  const issuedAt = new Date()
  const now = issuedAt.toISOString()
  const claimDueAt = new Date(
    issuedAt.getTime() + claimMinutes * 60_000,
  ).toISOString()
  const repair = {
    id: nextRepairId(repairs),
    status: REPAIR_STATUS.PENDING_ASSIGNMENT,
    version: 1,
    studentId: student.id,
    studentName: student.name,
    counselorId,
    campus,
    repairType: cleanText(repairType, 30, '报修类型'),
    location: cleanText(location, 120, '报修地点'),
    description: cleanText(description, 1000, '故障描述'),
    claimantId: null,
    claimantName: null,
    claimedAt: null,
    result: null,
    feedback: null,
    response: null,
    coordination: null,
    createdAt: now,
    updatedAt: now,
    claimDueAt,
    terminalAt: null,
    history: [
      historyEntry('created', student, {
        requestId: idempotencyKey,
        detail: '学生直接提交报修，等待后勤分配。',
      }),
    ],
  }
  return repair
}

export function claimRepair({ repair, logistics, version, requestId }) {
  ensureVersion(repair, version)
  if (logistics?.role !== 'logistics') {
    throw new RepairWorkflowError('只有后勤人员可以领取事项', 403)
  }
  if (repair.status !== REPAIR_STATUS.PENDING_ASSIGNMENT || repair.claimantId) {
    throw new RepairWorkflowError('该事项已被其他人员领取', 409)
  }
  const at = new Date().toISOString()
  return {
    ...repair,
    status: REPAIR_STATUS.PROCESSING,
    version: repair.version + 1,
    claimantId: logistics.id,
    claimantName: logistics.name,
    claimedAt: at,
    updatedAt: at,
    history: [
      ...repair.history,
      historyEntry('claimed', logistics, {
        requestId: cleanText(requestId, 100, '请求编号'),
        detail: '后勤人员已领取事项。',
      }),
    ],
  }
}

export function submitRepairResult({ repair, logistics, version, result, requestId }) {
  ensureVersion(repair, version)
  if (logistics?.role !== 'logistics' || repair.claimantId !== logistics.id) {
    throw new RepairWorkflowError('无权处理该事项', 403)
  }
  if (repair.status !== REPAIR_STATUS.PROCESSING) {
    throw new RepairWorkflowError('当前状态不能提交处理结果', 409)
  }
  const text = cleanText(result, 1000, '处理结果')
  const key = cleanText(requestId, 100, '请求编号')
  const at = new Date().toISOString()
  return {
    ...repair,
    status: REPAIR_STATUS.AWAITING_FEEDBACK,
    version: repair.version + 1,
    result: { text, at, actorId: logistics.id, actorName: logistics.name },
    updatedAt: at,
    history: [
      ...repair.history,
      historyEntry('result_submitted', logistics, {
        requestId: key,
        detail: text,
      }),
    ],
  }
}

export function submitRepairFeedback({
  repair,
  student,
  version,
  decision,
  reason,
  requestId,
  responseMinutes = 1440,
}) {
  ensureVersion(repair, version)
  if (student?.role !== 'student' || repair.studentId !== student.id) {
    throw new RepairWorkflowError('无权反馈该事项', 403)
  }
  if (repair.status !== REPAIR_STATUS.AWAITING_FEEDBACK || repair.feedback) {
    throw new RepairWorkflowError('该事项已经反馈，不能再次提交', 409)
  }
  if (!['satisfied', 'objection'].includes(decision)) {
    throw new RepairWorkflowError('请选择满意或提出异议')
  }
  const objection = decision === 'objection'
    ? cleanText(reason, 1000, '异议原因')
    : ''
  const atDate = new Date()
  const at = atDate.toISOString()
  const responseDueAt = objection
    ? new Date(atDate.getTime() + responseMinutes * 60_000).toISOString()
    : null
  const key = cleanText(requestId, 100, '请求编号')
  return {
    ...repair,
    status: objection
      ? REPAIR_STATUS.OBJECTION_PENDING_RESPONSE
      : REPAIR_STATUS.SATISFIED,
    version: repair.version + 1,
    feedback: { decision, reason: objection, at },
    updatedAt: at,
    terminalAt: objection ? null : at,
    history: [
      ...repair.history,
      historyEntry(objection ? 'objection_submitted' : 'satisfied', student, {
        requestId: key,
        detail: objection ? objection : '学生确认维修结果。',
        responseDueAt,
      }),
    ],
  }
}

export function respondToRepairObjection({
  repair,
  logistics,
  version,
  response,
  requestId,
}) {
  ensureVersion(repair, version)
  if (logistics?.role !== 'logistics' || repair.claimantId !== logistics.id) {
    throw new RepairWorkflowError('无权回应该事项', 403)
  }
  if (repair.status !== REPAIR_STATUS.OBJECTION_PENDING_RESPONSE || repair.response) {
    throw new RepairWorkflowError('当前状态不能回应异议', 409)
  }
  const text = cleanText(response, 1000, '异议说明')
  const key = cleanText(requestId, 100, '请求编号')
  const at = new Date().toISOString()
  return {
    ...repair,
    status: REPAIR_STATUS.PENDING_COORDINATION,
    version: repair.version + 1,
    response: { text, at, actorId: logistics.id, actorName: logistics.name },
    updatedAt: at,
    history: [
      ...repair.history,
      historyEntry('objection_responded', logistics, {
        requestId: key,
        detail: text,
      }),
    ],
  }
}

export function remindRepair({ repair, counselor, version, note, requestId }) {
  ensureVersion(repair, version)
  if (counselor?.role !== 'counselor' || repair.counselorId !== counselor.id) {
    throw new RepairWorkflowError('无权提醒该事项', 403)
  }
  if ([REPAIR_STATUS.SATISFIED, REPAIR_STATUS.COORDINATED_CLOSED].includes(repair.status)) {
    throw new RepairWorkflowError('终态事项不能再提醒', 409)
  }
  const text = cleanText(note, 500, '提醒内容')
  const at = new Date().toISOString()
  return {
    ...repair,
    version: repair.version + 1,
    updatedAt: at,
    history: [
      ...repair.history,
      historyEntry('reminded', counselor, {
        requestId: cleanText(requestId, 100, '请求编号'),
        detail: text,
      }),
    ],
  }
}

export function coordinateRepair({
  repair,
  counselor,
  version,
  conclusion,
  followUp,
  owner,
  dueAt,
  requestId,
  now = new Date(),
}) {
  ensureVersion(repair, version)
  if (counselor?.role !== 'counselor' || repair.counselorId !== counselor.id) {
    throw new RepairWorkflowError('无权协调该事项', 403)
  }
  const responseDueAt = repair.history.findLast(
    (entry) => entry.action === 'objection_submitted',
  )?.responseDueAt
  const responseOverdue =
    repair.status === REPAIR_STATUS.OBJECTION_PENDING_RESPONSE &&
    responseDueAt &&
    new Date(responseDueAt).getTime() <= now.getTime()
  if (repair.status !== REPAIR_STATUS.PENDING_COORDINATION && !responseOverdue) {
    throw new RepairWorkflowError('当前状态不能协调结案', 409)
  }
  const text = cleanText(conclusion, 1000, '协调结论')
  const nextText = cleanText(followUp, 500, '后续安排')
  const ownerText = cleanText(owner, 50, '后续负责人')
  if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) {
    throw new RepairWorkflowError('请填写有效的后续时间')
  }
  const at = now.toISOString()
  return {
    ...repair,
    status: REPAIR_STATUS.COORDINATED_CLOSED,
    version: repair.version + 1,
    updatedAt: at,
    terminalAt: at,
    coordination: {
      conclusion: text,
      followUp: nextText,
      owner: ownerText,
      dueAt: new Date(dueAt).toISOString(),
      at,
      actorId: counselor.id,
      actorName: counselor.name,
      responseOverdue: Boolean(responseOverdue),
    },
    history: [
      ...repair.history,
      historyEntry('coordinated_closed', counselor, {
        requestId: cleanText(requestId, 100, '请求编号'),
        detail: text,
        responseOverdue: Boolean(responseOverdue),
      }),
    ],
  }
}
