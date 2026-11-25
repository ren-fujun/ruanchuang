import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const checks = [
  ['C/D 跨端报修与异议', 'scripts/c/trial-e2e.mjs'],
  ['五端试用反馈', 'scripts/c/feedback-e2e.mjs'],
  ['五端总回归', 'scripts/e2e/five-portals.mjs'],
]
const results = []

for (const [name, file] of checks) {
  console.log(`\n=== ${name} ===`)
  const started = Date.now()
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '' },
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  results.push({
    name,
    file,
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
  realModel: Boolean(process.env.DEEPSEEK_API_KEY),
  results,
}
writeFileSync(
  path.join(outputDir, 'campus-feedback.json'),
  JSON.stringify(report, null, 2),
)
console.log(`\n校园反馈验收：${results.filter((item) => item.status === 'PASS').length}/${checks.length}`)
console.log(`报告：${path.join(outputDir, 'campus-feedback.json')}`)
if (results.some((item) => item.status !== 'PASS')) process.exitCode = 1
