/**
 * B 部分 · Agent 能力注册表与认知链路（B ↔ A 的接口层）
 *
 * A 负责多 Agent 调度流水线（Pipeline）与状态跃迁，B 负责每个 Agent 的「认知内容」。
 * 本文件把 B 侧能力统一成同一种信封（envelope），A 的调度框架只要按名字调用即可：
 *
 *   invokeAgent('risk', payload) → { ok, agent, version, degraded, latencyMs, output, warnings }
 *
 * 覆盖方案里的 5 个 Agent：
 *   intent（意图解析）· route（权责路由，GraphRAG）· risk（风险筛查）
 *   kb（知识库检索 / 自助答复）· attribution（复盘归因）
 * 另加 guard（幻觉复核）作为出口闸门。
 *
 * 任何一路失败都不会中断链路：降级为空结果并标注 degraded=true，由规则兜底。
 */

import { analyzeRequest, CATEGORY_META, makeSummary } from '../ai.js'
import { departmentMap } from '../seed.js'
import { chatJson, llmEnabled, llmStatus } from './llmClient.js'
import { PROMPTS } from './prompts.js'
import { guardAnalysis, guardAnswerText, extractFacts } from './guard.js'
import { searchKnowledgeDetailed } from './knowledge.js'
import { attributionSummary, queryGraph } from './graphrag.js'
import { refineRiskScan, scanRisk } from './riskAgent.js'

export const AGENT_VERSION = 'b-1.0.0'
const CATEGORIES = CATEGORY_META.map((item) => item.name).concat('其他')
const DEPT_IDS = Object.keys(departmentMap)
const MANUAL_REVIEW_ANSWER = '建议把具体情况提交给辅导员，由中枢协调对应部门处理。'

/** 部门 → 分类的口径修正表：图谱判定优先于关键词分类时使用 */
const DEPT_CATEGORY_HINT = {
  psych: '心理支持',
  security: '安全保卫',
  canteen: '餐饮服务',
  library: '图书馆',
  clinic: '医疗健康',
  it: '网络服务',
  dorm: '宿舍生活',
  logistics: '校园设施',
  finance: '缴费财务',
  academic: '教务教学',
  office: '学籍证明',
  grad: '毕业就业',
  career: '毕业就业',
  youth: '团学活动',
  sports: '团学活动',
}

const envelope = ({ agent, output, started, degraded = false, warnings = [] }) => ({
  ok: !degraded || Boolean(output),
  agent,
  version: AGENT_VERSION,
  degraded,
  latencyMs: Date.now() - started,
  output,
  warnings,
})

const safe = async (agent, started, task) => {
  try {
    const output = await task()
    return envelope({ agent, output, started })
  } catch (error) {
    return envelope({ agent, output: null, started, degraded: true, warnings: [error.message] })
  }
}

// ── 意图解析 Agent ──────────────────────────────────────────
export const intentAgent = async ({ text, category, location, urgency, useLlm = true }) => {
  const started = Date.now()
  const base = analyzeRequest({ text, category, location, urgency })
  if (!useLlm || !llmEnabled()) {
    return { ...envelope({ agent: 'intent', output: base, started }), warnings: ['未启用大模型，使用规则抽取'] }
  }
  const result = await chatJson({
    prompt: PROMPTS.intentAnalysis,
    payload: { text, location, deptIds: DEPT_IDS, base },
  })
  if (!result.ok) {
    return { ...envelope({ agent: 'intent', output: base, started, degraded: true }), warnings: [`模型不可用，已回退规则：${result.reason}`] }
  }
  const { analysis, applied, rejected } = guardAnalysis({
    llm: result.data,
    sourceText: [text, location].filter(Boolean).join('\n'),
    base,
    categories: CATEGORIES,
    deptIds: DEPT_IDS,
  })
  return {
    ...envelope({ agent: 'intent', output: analysis, started }),
    warnings: rejected.map((item) => `护栏拦截：${item}`),
    applied,
    model: result.meta,
  }
}

// ── 权责路由 Agent（GraphRAG）────────────────────────────────
export const routeAgent = async ({ text, category, preferredDepts = [], riskLevel = 'low' }) => {
  const started = Date.now()
  const graph = queryGraph(text, { category, preferredDepts, riskLevel })
  return envelope({ agent: 'route', output: graph, started })
}

// ── 风险筛查 Agent ─────────────────────────────────────────
export const riskScanAgent = async ({ text, history = [], category, location, baseRisk = 'low', useLlm = true, now }) => {
  const started = Date.now()
  const scan = scanRisk({ text, history, category, location, baseRisk, now })
  const result = envelope({ agent: 'risk', output: scan, started })
  return enrichRiskResult(result, { text, useLlm })
}

const enrichRiskResult = async (result, { text, useLlm }) => {
  if (!result.output || !useLlm || !llmEnabled()) return result
  const enhancement = await safe('risk', Date.now(), () => refineRiskScan(result.output, { text }))
  const output = enhancement.output || result.output
  const reason = output.model?.applied === false ? output.model.reason : null
  return {
    ...result,
    output,
    degraded: enhancement.degraded || output.model?.applied === false,
    latencyMs: result.latencyMs + enhancement.latencyMs,
    warnings: reason ? [`模型不可用，已保留规则筛查结果：${reason}`] : enhancement.warnings,
  }
}

// ── 知识库 Agent ───────────────────────────────────────────
export const knowledgeAgent = async ({ text, useLlm = true, riskLevel = 'low', urgency = 'normal' }) => {
  const started = Date.now()
  const match = searchKnowledgeDetailed(text)
  const knowledge = match.item
    ? {
        id: match.item.id,
        title: match.item.title,
        summary: match.item.summary,
        steps: match.item.steps,
        departmentId: match.item.departmentId,
        updatedAt: match.item.updatedAt,
        matchScore: match.score,
        matchTier: match.tier,
        confidence: match.confidence,
        matchedTerms: match.matchedTerms,
        related: match.related,
        ambiguous: match.ambiguous,
        threshold: match.threshold,
      }
    : null

  // 只有「高置信命中 + 低风险 + 非紧急」才允许走自助，用阈值换准确率
  const canSelfSolve = Boolean(knowledge) && match.tier === 'confident' && riskLevel === 'low' && urgency === 'normal'
  const sources = knowledge
    ? [knowledge.title, knowledge.summary, match.item.answer, ...(knowledge.steps || [])].join(' ')
    : ''
  let answer = ''
  const warnings = []
  let model

  if (knowledge) {
    const ruleAnswer = canSelfSolve
      ? match.item.answer
      : `知识库里有相关信息，但你的情况涉及${riskLevel === 'high' ? '需要优先关注的风险' : '需要人工协调的事项'}，建议直接提交工单，由辅导员跟进。`
    answer = ruleAnswer
    if (useLlm && llmEnabled() && canSelfSolve) {
      const result = await chatJson({
        prompt: PROMPTS.selfServiceAnswer,
        payload: { text, knowledge: match.item },
      })
      if (result.ok && result.data?.grounded === true && typeof result.data.answer === 'string' && result.data.answer.trim()) {
        const guarded = guardAnswerText({ answer: result.data.answer, sources: [sources], fallback: ruleAnswer })
        answer = guarded.answer
        if (guarded.ok) model = result.meta
        else warnings.push(...guarded.violations.map((item) => `护栏回退：${item}`))
      } else if (result.ok) {
        warnings.push('模型未提供有依据的有效答复，已回退知识库原文')
      } else {
        warnings.push(`模型不可用，已回退知识库原文：${result.reason}`)
      }
    }
  } else {
    answer = `暂时没有完全匹配的自助答案。${MANUAL_REVIEW_ANSWER}`
  }

  const guarded = guardAnswerText({ answer, sources: [sources], fallback: knowledge && canSelfSolve ? match.item.answer : answer })
  return {
    ...envelope({ agent: 'kb', output: { knowledge, answer: guarded.answer, canSelfSolve, sources }, started, degraded: warnings.length > 0, warnings }),
    model,
    violations: guarded.violations,
  }
}

// ── 复盘归因 Agent ─────────────────────────────────────────
export const attributionAgent = async ({ tickets = [], limit = 5 }) => {
  const started = Date.now()
  const summary = attributionSummary(tickets)
  const ranked = summary.top.slice(0, limit)
  return envelope({ agent: 'attribution', output: { ...summary, top: ranked }, started })
}

// ── 幻觉复核 Agent ─────────────────────────────────────────
export const guardAgent = async ({ answer, sources = [] }) => {
  const started = Date.now()
  const checked = guardAnswerText({ answer, sources })
  return {
    ...envelope({ agent: 'guard', output: checked, started, degraded: !checked.ok }),
    violations: checked.violations,
  }
}

export const AGENTS = {
  intent: intentAgent,
  route: routeAgent,
  risk: riskScanAgent,
  kb: knowledgeAgent,
  attribution: attributionAgent,
  guard: guardAgent,
}

/** A 侧 Pipeline 统一调用入口 */
export const invokeAgent = async (name, payload = {}) => {
  const agent = Object.hasOwn(AGENTS, name) ? AGENTS[name] : null
  if (!agent) return { ok: false, agent: name, version: AGENT_VERSION, degraded: true, latencyMs: 0, output: null, warnings: [`未知 Agent：${name}`] }
  const result = await safe(name, Date.now(), () => agent(payload))
  return result.output || result
}

export const agentManifest = () => ({
  version: AGENT_VERSION,
  llm: llmStatus(),
  agents: [
    { name: 'intent', desc: '意图解析：要素抽取 + 分类 + 摘要 + 首响话术', input: ['text', 'category', 'location', 'urgency', 'useLlm'], output: 'analysis' },
    { name: 'route', desc: '权责路由：GraphRAG 子图检索 + 会签判定 + 派单路径', input: ['text', 'category', 'preferredDepts', 'riskLevel'], output: 'graph' },
    { name: 'risk', desc: '风险筛查：情绪 + 行为时序融合，输出等级与干预建议', input: ['text', 'history', 'baseRisk', 'useLlm'], output: 'risk' },
    { name: 'kb', desc: '知识库检索与自助答复（阈值分层 + 可追溯护栏）', input: ['text', 'riskLevel', 'urgency', 'useLlm'], output: 'knowledge/answer/canSelfSolve' },
    { name: 'attribution', desc: '复盘归因：卡点排序与改进建议', input: ['tickets', 'limit'], output: 'headline/top/suggestion' },
    { name: 'guard', desc: '幻觉复核：硬事实可追溯校验', input: ['answer', 'sources'], output: 'ok/violations' },
  ],
})

/** 规则修正：图谱与风险筛查的结论回写进分析结果（基础任务 3：AI 前置预检与规则修正） */
const applyRuleCorrections = (analysis, { graph, risk, text, location }) => {
  const corrected = { ...analysis }
  const notes = []

  if (risk?.level === 'high') {
    corrected.risk = 'high'
    corrected.urgency = 'urgent'
    corrected.slaMinutes = Math.min(corrected.slaMinutes || 60, 60)
    notes.push('风险筛查为高风险，紧急度提升为 urgent，SLA 收紧至 60 分钟')
  } else if (risk?.level === 'medium' && corrected.risk === 'low') {
    corrected.risk = 'medium'
    notes.push('风险筛查为中风险，风险等级由低提升为中')
  }

  if (corrected.risk !== analysis.risk) {
    corrected.riskReason = risk.reasons.at(-1) || risk.levelLabel
    corrected.sentiment = risk.dimensions.emotion.label
    corrected.draft = '同学你好，已收到你的诉求。我们会优先核实情况，并尽快与你联系。'
  }

  if (graph?.matched) {
    const hint = DEPT_CATEGORY_HINT[graph.primaryDept]
    // 图谱证据足够强时以图谱权责归属修正分类；心理危机分类由危机词判定，不覆盖
    const strongGraph = (graph.duties?.[0]?.score || 0) >= 4
    if (hint && hint !== corrected.category && strongGraph && corrected.category !== '心理支持') {
      notes.push(`图谱命中「${graph.primaryDuty?.name}」，主责${departmentMap[graph.primaryDept]?.short || graph.primaryDept}，分类修正为「${hint}」`)
      corrected.category = hint
    }
    const merged = [
      ...graph.ownerDepts,
      ...graph.countersign.departments.map((department) => department.id),
      ...graph.collaboratorDepts,
      ...(corrected.suggestedDepartments || []),
    ].filter((id, index, list) => DEPT_IDS.includes(id) && list.indexOf(id) === index)
    corrected.suggestedDepartments = merged.slice(0, 4)
    corrected.suggestedDepartmentNames = corrected.suggestedDepartments.map((id) => departmentMap[id]?.name || id)
    if (graph.countersign.required) {
      notes.push(
        `图谱判定需会签：${graph.countersign.departments.map((item) => item.short).join('、') || graph.countersign.jointOwners.map((id) => departmentMap[id]?.short).join('、')}`,
      )
    }
    if (graph.complexity === 'compound') notes.push('图谱判定为复合工单，需拆分为多条子流程')
    if (!corrected.tags.includes('图谱路由')) corrected.tags = [...corrected.tags, '图谱路由'].slice(0, 5)
  }

  if (corrected.risk !== analysis.risk || corrected.category !== analysis.category) {
    corrected.summary = makeSummary(text, corrected.category, location, corrected.risk)
  }
  return { corrected, notes }
}

/**
 * B 侧认知链路：意图 → 规则风险筛查 →（风险解读 / 图谱路由 / 知识库 并行）→ 规则修正 → 组装
 * 返回值同时兼容既有 /api/ai/precheck 契约（analysis / knowledge / answer / canSelfSolve / needsTicket / quickReplies）
 * 并新增 graph / risk / trace 字段供 C 展示、D 训练与 A 调度。
 */
export const runCognitionChain = async ({ text = '', category, location = '', urgency, history = [], useLlm = true } = {}) => {
  const started = Date.now()
  const trace = []

  const intent = await invokeAgent('intent', { text, category, location, urgency, useLlm })
  trace.push({ agent: 'intent', degraded: intent.degraded, ms: intent.latencyMs, warnings: intent.warnings })
  const baseAnalysis = intent.output || analyzeRequest({ text, category, location, urgency })
  const ruleRisk = await invokeAgent('risk', {
    text, history, category: baseAnalysis.category, location, baseRisk: baseAnalysis.risk, useLlm: false,
  })
  const effectiveRisk = ruleRisk.output?.level || baseAnalysis.risk
  const effectiveUrgency = effectiveRisk === 'high' ? 'urgent' : baseAnalysis.urgency

  const [riskResult, routeResult, kbResult] = await Promise.all([
    enrichRiskResult(ruleRisk, { text, useLlm }),
    invokeAgent('route', { text, category: baseAnalysis.category, preferredDepts: baseAnalysis.suggestedDepartments, riskLevel: effectiveRisk }),
    invokeAgent('kb', { text, useLlm, riskLevel: effectiveRisk, urgency: ruleRisk.output ? effectiveUrgency : 'urgent' }),
  ])
  trace.push({ agent: 'risk', degraded: riskResult.degraded, ms: riskResult.latencyMs, warnings: riskResult.warnings })
  trace.push({ agent: 'route', degraded: routeResult.degraded, ms: routeResult.latencyMs, warnings: routeResult.warnings })
  trace.push({ agent: 'kb', degraded: kbResult.degraded, ms: kbResult.latencyMs, warnings: kbResult.warnings })

  const risk = riskResult.output
  const graph = routeResult.output
  const { corrected, notes } = applyRuleCorrections(baseAnalysis, { graph, risk, text, location })
  if (notes.length) trace.push({ agent: 'rules', degraded: false, ms: 0, warnings: [], notes })

  // 高风险或紧急时，自助通道一律关闭（与既有后端行为保持一致）
  const canSelfSolve = Boolean(risk && kbResult.output?.canSelfSolve && corrected.risk === 'low' && corrected.urgency === 'normal')
  const answer = corrected.risk === 'high'
    ? '这件事需要优先处理。请直接提交诉求，辅导员会尽快跟进。'
    : kbResult.output?.answer || MANUAL_REVIEW_ANSWER

  const analysis = {
    ...corrected,
    tags: [...new Set([...(corrected.tags || []), corrected.category, corrected.risk === 'high' ? '高风险预警' : ''])].filter(Boolean).slice(0, 5),
    riskScore: risk?.score,
    riskSignals: risk?.signals?.map((item) => item.label).slice(0, 5) || [],
  }

  return {
    analysis,
    knowledge: kbResult.output?.knowledge || null,
    answer,
    canSelfSolve,
    needsTicket: !canSelfSolve,
    quickReplies: canSelfSolve ? ['按这个指引办理', '我还是想提交工单', '转人工'] : ['帮我提交工单', '先和辅导员聊聊'],
    graph,
    risk,
    facts: extractFacts(text),
    trace,
    latencyMs: Date.now() - started,
    engine: intent.applied?.length || risk?.model?.applied || kbResult.model ? 'deepseek+rules' : 'local-rules',
  }
}

/** 工单落库时用的精简视图：只保留需要持久化的字段，避免 store.json 膨胀 */
export const ticketAiSnapshot = (chain) => ({
  summary: chain.analysis.summary,
  risk: chain.analysis.risk,
  riskReason: chain.analysis.riskReason,
  sentiment: chain.analysis.sentiment,
  confidence: chain.analysis.confidence,
  suggestedDepartments: chain.analysis.suggestedDepartments,
  tags: chain.analysis.tags,
  draft: chain.analysis.draft,
  elements: chain.analysis.elements || {},
  riskScan: chain.risk
    ? {
        level: chain.risk.level,
        score: chain.risk.score,
        signals: chain.risk.signals.slice(0, 6),
        intervention: chain.risk.intervention,
        behaviorFeatures: chain.risk.dimensions.behavior.features,
        at: chain.risk.at,
      }
    : null,
  graph: chain.graph
    ? {
        matched: chain.graph.matched,
        primaryDuty: chain.graph.primaryDuty,
        primaryDept: chain.graph.primaryDept,
        ownerDepts: chain.graph.ownerDepts,
        collaboratorDepts: chain.graph.collaboratorDepts,
        countersign: chain.graph.countersign,
        dispatchPath: chain.graph.dispatchPath,
        slaMinutes: chain.graph.slaMinutes,
        complexity: chain.graph.complexity,
        bottlenecks: chain.graph.bottlenecks,
        evidence: chain.graph.evidence.slice(0, 6),
        confidence: chain.graph.confidence,
      }
    : null,
})
