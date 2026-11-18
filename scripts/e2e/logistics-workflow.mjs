import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer as createViteServer } from 'vite'
import { seedData } from '../../server/seed.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
process.chdir(root)
const requestId = () => crypto.randomUUID()
const evidenceDir = path.resolve(
  process.env.E2E_EVIDENCE_DIR || '.tmp/logistics-evidence',
)
await mkdir(evidenceDir, { recursive: true })

const dir = await mkdtemp(path.join(os.tmpdir(), 'repair-e2e-'))
const dataFile = path.join(dir, 'store.json')
const data = seedData()
data.users.push(
  { id:'student-no-campus', role:'student', name:'校区未配置', account:'no-campus', password:'123456' },
  {
    id: 'logistics-other',
    role: 'logistics',
    name: '其他后勤人员',
    account: 'logistics-other',
    password: '123456',
    department: '后勤保障处',
    repairScopes: ['主校区'],
  },
  {
    id: 'logistics-outside',
    role: 'logistics',
    name: '校外校区后勤',
    account: 'logistics-outside',
    password: '123456',
    department: '后勤保障处',
    repairScopes: ['异地校区'],
  },
)
await writeFile(dataFile, JSON.stringify(data, null, 2))

async function freePort() {
  const probe = createNetServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  return port
}

const apiPort = await freePort()
const apiBase = `http://127.0.0.1:${apiPort}`
const server = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(apiPort),
    ZHIHUI_DATA_FILE: dataFile,
    DEEPSEEK_API_KEY: '',
    REPAIR_RESPONSE_MINUTES: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', (chunk) => {
  logs += chunk
})
server.stderr.on('data', (chunk) => {
  logs += chunk
})

async function waitForServer() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(logs || 'API 提前退出')
    try {
      if ((await fetch(`${apiBase}/api/health`)).ok) return
    } catch {
      // Isolated API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(logs || 'API 启动超时')
}

async function rawCall(pathname, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${apiBase}/api${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json()
  const data = typeof payload.code === 'number' ? payload.data : payload
  return { status: response.status, data }
}

async function call(pathname, token, body, method) {
  const result = await rawCall(pathname, token, body, method)
  if (result.status >= 400) {
    throw new Error(
      `${pathname} ${result.status}: ${result.data?.msg || result.data?.message || ''}`,
    )
  }
  return result.data
}

async function expectError(pathname, token, body, status, method) {
  const result = await rawCall(pathname, token, body, method)
  assert.equal(result.status, status, `${pathname} 应返回 ${status}`)
  return result
}

async function login(account, role) {
  return (
    await call('/auth/login', null, {
      account,
      password: '123456',
      role,
    })
  ).token
}

async function createRepair(student, description) {
  return (
    await call('/repairs', student, {
      repairType: '水电',
      location: '学生公寓 3 号楼 412',
      description,
      requestId: requestId(),
    }, 'POST')
  ).repair
}

let browser
let vite
try {
  await waitForServer()

  const student = await login('20230118', 'student')
  const counselor = await login('chenyuan', 'counselor')
  const logistics = await login('logistics', 'logistics')
  const otherLogistics = await login('logistics-other', 'logistics')
  const outsideLogistics = await login('logistics-outside', 'logistics')
  const noCampus = await login('no-campus', 'student')
  await expectError('/repairs', noCampus, {repairType:'水电',location:'测试地点',description:'模拟故障',requestId:requestId()}, 403)

  const idempotentRequestId = requestId()
  const idempotentBody = {
    repairType: '门窗',
    location: '图书馆 1F 东门',
    description: '门把手松动，需要紧固。',
    requestId: idempotentRequestId,
  }
  const createFirst = await rawCall('/repairs', student, idempotentBody)
  const createRetry = await rawCall('/repairs', student, idempotentBody)
  assert.equal(createFirst.status, 201)
  assert.equal(createRetry.status, 200)
  assert.equal(createFirst.data.repair.id, createRetry.data.repair.id)
  await expectError('/repairs', student, {...idempotentBody, description:'不同内容的报修请求'}, 409)
  await expectError(`/repairs/${createFirst.data.repair.id}/claim`, outsideLogistics, {version:1,requestId:idempotentRequestId}, 403)
  await expectError(`/repairs/${createFirst.data.repair.id}/claim`, logistics, {version:1,requestId:idempotentRequestId}, 409)
  const claimBody = {version:1, requestId:requestId()}
  assert.equal((await rawCall(`/repairs/${createFirst.data.repair.id}/claim`, logistics, claimBody)).status,200)
  assert.equal((await rawCall(`/repairs/${createFirst.data.repair.id}/claim`, logistics, claimBody)).data.duplicate,true)
  await expectError(`/repairs/${createFirst.data.repair.id}/claim`, logistics, {...claimBody,version:2}, 409)
  await expectError(`/repairs/${createFirst.data.repair.id}/claim`, student, claimBody, 403)
  await expectError(`/repairs/${createFirst.data.repair.id}/result`, outsideLogistics, claimBody, 403)

  const repair = await createRepair(student, '洗手池下方持续漏水，地面已经积水。')
  assert.equal(repair.status, 'pending_assignment')
  assert.equal(repair.claimantId, null, '学生直达后不应经过辅导员审核')

  const counselorQueue = await call('/repairs', counselor)
  assert.equal(counselorQueue.items.some((item) => item.id === repair.id), true)
  const outsideQueue = await call('/repairs', outsideLogistics)
  assert.equal(outsideQueue.items.length, 0, '异地校区后勤不能读取主校区报修')

  const vitePort = await freePort()
  process.env.PORTAL_API_URL = apiBase
  vite = await createViteServer({
    configFile: 'apps/logistics/vite.config.mjs',
    server: { port: vitePort, open: false },
  })
  await vite.listen()

  const edgePath = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => existsSync(candidate))
  if (!edgePath) throw new Error('未找到 Microsoft Edge')

  browser = await chromium.launch({ executablePath: edgePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`http://127.0.0.1:${vitePort}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '进入后勤维修台' }).click()
  const repairCard = page.locator('.repair-card').filter({ hasText: repair.id })
  await repairCard.locator('.status-pill').filter({ hasText: '待后勤分配' }).waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, 'd-direct-repair-queue.png'),
    fullPage: true,
  })
  await repairCard.getByRole('button', { name: '领取此报修' }).click()
  await repairCard.locator('.status-pill').filter({ hasText: '处理中' }).waitFor()
  await repairCard.getByLabel('本次处置结果').fill('已关闭总阀并更换洗手池软管，试水后无渗漏。')
  await repairCard.getByRole('button', { name: '提交本次结果' }).click()
  await repairCard.locator('.status-pill').filter({ hasText: '待学生反馈' }).waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, 'd-direct-repair-waiting-feedback.png'),
    fullPage: true,
  })

  const logisticsAfterUiLogin = await page.evaluate(() =>
    localStorage.getItem('zhihui_token'),
  )
  assert.ok(logisticsAfterUiLogin, '页面登录后应保存后勤 token')
  let current = (await call(`/repairs/${repair.id}`, logisticsAfterUiLogin)).repair
  await expectError(
    `/repairs/${repair.id}/result`,
    logisticsAfterUiLogin,
    {
      version: current.version,
      result: '重复提交第二次结果',
      requestId: requestId(),
    },
    409,
    'POST',
  )

  current = (
    await call(`/repairs/${repair.id}/feedback`, student, {
      version: current.version,
      decision: 'objection',
      reason: '表面不再滴水，但楼下天花板仍有渗水痕迹。',
      requestId: requestId(),
    })
  ).repair
  assert.equal(current.status, 'objection_pending_response')
  await expectError(
    `/repairs/${repair.id}/feedback`,
    student,
    {
      version: current.version,
      decision: 'satisfied',
      requestId: requestId(),
    },
    409,
  )

  await page.getByRole('button', { name: /刷新报修/ }).click()
  await repairCard.getByLabel('异议书面说明').waitFor()
  await page.screenshot({
    path: path.join(evidenceDir, 'd-direct-repair-objection.png'),
    fullPage: true,
  })
  await repairCard.getByLabel('异议书面说明').fill('已复查上一层排水管，渗水来自相邻房间存量积水，当前漏水点已修复。')
  await repairCard.getByRole('button', { name: '提交异议说明' }).click()
  await repairCard.locator('.status-pill').filter({ hasText: '待辅导员协调' }).waitFor()

  current = (await call(`/repairs/${repair.id}`, logisticsAfterUiLogin)).repair
  await expectError(
    `/repairs/${repair.id}/respond`,
    logisticsAfterUiLogin,
    {
      version: current.version,
      response: '重复回应',
      requestId: requestId(),
    },
    409,
  )
  current = (
    await call(`/repairs/${repair.id}/remind`, counselor, {
      version: current.version,
      note: '请后勤确认相邻房间积水情况，并准备辅导员协调所需材料。',
      requestId: requestId(),
    })
  ).repair
  assert.equal(current.status, 'pending_coordination')
  current = (
    await call(`/repairs/${repair.id}/coordinate`, counselor, {
      version: current.version,
      conclusion: '后勤现场修复属实，楼下痕迹为相邻房间存量积水，双方理解差异已核实。',
      followUp: '辅导员联系相邻房间学生并安排一次回访。',
      owner: '陈予安',
      dueAt: '2026-11-20T10:00:00.000Z',
      requestId: requestId(),
    })
  ).repair
  assert.equal(current.status, 'coordinated_closed')
  assert.equal(current.terminal, true)

  await expectError(
    `/tickets/${repair.id}/reopen`,
    student,
    { reason: '尝试旧返工接口' },
    404,
  )
  await expectError(
    `/issue-bundles/${repair.id}/${repair.id}/redispatch`,
    counselor,
    {},
    404,
  )
  await expectError(
    `/repairs/${repair.id}/feedback`,
    student,
    {
      version: current.version,
      decision: 'objection',
      reason: '再次无限异议',
      requestId: requestId(),
    },
    409,
  )

  const satisfiedRepair = await createRepair(student, '宿舍门锁卡住，需要检查锁舌。')
  let satisfied = (
    await call(`/repairs/${satisfiedRepair.id}/claim`, logisticsAfterUiLogin, {
      version: satisfiedRepair.version,
      requestId: requestId(),
    })
  ).repair
  satisfied = (
    await call(`/repairs/${satisfiedRepair.id}/result`, logisticsAfterUiLogin, {
      version: satisfied.version,
      result: '已调整锁舌位置并测试三次，开关正常。',
      requestId: requestId(),
    })
  ).repair
  satisfied = (
    await call(`/repairs/${satisfiedRepair.id}/feedback`, student, {
      version: satisfied.version,
      decision: 'satisfied',
      requestId: requestId(),
    })
  ).repair
  assert.equal(satisfied.status, 'satisfied')
  assert.equal(satisfied.terminal, true)

  const raceRepair = await createRepair(student, '楼道灯不亮，需要更换灯具。')
  const race = await Promise.all([
    rawCall(`/repairs/${raceRepair.id}/claim`, logisticsAfterUiLogin, {
      version: raceRepair.version,
      requestId: requestId(),
    }),
    rawCall(`/repairs/${raceRepair.id}/claim`, otherLogistics, {
      version: raceRepair.version,
      requestId: requestId(),
    }),
  ])
  assert.deepEqual(race.map((item) => item.status).sort(), [200, 409])

  const timeoutRepair = await createRepair(student, '公共水龙头关闭后仍持续滴水。')
  let timeoutCase = (
    await call(`/repairs/${timeoutRepair.id}/claim`, logisticsAfterUiLogin, {
      version: timeoutRepair.version,
      requestId: requestId(),
    })
  ).repair
  timeoutCase = (
    await call(`/repairs/${timeoutRepair.id}/result`, logisticsAfterUiLogin, {
      version: timeoutCase.version,
      result: '已更换阀芯。',
      requestId: requestId(),
    })
  ).repair
  timeoutCase = (
    await call(`/repairs/${timeoutRepair.id}/feedback`, student, {
      version: timeoutCase.version,
      decision: 'objection',
      reason: '夜间仍能听到持续滴水声。',
      requestId: requestId(),
    })
  ).repair
  timeoutCase = (
    await call(`/repairs/${timeoutRepair.id}/coordinate`, counselor, {
      version: timeoutCase.version,
      conclusion: '后勤未在配置期限内补充回应。',
      followUp: '人工决定是否新建关联维修任务。',
      owner: '陈予安',
      dueAt: '2026-11-21T10:00:00.000Z',
      requestId: requestId(),
    })
  ).repair
  assert.equal(timeoutCase.status, 'coordinated_closed')
  assert.equal(timeoutCase.coordination.responseOverdue, true)

  await expectError('/counselor/dashboard', logisticsAfterUiLogin, null, 403)
  await expectError(
    `/repairs/${repair.id}/claim`,
    outsideLogistics,
    { version: 1, requestId: requestId() },
    403,
  )

  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(
    mobile.scrollWidth <= mobile.viewport,
    `手机宽度发生横向溢出：${mobile.scrollWidth} > ${mobile.viewport}`,
  )

  console.log('PASS 学生报修直达后勤，不经过辅导员前置审核')
  console.log('PASS 后勤仅读取责任范围，抢单并发只成功一次')
  console.log('PASS 一次处置结果提交后锁定，等待学生反馈')
  console.log('PASS 学生只能异议一次，后勤回应后交辅导员协调')
  console.log('PASS 协调结案为终态，旧 reopen 路径返回 404')
  console.log('PASS 满意路径与无回应超时协调路径分别可用')
  console.log('PASS 后勤不能进入辅导员看板，390px 无横向溢出')
} finally {
  await browser?.close()
  await vite?.close()
  if (server.exitCode === null) {
    server.kill()
    await once(server, 'exit').catch(() => {})
  }
  await rm(dir, { recursive: true, force: true })
}
