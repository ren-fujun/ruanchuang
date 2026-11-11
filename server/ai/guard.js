/**
 * B 部分 · 幻觉护栏（交付标准：AI 服务稳定、幻觉可控）
 *
 * 三道防线：
 *   1. 字段白名单：模型只能改它被允许改的字段，枚举值越界直接丢弃（不抛错）。
 *   2. 不降级原则：本地规则判定的 risk / urgency 只允许持平或提升，模型无权下调。
 *   3. 可追溯校验：答复里的电话、金额、时限等硬事实必须能在来源材料里找到，否则整体回退规则文本。
 */

import { chatJson } from './llmClient.js'
import { PROMPTS } from './prompts.js'

/** 全局允许出现的公益号码：即便知识库没写，也不应视为幻觉 */
export const GLOBAL_CONTACT_ALLOWLIST = ['110', '119', '120', '122', '12355', '12356']

/** 典型「过度承诺」措辞，出现在答复里一律回退 */
const OVER_PROMISE_WORDS = ['保证', '一定能', '肯定能', '包解决', '100%', '立刻解决', '绝对', '全网最快']

/** 模型输出里不应出现的注入残留 */
const INJECTION_MARKERS = ['system:', '</', '忽略以上', 'ignore previous', '你现在是']

const RISK_ORDER = { low: 0, medium: 1, high: 2 }
const URGENCY_ORDER = { normal: 0, high: 1, urgent: 2 }

const clean = (value, max = 200) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)

const highestOf = (a, b, order, fallback) => {
  if (!(b in order)) return fallback
  return order[a] >= order[b] ? fallback : b
}

const lowerEnum = (value, allowed) => {
  const normalized = clean(value, 24).toLowerCase()
  return allowed.includes(normalized) ? normalized : null
}

const hasInjection = (value) => {
  const text = String(value || '').toLowerCase()
  return INJECTION_MARKERS.some((marker) => text.includes(marker.toLowerCase()))
}

/** 电话 / 号码候选：先剔除时间（9:00–11:30）避免误判，再抽取「最多两段分隔」的数字串，
 *  这样既能识别「0571-8820 3103」，也不会把相邻的两个号码贪婪地连成一个超长串。 */
const TIME_RE = /\d{1,2}:\d{2}(?::\d{2})?/g
const PHONE_RE = /[0-9]+(?:[-\s][0-9]+){0,2}/g

const digitsOnly = (value) => String(value).replace(/\D/g, '')

/** 号码比对：允许「8820 3103」与「0571-8820 3103」这类区号省略写法互相匹配 */
const phoneKnown = (phone, known) => known.some((item) => item.includes(phone) || phone.includes(item))

/** 抽取文本里的硬事实：电话号码、金额、时限 */
export const extractFacts = (text) => {
  const source = String(text || '').replace(TIME_RE, ' ')
  const phones = (source.match(PHONE_RE) || [])
    .map(digitsOnly)
    .filter((item) => item.length >= 5 && item.length <= 13)
  const money = (source.match(/\d+(?:\.\d+)?\s*(?:元|块|万元)/g) || []).map((item) => item.replace(/\s/g, ''))
  const duration = (source.match(/\d+\s*(?:分钟|小时|个工作日|工作日|天|周)/g) || []).map((item) =>
    item.replace(/\s/g, ''),
  )
  return { phones: [...new Set(phones)], money: [...new Set(money)], duration: [...new Set(duration)] }
}

/**
 * 校验模型答复是否可追溯。
 * @returns {{ ok: boolean, violations: string[], answer: string }}
 */
export const guardAnswerText = ({ answer, sources = [], fallback = '' }) => {
  const text = clean(answer, 400)
  const violations = []
  if (!text) return { ok: false, violations: ['空答复'], answer: fallback }

  const overPromise = OVER_PROMISE_WORDS.find((word) => text.includes(word))
  if (overPromise) violations.push(`过度承诺：${overPromise}`)

  const sourcePool = [sources.join(' '), GLOBAL_CONTACT_ALLOWLIST.join(' ')].join(' ')
  const sourceFacts = extractFacts(sourcePool)
  const answerFacts = extractFacts(text)
  const unknownPhones = answerFacts.phones.filter((phone) => !phoneKnown(phone, sourceFacts.phones))
  if (unknownPhones.length) violations.push(`来源中不存在的电话：${unknownPhones.join('、')}`)
  const unknownMoney = answerFacts.money.filter((item) => !sourceFacts.money.includes(item))
  if (unknownMoney.length) violations.push(`来源中不存在的金额：${unknownMoney.join('、')}`)
  const unknownDuration = answerFacts.duration.filter((item) => !sourceFacts.duration.includes(item))
  if (unknownDuration.length) violations.push(`来源中不存在的时限：${unknownDuration.join('、')}`)
  if (hasInjection(text)) violations.push('疑似提示词注入残留')

  return { ok: violations.length === 0, violations, answer: violations.length ? fallback : text }
}

/**
 * 合并模型结果与规则结果：模型只能补充与提升，不能删改红线字段。
 * @returns {{ analysis: object, applied: string[], rejected: string[] }}
 */
export const guardAnalysis = ({ llm, base, categories = [], deptIds = [] }) => {
  const applied = []
  const rejected = []
  const analysis = { ...base }
  if (!llm || typeof llm !== 'object') return { analysis, applied, rejected: ['模型未返回对象'] }

  const category = clean(llm.category, 24)
  if (category && categories.includes(category)) {
    if (category !== base.category) applied.push(`category:${base.category}→${category}`)
    analysis.category = category
  } else if (category) {
    rejected.push(`category:${category}`)
  }

  const risk = lowerEnum(llm.risk, ['low', 'medium', 'high'])
  if (risk) {
    if (RISK_ORDER[risk] < RISK_ORDER[base.risk]) rejected.push(`risk 降级被拒:${risk}`)
    else {
      if (risk !== base.risk) applied.push(`risk:${base.risk}→${risk}`)
      analysis.risk = risk
    }
  } else if (llm.risk !== undefined) {
    rejected.push(`risk 非法:${clean(llm.risk, 12)}`)
  }

  const urgency = lowerEnum(llm.urgency, ['normal', 'high', 'urgent'])
  if (urgency) {
    if (URGENCY_ORDER[urgency] < URGENCY_ORDER[base.urgency]) rejected.push(`urgency 降级被拒:${urgency}`)
    else {
      if (urgency !== base.urgency) applied.push(`urgency:${base.urgency}→${urgency}`)
      analysis.urgency = urgency
    }
  } else if (llm.urgency !== undefined) {
    rejected.push(`urgency 非法:${clean(llm.urgency, 12)}`)
  }

  if (typeof llm.riskReason === 'string' && clean(llm.riskReason)) {
    analysis.riskReason = clean(llm.riskReason, 160)
    applied.push('riskReason')
  }
  if (typeof llm.sentiment === 'string' && clean(llm.sentiment)) {
    analysis.sentiment = clean(llm.sentiment, 40)
    applied.push('sentiment')
  }
  if (typeof llm.summary === 'string' && clean(llm.summary)) {
    const candidate = clean(llm.summary, 200)
    const facts = extractFacts(candidate)
    const sourceFacts = extractFacts(`${base.summary} ${llm.sourceText || ''}`)
    const unknown = [...facts.phones, ...facts.money].filter(
      (item) =>
        !phoneKnown(item, sourceFacts.phones) &&
        !sourceFacts.money.includes(item) &&
        !sourceFacts.duration.includes(item),
    )
    if (unknown.length) rejected.push(`summary 含无来源事实:${unknown.join('、')}`)
    else {
      analysis.summary = candidate
      applied.push('summary')
    }
  }
  if (typeof llm.draft === 'string' && clean(llm.draft)) {
    const draft = guardAnswerText({
      answer: llm.draft,
      sources: [`${base.summary} ${base.riskReason}`],
      fallback: base.draft,
    })
    analysis.draft = draft.answer
    if (draft.ok) applied.push('draft')
    else rejected.push(`draft:${draft.violations.join('；')}`)
  }

  if (Array.isArray(llm.suggestedDepartments) && deptIds.length) {
    const suggested = llm.suggestedDepartments
      .map((id) => clean(id, 24))
      .filter((id) => deptIds.includes(id))
    const dropped = llm.suggestedDepartments.length - suggested.length
    if (dropped > 0) rejected.push(`suggestedDepartments 越界 ${dropped} 个`)
    if (suggested.length) {
      analysis.suggestedDepartments = suggested.slice(0, 4)
      applied.push('suggestedDepartments')
    }
  }

  if (Array.isArray(llm.tags)) {
    const tags = llm.tags
      .map((tag) => clean(tag, 12))
      .filter((tag) => tag && !hasInjection(tag))
      .slice(0, 5)
    if (tags.length) {
      analysis.tags = tags
      applied.push('tags')
    }
  }

  if (llm.elements && typeof llm.elements === 'object') {
    const allowed = ['location', 'object', 'phenomenon', 'timeHint', 'demand']
    analysis.elements = Object.fromEntries(
      allowed.map((key) => [key, clean(llm.elements[key], 40)]).filter(([, value]) => value),
    )
    if (Object.keys(analysis.elements).length) applied.push('elements')
  }

  return { analysis, applied, rejected }
}

/**
 * 第二道可追溯复核（可选，需配置模型）。任一环节不可用时视为通过，
 * 因为 guardAnswerText 已经做过确定性的硬事实校验。
 */
export const groundedReview = async ({ draft, sources = [] }) => {
  if (!draft) return { ok: true, skipped: true, violations: [] }
  const result = await chatJson({
    prompt: PROMPTS.groundedReview,
    payload: { draft, source: sources.join('\n') },
    temperature: 0,
  })
  if (!result.ok) return { ok: true, skipped: true, reason: result.reason, violations: [] }
  const violations = Array.isArray(result.data?.violations)
    ? result.data.violations.map((item) => clean(item, 80)).filter(Boolean).slice(0, 5)
    : []
  return { ok: result.data?.grounded !== false && violations.length === 0, skipped: false, violations }
}

export const guardSummary = () => ({
  allowlistContacts: GLOBAL_CONTACT_ALLOWLIST,
  overPromiseWords: OVER_PROMISE_WORDS,
  rules: [
    '枚举白名单：category / risk / urgency / department 越界即丢弃',
    '风险不降级：risk 与 urgency 只允许持平或提升',
    '硬事实可追溯：电话 / 金额 / 时限必须出现在来源材料中',
    '来源不足即回退：知识库条目之外的信息不允许进入自助答复',
  ],
})
