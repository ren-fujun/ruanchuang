import { chromium } from 'playwright'
import fs from 'node:fs'

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8787'
const errors = []
fs.mkdirSync('screenshots/e2e', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
})
const page = await context.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('503')) errors.push(`[console] ${msg.text()}`)
})
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /学生视角/ }).click()
await page.waitForURL('**/student/home')
await page.goto(`${base}/student/new`, { waitUntil: 'networkidle' })
await page.locator('textarea').fill('宿舍洗手台水龙头一直漏水，已经漏到柜子里了，物业电话打不通，希望今天尽快上门处理。')
await page.getByRole('button', { name: /让 AI 先看看/ }).click()
await page.getByText('AI 预检完成').waitFor({ timeout: 8000 })
await page.screenshot({ path: 'screenshots/e2e/01-ai-review.png' })
await page.getByRole('button', { name: /^(确认提交|仍要提交)$/ }).click()
await page.getByText('已经接住了。').waitFor({ timeout: 8000 })
await page.screenshot({ path: 'screenshots/e2e/02-submitted.png' })
await page.getByRole('button', { name: /查看办理进度/ }).click()
await page.waitForURL('**/student/tickets/**')
const ticketId = new URL(page.url()).pathname.split('/').pop()
await page.getByText('AI 已整理，等待老师审核').waitFor({ timeout: 8000 })
console.log('student submit OK')

// Counselor flow in a new context
const counselorContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
})
const cou = await counselorContext.newPage()
cou.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[c-counselor console] ${msg.text()}`)
})
cou.on('pageerror', (err) => errors.push(`[c-counselor pageerror] ${err.message}`))
await cou.goto(`${base}/login`, { waitUntil: 'networkidle' })
await cou.getByRole('button', { name: /辅导员视角/ }).click()
await cou.waitForURL('**/counselor/home')
await cou.goto(`${base}/counselor/tickets/${ticketId}`, { waitUntil: 'networkidle' })
await cou.waitForURL('**/counselor/tickets/**')
await cou.getByRole('button', { name: /审核并分派/ }).click()
await cou.getByRole('button', { name: '一键采纳' }).click()
await cou.screenshot({ path: 'screenshots/e2e/03-review-sheet.png' })
await cou.getByRole('button', { name: '确认分派' }).click()
await cou.getByText('已分派，等待部门接单').waitFor({ timeout: 8000 })
console.log('counselor review OK')
await cou.getByRole('button', { name: /记录部门接单/ }).click()
await cou.getByRole('button', { name: '确认接单' }).click()
await cou.getByText('协同处理中').waitFor({ timeout: 8000 })
console.log('counselor accept OK')
await cou.getByRole('button', { name: /录入处置结果/ }).click()
await cou.locator('textarea.review-note').fill('维修师傅已上门更换水龙头并完成防水处理，柜体已擦干，现场无渗漏。')
await cou.getByRole('button', { name: /完成并通知学生/ }).click()
await cou.getByText('已办结，等待学生确认').waitFor({ timeout: 8000 })
await cou.screenshot({ path: 'screenshots/e2e/04-resolved.png' })
console.log('counselor resolve OK')

// Student confirms and rates
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: '确认办结' }).click()
await page.getByRole('button', { name: /确认办结并评价/ }).click()
await page.getByText('这件事，已收尾。', { exact: true }).waitFor({ timeout: 8000 })
await page.screenshot({ path: 'screenshots/e2e/05-student-completed.png' })
console.log('student confirm OK')

// A precheck outage must preserve the form and keep manual submission available.
await page.goto(base + '/student/new', { waitUntil: 'networkidle' })
await page.route('**/api/ai/precheck', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '模拟预检服务暂不可用' }) }))
await page.locator('textarea').fill('教学楼走廊照明损坏，请安排后勤检查并维修。')
await page.getByRole('button', { name: /让 AI 先看看/ }).click()
await page.getByText('你的描述已经为你保留').waitFor()
await page.getByRole('button', { name: '核对后提交草稿' }).click()
await page.getByText('已经接住了。').waitFor()
await page.unroute('**/api/ai/precheck')
console.log('precheck outage manual submit OK')

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
if (errors.length) process.exitCode = 1
