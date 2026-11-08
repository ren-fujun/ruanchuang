import { chromium } from 'playwright'

const base = 'http://127.0.0.1:8787'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /学生视角/ }).click()
await page.waitForURL('**/student/home')
await page.goto(`${base}/student/new`, { waitUntil: 'networkidle' })
await page.locator('textarea').fill('宿舍洗手台水龙头一直漏水，已经漏到柜子里了，希望今天尽快上门处理。')
await page.getByRole('button', { name: /让 AI 先看看/ }).click()
await page.getByText('AI 预检完成').waitFor({ timeout: 8000 })
await page.waitForTimeout(500)
await page.screenshot({ path: 'screenshots/purple/ai-review.png' })

await page.goto(`${base}/student/tickets/ZX20261107010`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '确认办结' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'screenshots/purple/rating-sheet.png' })

console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
