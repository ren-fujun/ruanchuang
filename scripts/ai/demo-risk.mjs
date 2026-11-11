/**
 * B 部分 · 风险筛查 Agent 预警 Demo（交付标准：风险预警 Demo，可稳定触发风险标签）
 *
 * 用法（仓库根目录）：
 *   node scripts/ai/demo-risk.mjs            打印风险标签触发过程，并导出 JSON
 *   node scripts/ai/demo-risk.mjs --repeat 5 额外做稳定性复跑（默认 3 次），验证标签可稳定触发
 *
 * 演示内容：
 *   1. 情绪维度识别（危机 / 即时安全 / 困扰 / 人际冲突 / 焦虑 / 正向）+ 程度副词 + 否定衰减 + 标点强化
 *   2. 行为时序特征（24h/72h/7d 提交量、夜间占比、最短间隔、同类重复、历史超时、30 天内高风险）
 *   3. 融合打分 → 高 / 中 / 低风险标签 + 干预建议 + 通知部门 + SLA
 *   4. 红线校验：危机与即时安全表达必定高风险；本地规则已判定的风险不会被下调
 *   5. 同文本不同历史的行为升级对照（说明「行为时序特征」确实参与判定）
 *
 * 产物：scripts/ai/out/risk-demo.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { analyzeBehavior, analyzeEmotion, riskLexiconSummary, riskThresholds, scanRisk } from '../../server/ai/riskAgent.js'
import { departmentMap } from '../../server/seed.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'out')
const repeatArg = process.argv.indexOf('--repeat')
const REPEAT = repeatArg > -1 ? Math.max(1, Number(process.argv[repeatArg + 1]) || 3) : 3

const line = (char = '─', width = 92) => char.repeat(width)
const deptName = (id) => departmentMap[id]?.name || id

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString()
/** 指定「昨天/今天」的某个钟点，用来构造夜间提交 */
const atHour = (dayOffset, hour) => {
  const date = new Date()
  date.setDate(date.getDate() - dayOffset)
  date.setHours(hour, 15, 0, 0)
  return date.toISOString()
}

/** 行为时序样例 A：24 小时内 3 单、其中 2 单夜间、最短间隔 4 小时 */
const busyHistory = [
  { id: 'H-01', category: '宿舍生活', risk: 'low', status: 'completed', createdAt: atHour(1, 23), updatedAt: atHour(1, 8), dueAt: atHour(1, 12) },
  { id: 'H-02', category: '宿舍生活', risk: 'medium', status: 'processing', createdAt: atHour(0, 2), updatedAt: atHour(0, 3), dueAt: atHour(0, 8) },
  { id: 'H-03', category: '宿舍生活', risk: 'high', status: 'pending_review', createdAt: hoursAgo(6), updatedAt: hoursAgo(5), dueAt: hoursAgo(4) },
]

/** 行为时序样例 B：一个月内多次同类超时 + 历史高风险（白天提交，避开夜间权重干扰） */
const chronicHistory = [
  { id: 'C-01', category: '宿舍生活', risk: 'high', status: 'completed', createdAt: atHour(26, 10), updatedAt: atHour(24, 16), dueAt: atHour(25, 10) },
  { id: 'C-02', category: '宿舍生活', risk: 'medium', status: 'completed', createdAt: atHour(18, 11), updatedAt: atHour(15, 15), dueAt: atHour(17, 11) },
  { id: 'C-03', category: '宿舍生活', risk: 'low', status: 'completed', createdAt: atHour(9, 14), updatedAt: atHour(8, 9), dueAt: atHour(8, 14) },
  { id: 'C-04', category: '宿舍生活', risk: 'medium', status: 'processing', createdAt: atHour(3, 9), updatedAt: atHour(2, 9), dueAt: atHour(2, 9) },
]

const CASES = [
  {
    id: 'R-01',
    desc: '危机表达 → 高风险（危机词命中即置高，不依赖分数累加）',
    text: '我最近压力很大，撑不住了，觉得活着没意思，不想回寝室',
    expectLevel: 'high',
  },
  {
    id: 'R-02',
    desc: '即时安全信号 → 高风险（漏电 / 着火 / 消防通道一类）',
    text: '宿舍楼消防通道被电动车占用，还有飞线充电，万一着火跑不出去，有人触电怎么办',
    expectLevel: 'high',
  },
  {
    id: 'R-03',
    desc: '人际冲突（无即时危险）→ 中风险下限，24 小时内主动跟进',
    text: '室友半夜打游戏很吵，跟他沟通还被骂，我想申请调宿',
    expectLevel: 'medium',
  },
  {
    id: 'R-04',
    desc: '人身威胁表达 → 高风险（威胁 / 殴打一类按安全优先，不降级）',
    text: '室友因为占位的事跟我吵起来，威胁要打我，我有点害怕',
    expectLevel: 'high',
  },
  {
    id: 'R-05',
    desc: '危机词不做否定衰减：宁可误报也不放过（安全优先设计）',
    text: '我不是想不开，就是课程太难了，想问问有没有补考安排',
    expectLevel: 'high',
  },
  {
    id: 'R-06',
    desc: '行为时序融合（异常历史）→ 同一文本由低升为中风险',
    text: '宿舍空调不制冷，希望安排维修',
    history: busyHistory,
    expectLevel: 'medium',
  },
  {
    id: 'R-07',
    desc: '行为时序融合（无异常历史，对照组）→ 低风险',
    text: '宿舍空调不制冷，希望安排维修',
    history: [],
    expectLevel: 'low',
  },
  {
    id: 'R-08',
    desc: '长期同类重复 + 历史多次超时 + 30 天内高风险 → 中风险',
    text: '宿舍热水器又坏了，这是这个月第三次了，还是没人来修',
    history: chronicHistory,
    expectLevel: 'medium',
  },
  {
    id: 'R-09',
    desc: '规则已判定的高风险不被下调（不降级原则）',
    text: '操场的路灯坏了三盏，晚上跑步看不清路',
    baseRisk: 'high',
    expectLevel: 'high',
  },
]

const RISK_ORDER = { low: 0, medium: 1, high: 2 }
const report = {
  generatedAt: new Date().toISOString(),
  engine: 'rule-fusion',
  thresholds: riskThresholds(),
  lexicon: riskLexiconSummary(),
  cases: [],
  stability: null,
}

if (!process.argv.includes('--quiet')) {
  console.log(line('='))
  console.log('风险筛查 Agent · 风险预警 Demo（B 部分）')
  console.log(line('='))
  console.log(
    `情绪词典：危机 ${report.lexicon.crisis} 词 / 即时安全 ${report.lexicon.safety} 词 / 困扰 ${report.lexicon.distress} 词 / ` +
      `人际冲突 ${report.lexicon.conflict} 词 / 焦虑 ${report.lexicon.anxiety} 词`,
  )
  console.log(
    `融合阈值：高风险 ≥ ${report.thresholds.high}｜中风险 ≥ ${report.thresholds.medium}｜危机与即时安全信号直接置高`,
  )
  console.log('')
}

let failed = 0
for (const item of CASES) {
  const scan = scanRisk({ text: item.text, history: item.history || [], baseRisk: item.baseRisk || 'low' })
  // 标签必须与预期完全一致：既不能漏报（低于预期），也不能误报（高于预期）
  const pass = scan.level === item.expectLevel
  if (!pass) failed += 1
  report.cases.push({
    id: item.id,
    desc: item.desc,
    text: item.text,
    historyCount: (item.history || []).length,
    baseRisk: item.baseRisk || 'low',
    expectLevel: item.expectLevel,
    pass,
    label: scan.levelLabel,
    level: scan.level,
    score: scan.score,
    confidence: scan.confidence,
    reasons: scan.reasons,
    signals: scan.signals,
    emotion: scan.dimensions.emotion,
    behavior: scan.dimensions.behavior,
    intervention: scan.intervention,
    slaMinutes: scan.slaMinutes,
  })

  console.log(line())
  console.log(`${pass ? '✓' : '✗'} [${item.id}] ${item.desc}`)
  if (!pass) {
    console.log(
      `  ↳ 标签不符合预期：期望 ${item.expectLevel}，实际 ${scan.level}（${
        RISK_ORDER[scan.level] < RISK_ORDER[item.expectLevel] ? '漏报' : '误报'
      }）`,
    )
  }
  console.log(`诉求原文：${item.text}`)
  if ((item.history || []).length) console.log(`历史工单：${item.history.length} 单（行为时序特征参与融合）`)
  console.log(`  风险标签：${scan.levelLabel}（${scan.level}）｜融合分 ${scan.score}｜置信度 ${scan.confidence}｜SLA ${scan.slaMinutes} 分钟`)
  console.log(`  判定依据：${scan.reasons.join('；')}`)
  console.log(
    `  情绪维度：${Object.entries(scan.dimensions.emotion.dimensionScores)
      .filter(([, score]) => score > 0)
      .map(([dim, score]) => `${dim}:${score}`)
      .join('、') || '无'}｜极性 ${scan.dimensions.emotion.polarity}｜强度 ${scan.dimensions.emotion.intensity}`,
  )
  if (scan.dimensions.emotion.hits.length) {
    const seenTerms = new Set()
    const hitLabels = scan.dimensions.emotion.hits
      .filter((hit) => (seenTerms.has(hit.term) ? false : seenTerms.add(hit.term)))
      .slice(0, 6)
      .map((hit) => `${hit.term}(权重 ${hit.weight}${hit.negated ? '·否定衰减' : ''})`)
    console.log(`  命中词（含程度副词与否定衰减）：${hitLabels.join('、')}`)
  }
  const behavior = scan.dimensions.behavior.features
  console.log(
    `  行为时序：24h ${behavior.submits24h} 单 / 72h ${behavior.submits72h} 单 / 7d ${behavior.submits7d} 单｜夜间占比 ${Math.round(
      behavior.nightRatio * 100,
    )}%｜最短间隔 ${behavior.minIntervalMinutes ?? '-'} 分钟｜同类重复 ${behavior.repeatCategory7d} 次｜历史超时 ${behavior.overdueCount} 单｜历史高风险 ${behavior.priorHighRisk30d} 单｜行为分 ${scan.dimensions.behavior.score}`,
  )
  console.log(`  干预建议（${scan.intervention.level} / ${scan.intervention.deadline}）：${scan.intervention.actions[0]}`)
  console.log(`  触达方式：${scan.intervention.channels.join('、')}｜通知部门：${scan.intervention.notifyDepartments.map((dept) => dept.short).join('、') || '无'}`)
  console.log(`  话术模板：${scan.intervention.script}`)
  console.log('')
}

// ── 标签稳定性复跑 ─────────────────────────────────────────
const stability = []
for (const item of CASES) {
  const levels = new Set()
  for (let index = 0; index < REPEAT; index += 1) {
    levels.add(scanRisk({ text: item.text, history: item.history || [], baseRisk: item.baseRisk || 'low' }).level)
  }
  stability.push({ id: item.id, runs: REPEAT, distinctLevels: [...levels], stable: levels.size === 1 })
}
report.stability = {
  runs: REPEAT,
  stableCount: stability.filter((item) => item.stable).length,
  total: stability.length,
  detail: stability,
}

if (!process.argv.includes('--quiet')) {
  console.log(line('='))
  console.log(`标签稳定性复跑（每条样例 ${REPEAT} 次，判定过程确定性，标签须完全一致）`)
  console.log(line('='))
  for (const item of stability) {
    console.log(`${item.stable ? '✓' : '✗'} ${item.id}：${item.runs} 次 → ${item.distinctLevels.join(' / ')}`)
  }
  console.log('')
}

// ── 情绪维度盘点（说明词典不是单一关键词匹配）────────────────
const samples = ['压力好大，快撑不下去了', '救命！有人晕倒了', '室友威胁要打我', '谢谢老师，问题已经解决了']
if (!process.argv.includes('--quiet')) {
  console.log(line('='))
  console.log('情绪维度识别抽查')
  console.log(line('='))
  for (const text of samples) {
    const emotion = analyzeEmotion(text)
    const behavior = analyzeBehavior([])
    console.log(
      `「${text}」→ 主导维度 ${emotion.dominantDimension || '无'}｜情绪分 ${emotion.score}｜行为分 ${behavior.score}｜极性 ${emotion.polarity}`,
    )
  }
  console.log('')
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const outFile = path.join(OUT_DIR, 'risk-demo.json')
fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (!process.argv.includes('--quiet')) {
  console.log(line('='))
  console.log(
    `${failed ? `存在 ${failed} 条未达预期，请检查` : '全部样例均按要求触发风险标签'}｜演示结果已导出：${path.relative(process.cwd(), outFile)}`,
  )
  console.log(line('='))
}

process.exit(failed ? 1 : 0)
