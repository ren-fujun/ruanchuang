/**
 * B 部分 · 风险筛查 Agent（升级任务 2）
 *
 * 融合两路信号，输出「高 / 中 / 低」风险标签 + 配套干预建议：
 *   ① 文本：情绪词典（危机 / 安全 / 痛苦 / 冲突 / 焦虑）+ 程度副词 + 否定 + 标点强度；
 *   ② 行为时序：短时间重复提交、夜间高频提交、同类问题反复、历史超时与历史高风险。
 * 行为特征全部由工单历史实时计算，字段同时作为特征向量交给 D 训练时序预测模型。
 *
 * 红线：文本命中危机信号时直接判定高风险，行为分只加不减；本地规则判定过的高风险不允许被下调。
 */

import { departmentMap } from '../seed.js'
import { chatJson } from './llmClient.js'
import { PROMPTS } from './prompts.js'

const RISK_ORDER = { low: 0, medium: 1, high: 2 }

const DEFAULT_HIGH_SCORE = 7
const DEFAULT_MEDIUM_SCORE = 3.2

const num = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const riskThresholds = () => ({
  high: num(process.env.RISK_HIGH_SCORE, DEFAULT_HIGH_SCORE),
  medium: num(process.env.RISK_MEDIUM_SCORE, DEFAULT_MEDIUM_SCORE),
})

// ── 情绪词典 ────────────────────────────────────────────────
/** 危机表达：命中即高风险，权重只用于解释与排序 */
const CRISIS_LEXICON = [
  '不想活', '活着没意思', '想死', '自杀', '轻生', '结束生命', '自残', '割腕',
  '跳楼', '跳下去', '想不开', '死了算了', '不如死了', '撑不下去', '撑不住', '崩溃了',
  '活不下去', '一了百了', '遗书', '永别', '安眠药',
  '失联', '联系不上', '两天没回', '消失',
]

/** 安全类：漏电、消防、食品等即时危险；「救命 / 威胁」一类呼救与人身威胁按安全优先处理 */
const SAFETY_LEXICON = [
  '漏电', '触电', '电线冒火', '着火', '起火', '冒烟', '煤气', '中毒', '燃气泄漏',
  '消防通道', '灭火器缺失', '坍塌', '高空坠物', '被困', '电梯困人', '打架', '斗殴',
  '持刀', '持械', '威胁', '殴打', '霸凌', '欺凌', '食物中毒', '呕吐', '腹泻',
  '救命', '晕倒', '昏迷', '流血', '受伤', '溺水', '中暑', '摔伤',
]

const DISTRESS_LEXICON = [
  '绝望', '没有意义', '毫无意义', '喘不过气', '心慌', '害怕', '恐惧', '恐慌',
  '失眠', '睡不着', '整夜睡不着', '情绪低落', '难受', '痛苦', '压力大', '压抑',
  '孤独', '没人理解', '被孤立', '排挤', '委屈', '无助',
]

const CONFLICT_LEXICON = [
  '吵架', '争吵', '冲突', '矛盾', '关系紧张', '被骂', '辱骂', '骚扰', '排挤',
  '孤立', '针对我', '不公平', '投诉', '举报',
  '威胁', '恐吓', '打我', '动手', '欺负', '冷暴力',
]

const ANXIETY_LEXICON = ['焦虑', '紧张', '担心', '急', '催促', '等不了', '受不了', '烦躁', '无奈']

const POSITIVE_LEXICON = ['谢谢', '感谢', '辛苦了', '还好', '没关系', '不着急', '慢慢来']

const HELP_LEXICON = ['救命', '帮帮我', '紧急', '马上', '立刻', '尽快', '赶紧', '求助']

const DEGREE_STRONG = ['非常', '特别', '极其', '极度', '超级', '太', '十分', '严重', '一直', '反复', '连续']
const DEGREE_WEAK = ['有点', '稍微', '略微', '一点', '些许', '偶尔']

const DIMENSION_WEIGHT = {
  crisis: 4,
  safety: 3,
  distress: 1.6,
  conflict: 1.3,
  anxiety: 0.9,
  positive: -0.9,
}

const DIMENSION_LABEL = {
  crisis: '危机表达',
  safety: '安全风险',
  distress: '强烈痛苦',
  conflict: '冲突与关系',
  anxiety: '焦虑与压力',
  positive: '情绪缓和',
}

const LEXICON_BY_DIMENSION = {
  crisis: CRISIS_LEXICON,
  safety: SAFETY_LEXICON,
  distress: DISTRESS_LEXICON,
  conflict: CONFLICT_LEXICON,
  anxiety: ANXIETY_LEXICON,
  positive: POSITIVE_LEXICON,
}

const NEGATIONS = ['不', '没', '没有', '无', '别', '谈不上', '不算']

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * 文本情绪分析：词典命中 + 程度副词缩放 + 否定衰减 + 标点/重复字强度。
 * 危机与安全维度不参与否定衰减（「不想活」本身就是危机表达）。
 */
export const analyzeEmotion = (text) => {
  const source = String(text || '')
  const hits = []
  const dimensionScores = Object.fromEntries(Object.keys(DIMENSION_WEIGHT).map((key) => [key, 0]))

  for (const [dimension, lexicon] of Object.entries(LEXICON_BY_DIMENSION)) {
    for (const term of lexicon) {
      const index = source.indexOf(term)
      if (index < 0) continue
      let weight = DIMENSION_WEIGHT[dimension]
      const window = source.slice(Math.max(0, index - 3), index)
      const strong = DEGREE_STRONG.find((word) => window.includes(word))
      const weak = DEGREE_WEAK.find((word) => window.includes(word))
      if (strong) weight *= 1.5
      if (weak) weight *= 0.6
      const negated = dimension !== 'crisis' && dimension !== 'safety' && NEGATIONS.some((word) => window.includes(word))
      if (negated) weight *= 0.35
      dimensionScores[dimension] += weight
      hits.push({
        dimension,
        dimensionLabel: DIMENSION_LABEL[dimension],
        term,
        weight: Number(weight.toFixed(2)),
        negated,
      })
    }
  }

  const exclamations = (source.match(/[！!]/g) || []).length
  const questions = (source.match(/[？?]/g) || []).length
  const repeats = (source.match(/(.)\1{2,}/g) || []).length
  const punctuationBoost = clamp((exclamations + questions - 1) * 0.15, 0, 1) + clamp(repeats * 0.2, 0, 0.6)
  const helpHits = HELP_LEXICON.filter((word) => source.includes(word))

  const crisisScore = dimensionScores.crisis
  const safetyScore = dimensionScores.safety
  const negative = dimensionScores.distress + dimensionScores.conflict + dimensionScores.anxiety + crisisScore + safetyScore
  const positive = Math.abs(Math.min(0, dimensionScores.positive))
  const raw = negative + punctuationBoost + helpHits.length * 0.35 - positive
  const score = Number(clamp(raw, 0, 10).toFixed(2))
  const polarity = Number(clamp((positive - negative) / Math.max(2, negative + positive), -1, 1).toFixed(2))
  const dominant = Object.entries({
    crisis: crisisScore,
    safety: safetyScore,
    distress: dimensionScores.distress,
    conflict: dimensionScores.conflict,
    anxiety: dimensionScores.anxiety,
  })
    .sort((a, b) => b[1] - a[1])
    .filter(([, value]) => value > 0)[0]

  return {
    score,
    polarity,
    intensity: Number(clamp(score / 8, 0, 1).toFixed(2)),
    dominantDimension: dominant?.[0] || null,
    dominantLabel: dominant ? DIMENSION_LABEL[dominant[0]] : '平稳',
    label: dominant ? DIMENSION_LABEL[dominant[0]] : positive > 0 ? '情绪缓和' : '中性',
    hits: hits.sort((a, b) => b.weight - a.weight).slice(0, 8),
    boosters: { punctuationBoost: Number(punctuationBoost.toFixed(2)), helpWords: helpHits },
    dimensionScores: Object.fromEntries(Object.entries(dimensionScores).map(([key, value]) => [key, Number(value.toFixed(2))])),
    crisisHits: hits.filter((hit) => hit.dimension === 'crisis').map((hit) => hit.term),
    safetyHits: hits.filter((hit) => hit.dimension === 'safety').map((hit) => hit.term),
  }
}

/**
 * 行为时序特征：全部由工单历史推导，不依赖额外埋点。
 * history: [{ createdAt, category, risk, status, dueAt, updatedAt }]
 */
export const analyzeBehavior = (history = [], { now = Date.now() } = {}) => {
  const list = Array.isArray(history) ? history.filter((item) => item && item.createdAt) : []
  const times = list.map((item) => new Date(item.createdAt).getTime()).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  const within = (hours) => times.filter((time) => now - time <= hours * 3600000)
  const submits24h = within(24).length
  const submits72h = within(72).length
  const submits7d = within(24 * 7).length
  const nightSubmits = times.filter((time) => {
    const hour = new Date(time).getHours()
    return hour >= 22 || hour < 6
  }).length
  const nightRatio = times.length ? Number((nightSubmits / times.length).toFixed(2)) : 0
  const intervals = times.slice(1).map((time, index) => (time - times[index]) / 60000)
  const minIntervalMinutes = intervals.length ? Math.round(Math.min(...intervals)) : null
  const categories7d = list
    .filter((item) => now - new Date(item.createdAt).getTime() <= 7 * 24 * 3600000)
    .map((item) => item.category)
  const repeatCategory7d = categories7d.length
    ? Math.max(...Object.values(categories7d.reduce((acc, item) => ({ ...acc, [item]: (acc[item] || 0) + 1 }), {})))
    : 0
  const overdueCount = list.filter(
    (item) => item.dueAt && new Date(item.updatedAt || item.createdAt).getTime() > new Date(item.dueAt).getTime(),
  ).length
  const priorHighRisk30d = list.filter(
    (item) => item.risk === 'high' && now - new Date(item.createdAt).getTime() <= 30 * 24 * 3600000,
  ).length

  const signals = []
  let score = 0
  if (submits24h >= 3) {
    score += 2
    signals.push({ type: 'behavior', label: '24 小时内 3 次以上重复提交', weight: 2, evidence: `24h 内 ${submits24h} 单` })
  } else if (submits24h === 2) {
    score += 1
    signals.push({ type: 'behavior', label: '24 小时内再次提交', weight: 1, evidence: `24h 内 ${submits24h} 单` })
  }
  if (minIntervalMinutes !== null && minIntervalMinutes <= 30) {
    score += 1.5
    signals.push({ type: 'behavior', label: '极短间隔连续提交', weight: 1.5, evidence: `最短间隔 ${minIntervalMinutes} 分钟` })
  } else if (minIntervalMinutes !== null && minIntervalMinutes <= 120) {
    score += 0.8
    signals.push({ type: 'behavior', label: '短时间内连续提交', weight: 0.8, evidence: `最短间隔 ${minIntervalMinutes} 分钟` })
  }
  if (nightSubmits >= 2 && nightRatio >= 0.5) {
    score += 1.2
    signals.push({ type: 'behavior', label: '夜间高频提交', weight: 1.2, evidence: `夜间占比 ${Math.round(nightRatio * 100)}%` })
  }
  if (repeatCategory7d >= 3) {
    score += 1
    signals.push({ type: 'behavior', label: '同类问题反复提交', weight: 1, evidence: `7 天内同类 ${repeatCategory7d} 单` })
  }
  if (overdueCount >= 2) {
    score += 0.8
    signals.push({ type: 'behavior', label: '历史多次超时未办结', weight: 0.8, evidence: `历史超时 ${overdueCount} 单` })
  }
  if (priorHighRisk30d >= 1) {
    score += 1.5
    signals.push({ type: 'behavior', label: '30 天内出现过高风险诉求', weight: 1.5, evidence: `历史高风险 ${priorHighRisk30d} 单` })
  }

  return {
    features: {
      totalTickets: list.length,
      submits24h,
      submits72h,
      submits7d,
      nightSubmits,
      nightRatio,
      minIntervalMinutes,
      repeatCategory7d,
      overdueCount,
      priorHighRisk30d,
    },
    score: Number(clamp(score, 0, 6).toFixed(2)),
    signals,
  }
}

// ── 干预建议库 ──────────────────────────────────────────────
const INTERVENTIONS = {
  crisis: {
    level: 'high',
    deadline: '15 分钟内',
    channels: ['电话直呼', '线下当面'],
    notify: ['psych', 'office', 'security'],
    actions: [
      '立即电话联系学生本人，确认当下安全与所在位置',
      '同步心理中心值班咨询师介入，必要时启动危机干预流程',
      '通知学院辅导员与家长联系人，落实 24 小时包保跟进',
      '涉及失联、自伤或危及他人时联系保卫处协同寻找',
    ],
    script:
      '同学你好，我看到你的消息了，谢谢你愿意告诉我。我现在就联系你，我们先确认你此刻是安全的，好吗？你不需要一个人扛着。',
    followUp: ['24 小时内回访并记录状态', '72 小时内复评风险等级', '纳入重点关注名单持续跟踪'],
    resources: ['心理援助热线 0571-8820 8125', '紧急情况拨打 120 / 110'],
  },
  safety: {
    level: 'high',
    deadline: '30 分钟内',
    channels: ['电话直呼', '现场核查'],
    notify: ['security', 'logistics', 'dorm'],
    actions: [
      '第一时间电话核实现场是否有人受伤，必要时指导撤离',
      '联动保卫处与后勤到现场封控、断电或停用相关设施',
      '处置过程留证（照片、检修单），并邮件同步责任部门',
    ],
    script: '同学你好，这件事有安全风险，我们已经通知保卫处和后勤马上到场核查，请先远离危险区域，注意自身安全。',
    followUp: ['核查完成 2 小时内回填处置结果', '一周内回访确认隐患未复现'],
    resources: ['保卫处 0571-8820 7110', '火警 119 / 急救 120'],
  },
  conflict: {
    level: 'medium',
    deadline: '24 小时内',
    channels: ['当面沟通', '电话'],
    notify: ['security', 'psych', 'office'],
    actions: [
      '分别了解各方陈述，避免在群聊中定性',
      '评估是否存在人身安全风险，必要时启动保卫处介入',
      '安排心理中心评估涉事学生情绪状态，并跟进调解',
    ],
    script: '同学你好，你反映的情况我已经看到了。我想先单独听听你的说法，我们一起把它处理好，不会让你一个人面对。',
    followUp: ['3 日内回访确认冲突是否缓解', '必要时安排调解并留档'],
    resources: ['心理健康教育中心 0571-8820 8125'],
  },
  distress: {
    level: 'medium',
    deadline: '24 小时内',
    channels: ['电话', '当面'],
    notify: ['psych', 'office'],
    actions: [
      '主动联系学生，先接住情绪再讨论具体诉求',
      '评估睡眠、饮食与社会支持情况，必要时转介心理中心',
      '把诉求转成可执行事项，给出明确的时间点',
    ],
    script: '同学你好，听得出你最近这段时间挺不容易的。你的诉求我已经记下了，我们先聊聊你现在的状态，具体的事情我来协调。',
    followUp: ['48 小时内回访情绪变化', '一周内确认诉求是否落地'],
    resources: ['心理中心预约：浙青心苑公众号', '24 小时心理援助热线 0571-8820 8125'],
  },
  routine: {
    level: 'low',
    deadline: '按 SLA 时限',
    channels: ['站内通知'],
    notify: [],
    actions: ['按常规流程派单并同步办理进度', '办结后邀请学生评价，沉淀办事知识库'],
    script: '同学你好，你的诉求已经收到，我们会按流程跟进，有进展第一时间同步你。',
    followUp: ['办结后 3 日内确认满意度'],
    resources: [],
  },
}

const pickIntervention = (level, dominantDimension) => {
  if (dominantDimension === 'crisis') return INTERVENTIONS.crisis
  if (dominantDimension === 'safety') return INTERVENTIONS.safety
  if (level === 'high') return INTERVENTIONS.crisis
  if (dominantDimension === 'conflict') return INTERVENTIONS.conflict
  if (level === 'medium') return INTERVENTIONS.distress
  return INTERVENTIONS.routine
}

/**
 * 风险筛查主入口。
 * @param {{ text: string, history?: object[], category?: string, location?: string, baseRisk?: string, now?: number }} payload
 */
export const scanRisk = ({ text = '', history = [], category = '', location = '', baseRisk = 'low', now = Date.now() } = {}) => {
  const emotion = analyzeEmotion(text)
  const behavior = analyzeBehavior(history, { now })
  const thresholds = riskThresholds()
  const total = Number((emotion.score + behavior.score).toFixed(2))

  const signals = [
    ...emotion.hits.map((hit) => ({
      type: hit.dimension === 'crisis' ? 'crisis' : hit.dimension === 'safety' ? 'safety' : 'emotion',
      label: `${hit.dimensionLabel}：${hit.term}`,
      weight: hit.weight,
      evidence: hit.negated ? `原文「${hit.term}」（含否定语境，已衰减）` : `原文「${hit.term}」`,
    })),
    ...behavior.signals,
  ]

  let level = 'low'
  const reasons = []
  if (emotion.crisisHits.length) {
    level = 'high'
    reasons.push(`命中危机表达：${emotion.crisisHits.join('、')}`)
  } else if (emotion.safetyHits.length) {
    level = 'high'
    reasons.push(`命中即时安全信号：${emotion.safetyHits.join('、')}`)
  } else if (total >= thresholds.high) {
    level = 'high'
    reasons.push(`融合分 ${total} ≥ 高风险阈值 ${thresholds.high}`)
  } else if (total >= thresholds.medium) {
    level = 'medium'
    reasons.push(`融合分 ${total} ≥ 中风险阈值 ${thresholds.medium}`)
  } else {
    reasons.push(`融合分 ${total} 低于中风险阈值 ${thresholds.medium}`)
  }

  if (RISK_ORDER[baseRisk] > RISK_ORDER[level]) {
    level = baseRisk
    reasons.push(`本地规则已判定为${baseRisk === 'high' ? '高' : '中'}风险，按不降级原则保持`)
  }
  if (behavior.signals.length && level === 'low' && behavior.score >= 2) {
    level = 'medium'
    reasons.push(`行为时序特征异常（${behavior.signals.map((signal) => signal.label).join('、')}），提升为中风险以便主动跟进`)
  }
  // 人际冲突类信号有升级为舆情或人身安全事件的先例，单独设中风险下限
  if (level === 'low' && emotion.dimensionScores.conflict > 0) {
    level = 'medium'
    reasons.push('存在人际冲突信号，建议 24 小时内主动跟进核实')
  }

  const intervention = pickIntervention(level, emotion.dominantDimension || (emotion.safetyHits.length ? 'safety' : null))
  const notifyDepartments = [...new Set([...(intervention.notify || []), ...(level === 'high' ? ['psych'] : [])])]
    .filter((id) => departmentMap[id])
    .map((id) => ({ id, name: departmentMap[id].name, short: departmentMap[id].short, phone: departmentMap[id].phone }))

  const confidence = Number(
    clamp(
      0.55 +
        Math.min(signals.length, 6) * 0.05 +
        (emotion.crisisHits.length || emotion.safetyHits.length ? 0.15 : 0) +
        (behavior.features.totalTickets >= 3 ? 0.08 : 0),
      0.5,
      0.96,
    ).toFixed(2),
  )

  return {
    level,
    levelLabel: level === 'high' ? '高风险' : level === 'medium' ? '中风险' : '低风险',
    score: total,
    thresholds,
    reasons,
    signals: signals.slice(0, 10),
    dimensions: {
      emotion: {
        score: emotion.score,
        polarity: emotion.polarity,
        intensity: emotion.intensity,
        label: emotion.label,
        dominantDimension: emotion.dominantDimension,
        hits: emotion.hits,
        boosters: emotion.boosters,
        dimensionScores: emotion.dimensionScores,
      },
      behavior: {
        score: behavior.score,
        features: behavior.features,
        signals: behavior.signals,
      },
    },
    intervention: {
      ...intervention,
      notifyDepartments,
      tone: level === 'high' ? 'coral' : level === 'medium' ? 'amber' : 'mint',
    },
    slaMinutes: level === 'high' ? 60 : level === 'medium' ? 120 : 240,
    confidence,
    engine: 'rule-fusion',
    at: new Date(now).toISOString(),
  }
}

/**
 * 可选模型增强：模型只能补充「情绪解读 / 行为解读 / 干预话术」，
 * 风险等级与数值分完全由规则融合决定（幻觉可控）。
 */
export const refineRiskScan = async (scan, { text } = {}) => {
  if (!scan) return scan
  const result = await chatJson({
    prompt: PROMPTS.riskScan,
    payload: {
      text,
      behavior: scan.dimensions.behavior.features,
      ruleSignals: scan.signals.map((item) => item.label),
    },
    temperature: 0.1,
  })
  if (!result.ok) return { ...scan, model: { applied: false, reason: result.reason } }
  const data = result.data || {}
  const suggestion = String(data.suggestion || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const behaviorNote = String(data.behaviorNote || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const label = String(data.emotion?.label || '').replace(/\s+/g, ' ').trim().slice(0, 12)
  return {
    ...scan,
    dimensions: {
      ...scan.dimensions,
      emotion: { ...scan.dimensions.emotion, modelLabel: label || undefined },
      behavior: { ...scan.dimensions.behavior, modelNote: behaviorNote || undefined },
    },
    intervention: { ...scan.intervention, modelSuggestion: suggestion || undefined },
    model: { applied: true, promptId: PROMPTS.riskScan.id, version: PROMPTS.riskScan.version },
  }
}

export const riskLexiconSummary = () => ({
  crisis: CRISIS_LEXICON.length,
  safety: SAFETY_LEXICON.length,
  distress: DISTRESS_LEXICON.length,
  conflict: CONFLICT_LEXICON.length,
  anxiety: ANXIETY_LEXICON.length,
  thresholds: riskThresholds(),
})
