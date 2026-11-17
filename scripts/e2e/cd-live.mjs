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
let counselorVite
let studentVite
try {
  await waitForServer()

  let counselor = await login('chenyuan', 'counselor')
  const pending = (await call('/tickets?status=pending_review&pageSize=50', counselor)).tickets
  const logisticsTickets = pending.filter((ticket) => ticket.departmentIds?.includes('logistics'))
  const firstTicket = logisticsTickets.find((ticket) => ticket.studentId === 'stu-lin')
  const secondTicket = logisticsTickets.find(
    (ticket) => ticket.id !== firstTicket?.id && ticket.studentId !== 'stu-lin',
  )
  assert.ok(firstTicket && secondTicket, '演示数据不足两条后勤待审核诉求')

  const edgePath = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => existsSync(candidate))
  if (!edgePath) throw new Error('未找到 Microsoft Edge')
  browser = await chromium.launch({ executablePath: edgePath, headless: true })
  process.env.PORTAL_API_URL = apiBase
  counselorVite = await createViteServer({ configFile:'apps/counselor/vite.config.mjs', server:{port:await freePort(),open:false} })
  await counselorVite.listen()
  const teacher = await browser.newPage()
  const teacherBase = `http://127.0.0.1:${counselorVite.config.server.port}`
  await teacher.goto(`${teacherBase}/login`)
  await teacher.getByRole('button',{name:'体验辅导员演示账号'}).click()
  await teacher.waitForURL('**/counselor/home')
  await teacher.goto(`${teacherBase}/counselor/bundles`)
  await teacher.getByLabel('问题包名称').fill('联调宿舍问题')
  await teacher.locator('select').first().selectOption('logistics')
  await teacher.locator('label.c-choice').filter({hasText:firstTicket.title}).locator('input').check()
  await teacher.locator('label.c-choice').filter({hasText:secondTicket.title}).locator('input').check()
  await teacher.getByLabel('我已逐条核对诉求、风险和目标部门').check()
  await teacher.getByRole('button',{name:'建立待转交问题包'}).click()
  await teacher.waitForURL('**/counselor/bundles/*')
  const bundle = { id: teacher.url().split('/').pop() }
  await teacher.getByLabel('说明').fill('已逐条核对，请后勤处理')
  await teacher.getByLabel('已核对本包全部诉求及目标部门').check()
  await teacher.getByRole('button',{name:'确认转交'}).click()
  await teacher.getByText('问题包已转交',{exact:true}).waitFor()
  counselor = await login('chenyuan', 'counselor')

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

  studentVite = await createViteServer({configFile:'apps/student/vite.config.mjs', server:{port:await freePort(),open:false}})
  await studentVite.listen()
  const studentPage=await browser.newPage()
  const studentBase=`http://127.0.0.1:${studentVite.config.server.port}`
  await studentPage.goto(`${studentBase}/login`)
  await studentPage.getByRole('button',{name:'体验学生演示账号'}).click()
  await studentPage.waitForURL('**/student/home')
  await studentPage.goto(`${studentBase}/student/tickets/${firstTicket.id}`)
  await studentPage.getByRole('button',{name:'确认办结',exact:true}).click()
  await studentPage.getByRole('button',{name:'暂不评价，直接确认'}).click()
  await studentPage.getByText('这件事，已收尾。').waitFor()
  const student=await login('20230118','student')
  assert.equal((await call(`/tickets/${firstTicket.id}`,student)).ticket.status,'completed')

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

  console.log('PASS C辅导员页面创建并转交真实问题包')
  console.log('PASS 后勤问题包列表与接收人范围隔离')
  console.log('PASS 后勤页面逐项接收并提交处理结果')
  console.log('PASS 单事项完成不关闭同包其他事项')
  console.log('PASS C学生页面确认后原工单正确办结')
  console.log('PASS 后勤身份不能进入辅导员看板')
  console.log('PASS 390px 手机宽度无横向溢出')
} finally {
  await browser?.close()
  await counselorVite?.close()
  await studentVite?.close()
  await vite?.close()
  if (server.exitCode === null) {
    server.kill()
    await once(server, 'exit').catch(() => {})
  }
  await rm(dir, { recursive: true, force: true })
}
