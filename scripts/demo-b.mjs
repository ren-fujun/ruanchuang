import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
process.env.PORT ||= '18804'
process.env.B_DEMO = 'true'
process.env.DEEPSEEK_API_KEY = ''
process.env.ZHIHUI_DATA_FILE ||= fileURLToPath(
  new URL('../.tmp/b-demo/store.json', import.meta.url),
)
process.env.PORTAL_API_URL = 'http://127.0.0.1:' + process.env.PORT
await import('../server/index.js')
for (const role of ['mentor', 'student']) {
  const server = await createServer({
    configFile: fileURLToPath(
      new URL('../apps/' + role + '/vite.config.mjs', import.meta.url),
    ),
  })
  await server.listen()
}
console.log(
  'B 演示：导师 http://127.0.0.1:5195；学生 http://127.0.0.1:5191；账号见 docs/B五端交付.md',
)
