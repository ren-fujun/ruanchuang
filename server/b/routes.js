import express from 'express'
import crypto from 'node:crypto'
import { scanRisk } from '../ai/riskAgent.js'
const id = () => crypto.randomUUID(),
  now = () => new Date().toISOString()
export function mountB(app, { db, save, requireAuth }) {
  db.b ||= { cases: [], knowledge: [], conversations: [], audit: [] }
  const state = db.b
  if (
    process.env.B_DEMO === 'true' &&
    !db.users.some((u) => u.id === 'mentor-demo')
  ) {
    db.users.push(
      {
        id: 'mentor-demo',
        role: 'mentor',
        account: 'mentor',
        password: '123456',
        name: '示例导师',
        college: '信息工程学院',
      },
      {
        id: 'academic-demo',
        role: 'academic',
        account: 'academic',
        password: '123456',
        name: '示例教务',
        college: '信息工程学院',
      },
      {
        id: 'review-demo',
        role: 'counselor',
        account: 'reviewer',
        password: '123456',
        name: '知识审核员',
        knowledgeReviewer: true,
      },
    )
    state.cases.push({
      id: 'case-demo',
      studentId: 'stu-lin',
      studentName: '林知夏',
      college: '信息工程学院',
      mentorId: 'mentor-demo',
      counselorId: 'cou-chen',
      course: '高等数学',
      status: 'pending_contact',
      version: 1,
      result: null,
      records: [],
      createdAt: now(),
    })
    save()
  }
  const r = express.Router()
  r.use(requireAuth)
  const audit = (req, action, target) => {
    state.audit.push({
      id: id(),
      actor: req.user.id,
      action,
      target,
      at: now(),
    })
    save()
  }
  const allowed = (roles) => (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: '无权访问此业务' })
  const visible = (c, u) =>
    u.role === 'mentor'
      ? c.mentorId === u.id
      : u.role === 'counselor'
        ? c.counselorId === u.id
        : u.role === 'academic'
          ? c.college === u.college
          : false
  const projected = (c, u) =>
    u.role === 'mentor'
      ? c
      : {
          ...c,
          records: c.records.map(({ type, at, actor }) => ({
            type,
            at,
            actor,
          })),
        }
  const fail = (res, msg, status = 400) =>
    res.status(status).json({ message: msg })
  r.post('/cases', allowed(['academic']), (req, res) => {
    const { studentId, mentorId, counselorId, course } = req.body || {}
    const student = db.users.find(
      (u) =>
        u.id === studentId &&
        u.role === 'student' &&
        u.college === req.user.college,
    )
    const mentor = db.users.find(
      (u) =>
        u.id === mentorId &&
        u.role === 'mentor' &&
        u.college === req.user.college,
    )
    const counselor = db.users.find(
      (u) => u.id === counselorId && u.role === 'counselor',
    )
    if (
      !student ||
      !mentor ||
      !counselor ||
      student.counselor !== counselor.name ||
      typeof course !== 'string' ||
      !course.trim() ||
      course.length > 100
    )
      return fail(
        res,
        '请校验学生、导师、辅导员和课程；学生和导师须属于授权学院',
      )
    if (
      state.cases.some(
        (c) =>
          c.studentId === studentId &&
          c.course === course.trim() &&
          c.status !== 'completed',
      )
    )
      return fail(res, '该学生课程已有未结束任务', 409)
    const item = {
      id: id(),
      studentId,
      studentName: student.name,
      college: student.college,
      mentorId,
      counselorId,
      course: course.trim(),
      status: 'pending_contact',
      version: 1,
      records: [],
      result: null,
      createdAt: now(),
    }
    state.cases.push(item)
    audit(req, 'academic_case_created', item.id)
    res.status(201).json({ item: projected(item, req.user) })
  })
  r.get('/cases', allowed(['mentor', 'counselor', 'academic']), (req, res) =>
    res.json({
      items: state.cases
        .filter((c) => visible(c, req.user))
        .map((c) => projected(c, req.user)),
    }),
  )
  r.post('/cases/:id/events', allowed(['mentor']), (req, res) => {
    const c = state.cases.find(
      (c) => c.id === req.params.id && visible(c, req.user),
    )
    if (!c) return fail(res, '无权访问该学业任务', 403)
    const { type, text = '', scheduledAt, version } = req.body || {}
    if (version !== c.version) return fail(res, '任务已更新，请刷新后重试', 409)
    if (c.status === 'completed')
      return fail(res, '已结束任务不能追加办理动作', 409)
    const transitions = {
      contact: [
        'pending_contact',
        'contacted',
        'interviewed',
        'awaiting_result',
      ],
      interview: ['contacted', 'interviewed', 'awaiting_result'],
      remind: ['interviewed', 'awaiting_result'],
      referral: [
        'pending_contact',
        'contacted',
        'interviewed',
        'awaiting_result',
      ],
    }
    if (!transitions[type]?.includes(c.status))
      return fail(res, '请先完成联系，再记录面谈与重修提醒', 409)
    if (typeof text !== 'string' || !text.trim() || text.length > 2000)
      return fail(res, '请填写不超过2000字的必要工作记录')
    if (
      scheduledAt &&
      (!Number.isFinite(Date.parse(scheduledAt)) ||
        Date.parse(scheduledAt) < Date.now())
    )
      return fail(res, '下次联系时间应晚于当前时间')
    c.records.push({
      id: id(),
      type,
      text: text.trim(),
      scheduledAt: scheduledAt || null,
      at: now(),
      actor: req.user.id,
    })
    if (type === 'contact')
      c.status = c.status === 'pending_contact' ? 'contacted' : c.status
    if (type === 'interview') c.status = 'interviewed'
    if (type === 'remind') c.status = 'awaiting_result'
    if (type === 'referral') {
      c.referral = { status: 'requested', recipient: c.counselorId, at: now() }
      db.notifications.unshift({
        id: id(),
        userId: c.counselorId,
        type: 'system',
        title: '导师请求协同支持',
        body: '学业任务需要人工跟进，请查看授权范围内的任务。',
        ticketId: null,
        tone: 'gold',
        at: now(),
        read: false,
      })
    }
    c.version++
    audit(req, type, c.id)
    res.json({ item: c })
  })
  r.patch('/cases/:id/result', allowed(['academic']), (req, res) => {
    const c = state.cases.find(
      (c) => c.id === req.params.id && visible(c, req.user),
    )
    if (!c) return fail(res, '无权更新', 403)
    if (c.version !== req.body.version) return fail(res, '版本冲突', 409)
    if (
      !['passed', 'failed'].includes(req.body.result) ||
      !String(req.body.source || '').trim()
    )
      return fail(res, '需要正式结果及来源说明')
    c.result = {
      value: req.body.result,
      source: String(req.body.source).slice(0, 500),
      at: now(),
      actor: req.user.id,
    }
    c.records.push({
      id: id(),
      type: 'official_result',
      text: c.result.source,
      at: now(),
      actor: req.user.id,
    })
    c.status = req.body.result === 'passed' ? 'completed' : 'pending_contact'
    c.version++
    audit(req, 'official_result', c.id)
    res.json({ item: projected(c, req.user) })
  })
  r.get('/knowledge', allowed(['counselor']), (req, res) =>
    res.json({
      items: state.knowledge.filter(
        (k) => k.authorId === req.user.id || req.user.knowledgeReviewer,
      ),
    }),
  )
  r.post('/knowledge', allowed(['counselor']), (req, res) => {
    const {
      title,
      answer,
      keywords,
      source,
      department,
      validUntil,
      parentId,
    } = req.body || {}
    if (
      ![title, answer, source, department].every(
        (v) => typeof v === 'string' && v.trim() && v.length <= 4000,
      ) ||
      !Array.isArray(keywords) ||
      !keywords.length ||
      keywords.length > 20 ||
      !keywords.every(
        (k) => typeof k === 'string' && k.trim().length >= 2 && k.length <= 30,
      ) ||
      !Number.isFinite(Date.parse(validUntil)) ||
      Date.parse(validUntil) <= Date.now()
    )
      return fail(res, '请填写标题、答案、关键词、来源、责任部门及未来有效期')
    const parent = parentId
      ? state.knowledge.find((k) => k.id === parentId)
      : null
    if (parentId && (!parent || parent.authorId !== req.user.id))
      return fail(res, '只能修订本人知识', 403)
    const family = parent?.family || id()
    const item = {
      id: id(),
      family,
      version:
        Math.max(
          0,
          ...state.knowledge
            .filter((k) => k.family === family)
            .map((k) => k.version),
        ) + 1,
      title,
      answer,
      keywords,
      source,
      department,
      validUntil,
      status: 'draft',
      authorId: req.user.id,
      createdAt: now(),
    }
    state.knowledge.push(item)
    audit(req, 'knowledge_draft', item.id)
    res.status(201).json({ item })
  })
  r.post('/knowledge/:id/review', allowed(['counselor']), (req, res) => {
    const k = state.knowledge.find((k) => k.id === req.params.id)
    if (!k) return fail(res, '知识不存在', 404)
    if (!req.user.knowledgeReviewer || k.authorId === req.user.id)
      return fail(res, '需由另一位授权审核人员审核', 403)
    if (k.status !== 'draft') return fail(res, '该版本已审核', 409)
    if (
      !['publish', 'reject'].includes(req.body.action) ||
      !String(req.body.note || '').trim()
    )
      return fail(res, '需提供审核决定和意见')
    if (req.body.action === 'publish' && Date.parse(k.validUntil) <= Date.now())
      return fail(res, '过期版本不能发布')
    if (req.body.action === 'publish')
      state.knowledge
        .filter((x) => x.family === k.family && x.status === 'published')
        .forEach((x) => (x.status = 'superseded'))
    k.status = req.body.action === 'publish' ? 'published' : 'rejected'
    k.review = {
      actor: req.user.id,
      note: String(req.body.note).slice(0, 1000),
      at: now(),
    }
    audit(req, 'knowledge_' + k.status, k.id)
    res.json({ item: k })
  })
  r.post('/knowledge/:id/withdraw', allowed(['counselor']), (req, res) => {
    const k = state.knowledge.find((k) => k.id === req.params.id)
    if (!k || (!req.user.knowledgeReviewer && k.authorId !== req.user.id))
      return fail(res, '无权撤回', 403)
    k.status = 'withdrawn'
    audit(req, 'knowledge_withdraw', k.id)
    res.json({ item: k })
  })
  r.post('/assistant', allowed(['student']), (req, res) => {
    const text = String(req.body.text || '').trim()
    if (text.length < 2 || text.length > 2000)
      return fail(res, '请输入2至2000字')
    let c = req.body.conversationId
      ? state.conversations.find(
          (c) => c.id === req.body.conversationId && c.userId === req.user.id,
        )
      : null
    if (req.body.conversationId && !c)
      return fail(res, '会话不存在或无权访问', 403)
    if (c && c.turns.length >= 6)
      return fail(res, '本轮对话已结束，请转人工或新建对话', 409)
    if (!c) {
      c = { id: id(), userId: req.user.id, turns: [], createdAt: now() }
      state.conversations.push(c)
    }
    c.turns.push(text)
    const combined = c.turns.join('；')
    const risk = scanRisk({ text: combined })
    const score = (k) =>
      k.keywords.reduce((n, w) => n + (combined.includes(w) ? w.length : 0), 0)
    const matches = state.knowledge
      .filter(
        (k) =>
          k.status === 'published' && Date.parse(k.validUntil) > Date.now(),
      )
      .map((k) => ({ k, score: score(k) }))
      .filter((x) => x.score >= 4)
      .sort((a, b) => b.score - a.score)
    const certain =
      matches.length && (!matches[1] || matches[0].score > matches[1].score)
    let result = {
      conversationId: c.id,
      summary: combined,
      action: 'handoff',
      answer: '暂未找到足够可靠的有效资料，可携带对话摘要转交辅导员。',
      source: null,
      risk: risk.level || risk.label,
    }
    if (risk.label === 'high' || risk.level === 'high') {
      result.answer =
        '这条诉求需要优先由人工关注，请联系学校确认的紧急支持渠道。'
      result.action = 'urgent_handoff'
    } else if (risk.level !== 'low') {
      result.answer = '当前情况建议由辅导员进一步核实，可确认提交对话摘要。'
    } else if (certain) {
      const k = matches[0].k
      result = {
        ...result,
        action: 'answer',
        answer: k.answer,
        source: {
          id: k.id,
          title: k.title,
          version: k.version,
          source: k.source,
          department: k.department,
          validUntil: k.validUntil,
        },
      }
    } else if (c.turns.length < 3) {
      result.action = 'clarify'
      result.answer =
        c.turns.length === 1
          ? '请补充发生地点，以及希望解决的具体问题。'
          : '请补充发生时间，以及已经尝试过的处理方式。'
    }
    c.last = result
    save()
    res.json(result)
  })
  app.use('/api/b', r)
}
