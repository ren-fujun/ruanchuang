import assert from 'node:assert/strict'
const base = `${process.env.E2E_BASE_URL || 'http://127.0.0.1:8787'}/api`

async function call(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${payload.message}`)
  return typeof payload.code === 'number' ? payload.data : payload
}

const student = await call('/auth/login', {
  method: 'POST',
  body: { account: '20230118', password: '123456', role: 'student' },
})
const counselor = await call('/auth/login', {
  method: 'POST',
  body: { account: 'chenyuan', password: '123456', role: 'counselor' },
})

const pre = await call('/ai/precheck', {
  token: student.token,
  method: 'POST',
  body: {
    text: '宿舍洗手台水龙头一直漏水，已经漏到柜子里了，物业电话打不通，希望尽快处理。',
    category: '宿舍生活',
    location: '学生公寓 3 号楼 412',
  },
})
console.log('precheck:', pre.analysis.category, pre.analysis.risk, pre.analysis.suggestedDepartmentNames.join('/'))

const created = await call('/tickets', {
  token: student.token,
  method: 'POST',
  body: {
    description: '宿舍洗手台水龙头一直漏水，已经漏到柜子里了，物业电话打不通，希望尽快处理。',
    category: pre.analysis.category,
    location: '学生公寓 3 号楼 412',
    urgency: pre.analysis.urgency,
  },
})
const id = created.ticket.id
console.log('created:', id, created.ticket.status)

const afterCreate = await call('/counselor/dashboard', { token: counselor.token })
console.log('counselor pending after create:', afterCreate.stats.pending)

const reviewed = await call(`/tickets/${id}/review`, {
  token: counselor.token,
  method: 'PATCH',
  body: { departmentIds: ['dorm', 'logistics'], note: '请今日上门处理并检查柜体。' },
})
console.log('reviewed:', reviewed.ticket.status, reviewed.ticket.departmentIds.join('/'))

const accepted = await call(`/tickets/${id}/progress`, {
  token: counselor.token,
  method: 'PATCH',
  body: { action: 'accept' },
})
console.log('accepted:', accepted.ticket.status)

const resolved = await call(`/tickets/${id}/progress`, {
  token: counselor.token,
  method: 'PATCH',
  body: { action: 'resolve', result: '维修师傅已更换水龙头并做防水处理，柜体已擦干。' },
})
console.log('resolved:', resolved.ticket.status)

const confirmed = await call(`/tickets/${id}/confirm`, {
  token: student.token,
  method: 'POST',
  body: { score: 5, comment: '处理很快，师傅还帮忙检查了柜体。', tags: ['响应及时', '处理到位'] },
})
console.log('confirmed:', confirmed.ticket.status, 'rating:', confirmed.ticket.rating.score)

const detail = await call(`/tickets/${id}`, { token: student.token })
console.log('timeline:', detail.ticket.timeline.map((item) => item.title).join(' -> '))
console.log('student completed count:', (await call('/student/home', { token: student.token })).stats.completed)

const note = await call(`/tickets/${id}/note`, {
  token: counselor.token,
  method: 'POST',
  body: { text: '已电话回访，学生确认无渗漏。' },
})
console.log('note ok:', note.ticket.notes.length)



assert.equal(created.ticket.status, 'pending_review')
assert.equal(reviewed.ticket.status, 'assigned')
assert.equal(accepted.ticket.status, 'processing')
assert.equal(resolved.ticket.status, 'awaiting_confirm')
assert.equal(confirmed.ticket.status, 'completed')
assert.equal(confirmed.ticket.rating.score, 5)
const privateText = '内部备注隔离验收-' + Date.now()
await call('/tickets/' + id + '/note', { token: counselor.token, method: 'POST', body: { text: privateText } })
for (const path of ['/tickets/' + id, '/tickets', '/student/home']) {
  const data = await call(path, { token: student.token })
  assert(!JSON.stringify(data).includes(privateText), '学生响应不应包含内部备注: ' + path)
  assert(!JSON.stringify(data).includes('请今日上门处理并检查柜体。'), '学生响应不应包含督办备注: ' + path)
}
assert(JSON.stringify(await call('/tickets/' + id, { token: counselor.token })).includes(privateText))
const unauth = await fetch(base + '/tickets')
assert.equal(unauth.status, 401)
const forbidden = await fetch(base + '/counselor/dashboard', { headers: { Authorization: 'Bearer ' + student.token } })
assert.equal(forbidden.status, 403)
console.log('LIFECYCLE_AND_PRIVACY_OK')

const dashboard = await call('/counselor/dashboard', { token: counselor.token })
const insights = await call('/counselor/insights', { token: counselor.token })
assert.equal(dashboard.stats.closureRate, Math.round(dashboard.stats.completed / dashboard.stats.total * 100))
assert.equal(insights.summary.closureRate, dashboard.stats.closureRate)
assert.equal(insights.summary.avgResponse, dashboard.stats.avgResponse)
console.log('STATISTICS_OK')

const allTickets = await call('/tickets', { token: counselor.token })
const otherTicket = allTickets.tickets.find(ticket => ticket.studentId !== student.user.id)
assert(otherTicket, '演示种子应包含其他学生工单')
const crossStudent = await fetch(base + '/tickets/' + otherTicket.id, { headers: { Authorization: 'Bearer ' + student.token } })
assert.equal(crossStudent.status, 403)
console.log('CROSS_STUDENT_ACCESS_BLOCKED; E2E_OK')
