const base = String(
  process.env.ZHIHUI_PUBLIC_BASE_URL || 'http://127.0.0.1:8787',
).replace(/\/$/, '')

const response = await fetch(`${base}/api/health`, {
  signal: AbortSignal.timeout(10_000),
})
if (!response.ok) {
  throw new Error(`健康检查失败：HTTP ${response.status}`)
}
const body = await response.json()
if (!body.ok) {
  throw new Error(`健康检查返回异常：${JSON.stringify(body)}`)
}

console.log(`PASS 健康检查：${base}/api/health`)
console.log(JSON.stringify(body))
