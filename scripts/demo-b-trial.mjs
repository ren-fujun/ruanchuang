import { bTrialFixture } from './fixtures/b-trial.mjs'
import { mkdir, access, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'vite'
process.env.PORT ||= '18814'
process.env.B_DEMO = 'false'
process.env.DEEPSEEK_API_KEY = ''
process.env.ZHIHUI_DATA_FILE ||= fileURLToPath(new URL('../.tmp/b-trial/store.json', import.meta.url))
await mkdir(path.dirname(process.env.ZHIHUI_DATA_FILE), { recursive: true })
try { await access(process.env.ZHIHUI_DATA_FILE) } catch { await writeFile(process.env.ZHIHUI_DATA_FILE, JSON.stringify(bTrialFixture(), null, 2)) }
process.env.PORTAL_API_URL = 'http://127.0.0.1:' + process.env.PORT
await import('../server/index.js')
for (const [role, port] of [['student', 5291], ['counselor', 5292], ['mentor', 5295]]) {
  const server = await createServer({ configFile: `apps/${role}/vite.config.mjs`, server: { port } })
  await server.listen()
}
console.log('B第二轮演示：学生5291，辅导员5292，导师5295；graduate为研究生，其他账号见交付文档。')
