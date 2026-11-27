import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chatJson, llmStatus, resetLlmRuntime } from '../../server/ai/llmClient.js'
import { bTrialFixture } from '../fixtures/b-trial.mjs'
import {
  appointmentDurationCases, consultationCases, consultationKnowledge,
  liveAppointmentDurationCases, liveConsultationCases, sprintConsultationCases,
} from '../fixtures/assistant-eval.mjs'

const args = process.argv.slice(2)
const live = args.includes('--live')
const compare = args.includes('--compare')
const output = args.find(arg => !arg.startsWith('--'))
if (live && existsSync('.env')) process.loadEnvFile?.()
if (live && !process.env.DEEPSEEK_API_KEY?.trim()) {
  console.error('真实模型评测需要在运行脚本的服务端配置 DEEPSEEK_API_KEY。')
  process.exit(2)
}

const directPrompt = {
  id: 'sprint-direct-consultation',
  version: 1,
  maxTokens: 450,
  timeoutMs: 5000,
  temperature: 0.2,
  build: input => ({
    system: [
      '你是知行桥学生咨询助手。请直接根据当前问题、之前的对话和学生类别回答。',
      '返回 JSON，包含 action、topic、next、answer。action 选 guidance、answer、handoff 或 urgent_handoff。',
      'topic 用简短英文。next 只能为页面路径字符串或 null。可用页面包括 /student/repairs/new、/student/repairs、/student/leaves、/student/appointments、/student/new、/student/tickets。',
      'answer 用简短中文给出下一步。如缺少校方依据或需要人工处理，请明确告知学生。',
    ].join('\n'),
    user: JSON.stringify(input),
  }),
}

async function withTestApi(useModel, run) {
  const socket = createServer().listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const { port } = socket.address()
  await new Promise(resolve => socket.close(resolve))
  const dir = await mkdtemp(path.join(tmpdir(), 'zhixingqiao-assistant-eval-'))
  let server
  try {
    const file = path.join(dir, 'store.json')
    const fixture = bTrialFixture()
    fixture.b.knowledge = consultationKnowledge
    await writeFile(file, JSON.stringify(fixture))
    server = spawn(process.execPath, ['server/index.js'], {
      env: { ...process.env, PORT: String(port), ZHIHUI_DATA_FILE: file, B_DEMO: 'false',
        TRIAL_MODE: 'false', DEEPSEEK_API_KEY: useModel ? process.env.DEEPSEEK_API_KEY : '',
        STUDENT_KNOWLEDGE_LLM: String(useModel), APPOINTMENT_ADVICE_LLM: String(useModel) },
      windowsHide: true,
    })
    const base = 'http://127.0.0.1:' + port + '/api'
    let ready = false
    for (let i = 0; !ready && i < 80; i++) {
      ready = await fetch(base + '/health').then(response => response.ok).catch(() => false)
      if (!ready) await delay(100)
    }
    assert.ok(ready, 'API did not start')
    const request = async (route, body, token) => {
      const response = await fetch(base + route, {
        ...(body !== undefined && { method: 'POST', body: JSON.stringify(body) }),
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
        signal: AbortSignal.timeout(12000),
      })
      assert.ok(response.ok, route + ' returned ' + response.status)
      return response.json()
    }
    const tokens = new Map()
    const studentToken = async (account = '20230118') => {
      if (!tokens.has(account)) {
        const session = await request('/auth/login', { role: 'student', account, password: '123456' })
        tokens.set(account, session.token)
      }
      return tokens.get(account)
    }
    return await run(request, studentToken)
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit')
      server.kill()
      await exited
    }
    await rm(dir, { recursive: true, force: true })
  }
}

const observed = response => ({
  action: response.action ?? null,
  topic: response.topic ?? null,
  next: typeof response.next === 'string' ? response.next : response.next?.path ?? null,
  source: response.source?.id ?? null,
  policy: Boolean(response.policyVersion),
  policyVersion: response.policyVersion || null,
  engine: response.engine ?? 'local-rules',
  answer: String(response.answer || ''),
})

async function evaluate(cases, prepare) {
  const results = []
  for (const scenario of cases) {
    const ask = await prepare(scenario)
    const turns = []
    for (const [text, expected] of scenario.turns) {
      const started = performance.now()
      const actual = observed(await ask(text))
      const failures = Object.entries(expected).filter(([key, value]) =>
        key === 'answer' ? !actual.answer.includes(value) : actual[key] !== value).map(([key]) => key)
      turns.push({ text, expected, actual, failures, latencyMs: Math.round(performance.now() - started) })
    }
    results.push({ id: scenario.id, group: scenario.group, ok: turns.every(turn => !turn.failures.length), turns })
  }
  return results
}

const isHandoff = action => action === 'handoff' || action === 'urgent_handoff'
const percentile = (values, p) => values.slice().sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? null

function summarize(results) {
  const all = results.flatMap(row => row.turns)
  const entries = all.filter(turn => turn.expected.next)
  const handoffs = all.filter(turn => isHandoff(turn.expected.action))
  return {
    scenariosPassed: results.filter(row => row.ok).length,
    scenarios: results.length,
    turnsPassed: all.filter(turn => !turn.failures.length).length,
    turns: all.length,
    correctEntries: entries.filter(turn => turn.expected.next === turn.actual.next).length,
    entryCases: entries.length,
    incorrectGuidance: all.filter(({ expected, actual }) =>
      (actual.next && expected.next !== undefined && actual.next !== expected.next) ||
      (isHandoff(expected.action) && ['guidance', 'answer'].includes(actual.action))).length,
    correctHandoffs: handoffs.filter(turn => turn.expected.action === turn.actual.action).length,
    handoffCases: handoffs.length,
    modelTurns: all.filter(turn => ['model-assisted', 'model-direct'].includes(turn.actual.engine)).length,
    failedModelTurns: all.filter(turn => turn.actual.engine === 'model-error').length,
    p50Ms: percentile(all.map(turn => turn.latencyMs), 0.5),
    p95Ms: percentile(all.map(turn => turn.latencyMs), 0.95),
  }
}

function modelCost(stats, turns) {
  const usage = stats.metrics.providerUsage
  const unitPrices = Object.fromEntries(['CACHED_INPUT', 'UNCACHED_INPUT', 'OUTPUT'].map(field => {
    const raw = process.env['B_EVAL_' + field + '_PER_MILLION']?.trim()
    const price = raw ? Number(raw) : NaN
    return [field.toLowerCase(), Number.isFinite(price) && price >= 0 ? price : null]
  }))
  const usageComplete = usage.attempts === usage.responsesWithUsage &&
    usage.attempts === usage.responsesWithCacheBreakdown
  const rateAvailable = Object.values(unitPrices).every(price => price !== null)
  const total = !usage.attempts || !usageComplete || !rateAvailable ? null :
    (usage.cachedInputTokens * unitPrices.cached_input + usage.uncachedInputTokens * unitPrices.uncached_input +
      usage.outputTokens * unitPrices.output) / 1_000_000
  return {
    model: stats.model,
    ...usage,
    retries: stats.metrics.retries,
    timeouts: stats.metrics.timeouts,
    reasonCounts: stats.metrics.reasonCounts,
    currency: process.env.B_EVAL_CURRENCY || 'CNY',
    perMillion: unitPrices,
    status: !usage.attempts ? 'no-provider-requests' : !usageComplete ? 'incomplete-usage' :
      !rateAvailable ? 'missing-rates' : 'estimated-from-provider-usage',
    estimatedCost: total,
    estimatedCostPer1000Turns: total === null ? null : total * 1000 / turns,
  }
}

async function productRun(useModel, cases, includeDuration = false) {
  return withTestApi(useModel, async (request, studentToken) => {
    const results = await evaluate(cases, async scenario => {
      const token = await studentToken(scenario.account)
      let conversationId
      return async text => {
        const response = await request('/b/assistant', { text, conversationId }, token)
        conversationId = response.conversationId
        return response
      }
    })
    const metrics = summarize(results)
    const token = await studentToken()
    const consultationStats = useModel ? (await request('/ai/health', undefined, token)).llm : null
    const run = { ...metrics, results }
    if (consultationStats) run.usage = modelCost(consultationStats, metrics.turns)

    if (includeDuration) {
      const examples = useModel ? [...appointmentDurationCases, ...liveAppointmentDurationCases] : appointmentDurationCases
      const rows = []
      for (const { topic, ...expected } of examples) {
        const { item } = await request('/appointments/advice', { text: topic }, token)
        const actual = {
          category: item.category === 'signature' ? 'signing' : item.category,
          durationMinutes: item.minutes, reason: item.reason, source: item.engine,
        }
        const ok = actual.category === expected.category && actual.durationMinutes === expected.durationMinutes
        rows.push({ topic, expected, actual, ok })
      }
      run.appointment = {
        passed: rows.filter(row => row.ok).length, total: rows.length,
        modelSuggestions: rows.filter(row => row.actual.source === 'model').length, rows,
      }
    }
    return run
  })
}

async function directRun(cases) {
  resetLlmRuntime()
  const results = await evaluate(cases, async scenario => {
    const history = []
    return async question => {
      const response = await chatJson({
        prompt: directPrompt, cacheable: false,
        payload: { question, history, educationLevel: scenario.account === 'graduate' ? '研究生' : '本科生' },
      })
      const data = response.ok ? response.data : { answer: '' }
      history.push({ question, answer: typeof data.answer === 'string' ? data.answer : '' })
      return { ...data, source: null, policyVersion: null, engine: response.ok ? 'model-direct' : 'model-error' }
    }
  })
  const metrics = summarize(results)
  return { ...metrics, results, usage: modelCost(llmStatus(), metrics.turns) }
}

async function saveReport(report) {
  if (!output) return
  await mkdir(path.dirname(path.resolve(output)), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
}

const now = new Date().toISOString()
if (compare) {
  const ruleResult = await productRun(false, sprintConsultationCases, true)
  const pending = { status: 'requires-live-model' }
  const direct = live ? await directRun(sprintConsultationCases) : pending
  const grounded = live ? await productRun(true, sprintConsultationCases, true) : pending
  const report = {
    mode: live ? 'live-comparison' : 'local-baseline', evaluatedAt: now,
    notes: [
      '12 个固定合成案例，保留原始判据。规则与护栏组走当前分支的学生咨询 API，报告保留与历史预期的差异。',
      '模型直接回答组复用相同供应商但不加载知识，在评测进程直接计时。对照覆盖业务路由、人工入口及固定答案判据，不作为通用模型准确率。',
      '按轮统计，每千轮费用基于供应商返回的实际 Token 和本轮提供的单价，最终账单以供应商为准。',
    ],
    groups: { rules: ruleResult, modelDirect: direct, modelGrounded: grounded },
  }
  await saveReport(report)
  for (const [mode, row] of Object.entries(report.groups)) {
    console.log(mode, row.status || [
      row.scenariosPassed + '/' + row.scenarios + ' 场景',
      row.turnsPassed + '/' + row.turns + ' 轮',
      row.modelTurns + ' 轮使用模型',
      row.appointment && '预约时长 ' + row.appointment.passed + '/' + row.appointment.total,
    ].filter(Boolean).join('，'))
  }
  if (live && (!direct.modelTurns || !grounded.modelTurns)) process.exitCode = 1
} else {
  const result = await productRun(live, live ? liveConsultationCases : consultationCases)
  const report = {
    mode: live ? 'live-deepseek' : 'local-rules', evaluatedAt: now,
    ...(live && { model: result.usage.model }), ...result,
  }
  await saveReport(report)
  for (const row of result.results.filter(row => !row.ok)) {
    console.log(row.id, row.turns.filter(turn => turn.failures.length).map(turn => turn.failures.join(',')).join(' / '))
  }
  console.log((live ? '真实模型' : '规则') + '咨询评测 ' +
    result.scenariosPassed + '/' + result.scenarios + ' 场景，' +
    result.turnsPassed + '/' + result.turns + ' 轮，模型参与 ' + result.modelTurns + ' 轮')
  if (result.scenariosPassed !== result.scenarios) process.exitCode = 1
}
