// Browser contract test: actual app/auth/appointments; consultation responses explicitly stubbed.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { chromium } from 'playwright'
import { createServer as createViteServer } from 'vite'
import { bTrialFixture } from '../fixtures/b-trial.mjs'
await fs.mkdir('.tmp/rag-ui', { recursive: true })
const dir = await fs.mkdtemp(path.resolve('.tmp/rag-ui/run-'))
const freePort = async () => { const server = createServer().listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(r => server.close(r)); return port }
const port = await freePort(), webPort = await freePort(), store = path.join(dir, 'store.json')
const fixture = bTrialFixture(); await fs.writeFile(store, JSON.stringify(fixture))
const processes = [], errors = []; let browser, page, web
function start(args, env) { const child = spawn(process.execPath, args, { windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); processes.push(child); return child }
const wait = async url => { for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.status < 500) return } catch {} await new Promise(r => setTimeout(r, 100)) } throw new Error(`Startup failed: ${url}`) }
try {
  start(['server/index.js'], { PORT: String(port), ZHIHUI_DATA_FILE: store, DEEPSEEK_API_KEY: '', EMBEDDING_API_KEY: '', B_DEMO: 'false' })
  await wait(`http://127.0.0.1:${port}/api/me`)
  web = await createViteServer({ server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: true } } } })
  await web.listen()
  await wait(`http://127.0.0.1:${webPort}`)
  // Vite's configured API target can differ; route actual API requests to our isolated server.
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); page.on('pageerror', error => errors.push(error.message))
  const response = { sessionId: 'stub-session', answer: '此处为界面合成测试：可提交复核申请。[1]', engine: 'hybrid-rag', traceId: 'stub-trace', clarification: null,
    citations: [{ id: 'stub-evidence', title: '合成测试资料', excerpt: '仅用于验证展示，不代表学校政策。', source: 'https://example.org/policy', scope: { school: '合成学校', college: '合成学院', grades: ['2023'] } }],
    actionDraft: { topic: '综测复核咨询', minutes: 15, sourceTurn: 1, summary: '合成学生咨询内容', materials: [], questions: ['请老师确认办理期限'] } }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/ai/consult' && route.request().method() === 'POST') return route.fulfill({ json: response })
    if (url.pathname === '/api/ai/consult/stub-session' && route.request().method() === 'GET') return route.fulfill({ json: { id: response.sessionId, turns: [{ text: '综测复核怎么做', result: response }] } })
    if (url.pathname.includes('/feedback')) return route.fulfill({ json: { ok: true } })
    return route.continue()
  })
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: fixture.users.find(u => u.id === 'stu-lin').account, password: '123456' }) })
  assert.equal(login.status, 200); const auth = await login.json()
  await page.goto(`http://127.0.0.1:${webPort}`); await page.evaluate(token => localStorage.setItem('zhihui_token', token), auth.token)
  await page.goto(`http://127.0.0.1:${webPort}/student/assistant`)
  await page.getByLabel('咨询内容').fill('综测复核怎么做'); await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByText('此处为界面合成测试：可提交复核申请。[1]', { exact: true }).waitFor()
  await page.getByText('合成测试资料', { exact: true }).click(); assert.ok(await page.getByRole('link', { name: '查看资料原文' }).isVisible())
  assert.ok(!(await page.locator('body').innerText()).includes('[object Object]'))
  await page.reload(); await page.getByText('预约草稿（可编辑）', { exact: true }).waitFor()
  for (const width of [390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: path.join(dir, `student-${width}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: '带入预约申请' }).click()
  await page.getByRole('heading', { name: '申请预约' }).waitFor()
  assert.ok(page.url().includes('consultationSessionId=stub-session'))
  assert.ok(page.url().includes('consultationTurn=1'))
  // Teacher editor contract uses explicit synthetic appointment/model responses.
  const teacherLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: fixture.users.find(u => u.id === 'cou-chen').account, password: '123456' }) })
  assert.equal(teacherLogin.status, 200)
  const teacherAuth = await teacherLogin.json()
  const appointment = { id: 'synthetic-editor', version: 1, topic: '合成综测预约', studentName: '合成学生', ownerName: '合成老师', status: 'scheduled', unread: 0 }
  let releaseDraft, draftRequested = false, savedOutcome = null
  await page.route('**/api/appointments', route => route.fulfill({ json: { items: [appointment] } }))
  await page.route('**/api/appointments/slots', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/api/appointments/synthetic-editor/outcome-draft', async route => {
    draftRequested = true
    await new Promise(resolve => { releaseDraft = resolve })
    await route.fulfill({ json: { item: { draft: '1. 说明渠道\n2. 等待材料', engine: 'model-organized' } } })
  })
  await page.route('**/api/appointments/synthetic-editor/complete', async route => {
    savedOutcome = route.request().postDataJSON().outcome
    appointment.status = 'completed'
    await route.fulfill({ json: { item: appointment } })
  })
  await page.evaluate(token => localStorage.setItem('zhihui_token', token), teacherAuth.token)
  await page.goto(`http://127.0.0.1:${webPort}/counselor/appointments`)
  await page.getByLabel('帮扶结果').fill('说明渠道；等待材料')
  await page.getByRole('button', { name: '整理处理要点', exact: true }).click()
  await waitFor(() => draftRequested)
  await page.getByLabel('帮扶结果').fill('老师在等待时修改的新记录')
  releaseDraft()
  await page.getByText('内容或预约已变化，保留当前输入。', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('帮扶结果').inputValue(), '老师在等待时修改的新记录')
  assert.equal(savedOutcome, null)
  for (const width of [390, 412]) {
    await page.setViewportSize({ width, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: path.join(dir, `counselor-${width}.png`), fullPage: true })
  }
  draftRequested = false
  await page.getByLabel('帮扶结果').fill('说明渠道；等待材料')
  await page.getByRole('button', { name: '整理处理要点', exact: true }).click()
  await waitFor(() => draftRequested)
  releaseDraft()
  await page.getByText('已整理原始要点，请核对后确认保存。', { exact: true }).waitFor()
  assert.equal(savedOutcome, null)
  assert.equal(await page.getByLabel('帮扶结果').inputValue(), '1. 说明渠道\n2. 等待材料')
  await page.getByRole('button', { name: '完成并记录结果', exact: true }).click()
  await waitFor(() => savedOutcome !== null)
  assert.equal(savedOutcome, '1. 说明渠道\n2. 等待材料')
  assert.equal(errors.length, 0, errors.join('\n'))
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify({ passed: true, evidence: 'browser-contract-consultation-and-teacher-editor-stubbed', widths: [390, 412], checks: ['citation-object-render', 'session-restore', 'editable-draft-navigation', 'async-draft-keeps-new-edits', 'teacher-confirms-before-save', 'no-overflow', 'no-runtime-errors'] }, null, 2))
  console.log(`PASS (consultation stubbed): ${dir}`)
} catch (error) {
  if (page) { console.error(JSON.stringify({ url: page.url(), body: await page.locator('body').innerText(), errors })); await page.screenshot({ path: path.join(dir, 'failure.png'), fullPage: true }) }
  throw error
} finally {
  await browser?.close()
  await web?.close()
  for (const child of processes.reverse()) if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped }
}
async function waitFor(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)) } throw new Error('Timed out waiting for editor response') }
