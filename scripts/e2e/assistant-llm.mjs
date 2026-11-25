import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const realModel = Boolean(process.env.DEEPSEEK_API_KEY)
const checks = [
  ['AI 认知链与护栏', ['scripts/ai/eval-b.mjs', ...(realModel ? ['--llm'] : [])]],
  ['模型超时/离线/护栏降级', ['scripts/ai/drill-degrade.mjs', '--quiet']],
]
const results = []

for (const [name, args] of checks) {
  console.log(`\n=== ${name} ===`)
  const started = Date.now()
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env },
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  results.push({
    name,
    command: [process.execPath, ...args].join(' '),
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status,
    elapsedMs: Date.now() - started,
  })
  if (result.status !== 0) break
}

const outputDir = path.resolve('scripts/ai/out')
mkdirSync(outputDir, { recursive: true })
const report = {
  generatedAt: new Date().toISOString(),
  realModel,
  note: realModel
    ? '已配置模型密钥；本地规则和模型评测均执行。'
    : '未配置模型密钥；本次仅证明本地规则与模拟故障降级，不代表真实模型质量。',
  results,
}
writeFileSync(
  path.join(outputDir, 'assistant-llm.json'),
  JSON.stringify(report, null, 2),
)
console.log(`\nAI 验收：${results.filter((item) => item.status === 'PASS').length}/${checks.length}`)
console.log(`真实模型：${realModel ? '已执行' : '未配置，仅本地规则与模拟故障'}`)
if (results.some((item) => item.status !== 'PASS')) process.exitCode = 1
