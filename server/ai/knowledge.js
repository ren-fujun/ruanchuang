/**
 * B 部分 · 校园知识库检索（基础任务 2：调优知识库检索阈值，提升自助答复准确率）
 *
 * 相比最初的「关键词命中即返回」，这里做了三件事：
 *   1. 打分：中文 bigram + 字段加权 + BM25，长关键词额外加权，避免「宿舍」命中就抢答。
 *   2. 同义词扩展：一卡通/校园卡/饭卡 这类同一实体的不同叫法先归一，再检索。
 *   3. 分层阈值：confident / probable / weak 三档，只有 confident 才允许「自助解决」，
 *      probable 给参考但建议转人工，weak 直接不给答案 —— 用阈值换准确率。
 *
 * 环境变量（可选）：KB_MIN_SCORE（默认 2.4）、KB_CONFIDENT_SCORE（默认 4.5）、KB_AMBIGUITY_RATIO（默认 0.85）
 */

import { knowledgeBase } from '../seed.js'

const DEFAULT_MIN_SCORE = 2.4
const DEFAULT_CONFIDENT_SCORE = 4.5
const DEFAULT_AMBIGUITY_RATIO = 0.85
const BM25_K1 = 1.4
const BM25_B = 0.75

const num = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const kbConfig = () => ({
  minScore: num(process.env.KB_MIN_SCORE, DEFAULT_MIN_SCORE),
  confidentScore: num(process.env.KB_CONFIDENT_SCORE, DEFAULT_CONFIDENT_SCORE),
  ambiguityRatio: num(process.env.KB_AMBIGUITY_RATIO, DEFAULT_AMBIGUITY_RATIO),
})

/** 同义词归一：同一件事的不同叫法，命中任意一个即当作命中整组 */
export const SYNONYM_GROUPS = [
  ['一卡通', '校园卡', '饭卡', '卡'],
  ['断电', '停电', '跳闸', '没电', '断电了'],
  ['漏水', '渗水', '跑水', '水龙头'],
  ['断网', '没网', '连不上网', '网络故障', '网断了'],
  ['热水', '洗澡水', '开水'],
  ['报修', '维修', '修理'],
  ['心理咨询', '心理辅导', '心理中心', '看心理'],
  ['在读证明', '学籍证明', '在籍证明', '证明'],
  ['助学金', '奖学金', '资助', '困难认定', '补助'],
  ['补办', '挂失', '补卡'],
  ['延期毕业', '延毕', '延迟毕业'],
  ['宿舍', '寝室', '公寓'],
]

const SYNONYM_LOOKUP = (() => {
  const map = new Map()
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) map.set(word, group)
  }
  return map
})()

const PUNCTUATION = /[\s，。！？、；：,.!?;:（）()【】\[\]「」“”"'’‘~～·—\-_/\\|@#$%^&*+=<>]/g

export const normalize = (text) => String(text || '').toLowerCase().replace(PUNCTUATION, '')

/**
 * 泛化词（无效检索词）：几乎所有诉求都会出现，几乎每篇知识库也都含有。
 * 它们不携带主题信息，但会靠 BM25 拼出虚高分（例如只写「问题」也能凑到 minScore 以上），
 * 因此在建索引与检索时一并剔除；不影响 keywordBonus（关键词精确命中仍走原文比对）。
 */
const GENERIC_TERMS = new Set([
  '问题', '情况', '事情', '东西', '方面', '时候', '现在', '目前', '今天', '明天', '昨天', '最近',
  '有点', '一些', '一下', '一直', '已经', '还是', '但是', '因为', '所以', '如果', '可以', '应该',
  '需要', '希望', '麻烦', '帮忙', '求助', '请问', '谢谢', '你们', '我们', '他们', '学校', '老师',
  '同学', '大家', '自己', '什么', '怎么', '为什么', '哪里', '这个', '那个', '哪个', '就是', '真的',
  '特别', '非常', '比较', '可能', '觉得', '感觉', '知道', '想要', '要求', '建议', '反映', '反馈',
  '处理', '解决', '尽快', '马上', '立刻', '如何', '不能', '没有', '还有', '以及', '或者', '然后',
  '看着办', '算了', '随便', '没事', '不好', '不行', '到底', '究竟',
])

/** 整词剔除泛化词，返回带分隔符的文本（保留分词边界） */
const stripGeneric = (normalized) => {
  let text = normalized
  for (const term of GENERIC_TERMS) {
    if (text.includes(term)) text = text.split(term).join(' ')
  }
  return text
}

/**
 * 中文检索分词：ascii 词 + 单字 + 双字 bigram。
 * 单字保留是因为「卡」「灯」这类短诉求经常只出现一个字；bigram 负责区分「漏水」与「热水」。
 * 泛化词在建 bigram 之前就整词剔除，避免出现「点问」「题你」这类跨词噪声 bigram。
 */
export const tokenize = (text) => {
  const normalized = stripGeneric(normalize(text))
  const tokens = []
  const ascii = normalized.match(/[a-z0-9]+/g) || []
  tokens.push(...ascii)
  const cjk = normalized.replace(/[a-z0-9]+/g, ' ')
  for (const chunk of cjk.split(/\s+/)) {
    if (!chunk) continue
    for (let i = 0; i < chunk.length; i += 1) {
      tokens.push(chunk[i])
      if (i + 1 < chunk.length) tokens.push(chunk.slice(i, i + 2))
    }
  }
  return tokens.filter((token) => token.trim() && !GENERIC_TERMS.has(token))
}

const expandSynonyms = (tokens) => {
  const expanded = new Set(tokens)
  for (const token of tokens) {
    const group = SYNONYM_LOOKUP.get(token)
    if (group) group.forEach((word) => expanded.add(word))
  }
  return [...expanded]
}

/** 字段权重：标题与关键词权重最高，答复正文最低，避免长文本靠字数刷分 */
const FIELD_WEIGHTS = [
  { field: 'title', weight: 3 },
  { field: 'keywords', weight: 3 },
  { field: 'summary', weight: 1.4 },
  { field: 'answer', weight: 1 },
  { field: 'steps', weight: 1.2 },
  { field: 'category', weight: 1.5 },
]

const buildIndex = () => {
  const docs = knowledgeBase.map((item) => {
    const tokens = []
    for (const { field, weight } of FIELD_WEIGHTS) {
      const value = item[field]
      const text = Array.isArray(value) ? value.join(' ') : String(value || '')
      const fieldTokens = tokenize(text)
      for (let i = 0; i < weight; i += 1) tokens.push(...fieldTokens)
    }
    const tf = new Map()
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1)
    return { item, tf, length: tokens.length }
  })
  const df = new Map()
  for (const doc of docs) {
    for (const token of doc.tf.keys()) df.set(token, (df.get(token) || 0) + 1)
  }
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / (docs.length || 1)
  return { docs, df, avgLength, total: docs.length }
}

let index = buildIndex()

/** 重建索引（知识库热更新后调用） */
export const rebuildIndex = () => {
  index = buildIndex()
  return knowledgeIndexStats()
}

const idf = (token) => {
  const df = index.df.get(token) || 0
  return Math.log(1 + (index.total - df + 0.5) / (df + 0.5))
}

const bm25 = (doc, tokens) => {
  let score = 0
  for (const token of tokens) {
    const tf = doc.tf.get(token)
    if (!tf) continue
    const denominator = tf + BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / (index.avgLength || 1))
    score += idf(token) * ((tf * (BM25_K1 + 1)) / denominator)
  }
  return score
}

/** 关键词精确命中加分：整词出现在原文里的信号强于 bigram 拼出来的相似 */
const keywordBonus = (doc, normalizedText, tokens) => {
  let bonus = 0
  const matched = []
  for (const keyword of doc.item.keywords || []) {
    const normalizedKeyword = normalize(keyword)
    if (!normalizedKeyword) continue
    const hit = normalizedText.includes(normalizedKeyword)
    const synonymHit = !hit && (SYNONYM_LOOKUP.get(normalizedKeyword) || []).some((word) => normalizedText.includes(normalize(word)))
    if (hit || synonymHit) {
      const base = normalizedKeyword.length >= 3 ? 1.6 : normalizedKeyword.length === 2 ? 1.1 : 0.7
      bonus += synonymHit && !hit ? base * 0.8 : base
      matched.push(keyword)
    }
  }
  // 领域词（如「报修」）出现在标题里再补一点，提升可解释性
  const titleTokens = new Set(tokenize(doc.item.title))
  const overlap = tokens.filter((token) => titleTokens.has(token)).length
  bonus += Math.min(0.8, overlap * 0.12)
  // 强证据：命中关键词，或与标题共享 ≥2 个多字词。
  // 只有单字重合（如「卡住」撞上「校园卡」）不足以给出高置信结论。
  const multiCharOverlap = tokens.filter((token) => token.length >= 2 && doc.tf.has(token)).length
  const strongEvidence = matched.length > 0 || multiCharOverlap >= 2
  return { bonus, matched, strongEvidence }
}

const tierOf = (score, confidentScore) => {
  if (score >= confidentScore) return 'confident'
  return 'probable'
}

/**
 * 详细检索结果：供 precheck、评测脚本与 /api/ai/kb/search 使用。
 * @returns {{ item: object|null, score: number, tier: 'confident'|'probable'|'weak'|'none', confidence: number, matchedTerms: string[], related: string[], ambiguous: boolean, threshold: object }}
 */
export const searchKnowledgeDetailed = (text, options = {}) => {
  const config = { ...kbConfig(), ...options }
  const normalizedText = normalize(text)
  const baseTokens = tokenize(text)
  const tokens = expandSynonyms(baseTokens)
  const ranked = index.docs
    .map((doc) => {
      const { bonus, matched, strongEvidence } = keywordBonus(doc, normalizedText, baseTokens)
      const score = bm25(doc, tokens) * 0.35 + bonus
      return { item: doc.item, score: Number(score.toFixed(3)), matchedTerms: matched, strongEvidence }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const runnerUp = ranked[1]
  const ambiguous = Boolean(
    best && runnerUp && runnerUp.score / best.score >= config.ambiguityRatio && runnerUp.item.id !== best.item.id,
  )
  // 诉求过短时信息量不足，即便分数高也不给「可自助」结论（阈值调优的兜底规则）
  const shortQuery = normalizedText.length < 4

  const threshold = {
    minScore: config.minScore,
    confidentScore: config.confidentScore,
    ambiguityRatio: config.ambiguityRatio,
  }

  if (!best || best.score < config.minScore) {
    return {
      item: null,
      score: best?.score || 0,
      tier: 'none',
      confidence: 0,
      matchedTerms: best?.matchedTerms || [],
      related: ranked.slice(0, 2).map((entry) => entry.item.title),
      ambiguous: false,
      shortQuery,
      threshold,
    }
  }

  let tier = tierOf(best.score, config.confidentScore)
  if (ambiguous && tier === 'confident') tier = 'probable'
  if (!best.strongEvidence && tier === 'confident') tier = 'probable'
  if (shortQuery && tier === 'confident') tier = 'probable'
  const confidence = Number(
    Math.min(0.96, 0.42 + best.score / 14 - (ambiguous ? 0.12 : 0) + (tier === 'confident' ? 0.06 : 0)).toFixed(2),
  )

  return {
    item: best.item,
    score: best.score,
    tier,
    confidence,
    matchedTerms: best.matchedTerms,
    related: ranked.slice(1, 3).map((entry) => entry.item.title),
    ambiguous,
    shortQuery,
    strongEvidence: best.strongEvidence,
    runnerUp: runnerUp ? { id: runnerUp.item.id, title: runnerUp.item.title, score: runnerUp.score } : null,
    threshold,
  }
}

/** 兼容旧调用：返回条目本身 + matchScore + related */
export const searchKnowledge = (text) => {
  const result = searchKnowledgeDetailed(text)
  if (!result.item) return null
  return {
    ...result.item,
    matchScore: result.score,
    matchTier: result.tier,
    confidence: result.confidence,
    matchedTerms: result.matchedTerms,
    related: result.related,
    shortQuery: result.shortQuery,
  }
}

export const knowledgeIndexStats = () => ({
  docs: index.docs.length,
  vocabulary: index.df.size,
  avgDocLength: Number(index.avgLength.toFixed(1)),
  synonyms: SYNONYM_GROUPS.length,
  threshold: kbConfig(),
})

export const knowledgeItems = () => knowledgeBase
