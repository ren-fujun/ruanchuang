import crypto from 'node:crypto'
import express from 'express'
import {
  REPAIR_STATUS,
  REPAIR_STATUS_LABELS,
  RepairWorkflowError,
  claimRepair,
  coordinateRepair,
  createRepair,
  remindRepair,
  respondToRepairObjection,
  submitRepairFeedback,
  submitRepairResult,
} from './repair-workflow.js'

const REPAIR_TYPES = ['水电', '门窗', '空调采暖', '网络设施', '公共设施', '其他']
const COUNSELOR_ROLES = ['student', 'counselor', 'logistics']

const requestIdOf = (body) =>
  typeof body?.requestId === 'string' ? body.requestId.trim() : ''

const inLogisticsScope = (user, repair) =>
  Array.isArray(user.repairScopes) && user.repairScopes.includes(repair.campus)

const canViewRepair = (user, repair) => {
  if (user.role === 'student') return repair.studentId === user.id
  if (user.role === 'counselor') return repair.counselorId === user.id
  if (user.role === 'logistics') {
    return inLogisticsScope(user, repair) &&
      (!repair.claimantId || repair.claimantId === user.id)
  }
  return false
}

const responseDueAtOf = (repair) =>
  repair.history.findLast((entry) => entry.action === 'objection_submitted')
    ?.responseDueAt || null

const decorateRepair = (repair) => {
  const responseDueAt = responseDueAtOf(repair)
  return {
    ...repair,
    statusLabel: REPAIR_STATUS_LABELS[repair.status] || repair.status,
    responseDueAt,
    responseOverdue:
      repair.status === REPAIR_STATUS.OBJECTION_PENDING_RESPONSE &&
      Boolean(responseDueAt) &&
      new Date(responseDueAt).getTime() <= Date.now(),
    terminal: [REPAIR_STATUS.SATISFIED, REPAIR_STATUS.COORDINATED_CLOSED].includes(
      repair.status,
    ),
  }
}

const addNotification = (db, save, {
  userId,
  type,
  title,
  body,
  repairId,
  tone = 'mint',
}) => {
  db.notifications.unshift({
    id: `n-${crypto.randomUUID().slice(0, 8)}`,
    userId,
    type,
    title,
    body,
    at: new Date().toISOString(),
    read: false,
    ticketId: null,
    repairId,
    tone,
  })
  save()
}

export function mountRepairRoutes(
  app,
  { db, save, requireAuth },
) {
  db.repairs ||= []
  const responseMinutes =
    Number.isFinite(Number(process.env.REPAIR_RESPONSE_MINUTES)) &&
    Number(process.env.REPAIR_RESPONSE_MINUTES) >= 0
      ? Number(process.env.REPAIR_RESPONSE_MINUTES)
      : 1440
  const router = express.Router()
  router.use(requireAuth)

  const fail = (res, error) => {
    if (error instanceof RepairWorkflowError) {
      return res.status(error.status).json({ message: error.message })
    }
    console.error('报修模块处理失败：', error)
    return res.status(500).json({ message: '报修服务暂时不可用，请稍后重试。' })
  }

  const getRepairOr404 = (id, res) => {
    const repair = db.repairs.find((item) => item.id === id)
    if (!repair) {
      res.status(404).json({ message: '没有找到该报修事项。' })
      return null
    }
    return repair
  }

  const duplicateResponse = (repair, requestId) =>
    requestId &&
    repair.history.some((entry) => entry.requestId === requestId)

  const replaceRepair = (next) => {
    const index = db.repairs.findIndex((repair) => repair.id === next.id)
    if (index < 0) throw new RepairWorkflowError('报修事项不存在', 404)
    db.repairs[index] = next
    save()
    return next
  }

  router.use((req, res, next) => {
    if (!COUNSELOR_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: '当前身份不能访问报修服务。' })
    }
    next()
  })

  router.get('/meta', (req, res) => {
    res.json({
      repairTypes: REPAIR_TYPES,
      campus: req.user.campus || '主校区',
      responseMinutes,
    })
  })

  router.get('/', (req, res) => {
    const repairs = db.repairs
      .filter((repair) => canViewRepair(req.user, repair))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(decorateRepair)
    res.json({ items: repairs })
  })

  router.get('/:id', (req, res) => {
    const repair = db.repairs.find((item) => item.id === req.params.id)
    if (!repair) return res.status(404).json({ message: '没有找到该报修事项。' })
    if (!canViewRepair(req.user, repair)) {
      return res.status(403).json({ message: '无权查看该报修事项。' })
    }
    return res.json({ repair: decorateRepair(repair) })
  })

  router.post('/', (req, res) => {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: '只有学生可以提交报修。' })
    }
    try {
      const counselor = db.users.find(
        (user) =>
          user.role === 'counselor' &&
          user.studentIds?.includes(req.user.id),
      )
      const repair = createRepair({
        repairs: db.repairs,
        student: req.user,
        counselorId: counselor?.id || null,
        repairType: req.body?.repairType,
        location: req.body?.location,
        description: req.body?.description,
        campus: req.user.campus || '主校区',
        requestId: requestIdOf(req.body),
      })
      const exists = db.repairs.some((item) => item.id === repair.id)
      if (!exists) {
        db.repairs.push(repair)
        save()
        const recipients = db.users.filter(
          (user) => user.role === 'logistics' && inLogisticsScope(user, repair),
        )
        for (const recipient of recipients) {
          addNotification(db, save, {
            userId: recipient.id,
            type: 'repair',
            title: '新的直达报修待领取',
            body: `${repair.location} · ${repair.repairType}，请按责任范围处理。`,
            repairId: repair.id,
            tone: 'gold',
          })
        }
      }
      return res.status(exists ? 200 : 201).json({ repair: decorateRepair(repair) })
    } catch (error) {
      return fail(res, error)
    }
  })

  router.post('/:id/claim', (req, res) => {
    const repair = getRepairOr404(req.params.id, res)
    if (!repair) return
    const requestId = requestIdOf(req.body)
    if (duplicateResponse(repair, requestId)) {
      return res.json({ repair: decorateRepair(repair), duplicate: true })
    }
    if (req.user.role !== 'logistics' || !inLogisticsScope(req.user, repair)) {
      return res.status(403).json({ message: '该报修不在你的责任范围。' })
    }
    try {
      const next = replaceRepair(
        claimRepair({
          repair,
          logistics: req.user,
          version: req.body?.version,
          requestId,
        }),
      )
      addNotification(db, save, {
        userId: next.studentId,
        type: 'repair',
        title: '后勤已领取报修',
        body: `${next.claimantName} 已领取「${next.repairType}」报修，正在处理。`,
        repairId: next.id,
      })
      return res.json({ repair: decorateRepair(next) })
    } catch (error) {
      return fail(res, error)
    }
  })

  router.post('/:id/result', (req, res) => {
    const repair = getRepairOr404(req.params.id, res)
    if (!repair) return
    const requestId = requestIdOf(req.body)
    if (duplicateResponse(repair, requestId)) {
      return res.json({ repair: decorateRepair(repair), duplicate: true })
    }
    try {
      const next = replaceRepair(
        submitRepairResult({
          repair,
          logistics: req.user,
          version: req.body?.version,
          result: req.body?.result,
          requestId,
        }),
      )
      addNotification(db, save, {
        userId: next.studentId,
        type: 'repair',
        title: '维修结果待你反馈',
        body: `后勤已提交「${next.repairType}」处理结果，请确认是否解决。`,
        repairId: next.id,
        tone: 'peach',
      })
      return res.json({ repair: decorateRepair(next) })
    } catch (error) {
      return fail(res, error)
    }
  })

  router.post('/:id/feedback', (req, res) => {
    const repair = getRepairOr404(req.params.id, res)
    if (!repair) return
    const requestId = requestIdOf(req.body)
    if (duplicateResponse(repair, requestId)) {
      return res.json({ repair: decorateRepair(repair), duplicate: true })
    }
    try {
      const next = replaceRepair(
        submitRepairFeedback({
          repair,
          student: req.user,
          version: req.body?.version,
          decision: req.body?.decision,
          reason: req.body?.reason,
          requestId,
          responseMinutes,
        }),
      )
      const recipients = [next.claimantId, next.counselorId].filter(Boolean)
      for (const userId of new Set(recipients)) {
        addNotification(db, save, {
          userId,
          type: next.status === REPAIR_STATUS.SATISFIED ? 'repair' : 'risk',
          title: next.status === REPAIR_STATUS.SATISFIED
            ? '学生已确认维修结果'
            : '学生提出维修异议',
          body: next.status === REPAIR_STATUS.SATISFIED
            ? `${next.location} 的报修已由学生确认。`
            : `${next.location} 的报修被反馈未解决，请查看异议说明。`,
          repairId: next.id,
          tone: next.status === REPAIR_STATUS.SATISFIED ? 'mint' : 'gold',
        })
      }
      return res.json({ repair: decorateRepair(next) })
    } catch (error) {
      return fail(res, error)
    }
  })

  router.post('/:id/respond', (req, res) => {
    const repair = getRepairOr404(req.params.id, res)
    if (!repair) return
    const requestId = requestIdOf(req.body)
    if (duplicateResponse(repair, requestId)) {
      return res.json({ repair: decorateRepair(repair), duplicate: true })
    }
    try {
      const next = replaceRepair(
        respondToRepairObjection({
          repair,
          logistics: req.user,
          version: req.body?.version,
          response: req.body?.response,
          requestId,
        }),
      )
      for (const userId of [next.studentId, next.counselorId].filter(Boolean)) {
        addNotification(db, save, {
          userId,
          type: 'repair',
          title: '后勤已补充异议说明',
          body: `${next.location} 的异议已收到后勤书面回应，待辅导员协调。`,
          repairId: next.id,
          tone: 'blue',
        })
      }
      return res.json({ repair: decorateRepair(next) })
    } catch (error) {
      return fail(res, error)
    }
  })

  router.post('/:id/remind', (req, res) => {
    const repair = getRepairOr404(req.params.id, res)
    if (!repair) return
    const requestId = requestIdOf(req.body)
    if (duplicateResponse(repair, requestId)) {
      return res.json({ repair: decorateRepair(repair), duplicate: true })
    }
    try {
      const next = replaceRepair(
        remindRepair({
          repair,
          counselor: req.user,
          version: req.body?.version,
          note: req.body?.note,
          requestId,
        }),
      )
      for (const userId of [next.claimantId, next.studentId].filter(Boolean)) {
        addNotification(db, save, {
          userId,
          type: 'repair',
          title: '辅导员提醒跟进报修',
          body: next.history.at(-1)?.detail || '请及时查看报修进展。',
          repairId: next.id,
          tone: 'gold',
        })
      }
      return res.json({ repair: decorateRepair(next) })
    } catch (error) {
      return fail(res, error)
    }
  })

  router.post('/:id/coordinate', (req, res) => {
    const repair = getRepairOr404(req.params.id, res)
    if (!repair) return
    const requestId = requestIdOf(req.body)
    if (duplicateResponse(repair, requestId)) {
      return res.json({ repair: decorateRepair(repair), duplicate: true })
    }
    try {
      const next = replaceRepair(
        coordinateRepair({
          repair,
          counselor: req.user,
          version: req.body?.version,
          conclusion: req.body?.conclusion,
          followUp: req.body?.followUp,
          owner: req.body?.owner,
          dueAt: req.body?.dueAt,
          requestId,
        }),
      )
      for (const userId of [next.studentId, next.claimantId].filter(Boolean)) {
        addNotification(db, save, {
          userId,
          type: 'repair',
          title: '报修异议已协调结案',
          body: `辅导员已记录协调结论与后续安排：${next.coordination.conclusion}`,
          repairId: next.id,
          tone: 'mint',
        })
      }
      return res.json({ repair: decorateRepair(next) })
    } catch (error) {
      return fail(res, error)
    }
  })

  app.use('/api/repairs', router)
}
