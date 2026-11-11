/**
 * B 部分 · DeepSeek 增强层（薄封装）
 *
 * 职责：把「本地规则结果」交给大模型做语义增强，再用护栏合并回来。
 * 稳定性来自三处：
 *   1. 调用链路加固（超时 / 重试 / 熔断 / 并发 / 缓存）——见 ai/llmClient.js；
 *   2. 提示词版本化与白名单校验——见 ai/prompts.js 与 ai/guard.js；
 *   3. 任何异常都返回本地规则结果，业务层无感（模型不可用 = 降级，不是故障）。
 *
 * 兼容：对外仍导出 refineAnalysis / llmEnabled，index.js 与脚本无需改动。
 */

import { departmentMap, knowledgeBase } from './seed.js'
import { chatJson, llmEnabled as clientEnabled, llmStatus, resetLlmRuntime, setFaultMode, getFaultMode } from './ai/llmClient.js'
import { PROMPTS } from './ai/prompts.js'
import { guardAnalysis } from './ai/guard.js'
import { CATEGORY_META } from './ai.js'

const CATEGORIES = CATEGORY_META.map((item) => item.name).concat('其他')
const DEPT_IDS = Object.keys(departmentMap)

/** 从知识库里收集所有校内号码，作为护栏的合法来源池（模型引用这些号码不算幻觉） */
const KB_FACT_SOURCES = knowledgeBase
  .map((item) => `${item.answer} ${(item.steps || []).join(' ')}`)
  .join(' ')

export const refineAnalysis = async (text, base, location) => {
  if (!llmEnabled()) return base
  const result = await chatJson({
    prompt: PROMPTS.intentAnalysis,
    payload: { text, location, deptIds: DEPT_IDS, base },
  })
  if (!result.ok) {
    if (result.reason !== 'no-api-key') {
      console.warn(`大模型增强不可用（${result.reason}），已回退到本地规则`)
    }
    return { ...base, degradation: { applied: false, reason: result.reason, at: new Date().toISOString() } }
  }

  const { analysis, applied, rejected } = guardAnalysis({
    llm: { ...result.data, sourceText: `${text} ${KB_FACT_SOURCES}` },
    base,
    categories: CATEGORIES,
    deptIds: DEPT_IDS,
  })

  return {
    ...analysis,
    slaMinutes: analysis.risk === 'high' ? 60 : analysis.urgency === 'urgent' ? 120 : base.slaMinutes,
    model: result.meta?.model || undefined,
    cached: Boolean(result.cached),
    guard: { applied, rejected },
  }
}

export const llmEnabled = () => clientEnabled()

/** 供 /api/ai/health 与演练脚本使用的透传接口 */
export const getLlmStatus = () => llmStatus()
export const resetLlm = () => resetLlmRuntime()
export const simulateLlmFault = (mode) => setFaultMode(mode)
export const currentLlmFault = () => getFaultMode()
