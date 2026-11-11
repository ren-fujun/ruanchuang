import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, save } from './store.js'
import { departmentMap, knowledgeBase } from './seed.js'
import { refineAnalysis } from './llm.js'
import { createDormRecord, dormConstants, getDormOverview } from './dorm.js'
import {
  STATUS_LABELS,
  URGENCY_LABELS,
  RISK_LABELS,
  analyzeRequest,
  generateCounselorBrief,
  precheckRequest,
} from './ai.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
try {
  process.loadEnvFile?.()
} catch {
  // .env is optional; environment variables still work.
}
const PORT = Number(process.env.PORT || 8787)
const app = express()

const errorCodes = {
  400: 40001,
  401: 40101,
  403: 40301,
  404: 40401,
  409: 40901,
  413: 41301,
  500: 50001,
}

// v1 的唯一响应出口：路由只返回业务 data，统一在这里包装为 { code, msg, data }。
// 这样不会让某个新路由意外回退成裸 JSON。
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  const sendJson = res.json.bind(res)
  res.json = (payload) => {
    if (payload && typeof payload === 'object' && typeof payload.code === 'number') {
      return sendJson(payload)
    }
    const success = res.statusCode < 400
    const msg = success ? 'ok' : String(payload?.message || '中枢开小差了，请稍后再试。')
    return sendJson({
      code: success ? 0 : errorCodes[res.statusCode] || 50001,
      msg,
      data: success ? payload : null,
    })
  }
  next()
})

const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS || 'http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:8787')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ message: '当前来源不在服务访问白名单中。' })
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '6mb' }))

const nowIso = () => new Date().toISOString()
const dateKey = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const startOfDay = (value = new Date()) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}
const dayDiff = (value, today = new Date()) =>
  Math.round((startOfDay(today).getTime() - startOfDay(value).getTime()) / 86400000)
const minutesBetween = (a, b) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000)
const hoursBetween = (a, b) => Number((minutesBetween(a, b) / 60).toFixed(1))

const statusProgress = {
  pending_review: 12,
  assigned: 30,
  processing: 64,
  awaiting_confirm: 90,
  completed: 100,
}

const decorateTicket = (ticket) => {
  const minutesLeft = Math.round((new Date(ticket.dueAt).getTime() - Date.now()) / 60000)
  const overdue = !['completed', 'awaiting_confirm'].includes(ticket.status) && minutesLeft < 0
  return {
    ...ticket,
    statusLabel: STATUS_LABELS[ticket.status] || ticket.status,
    urgencyLabel: URGENCY_LABELS[ticket.urgency] || ticket.urgency,
    riskLabel: RISK_LABELS[ticket.risk] || ticket.risk,
    departments: (ticket.departmentIds || []).map((id) => departmentMap[id]).filter(Boolean),
    suggestedDepartments: (ticket.ai?.suggestedDepartments || []).map((id) => departmentMap[id]).filter(Boolean),
    progress: statusProgress[ticket.status] || 0,
    overdue,
    minutesLeft,
    isHighRisk: ticket.risk === 'high',
  }
}

const ticketForUser = (ticket, user) => {
  const decorated = decorateTicket(ticket)
  if (user.role === 'counselor') return decorated
  return {
    ...decorated,
    notes: [],
    timeline: (decorated.timeline || []).filter((event) => event.type !== 'note').map((event) =>
      event.type === 'assigned' ? { ...event, desc: String(event.desc || '').split('。督办备注：')[0] } : event,
    ),
  }
}

const publicUser = (user) => {
  if (!user) return null
  const { password, ...safe } = user
  return safe
}

const addNotification = ({ userId, type, title, body, ticketId = null, tone = 'mint' }) => {
  db.notifications.unshift({
    id: `n-${crypto.randomUUID().slice(0, 8)}`,
    userId,
    type,
    title,
    body,
    at: nowIso(),
    read: false,
    ticketId,
    tone,
  })
  save()
}

const makeTimelineEvent = (type, title, desc, actor) => ({
  id: `tl-${crypto.randomUUID().slice(0, 8)}`,
  type,
  title,
  desc,
  at: nowIso(),
  actor,
})

const getAuth = (req) => {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7)
  const session = db.sessions.find((item) => item.token === token)
  if (!session) return null
  return db.users.find((user) => user.id === session.userId) || null
}

const requireAuth = (req, res, next) => {
  const user = getAuth(req)
  if (!user) {
    return res.status(401).json({ message: '登录状态已失效，请重新进入。' })
  }
  req.user = user
  next()
}

const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ message: '当前身份无权访问该功能。' })
  }
  next()
}

const getTicketOr404 = (id, res) => {
  const ticket = db.tickets.find((item) => item.id === id)
  if (!ticket) {
    res.status(404).json({ message: '没有找到这张工单，可能已被归档。' })
    return null
  }
  return ticket
}

const canAccessTicket = (user, ticket) => {
  if (user.role === 'counselor') return true
  return ticket.studentId === user.id
}

const nextTicketId = () => {
  const date = new Date()
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const prefix = `ZX${ymd}`
  const todayCount = db.tickets.filter((ticket) => ticket.id.startsWith(prefix)).length
  return `${prefix}${String(todayCount + 1).padStart(3, '0')}`
}

const unreadFor = (userId) => db.notifications.filter((note) => note.userId === userId && !note.read).length

const completedAt = (ticket) =>
  [...ticket.timeline].reverse().find((event) => event.type === 'completed')?.at || ticket.updatedAt

const weeklySeries = (tickets) => {
  const labels = ['日', '一', '二', '三', '四', '五', '六']
  const days = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    const key = dateKey(date)
    const created = tickets.filter((ticket) => dateKey(ticket.createdAt) === key).length
    const completed = tickets.filter(
      (ticket) => ticket.status === 'completed' && dateKey(completedAt(ticket)) === key,
    ).length
    days.push({
      key,
      label: offset === 0 ? '今天' : `周${labels[date.getDay()]}`,
      date: key,
      created,
      completed,
    })
  }
  return days
}

const categoryPalette = {
  宿舍生活: '#F3A987',
  校园设施: '#88B7D9',
  学籍教务: '#B49ADB',
  奖助资助: '#E5BE65',
  心理支持: '#E6A4B4',
  安全保卫: '#83C5B0',
  网络服务: '#A7C7E7',
  其他: '#BFC7C2',
}

const categoryStats = (tickets) => {
  const map = new Map()
  for (const ticket of tickets) {
    map.set(ticket.category, (map.get(ticket.category) || 0) + 1)
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value, color: categoryPalette[name] || '#BFC7C2' }))
    .sort((a, b) => b.value - a.value)
}

const departmentStats = (tickets) => {
  return db.departments.map((department) => {
    const assigned = tickets.filter((ticket) => ticket.departmentIds?.includes(department.id))
    const active = assigned.filter((ticket) => ticket.status !== 'completed')
    const completed = assigned.filter((ticket) => ticket.status === 'completed')
    const responseSamples = assigned
      .map((ticket) => {
        const assignedEvent = ticket.timeline.find((event) => event.type === 'assigned')
        return assignedEvent ? hoursBetween(ticket.createdAt, assignedEvent.at) : null
      })
      .filter((value) => value !== null && Number.isFinite(value))
    const avgHours = responseSamples.length
      ? Number((responseSamples.reduce((sum, value) => sum + value, 0) / responseSamples.length).toFixed(1))
      : null
    return {
      ...department,
      active: active.length,
      completed: completed.length,
      total: assigned.length,
      observedAvgHours: avgHours,
      observedOnTime: completed.length ? Math.round(completed.filter(isOnTime).length / completed.length * 100) : null,
    }
  })
}

const isOnTime = (ticket) => {
  if (ticket.status !== 'completed') return false
  return new Date(completedAt(ticket)).getTime() <= new Date(ticket.dueAt).getTime()
}

const summaryMetrics = (tickets) => {
  const completed = tickets.filter((ticket) => ticket.status === 'completed')
  const ratings = tickets.map((ticket) => ticket.rating?.score).filter((score) => Number.isFinite(score) && score >= 1 && score <= 5)
  const responses = tickets.map((ticket) => {
    const assigned = ticket.timeline.find((event) => event.type === 'assigned')
    return assigned ? hoursBetween(ticket.createdAt, assigned.at) : null
  }).filter((value) => value !== null && Number.isFinite(value))
  return {
    satisfaction: ratings.length ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)) : null,
    avgResponse: responses.length ? Number((responses.reduce((sum, value) => sum + value, 0) / responses.length).toFixed(1)) : null,
    onTimeRate: completed.length ? Math.round(completed.filter(isOnTime).length / completed.length * 100) : null,
    closureRate: tickets.length ? Math.round(completed.length / tickets.length * 100) : null,
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: '智汇中枢 API', time: nowIso() })
})

app.post('/api/auth/login', (req, res) => {
  const { account = '', password = '', role } = req.body || {}
  const normalized = String(account).trim()
  const user = db.users.find(
    (item) =>
      item.account === normalized &&
      item.password === String(password) &&
      (!role || item.role === role),
  )
  if (!user) {
    return res.status(401).json({
      code: 40102,
      msg: '账号或密码不正确，请使用下方演示账号。',
      data: null,
    })
  }
  const token = crypto.randomUUID()
  db.sessions = db.sessions.filter((session) => session.userId !== user.id).slice(-40)
  db.sessions.push({ token, userId: user.id, at: nowIso() })
  save()
  res.json({ token, user: publicUser(user) })
})

app.post('/api/auth/demo', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ message: '生产环境不开放一键演示登录。' })
  const role = req.body?.role === 'counselor' ? 'counselor' : 'student'
  const user = db.users.find((item) => item.role === role)
  if (!user) return res.status(404).json({ message: '演示账号暂未配置。' })
  const token = crypto.randomUUID()
  db.sessions = db.sessions.filter((session) => session.userId !== user.id).slice(-40)
  db.sessions.push({ token, userId: user.id, at: nowIso() })
  save()
  res.json({ token, user: publicUser(user) })
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.slice(7)
  db.sessions = db.sessions.filter((session) => session.token !== token)
  save()
  res.json({ ok: true })
})

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), unread: unreadFor(req.user.id) })
})

app.get('/api/departments', requireAuth, (req, res) => {
  res.json({ departments: db.departments })
})

app.get('/api/knowledge', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim()
  const items = q
    ? knowledgeBase.filter(
        (item) =>
          item.title.includes(q) ||
          item.summary.includes(q) ||
          item.keywords.some((keyword) => keyword.includes(q)),
      )
    : knowledgeBase
  res.json({ items })
})

app.post('/api/ai/precheck', requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').trim()
  if (text.length < 4) {
    return res.status(400).json({ message: '再多描述一点，AI 才能更准确地帮你判断。' })
  }
  const location = String(req.body?.location || '')
  const result = precheckRequest({
    text,
    category: req.body?.category,
    location,
  })
  const baseAnalysis = result.analysis
  result.analysis = await refineAnalysis(text, baseAnalysis, location)
  if (result.analysis.risk !== 'low' || ['high', 'urgent'].includes(result.analysis.urgency)) {
    const wasSelfService = result.canSelfSolve
    result.canSelfSolve = false
    result.needsTicket = true
    if (wasSelfService) {
      result.answer =
        result.analysis.risk === 'high'
          ? '这件事需要被优先看见。请直接提交诉求，辅导员会尽快联系你；如果你正处于紧急危险中，请立即拨打 120 / 110。'
          : '这件事需要人工协同处理，建议直接提交给辅导员，由中枢协调对应部门。'
    }
  }
  res.json({ ...result, engine: result.analysis.model ? 'deepseek' : 'local-rules' })
})

app.get('/api/student/home', requireAuth, requireRole('student'), (req, res) => {
  const mine = db.tickets.filter((ticket) => ticket.studentId === req.user.id)
  const active = mine
    .filter((ticket) => ticket.status !== 'completed')
    .sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 }
      if (priority[a.risk] !== priority[b.risk]) return priority[a.risk] - priority[b.risk]
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  const featured =
    active.find((ticket) => ticket.status === 'processing') ||
    active.find((ticket) => ticket.status === 'awaiting_confirm') ||
    active[0] ||
    null
  const completed = mine.filter((ticket) => ticket.status === 'completed')
  const awaiting = mine.filter((ticket) => ticket.status === 'awaiting_confirm')
  const updates = mine
    .flatMap((ticket) =>
      ticketForUser(ticket, req.user).timeline.map((event) => ({
        ...event,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        category: ticket.category,
      })),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5)
  const notes = db.notifications
    .filter((note) => note.userId === req.user.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 3)

  res.json({
    user: publicUser(req.user),
    stats: {
      active: active.length,
      awaiting: awaiting.length,
      completed: completed.length,
      total: mine.length,
    },
    featured: featured ? ticketForUser(featured, req.user) : null,
    activeTickets: active.slice(0, 3).map((ticket) => ticketForUser(ticket, req.user)),
    updates,
    knowledge: knowledgeBase.filter((item) => item.hot).slice(0, 4),
    notifications: notes,
    unread: unreadFor(req.user.id),
    aiTip:
      awaiting.length > 0
        ? `你有 ${awaiting.length} 张工单待确认，确认后就能为这次办理打分。`
        : active.length > 0
          ? '你的诉求正在有序推进，有新的处理动作我会第一时间告诉你。'
          : '遇到问题随时告诉我，AI 会先帮你找答案，再决定要不要转给老师。',
  })
})

app.get('/api/tickets', requireAuth, (req, res) => {
  const status = String(req.query.status || 'all')
  const q = String(req.query.q || '').trim().toLowerCase()
  let list = db.tickets.filter((ticket) =>
    req.user.role === 'counselor' ? true : ticket.studentId === req.user.id,
  )
  if (status !== 'all') {
    const statuses = status.split(',')
    list = list.filter((ticket) => statuses.includes(ticket.status))
  }
  if (req.query.risk && req.query.risk !== 'all') {
    list = list.filter((ticket) => ticket.risk === req.query.risk)
  }
  if (req.query.overdue === 'true') {
    list = list.filter(
      (ticket) =>
        !['completed', 'awaiting_confirm'].includes(ticket.status) &&
        new Date(ticket.dueAt).getTime() < Date.now(),
    )
  }
  if (q) {
    list = list.filter(
      (ticket) =>
        ticket.title.toLowerCase().includes(q) ||
        ticket.studentName.toLowerCase().includes(q) ||
        ticket.category.toLowerCase().includes(q) ||
        ticket.id.toLowerCase().includes(q),
    )
  }
  const priority = { high: 0, medium: 1, low: 2 }
  list.sort((a, b) => {
    if (req.user.role === 'counselor' && a.status === 'pending_review' && b.status !== 'pending_review') return -1
    if (req.user.role === 'counselor' && b.status === 'pending_review' && a.status !== 'pending_review') return 1
    if (priority[a.risk] !== priority[b.risk]) return priority[a.risk] - priority[b.risk]
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const page = Number(req.query.page || 1)
  const pageSize = Number(req.query.pageSize || 20)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return res.status(400).json({ message: '分页参数不合法。' })
  }
  const total = list.length
  const start = (page - 1) * pageSize
  res.json({
    tickets: list.slice(start, start + pageSize).map((ticket) => ticketForUser(ticket, req.user)),
    counts: {
      all: db.tickets.filter((ticket) =>
        req.user.role === 'counselor' ? true : ticket.studentId === req.user.id,
      ).length,
      pending_review: db.tickets.filter(
        (ticket) =>
          ticket.status === 'pending_review' &&
          (req.user.role === 'counselor' || ticket.studentId === req.user.id),
      ).length,
      active: db.tickets.filter(
        (ticket) =>
          ticket.status !== 'completed' &&
          (req.user.role === 'counselor' || ticket.studentId === req.user.id),
      ).length,
      awaiting_confirm: db.tickets.filter(
        (ticket) =>
          ticket.status === 'awaiting_confirm' &&
          (req.user.role === 'counselor' || ticket.studentId === req.user.id),
      ).length,
      completed: db.tickets.filter(
        (ticket) =>
          ticket.status === 'completed' &&
          (req.user.role === 'counselor' || ticket.studentId === req.user.id),
      ).length,
    },
    page,
    pageSize,
    total,
    hasMore: start + pageSize < total,
  })
})

app.get('/api/tickets/:id', requireAuth, (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  if (!canAccessTicket(req.user, ticket)) {
    return res.status(403).json({ message: '你只能查看自己的诉求工单。' })
  }
  const decorated = ticketForUser(ticket, req.user)
  const related = db.tickets
    .filter(
      (item) =>
        item.id !== ticket.id &&
        item.studentId === ticket.studentId &&
        (item.category === ticket.category || item.status !== 'completed'),
    )
    .slice(0, 3)
    .map((item) => ticketForUser(item, req.user))
  res.json({
    ticket: decorated,
    related,
    student:
      req.user.role === 'counselor'
        ? {
            id: ticket.studentId,
            name: ticket.studentName,
            college: ticket.college,
            grade: '2023 级',
            tags: ticket.risk === 'high' ? ['重点关注', '近期有情绪波动'] : ['在册学生'],
            historyCount: db.tickets.filter((item) => item.studentId === ticket.studentId).length,
          }
        : publicUser(req.user),
    permissions: {
      canReview: req.user.role === 'counselor' && ticket.status === 'pending_review',
      canUrge: req.user.role === 'counselor' && ['assigned', 'processing'].includes(ticket.status),
      canProgress: req.user.role === 'counselor' && ['assigned', 'processing'].includes(ticket.status),
      canConfirm: req.user.role === 'student' && ticket.status === 'awaiting_confirm',
      canRate: req.user.role === 'student' && ticket.status === 'completed' && !ticket.rating,
      canStudentUrge:
        req.user.role === 'student' && ['assigned', 'processing'].includes(ticket.status),
    },
  })
})

app.post('/api/tickets', requireAuth, requireRole('student'), async (req, res) => {
  const text = String(req.body?.description || '').trim()
  if (text.length < 6) {
    return res.status(400).json({ message: '请至少用一句话描述你遇到的问题。' })
  }
  const category = req.body?.category && req.body.category !== '智能识别' ? req.body.category : undefined
  const location = String(req.body?.location || '')
  const baseAnalysis = analyzeRequest({
    text,
    category,
    location,
    urgency: req.body?.urgency,
  })
  const analysis = await refineAnalysis(text, baseAnalysis, location)
  const createdAt = nowIso()
  const id = nextTicketId()
  const timeline = [
    makeTimelineEvent('created', '诉求已提交', 'AI 已完成初步识别，等待辅导员审核', req.user.name),
    makeTimelineEvent('ai', 'AI 完成要素提取', `已生成标准化工单草稿，风险等级：${RISK_LABELS[analysis.risk]}`, '智汇中枢'),
  ]
  const ticket = {
    id,
    title: String(req.body?.title || '').trim() || text.slice(0, 24),
    description: text,
    category: analysis.category,
    location: String(req.body?.location || '未填写地点'),
    urgency: analysis.urgency,
    risk: analysis.risk,
    status: 'pending_review',
    studentId: req.user.id,
    studentName: req.user.name,
    college: req.user.college,
    departmentIds: [],
    createdAt,
    updatedAt: createdAt,
    dueAt: new Date(Date.now() + analysis.slaMinutes * 60000).toISOString(),
    slaMinutes: analysis.slaMinutes,
    ai: {
      summary: analysis.summary,
      risk: analysis.risk,
      riskReason: analysis.riskReason,
      sentiment: analysis.sentiment,
      confidence: analysis.confidence,
      suggestedDepartments: analysis.suggestedDepartments,
      coordinationReason: analysis.coordinationReason,
      missingInfo: analysis.missingInfo,
      tags: analysis.tags,
      draft: analysis.draft,
    },
    attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 6) : [],
    rating: null,
    timeline,
    notes: [],
    lastUrgedAt: null,
    source: '学生端 · H5',
    parentId: null,
  }
  db.tickets.unshift(ticket)

  addNotification({
    userId: 'cou-chen',
    type: analysis.risk === 'high' ? 'risk' : 'ticket',
    title: analysis.risk === 'high' ? '高风险预警 · 新工单' : '收到一条新诉求',
    body:
      analysis.risk === 'high'
        ? `${req.user.name}的诉求命中风险信号，建议 15 分钟内线下联系。`
        : `${req.user.name}提交了「${ticket.title}」，等待你审核分派。`,
    ticketId: ticket.id,
    tone: analysis.risk === 'high' ? 'coral' : 'mint',
  })

  save()
  res.status(201).json({ ticket: ticketForUser(ticket, req.user), message: '诉求已提交，辅导员会尽快查看。' })
})

app.post('/api/tickets/:id/confirm', requireAuth, requireRole('student'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  if (ticket.studentId !== req.user.id) {
    return res.status(403).json({ message: '你只能确认自己的诉求。' })
  }
  if (ticket.status !== 'awaiting_confirm') {
    return res.status(409).json({ message: '这张工单当前不在待确认状态。' })
  }
  const score = Number(req.body?.score || 0)
  const comment = String(req.body?.comment || '').trim()
  const tags = Array.isArray(req.body?.tags) ? req.body.tags.slice(0, 4) : []
  if (score >= 1 && score <= 5) {
    ticket.rating = { score, comment, tags, at: nowIso() }
  }
  ticket.status = 'completed'
  ticket.updatedAt = nowIso()
  ticket.timeline.push(
    makeTimelineEvent(
      'completed',
      '学生确认办结',
      ticket.rating ? `学生评价 ${score} 星${comment ? `：${comment}` : ''}` : '学生确认本次办理完成',
      req.user.name,
    ),
  )
  addNotification({
    userId: ticket.studentId,
    type: 'system',
    title: '工单已办结',
    body: `「${ticket.title}」已归档，感谢你的反馈。`,
    ticketId: ticket.id,
    tone: 'mint',
  })
  addNotification({
    userId: 'cou-chen',
    type: 'ticket',
    title: '学生确认办结',
    body: `${req.user.name}已确认「${ticket.title}」办结${ticket.rating ? `，评价 ${score} 星` : ''}。`,
    ticketId: ticket.id,
    tone: 'mint',
  })
  save()
  res.json({ ticket: ticketForUser(ticket, req.user), message: '已确认办结，谢谢你的反馈。' })
})

app.post('/api/tickets/:id/rate', requireAuth, requireRole('student'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  if (ticket.studentId !== req.user.id) return res.status(403).json({ message: '你只能评价自己的诉求。' })
  if (ticket.status !== 'completed') return res.status(409).json({ message: '工单办结后才能评价。' })
  const score = Number(req.body?.score || 0)
  if (score < 1 || score > 5) return res.status(400).json({ message: '请选择 1–5 星评分。' })
  ticket.rating = {
    score,
    comment: String(req.body?.comment || '').trim(),
    tags: Array.isArray(req.body?.tags) ? req.body.tags.slice(0, 4) : [],
    at: nowIso(),
  }
  ticket.updatedAt = nowIso()
  ticket.timeline.push(makeTimelineEvent('rated', '收到新的服务评价', `${score} 星 · ${ticket.rating.comment || '未填写评价'}`, req.user.name))
  save()
  res.json({ ticket: ticketForUser(ticket, req.user), message: '评价已提交，谢谢你帮助我们把服务做得更好。' })
})

app.post('/api/tickets/:id/urge-student', requireAuth, requireRole('student'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  if (ticket.studentId !== req.user.id) return res.status(403).json({ message: '你只能催办自己的诉求。' })
  if (!['assigned', 'processing'].includes(ticket.status)) {
    return res.status(409).json({ message: '当前状态暂时不需要催办。' })
  }
  ticket.lastUrgedAt = nowIso()
  ticket.updatedAt = nowIso()
  ticket.timeline.push(
    makeTimelineEvent('urge', '学生发起一次温和催办', String(req.body?.note || '想了解最新进展，辛苦老师帮忙看看。'), req.user.name),
  )
  addNotification({
    userId: 'cou-chen',
    type: 'sla',
    title: '学生催办提醒',
    body: `${req.user.name}希望了解「${ticket.title}」的最新进展。`,
    ticketId: ticket.id,
    tone: 'gold',
  })
  save()
  res.json({ ticket: ticketForUser(ticket, req.user), message: '已提醒辅导员，请耐心等待最新进展。' })
})

app.get('/api/counselor/dashboard', requireAuth, requireRole('counselor'), (req, res) => {
  const tickets = db.tickets
  const active = tickets.filter((ticket) => ticket.status !== 'completed')
  const completed = tickets.filter((ticket) => ticket.status === 'completed')
  const pending = active.filter((ticket) => ticket.status === 'pending_review')
  const highRisk = active.filter((ticket) => ticket.risk === 'high')
  const overdue = active.filter(
    (ticket) => ticket.status !== 'awaiting_confirm' && new Date(ticket.dueAt).getTime() < Date.now(),
  )
  const today = new Date()
  const todayNew = tickets.filter((ticket) => dayDiff(ticket.createdAt, today) === 0)
  const { avgResponse, satisfaction, onTimeRate, closureRate } = summaryMetrics(tickets)
  const queue = [...pending]
    .sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 }
      if (priority[a.risk] !== priority[b.risk]) return priority[a.risk] - priority[b.risk]
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    .slice(0, 4)
  const urgent = [...active]
    .filter(
      (ticket) =>
        ticket.risk === 'high' ||
        (ticket.status !== 'awaiting_confirm' && new Date(ticket.dueAt).getTime() <= Date.now() + 60 * 60000),
    )
    .sort((a, b) => {
      if ((a.risk === 'high') !== (b.risk === 'high')) return a.risk === 'high' ? -1 : 1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
    .slice(0, 4)

  const dormOverview = getDormOverview(db)
  res.json({
    user: publicUser(req.user),
    stats: {
      pending: pending.length,
      processing: active.filter((ticket) => ['assigned', 'processing'].includes(ticket.status)).length,
      overdue: overdue.length,
      highRisk: highRisk.length,
      todayNew: todayNew.length,
      active: active.length,
      completed: completed.length,
      total: tickets.length,
      avgResponse,
      satisfaction,
      onTimeRate,
      closureRate,
      dormPending: dormOverview.summary.pending,
      dormChecked: dormOverview.summary.checked,
    },
    brief: generateCounselorBrief(tickets),
    urgent: urgent.map(decorateTicket),
    queue: queue.map(decorateTicket),
    week: weeklySeries(tickets),
    categories: categoryStats(tickets).slice(0, 5),
    departments: departmentStats(tickets),
    unread: unreadFor(req.user.id),
    unreadMessages: db.notifications
      .filter((note) => note.userId === req.user.id && !note.read)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 2),
  })
})

app.patch('/api/tickets/:id/review', requireAuth, requireRole('counselor'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  if (ticket.status !== 'pending_review') {
    return res.status(409).json({ message: '这张工单已经审核过了。' })
  }
  const departmentIds = Array.isArray(req.body?.departmentIds)
    ? req.body.departmentIds.filter((id) => departmentMap[id])
    : []
  if (!departmentIds.length) {
    return res.status(400).json({ message: '请至少选择一个协同部门。' })
  }
  const note = String(req.body?.note || '').trim()
  ticket.departmentIds = [...new Set(departmentIds)].slice(0, 4)
  ticket.assignee = ticket.departmentIds
    .map((id) => departmentMap[id]?.contact)
    .filter(Boolean)
    .join(' / ')
  ticket.status = 'assigned'
  ticket.updatedAt = nowIso()
  ticket.timeline.push(
    makeTimelineEvent(
      'assigned',
      '辅导员审核通过',
      `已分派至 ${ticket.departmentIds.map((id) => departmentMap[id].name).join('、')}${note ? `。督办备注：${note}` : ''}`,
      req.user.name,
    ),
  )
  ticket.notes.push({ id: `note-${crypto.randomUUID().slice(0, 6)}`, text: note, at: nowIso(), actor: req.user.name })
  addNotification({
    userId: ticket.studentId,
    type: 'ticket',
    title: '工单已分派',
    body: `「${ticket.title}」已分派至${ticket.departmentIds.map((id) => departmentMap[id].short).join('、')}，请留意后续进展。`,
    ticketId: ticket.id,
    tone: 'blue',
  })
  save()
  res.json({ ticket: decorateTicket(ticket), message: '已审核并分派，学生会同步收到进展通知。' })
})

app.patch('/api/tickets/:id/progress', requireAuth, requireRole('counselor'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  const action = req.body?.action
  const result = String(req.body?.result || '').trim()

  if (action === 'accept') {
    if (ticket.status !== 'assigned') {
      return res.status(409).json({ message: '当前状态无法记录接单。' })
    }
    ticket.status = 'processing'
    ticket.updatedAt = nowIso()
    ticket.timeline.push(
      makeTimelineEvent(
        'accepted',
        '经办部门已接单',
        `${ticket.departmentIds.map((id) => departmentMap[id]?.short).join('、')}已接收工单，按 SLA 时限推进`,
        ticket.departmentIds[0] ? departmentMap[ticket.departmentIds[0]].short : '经办部门',
      ),
    )
    addNotification({
      userId: ticket.studentId,
      type: 'ticket',
      title: '部门已接单',
      body: `「${ticket.title}」已进入处理阶段。`,
      ticketId: ticket.id,
      tone: 'mint',
    })
  } else if (action === 'resolve') {
    if (!['assigned', 'processing'].includes(ticket.status)) {
      return res.status(409).json({ message: '当前状态无法录入办结结果。' })
    }
    if (!result) return res.status(400).json({ message: '请填写部门的处置结果。' })
    ticket.status = 'awaiting_confirm'
    ticket.updatedAt = nowIso()
    ticket.timeline.push(
      makeTimelineEvent(
        'awaiting_confirm',
        '处置完成，等待学生确认',
        result,
        ticket.departmentIds[0] ? departmentMap[ticket.departmentIds[0]].short : '经办部门',
      ),
    )
    addNotification({
      userId: ticket.studentId,
      type: 'reminder',
      title: '办理结果待确认',
      body: `「${ticket.title}」已处理完成，请查看结果并确认。`,
      ticketId: ticket.id,
      tone: 'peach',
    })
  } else {
    return res.status(400).json({ message: '未知的进展操作。' })
  }
  save()
  res.json({ ticket: decorateTicket(ticket), message: '进展已更新。' })
})

app.patch('/api/tickets/:id/urge', requireAuth, requireRole('counselor'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  if (!['assigned', 'processing'].includes(ticket.status)) {
    return res.status(409).json({ message: '当前状态不需要催办。' })
  }
  const note = String(req.body?.note || '请经办部门关注办理时限，尽快反馈处置进展。').trim()
  ticket.lastUrgedAt = nowIso()
  ticket.updatedAt = nowIso()
  ticket.timeline.push(makeTimelineEvent('urge', '辅导员发起督办催办', note, req.user.name))
  addNotification({
    userId: ticket.studentId,
    type: 'ticket',
    title: '老师已记录督办',
    body: `「${ticket.title}」已记录督办，请留意最新进展。`,
    ticketId: ticket.id,
    tone: 'gold',
  })
  save()
  res.json({ ticket: decorateTicket(ticket), message: '已记录督办并通知学生，请通过线下渠道联系部门。' })
})

app.post('/api/tickets/:id/note', requireAuth, requireRole('counselor'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  const text = String(req.body?.text || '').trim()
  if (!text) return res.status(400).json({ message: '请填写跟进备注。' })
  if (text.length > 600) return res.status(400).json({ message: '跟进备注不能超过 600 字。' })
  ticket.notes.push({ id: `note-${crypto.randomUUID().slice(0, 6)}`, text, at: nowIso(), actor: req.user.name })
  ticket.updatedAt = nowIso()
  ticket.timeline.push(makeTimelineEvent('note', '新增跟进备注', text, req.user.name))
  save()
  res.json({ ticket: decorateTicket(ticket), message: '跟进备注已记录。' })
})

app.post('/api/tickets/:id/split', requireAuth, requireRole('counselor'), (req, res) => {
  const parent = getTicketOr404(req.params.id, res)
  if (!parent) return
  if (parent.parentId || !['assigned', 'processing'].includes(parent.status)) {
    return res.status(409).json({ message: '当前工单不允许拆分。' })
  }
  if (db.tickets.some((ticket) => ticket.parentId === parent.id)) {
    return res.status(409).json({ message: '这张工单已经拆分过了。' })
  }
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const valid = items
    .map((item) => ({
      title: String(item?.title || '').trim(),
      departmentId: item?.departmentId,
      description: String(item?.description || '').trim(),
    }))
    .filter((item) => item.title && departmentMap[item.departmentId])
  if (!valid.length) return res.status(400).json({ message: '请至少添加一个有效的拆分事项。' })

  const children = valid.map((item, index) => {
    const id = `${parent.id}-${index + 1}`
    const createdAt = nowIso()
    return {
      ...parent,
      id,
      title: item.title,
      description: item.description || `由工单 ${parent.id} 拆分：${parent.description}`,
      status: 'assigned',
      departmentIds: [item.departmentId],
      assignee: departmentMap[item.departmentId].contact,
      createdAt,
      updatedAt: createdAt,
      dueAt: new Date(Date.now() + (departmentMap[item.departmentId].sla || 240) * 60000).toISOString(),
      slaMinutes: departmentMap[item.departmentId].sla || 240,
      parentId: parent.id,
      timeline: [
        makeTimelineEvent('split', '由主工单拆分生成', `来源：${parent.id} · ${parent.title}`, req.user.name),
        makeTimelineEvent('assigned', '已分派至协同部门', departmentMap[item.departmentId].name, req.user.name),
      ],
      notes: [],
      rating: null,
      lastUrgedAt: null,
    }
  })
  db.tickets.push(...children)
  parent.status = 'processing'
  parent.updatedAt = nowIso()
  parent.timeline.push(
    makeTimelineEvent(
      'split',
      '复合工单已拆分',
      `拆分为 ${children.length} 张子工单，分别由${children.map((child) => departmentMap[child.departmentIds[0]].short).join('、')}办理`,
      req.user.name,
    ),
  )
  addNotification({
    userId: parent.studentId,
    type: 'ticket',
    title: '复合诉求已拆分处理',
    body: `「${parent.title}」已拆分为 ${children.length} 个协同事项，可分别查看进展。`,
    ticketId: parent.id,
    tone: 'blue',
  })
  save()
  res.json({
    parent: decorateTicket(parent),
    children: children.map(decorateTicket),
    message: `已拆分为 ${children.length} 张子工单。`,
  })
})

app.patch('/api/tickets/:id/remind-confirm', requireAuth, requireRole('counselor'), (req, res) => {
  const ticket = getTicketOrNotFound(req.params.id, res)
  if (!ticket) return
  if (ticket.status !== 'awaiting_confirm') {
    return res.status(409).json({ message: '当前工单不在待确认状态。' })
  }
  ticket.timeline.push(makeTimelineEvent('reminder', '辅导员提醒学生确认', '已发送确认提醒', req.user.name))
  ticket.updatedAt = nowIso()
  addNotification({
    userId: ticket.studentId,
    type: 'reminder',
    title: '老师提醒你确认办理结果',
    body: `如果「${ticket.title}」的问题已经解决，请确认办结并评价。`,
    ticketId: ticket.id,
    tone: 'peach',
  })
  save()
  res.json({ ticket: decorateTicket(ticket), message: '确认提醒已发送。' })
})

function getTicketOrNotFound(id, res) {
  return getTicketOr404(id, res)
}

app.get('/api/counselor/insights', requireAuth, requireRole('counselor'), (req, res) => {
  const tickets = db.tickets
  const active = tickets.filter((ticket) => ticket.status !== 'completed')
  const completed = tickets.filter((ticket) => ticket.status === 'completed')
  const metrics = summaryMetrics(tickets)
  const categories = categoryStats(tickets)
  const tagCounts = new Map()
  tickets.forEach((ticket) => {
    ;(ticket.ai?.tags || []).forEach((tag) => {
      if (typeof tag !== 'string' || tag.length > 12) return
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    })
  })
  const hotTags = [...tagCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
  const timeSlots = [
    { name: '上午', range: '06–12', value: 0 },
    { name: '下午', range: '12–18', value: 0 },
    { name: '晚间', range: '18–24', value: 0 },
    { name: '深夜', range: '00–06', value: 0 },
  ]
  tickets.forEach((ticket) => {
    const hour = new Date(ticket.createdAt).getHours()
    if (hour < 6) timeSlots[3].value += 1
    else if (hour < 12) timeSlots[0].value += 1
    else if (hour < 18) timeSlots[1].value += 1
    else timeSlots[2].value += 1
  })
  const week = weeklySeries(tickets)
  const weeklyTotal = week.reduce((sum, day) => sum + day.created, 0)
  const topCategory = categories[0]
  const topDepartment = departmentStats(tickets).sort((a, b) => b.total - a.total)[0]
  return res.json({
    summary: {
      total: tickets.length,
      weekly: weeklyTotal,
      ...metrics,
      highRisk: active.filter((ticket) => ticket.risk === 'high').length,
    },
    week,
    categories,
    departments: departmentStats(tickets).sort((a, b) => b.total - a.total),
    hotTags,
    timeSlots,
    risk: {
      high: active.filter((ticket) => ticket.risk === 'high').length,
      medium: active.filter((ticket) => ticket.risk === 'medium').length,
      low: active.filter((ticket) => ticket.risk === 'low').length,
    },
    suggestion: {
      title: topCategory ? `「${topCategory.name}」是当前最集中的诉求类型` : '暂无诉求数据',
      body: topCategory
        ? `共 ${topCategory.value} 条，占全部诉求的 ${Math.round((topCategory.value / tickets.length) * 100)}%。建议联合${topDepartment?.short || '相关'}开展一次专项排查，把高频问题前置解决。`
        : '建议保持每周复盘，持续关注高风险与超时工单。',
      action: '生成专项治理建议',
    },
  })
})

app.get('/api/counselor/dorm-check', requireAuth, requireRole('counselor'), (req, res) => {
  res.json(getDormOverview(db))
})

app.post('/api/counselor/dorm-check', requireAuth, requireRole('counselor'), (req, res) => {
  const roomId = String(req.body?.roomId || '').trim()
  if (!roomId) return res.status(400).json({ message: '请选择要查寝的房间。' })
  if (!db.dormCheck?.rooms?.some((room) => room.id === roomId)) {
    return res.status(404).json({ message: '没有找到这间宿舍。' })
  }

  const absentStudents = Array.isArray(req.body?.absentStudents)
    ? req.body.absentStudents.filter((name) => typeof name === 'string')
    : []
  const issues = Array.isArray(req.body?.issues)
    ? req.body.issues.filter(
        (issue) => typeof issue === 'string' && dormConstants.issues.includes(issue),
      )
    : []
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : []

  const record = createDormRecord(db, req.user, {
    roomId,
    absentStudents,
    issues,
    note: req.body?.note,
    attachments,
  })
  if (!record) return res.status(404).json({ message: '没有找到这间宿舍。' })

  save()
  res.status(201).json({
    record,
    message: record.result === 'exception' ? '查寝记录已保存，异常项已登记。' : '查寝打卡成功。',
  })
})

app.get('/api/notifications', requireAuth, (req, res) => {
  const items = db.notifications
    .filter((note) => note.userId === req.user.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const page = Number(req.query.page || 1)
  const pageSize = Number(req.query.pageSize || 20)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return res.status(400).json({ message: '分页参数不合法。' })
  }
  const start = (page - 1) * pageSize
  res.json({
    notifications: items.slice(start, start + pageSize),
    unread: items.filter((note) => !note.read).length,
    page,
    pageSize,
    total: items.length,
    hasMore: start + pageSize < items.length,
  })
})

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  db.notifications.forEach((note) => {
    if (note.userId === req.user.id) note.read = true
  })
  save()
  res.json({ ok: true })
})

app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  const note = db.notifications.find((item) => item.id === req.params.id && item.userId === req.user.id)
  if (!note) return res.status(404).json({ message: '消息不存在。' })
  note.read = true
  save()
  res.json({ ok: true })
})

app.use('/api', (req, res) => {
  res.status(404).json({ message: '接口不存在。' })
})

app.use((error, req, res, next) => {
  console.error(error)
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: '请求内容不是有效的 JSON。' })
  }
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({ message: '请求内容过大，请减少附件或压缩后重试。' })
  }
  res.status(500).json({ message: '中枢开小差了，请稍后再试。' })
})

const distDir = path.join(rootDir, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`智汇中枢 API 已启动：http://127.0.0.1:${PORT}`)
})
