const base = 'http://127.0.0.1:8787/api'

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
  return payload
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

console.log('E2E_OK')
