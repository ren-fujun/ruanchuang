import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer as createViteServer } from 'vite'
import { seedData } from '../../server/seed.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
process.chdir(root)

const dir = await mkdtemp(path.join(os.tmpdir(), 'logistics-e2e-'))
const dataFile = path.join(dir, 'store.json')
const data = seedData()

data.users.push({
  id: 'logistics-other',
  role: 'logistics',
  name: '其他后勤人员',
  account: 'logistics-other',
  password: '123456',
  department: '后勤保障处',
})
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
      // The isolated server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(logs || 'API 启动超时')
}

async function call(pathname, token, body, method = body ? 'POST' : 'GET') {
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
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status}: ${data?.msg || data?.message || ''}`)
  }
  return data
}

async function login(account, role) {
  return (await call('/auth/login', null, { account, password: '123456', role })).token
}

let browser
let vite
try {
  await waitForServer()

  const counselor = await login('chenyuan', 'counselor')
  const pending = (await call('/tickets?status=pending_review&pageSize=50', counselor)).tickets
  const logisticsTickets = pending.filter((ticket) => ticket.departmentIds?.includes('logistics'))
  const firstTicket = logisticsTickets.find((ticket) => ticket.studentId === 'stu-lin')
  const secondTicket = logisticsTickets.find(
    (ticket) => ticket.id !== firstTicket?.id && ticket.studentId !== 'stu-lin',
  )
  assert.ok(firstTicket && secondTicket, '演示数据不足两条后勤待审核诉求')

  const bundle = (
    await call('/issue-bundles', counselor, {
      ticketIds: [firstTicket.id, secondTicket.id],
      note: 'D端自动化回归',
    })
  ).bundle
  assert.equal(bundle.status, 'draft')

  const dispatched = (
    await call(`/issue-bundles/${bundle.id}/dispatch`, counselor, {
      recipientId: 'logistics-demo',
    })
  ).bundle
  assert.equal(dispatched.status, 'dispatched')
  assert.deepEqual(
    dispatched.items.map((item) => item.status),
    ['sent', 'sent'],
  )

  const logistics = await login('logistics', 'logistics')
  const otherLogistics = await login('logistics-other', 'logistics')
  const ownOrders = await call('/logistics/work-orders', logistics)
  const otherOrders = await call('/logistics/work-orders', otherLogistics)
  assert.equal(ownOrders.items.length, 2)
  assert.equal(otherOrders.items.length, 0)

  let counselorDenied = false
  try {
    await call('/counselor/dashboard', logistics)
  } catch (error) {
    counselorDenied = /403/.test(error.message)
  }
  assert.equal(counselorDenied, true, '后勤账号不应进入辅导员看板')

  let denied = false
  try {
    await call(
      `/logistics/work-orders/${bundle.id}/${firstTicket.id}`,
      otherLogistics,
      { action: 'accept' },
    )
  } catch (error) {
    denied = /404/.test(error.message)
  }
  assert.equal(denied, true, '其他后勤账号不应能操作已分派事项')

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
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${vitePort}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '进入后勤工作台' }).click()
  await page.getByText('后勤事项逐项办理').waitFor()

  const firstItem = page.locator('.work-item').filter({ hasText: firstTicket.id })
  const secondItem = page.locator('.work-item').filter({ hasText: secondTicket.id })
  await firstItem.getByRole('button', { name: '接收此事项' }).click()
  await firstItem.getByLabel('处理结果').fill('已现场核查并完成处置，复测正常。')
  await firstItem.getByRole('button', { name: '提交处理结果' }).click()
  await firstItem.locator('.status-pill').filter({ hasText: '已处理，待学生确认' }).waitFor()
  await secondItem.locator('.status-pill').filter({ hasText: '待接收' }).waitFor()
  await secondItem.getByRole('button', { name: '接收此事项' }).waitFor()

  const logisticsAfterBrowserLogin = await login('logistics', 'logistics')
  const afterActions = await call('/logistics/work-orders', logisticsAfterBrowserLogin)
  assert.deepEqual(
    afterActions.items.map((item) => item.status),
    ['resolved', 'sent'],
  )

  const firstAfter = (
    await call(`/tickets/${firstTicket.id}`, counselor)
  ).ticket
  const secondAfter = (
    await call(`/tickets/${secondTicket.id}`, counselor)
  ).ticket
  assert.equal(firstAfter.status, 'awaiting_confirm')
  assert.equal(secondAfter.status, 'assigned')

  const student = await login('20230118', 'student')
  const confirmed = (
    await call(`/tickets/${firstTicket.id}/confirm`, student, {
      score: 5,
      comment: '后勤处理及时',
      tags: ['处理及时'],
    })
  ).ticket
  assert.equal(confirmed.status, 'completed')

  const finalSecond = (
    await call(`/tickets/${secondTicket.id}`, counselor)
  ).ticket
  assert.equal(finalSecond.status, 'assigned', '第一条确认后不得连带关闭第二条')

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileLayout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(
    mobileLayout.scrollWidth <= mobileLayout.viewport,
    `手机宽度发生横向溢出：${mobileLayout.scrollWidth} > ${mobileLayout.viewport}`,
  )

  console.log('PASS 后勤问题包列表与接收人范围隔离')
  console.log('PASS 后勤页面逐项接收并提交处理结果')
  console.log('PASS 单事项完成不关闭同包其他事项')
  console.log('PASS 学生确认后原工单正确办结')
  console.log('PASS 后勤身份不能进入辅导员看板')
  console.log('PASS 390px 手机宽度无横向溢出')
} finally {
  await browser?.close()
  await vite?.close()
  if (server.exitCode === null) {
    server.kill()
    await once(server, 'exit').catch(() => {})
  }
  await rm(dir, { recursive: true, force: true })
}
