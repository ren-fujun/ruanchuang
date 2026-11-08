import { chromium } from 'playwright'
import fs from 'node:fs'

const outDir = 'screenshots'
fs.mkdirSync(outDir, { recursive: true })
const base = 'http://127.0.0.1:8787'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = []

async function makePage(viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`)
  })
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
  return { context, page }
}

async function shot(page, name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${outDir}/${name}.png` })
  console.log('shot', name)
}

const desktop = await makePage({ width: 1440, height: 900 })
await desktop.page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await shot(desktop.page, '01-login-desktop')

const mobile = await makePage({ width: 390, height: 844 })
await mobile.page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await shot(mobile.page, '02-login-mobile')

await mobile.page.getByRole('button', { name: /学生视角/ }).click()
await mobile.page.waitForURL('**/student/home')
await shot(mobile.page, '03-student-home')
await mobile.page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 560 }))
await shot(mobile.page, '03b-student-home-scroll')

await mobile.page.goto(`${base}/student/tickets`, { waitUntil: 'networkidle' })
await shot(mobile.page, '04-student-tickets')

await mobile.page.getByText('宿舍热水时冷时热，晚上几乎没法洗澡').first().click()
await mobile.page.waitForURL('**/student/tickets/**')
await shot(mobile.page, '05-student-detail')
await mobile.page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 620 }))
await shot(mobile.page, '05b-student-detail-scroll')

await mobile.page.goto(`${base}/student/new`, { waitUntil: 'networkidle' })
await shot(mobile.page, '06-student-new')
await mobile.page.locator('textarea').fill('宿舍热水已经一周不稳定，晚上十点后基本只有温水，隔壁宿舍也有同样情况，希望尽快检修。')
await mobile.page.getByRole('button', { name: /让 AI 先看看/ }).click()
await mobile.page.waitForTimeout(1800)
await shot(mobile.page, '07-student-ai-review')

await mobile.page.goto(`${base}/student/messages`, { waitUntil: 'networkidle' })
await shot(mobile.page, '08-student-messages')

await mobile.page.goto(`${base}/student/profile`, { waitUntil: 'networkidle' })
await shot(mobile.page, '09-student-profile')

// Counselor
const counselor = await makePage({ width: 390, height: 844 })
await counselor.page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await counselor.page.getByRole('button', { name: /辅导员视角/ }).click()
await counselor.page.waitForURL('**/counselor/home')
await shot(counselor.page, '10-counselor-home')
await counselor.page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 620 }))
await shot(counselor.page, '10b-counselor-home-scroll')

await counselor.page.goto(`${base}/counselor/tickets`, { waitUntil: 'networkidle' })
await shot(counselor.page, '11-counselor-tickets')

await counselor.page.goto(`${base}/counselor/tickets/ZX20261107015`, { waitUntil: 'networkidle' })
await shot(counselor.page, '12-counselor-detail')
await counselor.page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 680 }))
await shot(counselor.page, '12b-counselor-detail-scroll')
await counselor.page.getByRole('button', { name: /审核并分派/ }).click()
await counselor.page.waitForTimeout(500)
await shot(counselor.page, '13-counselor-assign-sheet')

await counselor.page.goto(`${base}/counselor/insights`, { waitUntil: 'networkidle' })
await shot(counselor.page, '14-counselor-insights')
await counselor.page.locator('.app-scroll').evaluate((el) => el.scrollTo({ top: 620 }))
await shot(counselor.page, '14b-counselor-insights-scroll')

// Desktop app
const desktopApp = await makePage({ width: 1440, height: 900 })
await desktopApp.page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await desktopApp.page.getByRole('button', { name: /学生视角/ }).click()
await desktopApp.page.waitForURL('**/student/home')
await shot(desktopApp.page, '15-student-home-desktop')

console.log('\nERRORS:')
console.log(errors.length ? errors.join('\n') : 'none')

await browser.close()
