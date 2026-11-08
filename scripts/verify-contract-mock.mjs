import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
const page = await context.newPage()
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(err.message))

await page.goto('http://127.0.0.1:5180/contract-demo/tickets', { waitUntil: 'networkidle' })
await page.getByText('health 已通过').waitFor({ timeout: 10000 })
await page.getByText('6 条工单').waitFor({ timeout: 10000 })
console.log('mock page loaded:', await page.locator('.contract-ticket').count(), 'tickets')
await page.screenshot({ path: 'screenshots/contract-demo-mock.png' })

await page.getByRole('button', { name: '进行中' }).click()
await page.getByText('5 条工单').waitFor({ timeout: 5000 })
console.log('active filter:', await page.locator('.contract-ticket').count())

await page.getByRole('button', { name: '已办结' }).click()
await page.getByText('1 条工单').waitFor({ timeout: 5000 })
console.log('completed filter:', await page.locator('.contract-ticket').count())
await page.screenshot({ path: 'screenshots/contract-demo-completed.png' })

console.log('mode:', await page.locator('.contract-mode-badge').innerText())
console.log('health:', await page.locator('.contract-health strong').innerText())
console.log('errors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
