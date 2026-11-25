import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { seedData } from '../../server/seed.js'

const output = path.resolve(
  process.argv[2] || `.tmp/trial-demo-${new Date().toISOString().slice(0, 10)}/store.json`,
)
const selectedIds = [
  'ZX20261107009',
  'ZX20261107015',
  'ZX20261107018',
  'ZX20261107014',
  'ZX20261107008',
  'ZX20261107017',
  'ZX20261107005',
  'ZX20261107016',
  'ZX20261107010',
  'ZX20261107013',
]

const db = seedData()
const byId = new Map(db.tickets.map((ticket) => [ticket.id, ticket]))
const missing = selectedIds.filter((id) => !byId.has(id))
if (missing.length) throw new Error(`演示种子缺少工单：${missing.join(', ')}`)

const now = Date.now()
const selected = selectedIds.map((id) => structuredClone(byId.get(id)))
const overdue = selected.find((ticket) => ticket.id === 'ZX20261107009')
overdue.status = 'assigned'
overdue.risk = 'high'
overdue.urgency = 'urgent'
overdue.dueAt = new Date(now - 45 * 60_000).toISOString()
overdue.updatedAt = new Date(now - 50 * 60_000).toISOString()
overdue.ai.risk = 'high'
overdue.ai.riskReason = '漏水接近插线板，存在触电风险，演示数据已固定为逾期高风险事项。'

db.tickets = selected
db.sessions = []
db.trialFeedback = []
db.notifications = (db.notifications || []).filter(
  (note) => !note.ticketId || selectedIds.includes(note.ticketId),
)
db.trialDemo = {
  version: 1,
  generatedAt: new Date().toISOString(),
  description: '8至10条固定虚构事务，覆盖多部门、多风险和多状态。',
  selectedIds,
}

await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(db, null, 2), {
  encoding: 'utf8',
  flag: 'wx',
})

const departments = new Set(selected.flatMap((ticket) => ticket.departmentIds))
const statuses = new Set(selected.map((ticket) => ticket.status))
console.log(`演示数据已生成：${output}`)
console.log(
  `工单 ${selected.length}，部门 ${departments.size}，状态 ${statuses.size}，高风险 ${selected.filter((ticket) => ticket.risk === 'high').length}，逾期 ${selected.filter((ticket) => !['completed', 'awaiting_confirm'].includes(ticket.status) && new Date(ticket.dueAt).getTime() < now).length}`,
)
