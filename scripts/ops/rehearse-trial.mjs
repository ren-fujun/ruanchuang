import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright'

const runDir = await mkdtemp(path.join(os.tmpdir(), 'zhihui-rehearsal-'))
const dataFile = path.join(runDir, 'store.json')
const evidenceDir = path.resolve(
  process.env.E2E_EVIDENCE_DIR || '.tmp/trial-rehearsal',
)
await mkdir(evidenceDir, { recursive: true })
const generated = spawnSync(
  process.execPath,
  ['scripts/ops/create-trial-demo.mjs', dataFile],
  { encoding: 'utf8' },
)
assert.equal(generated.status, 0, generated.stderr)
console.log(generated.stdout.trim())

async function freePort() {
  const server = createNetServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

const apiPort = await freePort()
const apiBase = `http://127.0.0.1:${apiPort}`
const api = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(apiPort),
    ZHIHUI_DATA_FILE: dataFile,
    DEEPSEEK_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
api.stdout.on('data', (chunk) => {
  logs += chunk
})
api.stderr.on('data', (chunk) => {
  logs += chunk
})

const servers = []
let browser
try {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error(logs || 'API 提前退出')
    try {
      if ((await fetch(`${apiBase}/api/health`)).ok) break
    } catch {
      // API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!logs.includes('已启动')) throw new Error(logs || 'API 启动超时')

  process.env.PORTAL_API_URL = apiBase
  const origins = {}
  for (const role of ['student', 'counselor', 'logistics']) {
    const vite = await createViteServer({
      configFile: `apps/${role}/vite.config.mjs`,
      server: { port: await freePort(), open: false },
    })
    await vite.listen()
    servers.push(vite)
    origins[role] = `http://127.0.0.1:${vite.httpServer.address().port}`
  }

  const edgePath = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => existsSync(candidate))
  if (!edgePath) throw new Error('未找到 Microsoft Edge')
  browser = await chromium.launch({ executablePath: edgePath, headless: true })

  const login = async (role, account) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${origins[role]}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('账号', { exact: true }).fill(account)
    await page.getByLabel('密码', { exact: true }).fill('123456')
    await page
      .getByRole('button', {
        name: role === 'logistics' ? '进入后勤维修台' : '登录',
        exact: true,
      })
      .click()
    if (role === 'logistics') {
      await page.getByText('后勤维修工作台', { exact: false }).waitFor()
    } else {
      await page.waitForURL(`**/${role}/home`)
    }
    return page
  }

  const student = await login('student', '20230118')
  await student.locator('.c-metrics').waitFor()
  await student.screenshot({
    path: path.join(evidenceDir, 'demo-student-home.png'),
    fullPage: true,
  })
  await student.goto(`${origins.student}/student/repairs/new`)
  await student.getByLabel('报修类型').selectOption('水电')
  await student.getByLabel('报修地点').fill('学生公寓 3 号楼 412')
  await student.getByLabel('故障描述').fill('演示彩排：洗手池水管持续漏水，需要后勤处理。')
  await student.getByRole('button', { name: '确认提交', exact: true }).click()
  await student.waitForURL('**/student/repairs/**')
  await student.getByText('待后勤分配', { exact: true }).waitFor()
  await student.screenshot({
    path: path.join(evidenceDir, 'demo-student-repair.png'),
    fullPage: true,
  })

  const counselor = await login('counselor', 'chenyuan')
  await counselor.locator('.c-metrics').waitFor()
  await counselor.goto(`${origins.counselor}/counselor/tickets?risk=high`)
  await counselor.getByText('宿舍阳台天花板漏水', { exact: false }).waitFor()
  await counselor.screenshot({
    path: path.join(evidenceDir, 'demo-counselor-risk.png'),
    fullPage: true,
  })
  await counselor.goto(`${origins.counselor}/counselor/insights`)
  await counselor.getByText('协同洞察', { exact: false }).first().waitFor()
  await counselor.screenshot({
    path: path.join(evidenceDir, 'demo-insights.png'),
    fullPage: true,
  })

  const logistics = await login('logistics', 'logistics')
  await logistics.getByText('后勤维修工作台', { exact: false }).waitFor()
  await logistics.getByText('学生公寓 3 号楼 412', { exact: false }).waitFor()
  await logistics.screenshot({
    path: path.join(evidenceDir, 'demo-logistics.png'),
    fullPage: true,
  })

  await student.setViewportSize({ width: 390, height: 844 })
  const mobile = await student.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(mobile.scrollWidth <= mobile.viewport, '学生手机页面横向溢出')

  console.log('PASS 演示种子可启动真实 API')
  console.log('PASS 学生可从 H5 提交报修')
  console.log('PASS 辅导员可查看高风险与协同洞察')
  console.log('PASS 后勤可看到学生直达报修')
  console.log('PASS 学生 390px 手机布局无横向溢出')
} finally {
  await browser?.close()
  await Promise.allSettled(servers.map((server) => server.close()))
  if (api.exitCode === null) {
    api.kill()
    await once(api, 'exit').catch(() => {})
  }
}
