import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:8787'
fs.mkdirSync('screenshots/purple', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /学生视角/ }).click()
await page.waitForURL('**/student/home')
await page.waitForTimeout(600)
await page.screenshot({ path: 'screenshots/purple/home.png' })
await page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 500 }))
await page.screenshot({ path: 'screenshots/purple/home-scroll.png' })

await page.goto(`${base}/student/tickets`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: 'screenshots/purple/tickets.png' })

await page.goto(`${base}/student/tickets/ZX20261107018`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: 'screenshots/purple/detail.png' })
await page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 560 }))
await page.screenshot({ path: 'screenshots/purple/detail-scroll.png' })

await page.goto(`${base}/student/new`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/purple/new.png' })

await page.goto(`${base}/student/profile`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/purple/profile.png' })

await page.goto(`${base}/student/messages`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/purple/messages.png' })

console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
