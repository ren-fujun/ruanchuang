import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:8787'
fs.mkdirSync('screenshots/360', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (err) => errors.push(err.message))
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'screenshots/360/login.png' })
await page.getByRole('button', { name: /学生视角/ }).click()
await page.waitForURL('**/student/home')
await page.screenshot({ path: 'screenshots/360/student-home.png' })
await page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 520 }))
await page.screenshot({ path: 'screenshots/360/student-home-scroll.png' })
await page.goto(`${base}/student/tickets`, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'screenshots/360/student-tickets.png' })

const couContext = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
const cou = await couContext.newPage()
cou.on('pageerror', (err) => errors.push(err.message))
await cou.goto(`${base}/login`, { waitUntil: 'networkidle' })
await cou.getByRole('button', { name: /辅导员视角/ }).click()
await cou.waitForURL('**/counselor/home')
await cou.screenshot({ path: 'screenshots/360/counselor-home.png' })
await cou.goto(`${base}/counselor/insights`, { waitUntil: 'networkidle' })
await cou.screenshot({ path: 'screenshots/360/counselor-insights.png' })

console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
