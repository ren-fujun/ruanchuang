import crypto from 'node:crypto'
import { appointmentAdvice } from './b/appointment-advice.js'

export function mountAppointments(app, { db, save, requireAuth }) {
  const slots = () => db.appointmentSlots ||= []
  const items = () => db.appointments ||= []
  const messages = () => db.appointmentMessages ||= []
  const owns = (u, a) => u.role === 'student' ? a.studentId === u.id : u.role === 'counselor' && a.counselorId === u.id && (u.studentIds || []).includes(a.studentId)
  const related = (u, s) => u.role === 'counselor' ? s.counselorId === u.id : u.role === 'student' && (db.users.find(x => x.id === s.counselorId)?.studentIds || []).includes(u.id)
  const bad = (res, message, status = 400) => res.status(status).json({ message })
  const overlap = (a, b) => Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(a.endsAt) > Date.parse(b.startsAt)
  const decorate = s => ({ ...s, available: Date.parse(s.endsAt) > Date.now(), ownerName: db.users.find(x => x.id === s.counselorId)?.name || '辅导员' })
  const view = (a, user) => ({ ...a, ownerName: db.users.find(x => x.id === a.counselorId)?.name || '辅导员', studentName: db.users.find(x => x.id === a.studentId)?.name || '学生', unread: user ? messages().filter(m => m.appointmentId === a.id && m.fromId !== user.id && !m.readAt).length : 0 })
  app.get('/api/appointments/slots', requireAuth, (req, res) => res.json({ items: slots().filter(s => related(req.user, s)).map(decorate) }))
  app.post('/api/appointments/slots', requireAuth, (req, res) => {
    if (req.user.role !== 'counselor') return res.sendStatus(403)
    const start = Date.parse(req.body?.startsAt), end = Date.parse(req.body?.endsAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start || end - start > 12 * 3600000 || start % 300000 || end % 300000) return bad(res, '请选择未来的时间窗口，起止时间需按5分钟对齐。')
    const slot = { id: crypto.randomUUID(), counselorId: req.user.id, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }
    if (slots().some(s => s.counselorId === req.user.id && overlap(s, slot))) return bad(res, '开放时段冲突。', 409)
    slots().push(slot); save(); res.status(201).json({ item: decorate(slot) })
  })
  app.get('/api/appointments', requireAuth, (req, res) => res.json({ items: items().filter(a => owns(req.user, a)).map(a => view(a, req.user)) }))
  app.post('/api/appointments/advice', requireAuth, async (req, res) => {
    if (req.user.role !== 'student') return res.sendStatus(403)
    const text = req.body?.text
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) return bad(res, '请填写1至1000字的事项。')
    res.json({ item: await appointmentAdvice(text.trim()) })
  })
  app.post('/api/appointments', requireAuth, (req, res) => {
    if (req.user.role !== 'student') return res.sendStatus(403)
    const { slotId, topic, minutes, requestId } = req.body || {}
    const slot = slots().find(s => s.id === slotId && related(req.user, s))
    if (!slot || Date.parse(slot.endsAt) <= Date.now()) return bad(res, '时段不可用。', 404)
    if (typeof topic !== 'string' || !topic.trim() || topic.length > 1000 || !Number.isInteger(minutes) || minutes < 5 || minutes > 120 || minutes % 5 || typeof requestId !== 'string' || !requestId || requestId.length > 128) return bad(res, '请填写事项、5分钟为单位的时长和请求标识。')
    const existing = items().find(a => a.studentId === req.user.id && a.requestId === requestId)
    if (existing) return res.json({ item: view(existing) })
    const item = { id: crypto.randomUUID(), slotId, studentId: req.user.id, counselorId: slot.counselorId, topic: topic.trim(), minutes, requestId, status: 'pending', createdAt: new Date().toISOString(), version: 1 }
    items().push(item); save(); res.status(201).json({ item: view(item) })
  })
  const place = a => {
    const slot = slots().find(s => s.id === a.slotId && s.counselorId === a.counselorId)
    if (!slot) return false
    const occupied = items().filter(x => x.counselorId === a.counselorId && x.status === 'scheduled')
    for (let t = Math.max(Date.parse(slot.startsAt), Math.ceil(Date.now() / 300000) * 300000); t + a.minutes * 60000 <= Date.parse(slot.endsAt); t += 300000) {
      const candidate = { startsAt: new Date(t).toISOString(), endsAt: new Date(t + a.minutes * 60000).toISOString() }
      if (!occupied.some(x => overlap(x, candidate))) { Object.assign(a, candidate, { status: 'scheduled', version: a.version + 1 }); return true }
    }
    a.status = 'waitlisted'; return false
  }
  app.post('/api/appointments/batch', requireAuth, (req, res) => {
    if (req.user.role !== 'counselor') return res.sendStatus(403)
    const slot = slots().find(s => s.id === req.body?.slotId && s.counselorId === req.user.id)
    if (!slot) return res.sendStatus(404)
    const candidates = items().filter(a => a.slotId === slot.id && a.counselorId === req.user.id && (req.user.studentIds || []).includes(a.studentId) && ['pending', 'waitlisted'].includes(a.status)).sort((a, b) => (a.status === 'waitlisted' ? 0 : 1) - (b.status === 'waitlisted' ? 0 : 1) || a.createdAt.localeCompare(b.createdAt))
    candidates.forEach(place); save(); res.json({ items: candidates.map(a => view(a, req.user)) })
  })
  app.post('/api/appointments/:id/cancel', requireAuth, (req, res) => {
    const a = items().find(x => x.id === req.params.id && owns(req.user, x))
    if (!a) return res.sendStatus(404)
    if (!['pending', 'scheduled', 'waitlisted'].includes(a.status)) return bad(res, '预约当前无法取消。', 409)
    const reason = req.body?.reason
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 200)) return bad(res, '取消说明不能超过200字。')
    const wasScheduled = a.status === 'scheduled'; a.status = 'cancelled'; a.version++; a.cancelledAt = new Date().toISOString(); a.cancelReason = reason?.trim() || ''
    if (wasScheduled) for (const next of items().filter(x => x.slotId === a.slotId && x.status === 'waitlisted').sort((x, y) => x.createdAt.localeCompare(y.createdAt))) { if (place(next)) break }
    save(); res.json({ item: view(a) })
  })
  app.get('/api/appointments/:id/messages', requireAuth, (req, res) => {
    const a = items().find(x => x.id === req.params.id && owns(req.user, x)); if (!a) return res.sendStatus(404)
    const found = messages().filter(m => m.appointmentId === a.id)
    found.filter(m => m.fromId !== req.user.id && !m.readAt).forEach(m => { m.readAt = new Date().toISOString() }); save(); res.json({ items: found })
  })
  app.post('/api/appointments/:id/messages', requireAuth, (req, res) => {
    const a = items().find(x => x.id === req.params.id && owns(req.user, x)); if (!a) return res.sendStatus(404)
    const text = req.body?.text; if (typeof text !== 'string' || !text.trim() || text.length > 2000) return bad(res, '留言须为1至2000字。')
    const item = { id: crypto.randomUUID(), appointmentId: a.id, fromId: req.user.id, text: text.trim(), at: new Date().toISOString(), readAt: null }
    messages().push(item); save(); res.status(201).json({ item })
  })
}
