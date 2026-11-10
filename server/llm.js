import { departmentMap } from './seed.js'

const CATEGORIES = ['宿舍生活', '校园设施', '学籍教务', '奖助资助', '心理支持', '安全保卫', '网络服务', '其他']
const RISK_ORDER = { low: 0, medium: 1, high: 2 }
const URGENCY_ORDER = { normal: 0, high: 1, urgent: 2 }

const highest = (a, b, order) => (order[a] >= order[b] ? a : b)

const parseJson = (content) => {
  const cleaned = String(content || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return JSON.parse(cleaned)
}

/**
 * 可选的大模型增强层。
 * 未配置 DEEPSEEK_API_KEY 时始终返回本地规则结果，保证演示环境零依赖可运行。
 * 配置后只接受白名单字段，且不允许模型下调本地规则判定的风险与紧急等级。
 */
export const refineAnalysis = async (text, base, location) => {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return base

  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是高校学生事务协同中枢的语义分析助手。根据学生诉求输出严格 JSON，不要输出 Markdown。字段：category（只能从宿舍生活、校园设施、学籍教务、奖助资助、心理支持、安全保卫、网络服务、其他中选择）、urgency（normal/high/urgent）、risk（low/medium/high）、riskReason、sentiment、summary、tags（最多5个短标签）、suggestedDepartments（从 dorm、logistics、office、it、security、psych 中选择）、draft（给学生的第一句回应，温暖、具体、不下结论）。不得弱化任何自伤、自杀、暴力、消防、用电、食品安全信号。',
          },
          {
            role: 'user',
            content: `诉求原文：${text}\n地点：${location || '未填写'}\n本地规则初判：${JSON.stringify({
              category: base.category,
              urgency: base.urgency,
              risk: base.risk,
              riskReason: base.riskReason,
            })}`,
          },
        ],
      }),
    })
    if (!response.ok) throw new Error(`LLM ${response.status}`)
    const payload = await response.json()
    const result = parseJson(payload.choices?.[0]?.message?.content)
    if (!result || typeof result !== 'object') return base

    const risk = highest(base.risk, result.risk, RISK_ORDER)
    const urgency = highest(base.urgency, result.urgency, URGENCY_ORDER)
    const category = CATEGORIES.includes(result.category) ? result.category : base.category
    const suggested = base.suggestedDepartments
    const tags = Array.isArray(result.tags)
      ? result.tags.filter((tag) => typeof tag === 'string').slice(0, 5)
      : base.tags

    return {
      ...base,
      category,
      urgency,
      risk,
      riskReason:
        risk !== base.risk && typeof result.riskReason === 'string' && result.riskReason.trim()
          ? result.riskReason.trim().slice(0, 160)
          : base.riskReason,
      sentiment: typeof result.sentiment === 'string' ? result.sentiment.slice(0, 40) : base.sentiment,
      summary: typeof result.summary === 'string' && result.summary.trim() ? result.summary.trim().slice(0, 240) : base.summary,
      tags: tags.length ? tags : base.tags,
      suggestedDepartments: suggested.length ? suggested : base.suggestedDepartments,
      suggestedDepartmentNames: (suggested.length ? suggested : base.suggestedDepartments).map(
        (id) => departmentMap[id]?.name || id,
      ),
      draft: base.draft,
      slaMinutes: risk === 'high' ? 60 : urgency === 'urgent' ? 120 : base.slaMinutes,
      model: model,
    }
  } catch (error) {
    console.warn('大模型增强暂不可用，已回退到本地规则：', error.message)
    return base
  } finally {
    clearTimeout(timer)
  }
}

export const llmEnabled = () => Boolean(process.env.DEEPSEEK_API_KEY)
