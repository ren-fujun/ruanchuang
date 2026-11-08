import { chromium } from 'playwright'

const base = 'http://127.0.0.1:5180'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /辅导员视角/ }).click()
await page.waitForURL('**/counselor/home')
await page.goto(`${base}/counselor/dorm-check`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: 'screenshots/dorm-check.png' })
console.log('rooms:', await page.locator('.dorm-room').count())

await page.locator('.dorm-room', { hasText: '404' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: 'screenshots/dorm-check-sheet.png' })
console.log('sheet:', await page.getByText('查寝打卡 · 404').count())
console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
