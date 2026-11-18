import { mountB } from './b/routes.js'
import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, save } from './store.js'
import { departmentMap, knowledgeBase } from './seed.js'
import { llmEnabled, getLlmStatus, resetLlm, simulateLlmFault, currentLlmFault } from './llm.js'
import { createDormRecord, dormConstants, getDormOverview } from './dorm.js'
import { createIssueBundle, reviseIssueBundle } from './issue-bundles.js'
import { dispatchBundle, applyLogisticsAction } from './logistics-workflow.js'
import { mountRepairRoutes } from './repair-routes.js'
import { planStudentTicketChange } from './c-student.js'
import { createAcademicVersion, canReadAcademicVersion } from './academic-versions.js'
import { hashPassword, verifyPassword, createLoginLimiter } from './trial-auth.js'
import { mountTrialFeedback } from './trial-feedback.js'
import { mountTrialAdmin } from './trial-admin.js'
import { parseAcademicCsv } from './academic-csv.js'
import { STATUS_LABELS, URGENCY_LABELS, RISK_LABELS, detectRisk, generateCounselorBrief } from './ai.js'
import {
  AGENT_VERSION,
  agentManifest,
  attributionAgent,
  invokeAgent,
  runCognitionChain,
  ticketAiSnapshot,
} from './ai/agents.js'
import { graphSummary, graphVisualization, dutySubgraph, queryGraph, rankBottlenecks } from './ai/graphrag.js'
import { knowledgeIndexStats, searchKnowledgeDetailed } from './ai/knowledge.js'
import { riskLexiconSummary, scanRisk } from './ai/riskAgent.js'
import { guardSummary } from './ai/guard.js'
import { promptVersions } from './ai/prompts.js'
import { FAULT_MODE_LIST } from './ai/llmClient.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
try {
  process.loadEnvFile?.()
} catch {
  // .env is optional; environment variables still work.
}
const PORT = Number(process.env.PORT || 8787)
const trialMode = process.env.TRIAL_MODE === 'true'
const loginLimiter = createLoginLimiter()
const app = express()

app.use(express.json({ limit: '6mb' }))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

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

// Keep counselor-only follow-up content out of every student ticket response.
const ticketForUser = (ticket, user) => {
  const decorated = decorateTicket(ticket)
  if (user?.role !== 'student') return decorated
  return {
    ...decorated,
    notes: [],
    timeline: (decorated.timeline || []).filter((event) => event.type !== 'note').map((event) => {
      if (event.type === 'assigned') return { ...event, desc: String(event.desc || '').split('。督办备注：')[0] }
      if (event.type === 'urge') return { ...event, desc: '辅导员已跟进督办，请留意后续进展。' }
      return event
    }),
  }
}

const publicUser = (user) => {
  if (!user) return null
  const { password, passwordHash, ...safe } = user
  return safe
}

/**
 * 风险筛查 Agent 需要的「行为时序特征」原始输入：
 * 只取时序与结果字段，避免把整张工单塞进特征计算。
 */
const studentHistory = (studentId, excludeId = null) =>
  db.tickets
    .filter((ticket) => ticket.studentId === studentId && ticket.id !== excludeId)
    .map((ticket) => ({
      id: ticket.id,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      resolvedAt: ticket.resolvedAt || ticket.timeline?.findLast((event) => event.type === 'awaiting_confirm')?.at,
      dueAt: ticket.dueAt,
      category: ticket.category,
      risk: ticket.risk,
      status: ticket.status,
    }))

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
  if (trialMode && (session.trial !== true || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now())) return null
  const user = db.users.find((item) => item.id === session.userId)
  if (!user || user.disabled || (user.expiresAt && (!Number.isFinite(Date.parse(user.expiresAt)) || Date.parse(user.expiresAt) <= Date.now()))) return null
  return user
}

const requireAuth = (req, res, next) => {
  const user = getAuth(req)
  if (!user) {
    return res.status(401).json({ message: '登录状态已失效，请重新进入。' })
  }
  const academicBatchPath = user.role === 'academic' && /^\/api\/academic\/batches(?:\/preview|\/[^/]+\/dispatch)?$/.test(req.path)
  const trialAdminPath = user.trialAdmin === true && /^\/api\/trial\/admin\/accounts(?:\/[^/]+\/(?:status|reset-password|relations))?$/.test(req.path)
  if (['mentor', 'academic'].includes(user.role) && !req.originalUrl.startsWith('/api/b/') && !academicBatchPath && !trialAdminPath && !['/api/auth/logout', '/api/auth/change-password', '/api/me', '/api/trial/feedback'].includes(req.path)) return res.status(403).json({message: '该身份不能访问其他端接口'})
  if (trialMode && user.mustChangePassword === true && !['/api/auth/change-password','/api/auth/logout','/api/me'].includes(req.path)) return res.status(403).json({message:'请先修改初始密码。'})
  req.user = user
  next()
}

const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ message: '当前身份无权访问该功能。' })
  }
  next()
}

const riskInput = (user, body = {}) => {
  const text = String(body.text || '').trim()
  const staff = user.role === 'counselor'
  const studentId = staff ? (Array.isArray(user.studentIds) && user.studentIds.includes(body.studentId) ? body.studentId : null) : user.id
  const history = staff && Array.isArray(body.history)
    ? body.history
    : studentId ? studentHistory(studentId) : []
  return {
    text,
    history,
    category: body.category,
    location: String(body.location || ''),
    baseRisk: staff && Object.hasOwn(RISK_LABELS, body.baseRisk) ? body.baseRisk : detectRisk(text).level,
    useLlm: body.useLlm !== false,
  }
}

const asyncRoute = (handler) => (req, res, next) => handler(req, res).catch(next)

const getTicketOr404 = (id, res) => {
  const ticket = db.tickets.find((item) => item.id === id)
  if (!ticket) {
    res.status(404).json({ message: '没有找到这张工单，可能已被归档。' })
    return null
  }
  return ticket
}

const canAccessTicket = (user, ticket) => {
  if (user.role === 'counselor') return Array.isArray(user.studentIds) && user.studentIds.includes(ticket.studentId)
  return user.role === 'student' && ticket.studentId === user.id
}

// Apply the same scope to old detail and mutation routes before their handlers run.
app.use('/api/tickets/:id', requireAuth, (req, res, next) => {
  const ticket = db.tickets.find(item => item.id === req.params.id)
  if (!ticket) return res.status(404).json({ message:'工单不存在。' })
  if (!canAccessTicket(req.user, ticket)) return res.status(403).json({ message:'无权访问该工单。' })
  next()
})

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
      date: `${date.getMonth() + 1}/${date.getDate()}`,
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

const averageResponseHours = (tickets) => {
  const samples = tickets.map((ticket) => {
    const assigned = ticket.timeline.find((event) => event.type === 'assigned')
    return assigned ? hoursBetween(ticket.createdAt, assigned.at) : null
  }).filter((value) => value !== null && Number.isFinite(value))
  return samples.length ? Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(1)) : 0
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
      : 0
    return {
      ...department,
      active: active.length,
      completed: completed.length,
      total: assigned.length,
      avgHours,
      onTime: completed.length ? Math.round(completed.filter(isOnTime).length / completed.length * 100) : 0,
      load: Math.min(100, 24 + active.length * 16),
    }
  })
}

const isOnTime = (ticket) => {
  if (ticket.status !== 'completed') return false
  return new Date(completedAt(ticket)).getTime() <= new Date(ticket.dueAt).getTime()
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: '智汇中枢 API', time: nowIso() })
})

app.post('/api/auth/login', (req, res) => {
  const { account = '', password = '', role } = req.body || {}
  const normalized = String(account).trim()
  const limitKey = req.ip || 'unknown'
  if (trialMode && !loginLimiter.allowed(limitKey)) return res.status(429).json({ message:'登录尝试过多，请稍后再试。' })
  const candidate = db.users.find(item => item.account === normalized && (!role || item.role === role))
  const validAccount = candidate && !candidate.disabled && (!candidate.expiresAt || (Number.isFinite(Date.parse(candidate.expiresAt)) && Date.parse(candidate.expiresAt) > Date.now()))
  const user = validAccount && (trialMode ? verifyPassword(String(password), candidate.passwordHash) : candidate.password === String(password)) ? candidate : null
  if (!user) {
    if (trialMode) loginLimiter.fail(limitKey)
    return res.status(401).json({ message: trialMode ? '账号或密码不正确。' : '账号或密码不正确，请使用下方演示账号。' })
  }
  if (trialMode) loginLimiter.clear(limitKey)
  const token = crypto.randomUUID()
  db.sessions = db.sessions.filter((session) => session.userId !== user.id).slice(-40)
  db.sessions.push({ token, userId: user.id, at: nowIso(), ...(trialMode ? { trial:true, expiresAt:new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() } : {}) })
  save()
  res.json({ token, user: publicUser(user) })
})

app.post('/api/auth/demo', (req, res) => {
  if (trialMode) return res.status(403).json({ message:'试用模式不支持演示直登。' })
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

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  if (!trialMode) return res.status(404).json({ message:'该服务未启用。' })
  const key = req.ip || 'unknown'
  if (!loginLimiter.allowed(key)) return res.status(429).json({ message:'尝试次数过多，请稍后再试。' })
  const { currentPassword, newPassword } = req.body || {}
  if (!verifyPassword(currentPassword, req.user.passwordHash)) { loginLimiter.fail(key); return res.status(401).json({message:'当前密码不正确。'}) }
  if (currentPassword === newPassword) return res.status(400).json({ message:'新密码不能与当前密码相同。' })
  let nextHash
  try { nextHash = hashPassword(newPassword) } catch (error) { return res.status(400).json({message:error.message}) }
  const currentToken = (req.headers.authorization || '').slice(7)
  req.user.passwordHash = nextHash
  req.user.mustChangePassword = false
  db.sessions = db.sessions.filter(session => session.userId !== req.user.id || session.token === currentToken)
  loginLimiter.clear(key); save()
  return res.json({ok:true})
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

app.post('/api/ai/precheck', requireAuth, asyncRoute(async (req, res) => {
  const text = String(req.body?.text || '').trim()
  if (text.length < 4) {
    return res.status(400).json({ message: '再多描述一点，AI 才能更准确地帮你判断。' })
  }
  const location = String(req.body?.location || '')
  const chain = await runCognitionChain({
    text,
    category: req.body?.category,
    location,
    urgency: Object.hasOwn(URGENCY_LABELS, req.body?.urgency) ? req.body.urgency : undefined,
    history: req.user.role === 'student' ? studentHistory(req.user.id) : [],
    useLlm: req.body?.useLlm !== false,
  })
  res.json({
    analysis: chain.analysis,
    knowledge: chain.knowledge,
    answer: chain.answer,
    canSelfSolve: chain.canSelfSolve,
    needsTicket: chain.needsTicket,
    quickReplies: chain.quickReplies,
    // B 部分新增：图谱路由与风险筛查结果，供 C 端展示、D 端训练使用
    graph: chain.graph,
    risk: chain.risk,
    trace: chain.trace,
    latencyMs: chain.latencyMs,
    engine: chain.engine,
  })
}))

// ── B 部分 · AI 能力开放接口（图谱 / 风险 / Agent / 健康度）────────────
// 接口契约与字段说明见 docs/B部分交付说明.md

app.get('/api/ai/health', requireAuth, (req, res) => {
  res.json({
    agentVersion: AGENT_VERSION,
    engine: llmEnabled() ? 'deepseek+rules' : 'local-rules',
    llm: getLlmStatus(),
    faultMode: currentLlmFault(),
    faultModes: FAULT_MODE_LIST,
    knowledge: knowledgeIndexStats(),
    graph: graphSummary().stats,
    risk: riskLexiconSummary(),
    guard: guardSummary(),
    prompts: promptVersions(),
    at: nowIso(),
  })
})

app.get('/api/ai/agents', requireAuth, (req, res) => {
  res.json(agentManifest())
})

app.post('/api/ai/agents/:name', requireAuth, asyncRoute(async (req, res) => {
  const name = String(req.params.name || '')
  if (name === 'attribution' && req.user.role !== 'counselor') {
    return res.status(403).json({ message: '复盘归因涉及全校工单数据，仅辅导员可用。' })
  }
  const body = req.body || {}
  const payload = name === 'risk' ? riskInput(req.user, body) : { ...body }
  if (name === 'attribution' && !Array.isArray(payload.tickets)) {
    payload.tickets = db.tickets.filter(ticket => canAccessTicket(req.user, ticket))
  }
  const result = await invokeAgent(name, payload)
  if (!result.ok && result.warnings?.length) return res.status(400).json(result)
  res.json(result)
}))

app.get('/api/ai/graph', requireAuth, (req, res) => {
  const summary = graphSummary()
  if (String(req.query.full || '') === '1') {
    res.json({ ...summary, ...graphVisualization() })
    return
  }
  res.json(summary)
})

app.get('/api/ai/graph/duty/:id', requireAuth, (req, res) => {
  const subgraph = dutySubgraph(String(req.params.id || ''))
  if (!subgraph) return res.status(404).json({ message: '未找到该权责事项节点。' })
  res.json(subgraph)
})

app.post('/api/ai/graph/query', requireAuth, (req, res) => {
  const text = String(req.body?.text || '').trim()
  if (text.length < 2) return res.status(400).json({ message: '请提供需要检索的诉求文本。' })
  const preferredDepts = Array.isArray(req.body?.preferredDepts)
    ? req.body.preferredDepts.filter((id) => departmentMap[id])
    : []
  res.json(
    queryGraph(text, {
      category: req.body?.category,
      preferredDepts,
      riskLevel: req.body?.riskLevel,
      limit: Number(req.body?.limit) || 3,
    }),
  )
})

app.get('/api/ai/kb/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.status(400).json({ message: '请提供检索关键词。' })
  res.json(searchKnowledgeDetailed(q))
})

app.post('/api/ai/risk-scan', requireAuth, (req, res) => {
  const input = riskInput(req.user, req.body || {})
  if (input.text.length < 2) return res.status(400).json({ message: '请提供需要筛查的诉求文本。' })
  res.json(scanRisk(input))
})

app.post('/api/ai/attribution', requireAuth, requireRole('counselor'), async (req, res) => {
  const tickets = db.tickets.filter(ticket => canAccessTicket(req.user, ticket))
  const result = await attributionAgent({ tickets, limit: Number(req.body?.limit) || 5 })
  res.json({ ...result.output, bottlenecks: rankBottlenecks(tickets, { limit: Number(req.body?.limit) || 5 }), trace: result })
})

// 容灾演练开关：模拟大模型超时 / 离线 / 脏 JSON / 5xx，验证自动回退到规则链路
app.post('/api/ai/llm/fault', requireAuth, requireRole('counselor'), (req, res) => {
  const mode = req.body?.mode ?? null
  try {
    const applied = simulateLlmFault(mode)
    res.json({ ok: true, faultMode: applied, hint: applied ? '后续 AI 调用将按该故障模式降级，请在演练后重置' : '已恢复正常' })
  } catch (error) {
    res.status(400).json({ message: error.message, modes: FAULT_MODE_LIST })
  }
})

app.post('/api/ai/llm/reset', requireAuth, requireRole('counselor'), (req, res) => {
  res.json({ ok: true, llm: resetLlm() })
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
  const scopedTickets = db.tickets.filter(ticket => canAccessTicket(req.user, ticket))
  let list = [...scopedTickets]
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
  let hasMore = false
  if (req.query.page !== undefined || req.query.pageSize !== undefined) {
    const page = Number(req.query.page ?? 1), pageSize = Number(req.query.pageSize ?? 20)
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return res.status(400).json({ message: '分页参数无效。' })
    const start = (page - 1) * pageSize
    hasMore = start + pageSize < list.length
    list = list.slice(start, start + pageSize)
  }
  res.json({
    tickets: list.map((ticket) => ticketForUser(ticket, req.user)),
    hasMore,
    counts: {
      all: scopedTickets.length,
      pending_review: scopedTickets.filter(ticket => ticket.status === 'pending_review').length,
      active: scopedTickets.filter(ticket => ticket.status !== 'completed').length,
      awaiting_confirm: scopedTickets.filter(ticket => ticket.status === 'awaiting_confirm').length,
      completed: scopedTickets.filter(ticket => ticket.status === 'completed').length,
    },
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
    .map((ticket) => ticketForUser(ticket, req.user))
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

app.post('/api/tickets', requireAuth, requireRole('student'), asyncRoute(async (req, res) => {
  const text = String(req.body?.description || '').trim()
  if (text.length < 6) {
    return res.status(400).json({ message: '请至少用一句话描述你遇到的问题。' })
  }
  const category = req.body?.category && req.body.category !== '智能识别' ? req.body.category : undefined
  const location = String(req.body?.location || '')
  // B 侧认知链路：意图解析 → 风险筛查 / GraphRAG 路由 / 知识库检索 → 规则修正 → 护栏
  const chain = await runCognitionChain({
    text,
    category,
    location,
    urgency: Object.hasOwn(URGENCY_LABELS, req.body?.urgency) ? req.body.urgency : undefined,
    history: studentHistory(req.user.id),
  })
  const analysis = chain.analysis
  const createdAt = nowIso()
  const id = nextTicketId()
  const timeline = [
    makeTimelineEvent('created', '诉求已提交', 'AI 已完成初步识别，等待辅导员审核', req.user.name),
    makeTimelineEvent('ai', 'AI 完成要素提取', `已生成标准化工单草稿，风险等级：${RISK_LABELS[analysis.risk]}`, '智汇中枢'),
  ]
  if (chain.graph?.matched) {
    timeline.push(
      makeTimelineEvent(
        'ai',
        'GraphRAG 完成权责路由',
        `命中权责事项「${chain.graph.primaryDuty.name}」，主责${departmentMap[chain.graph.primaryDept]?.short || chain.graph.primaryDept}${
          chain.graph.countersign.required
            ? `，需会签：${(chain.graph.countersign.departments.map((item) => item.short).join('、') || chain.graph.countersign.jointOwners.map((deptId) => departmentMap[deptId]?.short).join('、'))}`
            : ''
        }`,
        '智汇中枢',
      ),
    )
  }
  if (chain.risk && chain.risk.level !== 'low') {
    timeline.push(
      makeTimelineEvent(
        'risk',
        '风险筛查 Agent 输出标签',
        `${chain.risk.levelLabel}（融合分 ${chain.risk.score}）：${chain.risk.signals.slice(0, 3).map((item) => item.label).join('；') || '行为时序特征异常'}`,
        '智汇中枢',
      ),
    )
  }
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
    ai: ticketAiSnapshot(chain),
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
}))

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
  for (const bundle of db.issueBundles || []) {
    if (bundle.status === 'dispatched' && bundle.ticketIds.includes(ticket.id)) bundle.version = (bundle.version || 1) + 1
  }
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
  const tickets = db.tickets.filter(ticket => canAccessTicket(req.user, ticket))
  const active = tickets.filter((ticket) => ticket.status !== 'completed')
  const completed = tickets.filter((ticket) => ticket.status === 'completed')
  const pending = active.filter((ticket) => ticket.status === 'pending_review')
  const highRisk = active.filter((ticket) => ticket.risk === 'high')
  const overdue = active.filter(
    (ticket) => ticket.status !== 'awaiting_confirm' && new Date(ticket.dueAt).getTime() < Date.now(),
  )
  const today = new Date()
  const todayNew = tickets.filter((ticket) => dayDiff(ticket.createdAt, today) === 0)
  const avgResponse = averageResponseHours(tickets)
  const ratings = tickets.map((ticket) => ticket.rating?.score).filter(Boolean)
  const satisfaction = ratings.length
    ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1))
    : 0
  const onTimeCount = completed.filter(isOnTime).length
  const onTimeRate = completed.length ? Math.round(onTimeCount / completed.length * 100) : 0
  const closureRate = tickets.length ? Math.round(completed.length / tickets.length * 100) : 0
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
        (ticket.status !== 'awaiting_confirm' && new Date(ticket.dueAt).getTime() < Date.now()),
    )
    .sort((a, b) => {
      if (a.risk !== b.risk) return a.risk === 'high' ? -1 : 1
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
    urgent: urgent.map((ticket) => ticketForUser(ticket, req.user)),
    queue: queue.map((ticket) => ticketForUser(ticket, req.user)),
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
  if ((db.issueBundles || []).some(bundle => ['draft', 'dispatched'].includes(bundle.status) && bundle.ticketIds.includes(ticket.id))) {
    return res.status(409).json({ message: '该工单在问题包中，请通过问题包流程处理。' })
  }
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
  res.json({ ticket: ticketForUser(ticket, req.user), message: '已审核并分派，学生会同步收到进展通知。' })
})

app.patch('/api/tickets/:id/progress', requireAuth, requireRole('counselor'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  if ((db.issueBundles || []).some(bundle => bundle.status === 'dispatched' && bundle.ticketIds.includes(ticket.id))) return res.status(409).json({ message: '该工单已交由后勤处理，请使用问题包流程。' })
  const action = req.body?.action
  const result = String(req.body?.result || '').trim()

  if (action === 'accept') {
    if (!['assigned', 'processing'].includes(ticket.status)) {
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
  res.json({ ticket: ticketForUser(ticket, req.user), message: '进展已更新。' })
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
    title: '老师已为你催办',
    body: `「${ticket.title}」已发起督办，请留意最新进展。`,
    ticketId: ticket.id,
    tone: 'gold',
  })
  save()
  res.json({ ticket: ticketForUser(ticket, req.user), message: '催办已送达，工单 SLA 保持不变。' })
})

app.post('/api/tickets/:id/note', requireAuth, requireRole('counselor'), (req, res) => {
  const ticket = getTicketOr404(req.params.id, res)
  if (!ticket) return
  const text = String(req.body?.text || '').trim()
  if (!text) return res.status(400).json({ message: '请填写跟进备注。' })
  ticket.notes.push({ id: `note-${crypto.randomUUID().slice(0, 6)}`, text, at: nowIso(), actor: req.user.name })
  ticket.updatedAt = nowIso()
  ticket.timeline.push(makeTimelineEvent('note', '新增跟进备注', text, req.user.name))
  save()
  res.json({ ticket: ticketForUser(ticket, req.user), message: '跟进备注已记录。' })
})

app.post('/api/tickets/:id/split', requireAuth, requireRole('counselor'), (req, res) => {
  const parent = getTicketOr404(req.params.id, res)
  if (!parent) return
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
    parent: ticketForUser(parent, req.user),
    children: children.map((ticket) => ticketForUser(ticket, req.user)),
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
  res.json({ ticket: ticketForUser(ticket, req.user), message: '确认提醒已发送。' })
})

function getTicketOrNotFound(id, res) {
  return getTicketOr404(id, res)
}

app.get('/api/counselor/insights', requireAuth, requireRole('counselor'), (req, res) => {
  const tickets = db.tickets.filter(ticket => canAccessTicket(req.user, ticket))
  const active = tickets.filter((ticket) => ticket.status !== 'completed')
  const completed = tickets.filter((ticket) => ticket.status === 'completed')
  const ratings = tickets.map((ticket) => ticket.rating?.score).filter(Boolean)
  const satisfaction = ratings.length
    ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1))
    : 0
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
      satisfaction,
      onTimeRate: completed.length ? Math.round(completed.filter(isOnTime).length / completed.length * 100) : 0,
      closureRate: tickets.length ? Math.round(completed.length / tickets.length * 100) : 0,
      highRisk: active.filter((ticket) => ticket.risk === 'high').length,
      avgResponse: averageResponseHours(tickets),
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
      title: topCategory ? `「${topCategory.name}」是当前最集中的诉求类型` : '本周诉求分布平稳',
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
  res.json({ notifications: items, unread: items.filter((note) => !note.read).length })
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

// C's page and existing clients use different response shapes; expose both.
const bundleVisibleTo = (bundle, user) => {
  const allowed = new Set(Array.isArray(user.studentIds) ? user.studentIds : [])
  return bundle.createdBy === user.id && bundle.ticketIds.every(id => {
    const ticket = db.tickets.find(item => item.id === id)
    return ticket && allowed.has(ticket.studentId)
  })
}
const bundleForC = (bundle) => ({
  id: bundle.id,
  title: bundle.title || '待转交问题包',
  departmentId: bundle.departmentId || 'logistics',
  reason: bundle.reason,
  status: bundle.status === 'dispatched' ? 'sent' : bundle.status,
  version: bundle.version || 1,
  items: bundle.ticketIds.map(id => {
    const ticket = db.tickets.find(item => item.id === id)
    const entry = bundle.items?.find(item => item.ticketId === id)
    const result = [...(entry?.history || [])].reverse().find(event => event.action === 'resolve')?.result
    const returnReason = [...(entry?.history || [])].reverse().find(event => event.action === 'return')?.result
    return { ticketId: id, title: ticket?.title || '', status: ticket?.status || '', result, workStatus:entry?.status, returnReason:entry?.status === 'returned' ? returnReason : undefined, studentConfirmed: ticket?.status === 'completed', reopened: Boolean(entry?.history?.some(event => event.action === 'disputed')) }
  }),
})
// The same request ID may only replay the same operation by the same user.
const cOperation = (req, res) => {
  const id = req.body?.requestId
  if (typeof id !== 'string' || !id.trim() || id.length > 100) { res.status(400).json({ message: '请提供有效的请求编号。' }); return null }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ path:req.originalUrl, body:req.body })).digest('hex')
  const previous = (db.cOperations || []).find(op => op.userId === req.user.id && op.id === id)
  if (previous) {
    if (previous.fingerprint !== fingerprint) res.status(409).json({ message: '请求编号已用于其他操作。' })
    else res.status(previous.status).json(previous.response)
    return null
  }
  return (status, response) => {
    db.cOperations ||= []
    db.cOperations.push({ userId:req.user.id, id, fingerprint, status, response })
    save()
    return res.status(status).json(response)
  }
}

// Drafts only: saving a bundle does not dispatch or modify the individual tickets.
app.post('/api/issue-bundles', requireAuth, requireRole('counselor'), (req, res) => {
  const bundles = db.issueBundles || []
  try {
    if (!Array.isArray(req.user.studentIds)) return res.status(403).json({ message: '尚未配置辅导员负责的学生范围。' })
    const allowed = new Set(req.user.studentIds)
    if (!Array.isArray(req.body?.ticketIds) || req.body.ticketIds.some(id => {
      const ticket = db.tickets.find(item => item.id === (typeof id === 'string' ? id.trim() : id))
      return !ticket || !allowed.has(ticket.studentId)
    })) return res.status(403).json({ message: '工单不存在或不在负责范围。' })
    const finish = req.body?.requestId !== undefined ? cOperation(req, res) : null
    if (req.body?.requestId !== undefined && !finish) return
    if (req.body?.title !== undefined && (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.trim().length > 100)) return res.status(400).json({ message: '请输入不超过100字的问题包标题。' })
    if (req.body?.departmentId !== undefined && req.body.departmentId !== 'logistics') return res.status(400).json({ message: '当前仅支持后勤问题包。' })
    if (req.body?.reviewed !== undefined && req.body.reviewed !== true) return res.status(400).json({ message: '请先确认已经人工核对。' })
    const bundle = createIssueBundle({ ticketIds: req.body?.ticketIds, note: req.body?.note ?? '', tickets: db.tickets, bundles, actorId: req.user.id })
    bundle.version = 1
    bundle.title = req.body?.title?.trim() || '待转交问题包'
    bundle.departmentId = 'logistics'
    db.issueBundles = [...bundles, bundle]
    save()
    const response = { bundle, item: bundleForC(bundle) }
    return finish ? finish(201, response) : res.status(201).json(response)
  } catch (error) {
    return res.status(400).json({ message: error.message })
  }
})

app.get('/api/issue-bundles', requireAuth, requireRole('counselor'), (req, res) => {
  const bundles = (db.issueBundles || []).filter(bundle => bundleVisibleTo(bundle, req.user))
  res.json({ bundles, items: bundles.map(bundleForC) })
})

app.get('/api/issue-bundles/:id', requireAuth, requireRole('counselor'), (req, res) => {
  const bundle = (db.issueBundles || []).find(item => item.id === req.params.id && bundleVisibleTo(item, req.user))
  if (!bundle) return res.status(404).json({ message: '问题包不存在。' })
  res.json({ item: bundleForC(bundle) })
})

app.post('/api/issue-bundles/:id/:action(send|urge|follow-ups)', requireAuth, requireRole('counselor'), (req, res) => {
  const bundles = db.issueBundles || []
  const index = bundles.findIndex(bundle => bundle.id === req.params.id && bundleVisibleTo(bundle, req.user))
  if (index < 0) return res.status(404).json({ message: '问题包不存在。' })
  const bundle = bundles[index]
  const finish = cOperation(req, res)
  if (!finish) return
  if (!Number.isSafeInteger(req.body?.version) || req.body.version !== (bundle.version || 1)) return res.status(409).json({ message: '数据已更新，请核对最新记录后重试。' })
  const action = req.params.action
  const text = action === 'follow-ups' ? req.body?.text : req.body?.reason
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 1000) return res.status(400).json({ message: '请填写不超过1000字的说明。' })
  if (action === 'send') {
    if (req.body?.reviewed !== true) return res.status(400).json({ message: '请先确认人工核对。' })
    const recipient = db.users.find(user => user.id === req.user.logisticsRecipientId)
    if (!recipient || recipient.role !== 'logistics' || recipient.disabled) return res.status(409).json({ message: '尚未配置可用的后勤接收人。' })
    try {
      const next = dispatchBundle({ bundle, counselor:req.user, recipient, tickets:db.tickets })
      next.version = (bundle.version || 1) + 1
      next.reason = text.trim()
      for (const id of next.ticketIds) {
        const ticket = db.tickets.find(item => item.id === id)
        ticket.status = 'assigned'; ticket.departmentIds = ['logistics']; ticket.updatedAt = next.dispatchedAt
        ticket.timeline.push(makeTimelineEvent('assigned', '辅导员已转交', '问题已转交后勤，等待接收。', req.user.name))
      }
      db.issueBundles[index] = next
      return finish(200, { item: bundleForC(next) })
    } catch (error) { return res.status(409).json({ message:error.message }) }
  }
  if (action === 'urge' && bundle.status !== 'dispatched') return res.status(409).json({ message: '只有已转交的问题包可以催办。' })
  bundle.actions ||= []
  bundle.actions.push({ id:crypto.randomUUID(), action, text:text.trim(), actorId:req.user.id, at:nowIso() })
  bundle.version = (bundle.version || 1) + 1
  bundle.updatedAt = nowIso()
  return finish(200, { item: bundleForC(bundle) })
})

app.patch('/api/issue-bundles/:id', requireAuth, requireRole('counselor'), (req, res) => {
  const bundles = db.issueBundles || []
  const index = bundles.findIndex(bundle => bundle.id === req.params.id && bundle.createdBy === req.user.id)
  if (index < 0) return res.status(404).json({ message: '问题包不存在。' })
  try {
    const original = bundles[index]
    const allowed = new Set(Array.isArray(req.user.studentIds) ? req.user.studentIds : [])
    const candidate = req.body?.ticketIds ?? original.ticketIds
    if (!Array.isArray(candidate) || [...original.ticketIds, ...candidate].some(id => { const ticket = db.tickets.find(item => item.id === (typeof id === 'string' ? id.trim() : id)); return !ticket || !allowed.has(ticket.studentId) })) return res.status(403).json({ message: '工单不存在或不在负责范围。' })
    const updated = reviseIssueBundle({ bundle: original, ticketIds: req.body?.ticketIds ?? original.ticketIds, note: req.body?.note ?? original.note, tickets: db.tickets, bundles, actorId: req.user.id })
    updated.version = (original.version || 1) + 1
    db.issueBundles[index] = updated
    save()
    return res.json({ bundle: updated })
  } catch (error) { return res.status(400).json({ message: error.message }) }
})

app.post('/api/issue-bundles/:id/cancel', requireAuth, requireRole('counselor'), (req, res) => {
  const bundle = (db.issueBundles || []).find(item => item.id === req.params.id && item.createdBy === req.user.id)
  if (!bundle) return res.status(404).json({ message: '问题包不存在。' })
  const allowed = new Set(Array.isArray(req.user.studentIds) ? req.user.studentIds : [])
  if (bundle.ticketIds.some(id => { const ticket = db.tickets.find(item => item.id === id); return !ticket || !allowed.has(ticket.studentId) })) return res.status(403).json({ message: '工单不存在或不在负责范围。' })
  if (bundle.status !== 'draft') return res.status(409).json({ message: '只有草稿可以取消。' })
  bundle.status = 'cancelled'
  bundle.version = (bundle.version || 1) + 1
  bundle.updatedAt = nowIso()
  save()
  return res.json({ bundle })
})

app.post('/api/issue-bundles/:id/dispatch', requireAuth, requireRole('counselor'), (req, res) => {
  const bundles = db.issueBundles || []
  const index = bundles.findIndex(item => item.id === req.params.id && item.createdBy === req.user.id)
  if (index < 0) return res.status(404).json({ message: '问题包不存在。' })
  try {
    const recipient = db.users.find(user => user.id === req.body?.recipientId)
    const next = dispatchBundle({ bundle: bundles[index], counselor: req.user, recipient, tickets: db.tickets })
    next.version = (bundles[index].version || 1) + 1
    const at = next.dispatchedAt
    for (const id of next.ticketIds) {
      const ticket = db.tickets.find(item => item.id === id)
      ticket.status = 'assigned'; ticket.departmentIds = ['logistics']; ticket.updatedAt = at
      ticket.timeline.push(makeTimelineEvent('assigned', '辅导员已转交', '问题已转交后勤，等待接收。', req.user.name))
    }
    db.issueBundles[index] = next; save()
    return res.json({ bundle: next })
  } catch (error) { return res.status(400).json({ message: error.message }) }
})

app.get('/api/logistics/work-orders', requireAuth, requireRole('logistics'), (req, res) => {
  const bundles = (db.issueBundles || []).filter(bundle => bundle.status === 'dispatched' && bundle.recipientId === req.user.id)
  // Only explicitly assigned issue details are returned; no internal notes or student profiles.
  const items = bundles.flatMap(bundle => bundle.items.map(item => {
    const ticket = db.tickets.find(record => record.id === item.ticketId)
    return ticket ? { bundleId: bundle.id, ticketId: ticket.id, title: ticket.title, description: ticket.description, location: ticket.location, status: item.status === 'resolved' && ticket.status === 'completed' ? 'completed' : item.status, history: item.history } : null
  }).filter(Boolean))
  return res.json({ items })
})

app.post('/api/logistics/work-orders/:bundleId/:ticketId', requireAuth, requireRole('logistics'), (req, res) => {
  const bundles = db.issueBundles || []
  const index = bundles.findIndex(bundle => bundle.id === req.params.bundleId && bundle.recipientId === req.user.id)
  if (index < 0) return res.status(404).json({ message: '问题包不存在。' })
  if (!bundles[index].items?.some(item => item.ticketId === req.params.ticketId)) return res.status(404).json({ message: '工单不存在。' })
  const ticket = db.tickets.find(item => item.id === req.params.ticketId)
  if (!ticket) return res.status(404).json({ message: '工单不存在。' })
  try {
    const action = req.body?.action
    if ((action === 'accept' && ticket.status !== 'assigned') || (action === 'resolve' && ticket.status !== 'processing') || (action === 'return' && !['assigned','processing'].includes(ticket.status))) return res.status(409).json({ message: '工单状态已变更。' })
    const next = applyLogisticsAction({ bundle: bundles[index], recipient: req.user, ticketId: ticket.id, action, result: req.body?.result })
    next.version = (bundles[index].version || 1) + 1
    ticket.status = action === 'accept' ? 'processing' : action === 'return' ? 'pending_review' : 'awaiting_confirm'
    ticket.updatedAt = nowIso()
    ticket.timeline.push(makeTimelineEvent(action === 'accept' ? 'accepted' : action === 'return' ? 'returned' : 'awaiting_confirm', action === 'accept' ? '后勤已接收' : action === 'return' ? '后勤已退回' : '处置完成，等待学生确认', action === 'accept' ? '后勤已接收工单。' : req.body.result.trim(), req.user.name))
    db.issueBundles[index] = next; save()
    return res.json({ item: next.items.find(item => item.ticketId === ticket.id) })
  } catch (error) { return res.status(400).json({ message: error.message }) }
})

const cStudentTicketChange = (req, res, action) => {
  const index = db.tickets.findIndex(item => item.id === req.params.id && item.studentId === req.user.id)
  if (index < 0) return res.status(404).json({ message: '工单不存在。' })
  const ticket = db.tickets[index]
  const bundleIndex = (db.issueBundles || []).findIndex(item => item.status === 'dispatched' && item.items?.some(entry => entry.ticketId === ticket.id && (action === 'supplement' || entry.status === 'resolved')))
  const plan = planStudentTicketChange({ ticket, bundle:bundleIndex >= 0 ? db.issueBundles[bundleIndex] : null, actorId:req.user.id, text:req.body?.text, expectedUpdatedAt:req.body?.expectedUpdatedAt, requestId:req.body?.requestId, action })
  if (!plan.ok) return res.status(plan.status).json({ message:plan.message })
  if (!plan.replay) { db.tickets[index] = plan.ticket; if (plan.bundle) db.issueBundles[bundleIndex] = plan.bundle; save() }
  return res.json({ ticket:ticketForUser(plan.ticket, req.user) })
}
app.post('/api/tickets/:id/supplements', requireAuth, requireRole('student'), (req, res) => cStudentTicketChange(req, res, 'supplement'))
app.post('/api/tickets/:id/reopen', requireAuth, requireRole('student'), (req, res) => {
  if (req.body?.text !== undefined) return cStudentTicketChange(req, res, 'reopen')
  const ticket = db.tickets.find(item => item.id === req.params.id && item.studentId === req.user.id)
  if (!ticket) return res.status(404).json({ message: '工单不存在。' })
  if (ticket.status !== 'awaiting_confirm') return res.status(409).json({ message: '当前状态不能反馈未解决。' })
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (!reason || reason.length > 1000) return res.status(400).json({ message: '请填写未解决的原因，最多1000字。' })
  const bundle = (db.issueBundles || []).find(item => item.status === 'dispatched' && item.items?.some(entry => entry.ticketId === ticket.id && entry.status === 'resolved'))
  if (!bundle) return res.status(409).json({ message: '当前工单尚不支持此操作。' })
  const item = bundle.items.find(entry => entry.ticketId === ticket.id)
  const at = nowIso()
  item.status = 'disputed'; item.history.push({ id: crypto.randomUUID(), action:'disputed', actorId:req.user.id, at, reason })
  ticket.status = 'pending_review'; ticket.updatedAt = at
  ticket.timeline.push(makeTimelineEvent('reopened', '学生反馈尚未解决', reason, req.user.name))
  bundle.version = (bundle.version || 1) + 1; bundle.updatedAt = at; save()
  return res.json({ ticket: ticketForUser(ticket, req.user) })
})

app.post('/api/issue-bundles/:bundleId/:ticketId/redispatch', requireAuth, requireRole('counselor'), (req, res) => {
  const bundle = (db.issueBundles || []).find(item => item.id === req.params.bundleId && item.createdBy === req.user.id && item.status === 'dispatched')
  const ticket = db.tickets.find(item => item.id === req.params.ticketId)
  if (!bundle || !ticket || !Array.isArray(req.user.studentIds) || !req.user.studentIds.includes(ticket.studentId)) return res.status(404).json({ message: '工单不存在或无权访问。' })
  const item = bundle.items.find(entry => entry.ticketId === ticket.id)
  if (!item || !['disputed','returned'].includes(item.status) || ticket.status !== 'pending_review') return res.status(409).json({ message: '当前状态不能重新转交。' })
  const at = nowIso(); item.status = 'sent'; item.history.push({ id:crypto.randomUUID(), action:'redispatched', actorId:req.user.id, at })
  ticket.status = 'assigned'; ticket.updatedAt = at
  ticket.timeline.push(makeTimelineEvent('assigned', '辅导员重新转交', '辅导员已将反馈重新转交后勤。', req.user.name))
  bundle.version = (bundle.version || 1) + 1; bundle.updatedAt = at; save()
  return res.json({ item })
})

const academicRelationsValid = (user, rows) => rows.every(row => {
  const student = db.users.find(item => item.id === row.studentId)
  const mentor = db.users.find(item => item.id === row.mentorId)
  const counselor = db.users.find(item => item.id === row.counselorId)
  return Boolean(user.college && student && mentor && counselor && student.college === user.college && mentor.college === user.college && Array.isArray(counselor.studentIds) && counselor.studentIds.includes(student.id) && (Array.isArray(student.counselorIds) ? student.counselorIds.includes(counselor.id) : student.counselor === counselor.name))
})
app.post('/api/academic/batches/preview', requireAuth, requireRole('academic'), (req, res) => {
  try {
    const rows = parseAcademicCsv(req.body?.csv)
    const result = createAcademicVersion({user:req.user, rows, users:db.users})
    if (!result.valid) return res.status(400).json({message:'名单校验失败。', errors:result.errors})
    if (!academicRelationsValid(req.user, result.batch.items)) return res.status(400).json({message:'学生、导师学院或辅导员关系不匹配。'})
    return res.json({items:result.batch.items})
  } catch (error) { return res.status(400).json({message:error.message}) }
})

app.post('/api/academic/batches', requireAuth, requireRole('academic'), (req, res) => {
  const batches = db.academicBatches || []
  const previous = req.body?.previousId ? batches.find(batch => batch.id === req.body.previousId) : null
  if (req.body?.previousId && (!previous || !canReadAcademicVersion(req.user, previous))) return res.status(404).json({ message:'名单不存在。' })
  if (previous && (previous.dispatchedAt || batches.some(batch => batch.previousId === previous.id))) return res.status(409).json({ message:'该版本已分发或已有更新版本，请人工核对。' })
  try {
    const result = createAcademicVersion({ user:req.user, rows:req.body?.rows, users:db.users, previous, expectedVersion:req.body?.expectedVersion ?? 0 })
    if (!result.valid) return res.status(400).json({ message:'名单校验失败。', errors:result.errors })
    if (!academicRelationsValid(req.user, result.batch.items)) return res.status(400).json({ message:'学生、导师学院或辅导员关系不匹配。' })
    db.academicBatches = [...batches, result.batch]; save()
    return res.status(201).json({ item:result.batch })
  } catch (error) { return res.status(400).json({ message:error.message }) }
})

app.get('/api/academic/batches', requireAuth, requireRole('academic'), (req, res) => {
  res.json({ items:(db.academicBatches || []).filter(batch => canReadAcademicVersion(req.user, batch)) })
})

app.post('/api/academic/batches/:id/dispatch', requireAuth, requireRole('academic'), (req, res) => {
  const batch = (db.academicBatches || []).find(item => item.id === req.params.id && canReadAcademicVersion(req.user, item))
  if (!batch) return res.status(404).json({ message:'名单不存在。' })
  if (batch.dispatchedAt || (db.academicBatches || []).some(item => item.previousId === batch.id) || req.body?.version !== batch.version) return res.status(409).json({ message:'名单已分发、已更新或版本冲突。' })
  const cases = db.b?.cases
  if (!Array.isArray(cases)) return res.status(503).json({ message:'学业服务尚未准备好。' })
  for (const row of batch.items) {
    const student = db.users.find(user => user.id === row.studentId && user.role === 'student')
    const mentor = db.users.find(user => user.id === row.mentorId && user.role === 'mentor')
    const counselor = db.users.find(user => user.id === row.counselorId && user.role === 'counselor')
    if (!student || !mentor || !counselor || !req.user.college || student.college !== req.user.college || mentor.college !== req.user.college || !Array.isArray(counselor.studentIds) || !counselor.studentIds.includes(student.id) || !(Array.isArray(student.counselorIds) ? student.counselorIds.includes(counselor.id) : student.counselor === counselor.name)) return res.status(409).json({ message:'人员关系已变化，请重新核对名单。' })
    if (cases.some(item => item.studentId === row.studentId && item.course === row.course && item.status !== 'completed')) return res.status(409).json({ message:'名单中存在尚未结束的同课程任务。' })
  }
  const at = nowIso()
  const created = batch.items.map(row => ({ id:crypto.randomUUID(), studentId:row.studentId, studentName:db.users.find(user => user.id === row.studentId).name, college:req.user.college, mentorId:row.mentorId, counselorId:row.counselorId, course:row.course, status:'pending_contact', version:1, result:null, records:[], createdAt:at, academicBatchId:batch.id }))
  db.b.cases.push(...created)
  batch.dispatchedAt = at; batch.caseIds = created.map(item => item.id); save()
  return res.json({ item:batch, createdCount:created.length })
})

app.get('/api/academic/cases/mine', requireAuth, requireRole('student'), (req, res) => {
  if (db.settings?.studentAcademicViewEnabled !== true) return res.status(501).json({ message: '学生学业信息展示尚未开放。' })
  const items = (db.b?.cases || []).filter(item => item.studentId === req.user.id).map(item => ({
    id:item.id, studentName:req.user.name, course:item.course, status:item.status, version:item.version,
    result:item.result ? { value:item.result.value, source:'', at:item.result.at } : null,
    records:(item.records || []).filter(record => record.type === 'official_result').map(record => ({ type:record.type, at:record.at, actor:'' })),
  }))
  return res.json({ items })
})

mountB(app, {db, save, requireAuth})
mountTrialFeedback(app, {db, save, requireAuth, trialMode})
mountTrialAdmin(app, {db, save, requireAuth, trialMode})
mountRepairRoutes(app, { db, save, requireAuth })

app.use('/api', (req, res) => {
  res.status(404).json({ message: '接口不存在。' })
})

app.use((error, req, res, next) => {
  console.error(error)
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
