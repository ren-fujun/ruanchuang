import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const source = path.resolve(
  process.env.ZHIHUI_DATA_FILE || 'server/data/store.json',
)
const backupDir = path.resolve(
  process.env.ZHIHUI_BACKUP_DIR || 'server/backups',
)

await stat(source)
const raw = await readFile(source, 'utf8')
const parsed = JSON.parse(raw)
if (!Array.isArray(parsed.users) || !Array.isArray(parsed.tickets)) {
  throw new Error('数据文件结构不完整，拒绝备份。')
}

await mkdir(backupDir, { recursive: true })
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const target = path.join(backupDir, `store-${stamp}.json`)
// Write exactly the snapshot we validated, and never replace a previous backup.
await writeFile(target, raw, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
console.log(`备份完成：${target}`)
console.log(`用户 ${parsed.users.length}，工单 ${parsed.tickets.length}，报修 ${(parsed.repairs || []).length}`)
