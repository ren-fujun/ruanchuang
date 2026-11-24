import { readFile } from 'node:fs/promises'
import path from 'node:path'

const input = process.argv[2]
if (!input) {
  console.error('用法：node scripts/ops/verify-trial-demo.mjs <演示数据文件>')
  process.exit(1)
}

const file = path.resolve(input)
const data = JSON.parse(await readFile(file, 'utf8'))
if (!Array.isArray(data.tickets) || !Array.isArray(data.users)) {
  throw new Error('演示数据缺少 tickets 或 users。')
}
if (data.tickets.length < 8 || data.tickets.length > 10) {
  throw new Error(`演示工单应为 8—10 条，当前 ${data.tickets.length} 条。`)
}

const departments = new Set(data.tickets.flatMap((ticket) => ticket.departmentIds || []))
const statuses = new Set(data.tickets.map((ticket) => ticket.status))
const highRisk = data.tickets.filter((ticket) => ticket.risk === 'high')
const overdue = data.tickets.filter(
  (ticket) =>
    !['completed', 'awaiting_confirm'].includes(ticket.status) &&
    new Date(ticket.dueAt).getTime() < Date.now(),
)

if (departments.size < 4) throw new Error(`部门覆盖不足，当前 ${departments.size} 个。`)
if (statuses.size < 4) throw new Error(`状态覆盖不足，当前 ${statuses.size} 种。`)
if (!highRisk.length) throw new Error('缺少高风险演示工单。')
if (!overdue.length) throw new Error('缺少逾期演示工单。')

console.log('PASS 试用演示数据')
console.log(
  JSON.stringify(
    {
      file,
      tickets: data.tickets.length,
      users: data.users.length,
      departments: [...departments],
      statuses: [...statuses],
      highRisk: highRisk.map((ticket) => ticket.id),
      overdue: overdue.map((ticket) => ticket.id),
    },
    null,
    2,
  ),
)
