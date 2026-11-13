import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { seedData } from '../../server/seed.js'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const directory = await mkdtemp(path.join(tmpdir(), 'zhihui-b-'))
const file = path.join(directory, 'store.json'),
  port = process.env.B_TEST_PORT || '18803',
  base = 'http://127.0.0.1:' + port + '/api'
const fixture = seedData()
fixture.users.push({
  id: 'mentor-other',
  role: 'mentor',
  college: '信息工程学院',
  name: '其他导师',
  account: 'mentor-other',
  password: '123456',
})
await writeFile(file, JSON.stringify(fixture))
const child = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: port,
    B_DEMO: 'true',
    ZHIHUI_DATA_FILE: file,
    DEEPSEEK_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let logs = ''
child.stderr.on('data', (b) => (logs += b))
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(Error(logs || '启动超时')), 10000)
  child.stdout.on('data', (b) => {
    if (String(b).includes('已启动')) {
      clearTimeout(timeout)
      resolve()
    }
  })
  child.on('exit', (code) => {
    clearTimeout(timeout)
    reject(Error('服务退出 ' + code + logs))
  })
})
let checks = 0
const call = async (url, token, body, method, status = 200) => {
  const r = await fetch(base + url, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json()
  assert.equal(r.status, status, JSON.stringify(data))
  checks++
  return data
}
try {
  const login = async (account) =>
    (await call('/auth/login', null, { account, password: '123456' })).token
  const mentor = await login('mentor'),
    academic = await login('academic'),
    counselor = await login('chenyuan'),
    reviewer = await login('reviewer'),
    student = await login('20230118')
  await call('/b/cases', null, null, null, 401)
  await call('/b/cases', student, null, null, 403)
  await call('/tickets', mentor, null, null, 403)
  let c = (await call('/b/cases', mentor)).items[0]
  const other = await login('mentor-other')
  assert.equal((await call('/b/cases', other)).items.length, 0)
  checks++
  await call(
    '/b/cases/' + c.id + '/events',
    other,
    { type: 'contact', text: '越权', version: c.version },
    null,
    403,
  )
  await call(
    '/b/cases',
    academic,
    {
      studentId: 'stu-lin',
      mentorId: 'mentor-demo',
      counselorId: 'cou-chen',
      course: '高等数学',
    },
    null,
    409,
  )
  await call(
    '/b/cases/' + c.id + '/events',
    mentor,
    { type: 'remind', text: 'test', version: c.version },
    null,
    409,
  )
  for (const type of ['contact', 'interview', 'remind', 'referral']) {
    c = (
      await call('/b/cases/' + c.id + '/events', mentor, {
        type,
        text: '私密面谈内容-' + type,
        version: c.version,
      })
    ).item
  }
  await call(
    '/b/cases/' + c.id + '/events',
    mentor,
    { type: 'contact', text: '冲突', version: 1 },
    null,
    409,
  )
  await call(
    '/b/cases/' + c.id + '/events',
    mentor,
    {
      type: 'contact',
      text: '计划',
      version: c.version,
      scheduledAt: '2000-01-01',
    },
    null,
    400,
  )
  assert(!JSON.stringify(await call('/b/cases', counselor)).includes('私密'))
  checks++
  assert(!JSON.stringify(await call('/b/cases', academic)).includes('私密'))
  checks++
  await call(
    '/b/cases/' + c.id + '/result',
    mentor,
    { result: 'passed', source: 'test', version: c.version },
    'PATCH',
    403,
  )
  c = (
    await call(
      '/b/cases/' + c.id + '/result',
      academic,
      { result: 'failed', source: '教务名单第1版', version: c.version },
      'PATCH',
    )
  ).item
  assert.equal(c.status, 'pending_contact')
  checks++
  c = (
    await call(
      '/b/cases/' + c.id + '/result',
      academic,
      { result: 'passed', source: '教务名单第2版', version: c.version },
      'PATCH',
    )
  ).item
  assert.equal(c.status, 'completed')
  checks++
  await call(
    '/b/cases/' + c.id + '/events',
    mentor,
    { type: 'contact', text: '完成后修改', version: c.version },
    null,
    409,
  )
  let k = (
    await call(
      '/b/knowledge',
      counselor,
      {
        title: '实验室预约',
        answer: '请在学院公布的预约入口选择空闲时段，并等待管理员确认。',
        keywords: ['实验室', '预约'],
        source: '学院审核资料：测试样本',
        department: '教务',
        validUntil: '2099-01-01',
      },
      null,
      201,
    )
  ).item
  await call('/b/knowledge', student, null, null, 403)
  let reply = await call('/b/assistant', student, { text: '实验室怎么预约' })
  assert.equal(reply.action, 'clarify')
  checks++
  await call(
    '/b/knowledge/' + k.id + '/review',
    counselor,
    { action: 'publish', note: '审核' },
    null,
    403,
  )
  await call('/b/knowledge/' + k.id + '/review', reviewer, {
    action: 'publish',
    note: '资料与流程已核对',
  })
  reply = await call('/b/assistant', student, { text: '实验室怎么预约' })
  assert.equal(reply.action, 'answer')
  assert.equal(reply.source.version, 1)
  checks += 2
  const next = (
    await call(
      '/b/knowledge',
      counselor,
      { ...k, parentId: k.id, answer: '修订答案' },
      null,
      201,
    )
  ).item
  assert.equal(next.version, 2)
  checks++
  await call('/b/knowledge/' + next.id + '/review', reviewer, {
    action: 'publish',
    note: '复核修订',
  })
  reply = await call('/b/assistant', student, { text: '实验室怎么预约' })
  assert.equal(reply.source.version, 2)
  checks++
  await call('/b/knowledge/' + next.id + '/withdraw', counselor, {})
  reply = await call('/b/assistant', student, { text: '实验室怎么预约' })
  assert.equal(reply.action, 'clarify')
  checks++
  reply = await call('/b/assistant', student, {
    text: '实验室一楼',
    conversationId: reply.conversationId,
  })
  reply = await call('/b/assistant', student, {
    text: '今天上午没有处理过',
    conversationId: reply.conversationId,
  })
  assert.equal(reply.action, 'handoff')
  assert(reply.summary.includes('实验室一楼'))
  checks += 2
  await call(
    '/b/assistant',
    student,
    { text: '实验室', conversationId: 'missing' },
    null,
    403,
  )
  reply = await call('/b/assistant', student, {
    text: '宿舍消防通道堆满杂物，有严重火灾隐患',
  })
  assert.equal(reply.action, 'urgent_handoff')
  checks++
  await call(
    '/b/knowledge',
    counselor,
    { ...k, validUntil: '2000-01-01' },
    null,
    400,
  )
  const exp = (
    await call(
      '/b/knowledge',
      counselor,
      {
        title: '过期测试',
        answer: '过期答案',
        keywords: ['过期验证'],
        source: '测试',
        department: '教务',
        validUntil: new Date(Date.now() + 1200).toISOString(),
      },
      null,
      201,
    )
  ).item
  await call('/b/knowledge/' + exp.id + '/review', reviewer, {
    action: 'publish',
    note: '时效校验',
  })
  await new Promise((r) => setTimeout(r, 1400))
  assert.notEqual(
    (await call('/b/assistant', student, { text: '过期验证' })).action,
    'answer',
  )
  checks++
  await new Promise((r) => setTimeout(r, 100))
  const saved = JSON.parse(await readFile(file, 'utf8'))
  assert(saved.b.audit.length > 0)
  assert.equal(saved.b.cases[0].status, 'completed')
  checks += 2
  console.log('B_WORKFLOW_OK ' + checks + ' checks; isolated store: ' + file)
} finally {
  child.kill()
}
