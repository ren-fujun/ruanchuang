import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const input = process.argv[2]
if (!input) {
  console.error('用法：node scripts/ops/restore.mjs <备份文件> --yes')
  process.exit(1)
}
if (!process.argv.includes('--yes')) {
  console.error('恢复会覆盖当前数据。确认恢复时请追加 --yes。')
  process.exit(1)
}

const source = path.resolve(input)
const target = path.resolve(
  process.env.ZHIHUI_DATA_FILE || 'server/data/store.json',
)
await stat(source)
const raw = await readFile(source, 'utf8')
const parsed = JSON.parse(raw)
if (!Array.isArray(parsed.users) || !Array.isArray(parsed.tickets)) {
  throw new Error('备份文件结构不完整，拒绝恢复。')
}

await mkdir(path.dirname(target), { recursive: true })
if (await stat(target).then(() => true).catch(() => false)) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const safety = `${target}.pre-restore-${stamp}`
  await copyFile(target, safety)
  console.log(`当前数据已另存：${safety}`)
}

const temp = `${target}.restore.tmp`
await writeFile(temp, JSON.stringify(parsed, null, 2), 'utf8')
await rename(temp, target)
console.log(`恢复完成：${target}`)
console.log('请重启 API 服务后生效。')
