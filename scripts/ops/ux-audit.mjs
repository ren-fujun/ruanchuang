import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const evidenceDir = '.tmp/ux-audit'
mkdirSync(evidenceDir, { recursive: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const observations = []

await page.goto('http://127.0.0.1:5191', { waitUntil: 'networkidle' })
await page.getByLabel('账号', { exact: true }).fill('20230118')
await page.getByLabel('密码', { exact: true }).fill('123456')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.waitForURL('**/student/home')
await page.getByRole('heading', { name: '正在跟进', exact: true }).waitFor()
const beforeHome = await page.locator('body').innerText()
const beforeMetrics = await page.locator('.c-metrics').innerText()
observations.push({
  step: 'student-home',
  metrics: beforeMetrics.replaceAll('\n', ' '),
  hasDormQuickEntry: beforeHome.includes('宿舍报修'),
  hasAIEntry: beforeHome.includes('AI 问答'),
})
await page.screenshot({
  path: `${evidenceDir}/student-home.png`,
  fullPage: true,
})

await page.getByRole('button', { name: '宿舍报修', exact: true }).click()
await page.waitForURL('**/student/repairs/new')
await page.getByRole('heading', { name: '提交报修', exact: true }).waitFor()
await page.getByLabel('报修类型').waitFor()
const form = await page.locator('body').innerText()
observations.push({
  step: 'repair-form',
  copyExplainsDirectLogistics: form.includes('直接') || form.includes('后勤'),
  fields: ['报修类型', '校区', '楼栋', '房间或区域', '故障描述'].filter((label) => form.includes(label)),
})
await page.getByLabel('报修类型').selectOption('水电')
await page.getByLabel('校区').selectOption('主校区')
await page.getByLabel('楼栋').selectOption('dorm-3')
await page.getByLabel('房间或区域').selectOption('412')
await page.getByLabel('故障描述').fill('体验测试：洗手池下方持续渗水，需要后勤检查。')
await page.getByRole('button', { name: '确认提交', exact: true }).click()
await page.waitForURL('**/student/repairs/**')
await page.getByRole('heading', { name: '报修进度', exact: true }).waitFor()
const detail = await page.locator('body').innerText()
observations.push({
  step: 'repair-detail',
  showsStatus: detail.includes('待后勤分配'),
  showsNextStep: detail.includes('等待后勤分配') || detail.includes('下一步'),
})
await page.screenshot({
  path: `${evidenceDir}/repair-detail.png`,
  fullPage: true,
})

await page.goto('http://127.0.0.1:5191/student/home', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: '正在跟进', exact: true }).waitFor()
await page.waitForTimeout(1500)
const afterHome = await page.locator('body').innerText()
const afterMetrics = await page.locator('.c-metrics').innerText()
const apiRepairs = await page.evaluate(async () => {
  const token = localStorage.getItem('zhihui_token') || ''
  const response = await fetch('/api/repairs', {
    headers: { Authorization: 'Bearer ' + token },
  })
  return { status: response.status, body: await response.json() }
})
observations.push({
  step: 'return-home',
  metrics: afterMetrics.replaceAll('\n', ' '),
  repairVisibleOnHome: afterHome.includes('水电 · 学生公寓 3 号楼 412'),
  apiRepairCount: apiRepairs.body?.items?.length ?? -1,
})
await page.screenshot({
  path: `${evidenceDir}/home-after-repair.png`,
  fullPage: true,
})

await page.goto('http://127.0.0.1:5191/student/repairs', { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: '我的报修', exact: true }).waitFor()
await page.waitForTimeout(1500)
const repairList = await page.locator('body').innerText()
observations.push({
  step: 'repair-list',
  repairVisibleUnderRepairs: repairList.includes('水电 · 学生公寓 3 号楼 412'),
})
await page.screenshot({
  path: `${evidenceDir}/repair-list.png`,
  fullPage: true,
})

console.log(JSON.stringify(observations, null, 2))
await browser.close()
