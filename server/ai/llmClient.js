/**
 * B 部分 · 大模型调用链路加固（基础任务 1）
 *
 * 目标：把「一次 fetch 打天下」的调用方式，升级为可观测、可退化的调用链路：
 *   超时控制 → 失败重试（指数退避）→ 熔断保护 → 并发限流 → 结果缓存 → 故障注入演练 → 指标埋点
 * 任何一环失败都不会抛异常给业务层，统一返回 { ok: false, reason }，由规则层兜底。
 *
 * 环境变量（全部可选，未配置时用默认值；每次调用时读取，便于脚本内临时覆盖）：
 *   DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL
 *   LLM_TIMEOUT_MS          单次请求超时，默认 9000
 *   LLM_MAX_RETRIES         失败重试次数，默认 1
 *   LLM_CIRCUIT_FAILURES    熔断阈值（连续失败次数），默认 3
 *   LLM_CIRCUIT_COOLDOWN_MS 熔断冷却时间，默认 60000
 *   LLM_MAX_CONCURRENCY     并发上限，默认 4
 *   LLM_CACHE_TTL_MS        结果缓存时长，默认 600000（10 分钟）
 */

const DEFAULT_TIMEOUT_MS = 9000
const DEFAULT_MAX_RETRIES = 1
const DEFAULT_CIRCUIT_FAILURES = 3
const DEFAULT_CIRCUIT_COOLDOWN_MS = 60000
const DEFAULT_MAX_CONCURRENCY = 4
const DEFAULT_CACHE_TTL_MS = 600000
const CACHE_LIMIT = 200

const num = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const config = () => ({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
  timeoutMs: num(process.env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  maxRetries: num(process.env.LLM_MAX_RETRIES, DEFAULT_MAX_RETRIES),
  circuitFailures: num(process.env.LLM_CIRCUIT_FAILURES, DEFAULT_CIRCUIT_FAILURES),
  circuitCooldownMs: num(process.env.LLM_CIRCUIT_COOLDOWN_MS, DEFAULT_CIRCUIT_COOLDOWN_MS),
  maxConcurrency: num(process.env.LLM_MAX_CONCURRENCY, DEFAULT_MAX_CONCURRENCY),
  cacheTtlMs: num(process.env.LLM_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
})

// ── 运行时状态（进程内，重启即清空）────────────────────────────
const runtime = {
  /** 熔断状态：closed 正常 / open 熔断中 / half-open 试探恢复 */
  breaker: 'closed',
  /** 连续失败计数与窗口内失败时间戳 */
  consecutiveFailures: 0,
  failureTimes: [],
  openedAt: 0,
  /** 并发控制 */
  inFlight: 0,
  queue: [],
  /** 结果缓存（LRU + TTL） */
  cache: new Map(),
  cacheHits: 0,
  /** 故障注入：null | timeout | offline | bad-json | http-500 */
  faultMode: null,
  /** 指标 */
  metrics: {
    calls: 0,
    success: 0,
    failure: 0,
    degraded: 0,
    retries: 0,
    timeouts: 0,
    lastError: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    latencySamples: [],
    reasonCounts: {},
  },
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const recordLatency = (ms) => {
  const samples = runtime.metrics.latencySamples
  samples.push(ms)
  if (samples.length > 120) samples.shift()
}

const percentile = (samples, ratio) => {
  if (!samples.length) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return Math.round(sorted[index])
}

const countReason = (reason) => {
  runtime.metrics.reasonCounts[reason] = (runtime.metrics.reasonCounts[reason] || 0) + 1
}

const cacheKeyOf = (promptId, payload) => `${config().model}|${promptId}|${JSON.stringify(payload)}`

const readCache = (key) => {
  const hit = runtime.cache.get(key)
  if (!hit) return null
  if (hit.expireAt < Date.now()) {
    runtime.cache.delete(key)
    return null
  }
  // LRU：命中后移动到队尾
  runtime.cache.delete(key)
  runtime.cache.set(key, hit)
  runtime.cacheHits += 1
  return hit.value
}

const writeCache = (key, value) => {
  runtime.cache.set(key, { value, expireAt: Date.now() + config().cacheTtlMs })
  while (runtime.cache.size > CACHE_LIMIT) {
    const oldest = runtime.cache.keys().next().value
    runtime.cache.delete(oldest)
  }
}

// ── 熔断器 ──────────────────────────────────────────────────
const breakerState = () => {
  const { circuitCooldownMs } = config()
  if (runtime.breaker === 'open' && Date.now() - runtime.openedAt >= circuitCooldownMs) {
    runtime.breaker = 'half-open'
  }
  return runtime.breaker
}

const onSuccess = () => {
  runtime.consecutiveFailures = 0
  runtime.failureTimes = []
  runtime.breaker = 'closed'
}

const onFailure = () => {
  const { circuitFailures } = config()
  runtime.consecutiveFailures += 1
  runtime.failureTimes.push(Date.now())
  if (runtime.consecutiveFailures >= circuitFailures) {
    runtime.breaker = 'open'
    runtime.openedAt = Date.now()
  }
}

// ── 并发限流 ────────────────────────────────────────────────
const acquire = () =>
  new Promise((resolve) => {
    const run = () => {
      runtime.inFlight += 1
      resolve(() => {
        runtime.inFlight -= 1
        const next = runtime.queue.shift()
        if (next) next()
      })
    }
    if (runtime.inFlight < config().maxConcurrency) run()
    else runtime.queue.push(run)
  })

// ── 单次请求 ────────────────────────────────────────────────
const parseJson = (content) => {
  const cleaned = String(content || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return JSON.parse(cleaned)
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const callOnce = async ({ prompt, payload, temperature, timeoutMs }) => {
  const { apiKey, baseUrl, model } = config()
  const built = prompt.build(payload)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: temperature ?? prompt.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: built.system },
          { role: 'user', content: built.user },
        ],
      }),
    })
    if (!response.ok) {
      const error = new Error(`LLM HTTP ${response.status}`)
      error.status = response.status
      error.retryable = RETRYABLE_STATUS.has(response.status)
      throw error
    }
    const body = await response.json()
    const raw = body?.choices?.[0]?.message?.content
    try {
      return { data: parseJson(raw), raw }
    } catch {
      const error = new Error('LLM 返回内容不是合法 JSON')
      error.retryable = true
      error.badJson = true
      throw error
    }
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const timeoutError = new Error(`LLM 调用超时（${timeoutMs}ms）`)
      timeoutError.retryable = true
      timeoutError.timeout = true
      throw timeoutError
    }
    if (error.retryable === undefined) error.retryable = true // fetch 网络错误（如 DNS / 连接被拒）
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// ── 故障注入（答辩容灾演练用；生产默认关闭）────────────────────
const FAULT_MODES = ['timeout', 'offline', 'bad-json', 'http-500']

export const setFaultMode = (mode) => {
  if (mode && !FAULT_MODES.includes(mode)) throw new Error(`未知故障模式：${mode}`)
  runtime.faultMode = mode || null
  return runtime.faultMode
}

export const getFaultMode = () => runtime.faultMode

const applyFault = async ({ timeoutMs }) => {
  const mode = runtime.faultMode
  if (!mode) return null
  if (mode === 'timeout') {
    await sleep(Math.min(timeoutMs, 40))
    const error = new Error(`LLM 调用超时（${timeoutMs}ms，故障注入）`)
    error.timeout = true
    error.retryable = true
    return error
  }
  if (mode === 'offline') {
    const error = new Error('LLM 网络不可达（故障注入：offline）')
    error.retryable = true
    return error
  }
  if (mode === 'http-500') {
    const error = new Error('LLM HTTP 500（故障注入）')
    error.status = 500
    error.retryable = true
    return error
  }
  if (mode === 'bad-json') {
    const error = new Error('LLM 返回内容不是合法 JSON（故障注入）')
    error.badJson = true
    error.retryable = true
    return error
  }
  return null
}

/**
 * 统一入口：调用大模型并返回结构化 JSON。
 * 永不抛异常；失败时返回 { ok: false, reason, degraded: true }，业务层直接走本地规则。
 */
export const chatJson = async ({ prompt, payload, temperature, cacheable = true, cacheKey } = {}) => {
  const started = Date.now()
  runtime.metrics.calls += 1
  const { apiKey, timeoutMs, maxRetries } = config()

  const fail = (reason, error) => {
    runtime.metrics.failure += 1
    runtime.metrics.degraded += 1
    runtime.metrics.lastError = { reason, message: error?.message || '', at: new Date().toISOString() }
    runtime.metrics.lastFailureAt = new Date().toISOString()
    countReason(reason)
    const latencyMs = Date.now() - started
    recordLatency(latencyMs)
    return { ok: false, reason, error: error?.message || '', degraded: true, meta: { latencyMs } }
  }

  if (!prompt?.build) return fail('bad-prompt')
  if (!apiKey) return fail('no-api-key')

  const state = breakerState()
  if (state === 'open') return fail('circuit-open')

  const key = cacheable ? cacheKey || cacheKeyOf(prompt.id, payload) : null
  if (key) {
    const cached = readCache(key)
    if (cached) {
      runtime.metrics.success += 1
      return { ok: true, data: cached, cached: true, meta: { latencyMs: Date.now() - started, source: 'cache' } }
    }
  }

  const release = await acquire()
  let attempts = 0
  let lastError = null
  try {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      attempts += 1
      const fault = await applyFault({ timeoutMs })
      if (fault) {
        lastError = fault
      } else {
        try {
          const { data } = await callOnce({ prompt, payload, temperature, timeoutMs })
          onSuccess()
          runtime.metrics.success += 1
          runtime.metrics.lastSuccessAt = new Date().toISOString()
          const latencyMs = Date.now() - started
          recordLatency(latencyMs)
          if (key) writeCache(key, data)
          return { ok: true, data, attempts, meta: { latencyMs, model: config().model, source: 'model' } }
        } catch (error) {
          lastError = error
        }
      }
      if (lastError?.timeout) runtime.metrics.timeouts += 1
      if (attempt < maxRetries && (lastError?.retryable || state === 'half-open')) {
        runtime.metrics.retries += 1
        await sleep(120 * 2 ** attempt + Math.floor(Math.random() * 60))
        continue
      }
      break
    }
    onFailure()
    const reason = lastError?.timeout
      ? 'timeout'
      : lastError?.badJson
        ? 'bad-json'
        : lastError?.status
          ? `http-${lastError.status}`
          : runtime.faultMode === 'offline'
            ? 'offline'
            : 'network-error'
    return { ...fail(reason, lastError), attempts: attempts }
  } finally {
    release()
  }
}

export const llmEnabled = () => Boolean(process.env.DEEPSEEK_API_KEY)

/** 健康快照：给 /api/ai/health 与演练脚本使用 */
export const llmStatus = () => {
  const cfg = config()
  const samples = runtime.metrics.latencySamples
  const avg = samples.length ? Math.round(samples.reduce((sum, item) => sum + item, 0) / samples.length) : 0
  return {
    enabled: llmEnabled(),
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    breaker: breakerState(),
    consecutiveFailures: runtime.consecutiveFailures,
    inFlight: runtime.inFlight,
    queued: runtime.queue.length,
    faultMode: runtime.faultMode,
    cache: { entries: runtime.cache.size, hits: runtime.cacheHits, ttlMs: cfg.cacheTtlMs },
    limits: {
      timeoutMs: cfg.timeoutMs,
      maxRetries: cfg.maxRetries,
      circuitFailures: cfg.circuitFailures,
      circuitCooldownMs: cfg.circuitCooldownMs,
      maxConcurrency: cfg.maxConcurrency,
    },
    metrics: {
      calls: runtime.metrics.calls,
      success: runtime.metrics.success,
      failure: runtime.metrics.failure,
      degraded: runtime.metrics.degraded,
      retries: runtime.metrics.retries,
      timeouts: runtime.metrics.timeouts,
      avgLatencyMs: avg,
      p95LatencyMs: percentile(samples, 0.95),
      reasonCounts: { ...runtime.metrics.reasonCounts },
      lastError: runtime.metrics.lastError,
      lastSuccessAt: runtime.metrics.lastSuccessAt,
      lastFailureAt: runtime.metrics.lastFailureAt,
    },
  }
}

/** 演练/测试用：把熔断、缓存与指标恢复到初始状态 */
export const resetLlmRuntime = () => {
  runtime.breaker = 'closed'
  runtime.consecutiveFailures = 0
  runtime.failureTimes = []
  runtime.openedAt = 0
  runtime.cache.clear()
  runtime.cacheHits = 0
  runtime.faultMode = null
  runtime.metrics.calls = 0
  runtime.metrics.success = 0
  runtime.metrics.failure = 0
  runtime.metrics.degraded = 0
  runtime.metrics.retries = 0
  runtime.metrics.timeouts = 0
  runtime.metrics.lastError = null
  runtime.metrics.lastSuccessAt = null
  runtime.metrics.lastFailureAt = null
  runtime.metrics.latencySamples = []
  runtime.metrics.reasonCounts = {}
  return llmStatus()
}

export const FAULT_MODE_LIST = [...FAULT_MODES]
