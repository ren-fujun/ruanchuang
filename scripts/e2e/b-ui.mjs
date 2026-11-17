import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:5195')
  await page.getByLabel('账号', { exact: true }).fill('mentor')
  await page.getByLabel('密码', { exact: true }).fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator('.case-row').first().click()
  await page
    .getByLabel('必要工作记录')
    .fill('已联系学生，约定本周讨论学习计划。')
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await page.getByText('状态：已联系', { exact: false }).waitFor()
  await page.getByLabel('办理动作').selectOption('interview')
  await page.getByLabel('必要工作记录').fill('已完成面谈，明确课程复习计划。')
  await page.getByRole('button', { name: '保存记录', exact: true }).click()
  await page.getByText('状态：已面谈', { exact: false }).waitFor()
  await mkdir('.tmp/b-ui', { recursive: true })
  await page.screenshot({ path: '.tmp/b-ui/mentor.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.getByLabel('账号', { exact: true }).fill('chenyuan')
  await page.getByLabel('密码', { exact: true }).fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '知识审核与版本' }).click()
  await page.getByLabel('标题', { exact: true }).fill('测试：实验室预约')
  await page.getByLabel('关键词（用顿号分隔）').fill('实验室、预约')
  await page.getByLabel('来源说明').fill('演示资料，仅用于测试')
  await page.getByLabel('责任部门').fill('教务处')
  await page.getByLabel('有效期').fill('2099-01-01')
  await page
    .getByLabel('经核对的标准答案')
    .fill('请查看学院公布的实验室空闲时段，提交申请后等待管理员确认。')
  await page.getByRole('button', { name: '保存草稿' }).click()
  await page.getByRole('heading', { name: '测试：实验室预约 · v1' }).waitFor()
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.getByLabel('账号', { exact: true }).fill('reviewer')
  await page.getByLabel('密码', { exact: true }).fill('123456')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '知识审核与版本' }).click()
  await page.getByLabel('审核意见', { exact: true }).fill('演示资料复核通过')
  await page.getByRole('button', { name: '审核发布' }).last().click()
  await page.getByText('已发布 · 教务处', { exact: false }).last().waitFor()
  const student = await browser.newPage({
    viewport: { width: 390, height: 844 },
  })
  student.on('pageerror', (e) => errors.push(e.message))
  await student.goto('http://127.0.0.1:5191/login')
  await student.getByRole('button', { name: /学生视角/ }).click()
  await student.getByRole('button', { name: 'AI 咨询与追问' }).click()
  await student.getByLabel('咨询内容').fill('实验室如何预约')
  await student.getByRole('button', { name: '发送', exact: true }).click()
  await student.getByText('依据：测试：实验室预约', { exact: false }).waitFor()
  await student.screenshot({ path: '.tmp/b-ui/assistant.png', fullPage: true })
  await student.getByRole('button', { name: '确认将摘要提交辅导员' }).click()
  await student.waitForURL('**/student/tickets/**')
  assert.deepEqual(errors, [])
  console.log(
    'B_BROWSER_OK: mentor contact/interview, knowledge author/reviewer publish, student grounded answer and ticket handoff; mobile layout',
  )
} finally {
  await browser.close()
}
