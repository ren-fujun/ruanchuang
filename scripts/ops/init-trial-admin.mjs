// Offline only. Reads credentials from stdin; never puts them in arguments or output.
import { readFile, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { prepareTrialAccounts } from '../../server/trial-admin.js'

try {
  const [sourceArg, outputArg] = process.argv.slice(2)
  if (!sourceArg || !outputArg || process.argv.length !== 4 || process.stdin.isTTY) throw new Error('须提供原数据文件和新的输出文件，并通过标准输入提供账号资料。')
  const source = path.resolve(sourceArg), output = path.resolve(outputArg)
  if (source.toLowerCase() === output.toLowerCase()) throw new Error('输出文件必须不同于原文件。')
  let raw = ''
  for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 16384) throw new Error('输入过长。') }
  const input = JSON.parse(raw), data = JSON.parse(await readFile(source, 'utf8'))
  if (!data || !Array.isArray(data.users) || !Array.isArray(data.tickets)) throw new Error('数据文件结构不完整。')
  if (data.users.some(user => user.trialAdmin === true)) throw new Error('已存在管理员，不能重复初始化。')
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['id','account','name','password','expiresAt'].includes(k))) throw new Error('账号资料无效。')
  const [admin] = prepareTrialAccounts(data.users, [{...input, role:'counselor'}])
  if (data.trialAudit !== undefined && !Array.isArray(data.trialAudit)) throw new Error('审计数据无效。')
  data.users.push({...admin, trialAdmin:true})
  data.trialAudit ||= []
  data.trialAudit.push({id:crypto.randomUUID(),actor:admin.id,action:'first_admin_initialized',targets:[admin.id],at:new Date().toISOString()})
  await writeFile(output, JSON.stringify(data, null, 2), {encoding:'utf8', flag:'wx', mode:0o600})
  console.log('已生成新的隔离数据文件；原文件未修改。管理员首次登录必须改密。')
} catch (error) {
  // Do not echo input or parser errors: they may contain credentials.
  console.error('初始化失败。请检查文件、账号资料及是否已有管理员；原文件未修改。')
  process.exitCode = 1
}
