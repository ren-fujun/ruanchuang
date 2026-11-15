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
  (typeof value === 'string' ? value : '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)

const lowerEnum = (value, allowed) => {
  const normalized = clean(value, 24).toLowerCase()
  return allowed.includes(normalized) ? normalized : null
}

const normalize = (text) => String(text ?? '').normalize('NFKC').replace(/\p{Cf}/gu, '')

/** 电话 / 号码候选：先剔除时间（9:00–11:30）避免误判，再抽取「最多两段分隔」的数字串，
 *  这样既能识别「0571-8820 3103」，也不会把相邻的两个号码贪婪地连成一个超长串。 */
const TIME_RE = /\d{1,2}:\d{2}(?::\d{2})?/g
const PHONE_RE = /(?:\(0\d{2,3}\)[ -]?)?\d+(?:[- ]\d+){0,2}/g
const CONTACT_PREFIX_RE = /(?:电话(?:号码)?|热线|拨打|致电|联系(?:方式)?)\s*(?:(?:为|是|:)\s*)?(?:[()\d -]+(?:[/、]|或|和)\s*)*$/
const LANDLINE_RE = /^0\d{2,3}([2-9]\d{6,7})$/
const QUANTITY = String.raw`(?:(?<![\d.])\d+(?:\.\d+)?|(?<![零〇一二两三四五六七八九十百千])[零〇一二两三四五六七八九十百千]+)`
const MONEY_RE = new RegExp(String.raw`${QUANTITY}\s*(?:万元|元|块)`, 'g')
const DURATION_RE = new RegExp(String.raw`${QUANTITY}\s*(?:个\s*)?(?:工作日|分钟|小时|天|周|月)`, 'g')

const digitsOnly = (value) => String(value).replace(/\D/g, '')

/** 允许省略来源中已存在的固定电话区号 */
const phoneKnown = (phone, known) =>
  known.some((item) => item === phone || item.match(LANDLINE_RE)?.[1] === phone)

/** 抽取文本里的硬事实：电话号码、金额、时限 */
export const extractFacts = (text) => {
  const source = normalize(text).replace(TIME_RE, ' ')
  const phones = []
  for (const match of source.matchAll(PHONE_RE)) {
    const phone = digitsOnly(match[0])
    const explicit = CONTACT_PREFIX_RE.test(source.slice(Math.max(0, match.index - 40), match.index))
    if (explicit ? phone.length >= 3 : phone.length >= 5 && phone.length <= 13) phones.push(phone)
  }
  const money = (source.match(MONEY_RE) || []).map((item) => item.replace(/\s/g, ''))
  const duration = (source.match(DURATION_RE) || []).map((item) => item.replace(/\s/g, ''))
  return { phones: [...new Set(phones)], money: [...new Set(money)], duration: [...new Set(duration)] }
}

/**
 * 校验模型答复是否可追溯。
 * @returns {{ ok: boolean, violations: string[], answer: string }}
 */
export const guardAnswerText = ({ answer, sources = [], fallback = '', maxLength = 400, allowPublicContacts = true }) => {
  const text = clean(answer, Infinity)
  const violations = []
  if (!text) return { ok: false, violations: ['空答复'], answer: fallback }
  if (text.length > maxLength) return { ok: false, violations: ['答复超长'], answer: fallback }

  const normalized = normalize(text)
  const overPromise = OVER_PROMISE_WORDS.find((word) => normalized.includes(word))
  if (overPromise) violations.push(`过度承诺：${overPromise}`)

  const sourceFacts = extractFacts(sources.join('\n'))
  const answerFacts = extractFacts(text)
  const knownPhones = allowPublicContacts ? [...sourceFacts.phones, ...GLOBAL_CONTACT_ALLOWLIST] : sourceFacts.phones
  const unknownPhones = answerFacts.phones.filter((phone) => !phoneKnown(phone, knownPhones))
  if (unknownPhones.length) violations.push(`来源中不存在的电话：${unknownPhones.join('、')}`)
  const unknownMoney = answerFacts.money.filter((item) => !sourceFacts.money.includes(item))
  if (unknownMoney.length) violations.push(`来源中不存在的金额：${unknownMoney.join('、')}`)
  const unknownDuration = answerFacts.duration.filter((item) => !sourceFacts.duration.includes(item))
  if (unknownDuration.length) violations.push(`来源中不存在的时限：${unknownDuration.join('、')}`)
  const normalizedLower = normalized.toLowerCase()
  if (INJECTION_MARKERS.some((marker) => normalizedLower.includes(marker))) {
    violations.push('疑似提示词注入残留')
  }

  return { ok: violations.length === 0, violations, answer: violations.length ? fallback : text }
}

/**
 * 合并模型结果与规则结果：模型只能补充与提升，不能删改红线字段。
 * @returns {{ analysis: object, applied: string[], rejected: string[] }}
 */
export const guardAnalysis = ({ llm, base, sourceText = '', categories = [], deptIds = [] }) => {
  const applied = []
  const rejected = []
  const analysis = { ...base }
  if (!llm || typeof llm !== 'object' || Array.isArray(llm)) {
    return { analysis, applied, rejected: ['模型未返回对象'] }
  }
  const sources = [sourceText, base.summary, base.riskReason]

  const applyText = (field, maxLength) => {
    if (typeof llm[field] !== 'string' || !llm[field].trim()) return
    const isDraft = field === 'draft'
    const checked = guardAnswerText({
      answer: llm[field],
      sources: isDraft ? [base.draft] : sources,
      maxLength,
      allowPublicContacts: isDraft,
    })
    if (!checked.ok) {
      rejected.push(`${field}:${checked.violations.join('；')}`)
      return
    }
    analysis[field] = checked.answer
    applied.push(field)
  }

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

  if (base.risk === 'low') applyText('riskReason', 160)
  else if (llm.riskReason && llm.riskReason !== base.riskReason) rejected.push('riskReason 保留规则风控依据')
  applyText('sentiment', 40)
  applyText('summary', 200)
  applyText('draft', 400)

  if (Array.isArray(llm.suggestedDepartments) && deptIds.length) {
    const suggested = llm.suggestedDepartments
      .map((id) => clean(id, 24))
      .filter((id) => deptIds.includes(id))
    const dropped = llm.suggestedDepartments.length - suggested.length
    if (dropped > 0) rejected.push(`suggestedDepartments 越界 ${dropped} 个`)
    if (suggested.length) {
      analysis.suggestedDepartments = [...new Set(suggested)].slice(0, 4)
      applied.push('suggestedDepartments')
    }
  }

  if (Array.isArray(llm.tags)) {
    const tags = llm.tags
      .map((answer) => guardAnswerText({ answer, sources, maxLength: 12, allowPublicContacts: false }).answer)
      .filter(Boolean)
      .slice(0, 5)
    if (tags.length) {
      analysis.tags = tags
      applied.push('tags')
    }
  }

  if (llm.elements && typeof llm.elements === 'object') {
    const allowed = ['location', 'object', 'phenomenon', 'timeHint', 'demand']
    const elements = Object.fromEntries(
      allowed
        .map((key) => [key, guardAnswerText({ answer: llm.elements[key], sources, maxLength: 40, allowPublicContacts: false }).answer])
        .filter(([, value]) => value),
    )
    if (Object.keys(elements).length) {
      analysis.elements = { ...analysis.elements, ...elements }
      applied.push('elements')
    }
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
  return { ok: result.data.grounded === true && violations.length === 0, skipped: false, violations }
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
