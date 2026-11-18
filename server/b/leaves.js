import crypto from 'node:crypto'
import { operation, notice } from './operations.js'

const roles = ['student', 'counselor', 'mentor']
export function leaveApprovers(db, student) {
  const undergraduate = student.educationLevel === 'undergraduate'
  const graduate = student.educationLevel === 'postgraduate'
  if (!undergraduate && !graduate) return []
  const ids = undergraduate ? student.counselorIds : student.classAdvisorIds
  return db.users.filter(u => !u.disabled && (!u.expiresAt || (Number.isFinite(Date.parse(u.expiresAt)) && Date.parse(u.expiresAt) > Date.now())) && Array.isArray(ids) && ids.includes(u.id) &&
    (undergraduate ? u.role === 'counselor' : u.role === 'mentor' && u.classAdvisor === true))
}

export function mountLeaves(r, { db, save, state, audit }) {
  state.leaves ||= []
  const fail = (res, message, status = 400) => res.status(status).json({ message })
  const visible = (item, u) => {
    const student = db.users.find(x => x.id === item.studentId && !x.disabled)
    return u.role === 'student' ? item.studentId === u.id : item.approverId === u.id && student &&
      leaveApprovers(db, student).some(x => x.id === u.id)
  }
  const guard = (req, res, next) => roles.includes(req.user.role) && !req.user.disabled
    ? next() : fail(res, '无权访问请假业务', 403)
  r.get('/leaves/approvers', guard, (req, res) => {
    if (req.user.role !== 'student') return fail(res, '仅学生可选择审批人', 403)
    res.json({ educationLevel: req.user.educationLevel || null,
      items: leaveApprovers(db, req.user).map(({ id, name }) => ({ id, name })),
      configured: ['undergraduate', 'postgraduate'].includes(req.user.educationLevel) })
  })
  r.get('/leaves', guard, (req, res) => res.json({ items: state.leaves.filter(x => visible(x, req.user)) }))
  r.post('/leaves', guard, (req, res) => {
    if (req.user.role !== 'student') return fail(res, '仅学生可申请请假', 403)
    const { approverId, startsAt, endsAt, reason } = req.body || {}
    if (!leaveApprovers(db, req.user).some(u => u.id === approverId)) return fail(res, '审批人不在授权范围，请联系管理员配置学生关系', 403)
    const finish = operation(req, res, state, 'leave:create'); if (!finish) return
    if (![startsAt, endsAt].every(x => typeof x === 'string' && Number.isFinite(Date.parse(x))) ||
      Date.parse(startsAt) <= Date.now() || Date.parse(endsAt) <= Date.parse(startsAt) ||
      typeof reason !== 'string' || !reason.trim() || reason.length > 2000)
      return fail(res, '请填写未来开始时间、晚于开始的结束时间和不超过2000字的原因')
    if (state.leaves.some(x => x.studentId === req.user.id && ['pending', 'approved'].includes(x.status) &&
      Date.parse(x.startsAt) < Date.parse(endsAt) && Date.parse(x.endsAt) > Date.parse(startsAt)))
      return fail(res, '该时间段已有待批或已批准申请', 409)
    const item = { id: crypto.randomUUID(), studentId: req.user.id, studentName: req.user.name,
      educationLevel: req.user.educationLevel, approverId,
      approverName: db.users.find(x => x.id === approverId).name,
      startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), reason: reason.trim(),
      status: 'pending', version: 1, createdAt: new Date().toISOString(), decision: null }
    state.leaves.push(item)
    notice(db, approverId, '新的请假待审批', '请进入请假审批查看授权申请。')
    audit(req, 'leave_created', item.id)
    finish({ item }, 201); save()
  })
  r.post('/leaves/:id/decision', guard, (req, res) => {
    const item = state.leaves.find(x => x.id === req.params.id)
    if (req.user.role === 'student' || !item || !visible(item, req.user)) return fail(res, '无权审批该申请', 403)
    const finish = operation(req, res, state, 'leave:decision:' + item.id); if (!finish) return
    if (item.status !== 'pending' || item.version !== req.body.version) return fail(res, '申请已处理或版本冲突，请刷新', 409)
    const { action, note } = req.body
    if (!['approved', 'rejected'].includes(action) || typeof note !== 'string' || !note.trim() || note.length > 1000)
      return fail(res, '请提供审批决定和不超过1000字的意见')
    const next = { ...item, status: action, version: item.version + 1,
      decision: { action, note: note.trim(), actor: req.user.id, at: new Date().toISOString() } }
    state.leaves[state.leaves.indexOf(item)] = next
    notice(db, item.studentId, '请假审批结果已更新', '请进入我的请假查看审批意见。')
    audit(req, 'leave_' + action, item.id)
    finish({ item: next }); save()
  })
}
