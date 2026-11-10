import { departmentMap, knowledgeBase } from './seed.js'

const CATEGORY_RULES = [
  {
    category: '宿舍生活',
    keywords: ['宿舍', '寝室', '热水', '漏水', '门锁', '床板', '卫生间', '下水道', '阳台', '噪音', '门禁', '快递柜'],
    departments: ['dorm', 'logistics'],
  },
  {
    category: '校园设施',
    keywords: ['食堂', '操场', '电梯', '路灯', '充电桩', '快递', '空调', '饮水机', '座椅', '班车'],
    departments: ['logistics'],
  },
  {
    category: '学籍教务',
    keywords: ['选课', '成绩', '证明', '学籍', '课程', '考试', '培养方案', '缓考', '重修', '辅修'],
    departments: ['academic', 'office'],
  },
  {
    category: '毕业就业',
    keywords: ['毕业', '论文', '答辩', '三方', '档案', '就业', '实习', '学分', '学位', '离校'],
    departments: ['career', 'academic'],
  },
  {
    category: '图书馆',
    keywords: ['图书馆', '借书', '还书', '续借', '数据库', '自习室', '文献', '查重', '研讨间'],
    departments: ['library'],
  },
  {
    category: '医疗健康',
    keywords: ['校医院', '发烧', '受伤', '体检', '医保', '生病', '药品', '门诊', '疫苗', '过敏'],
    departments: ['clinic'],
  },
  {
    category: '奖助资助',
    keywords: ['助学金', '奖学金', '资助', '贷款', '困难认定', '补助', '公示', '勤工助学'],
    departments: ['office'],
  },
  {
    category: '心理支持',
    keywords: ['情绪', '焦虑', '抑郁', '压力', '失眠', '睡不着', '心理咨询', '崩溃', '不想活', '轻生', '撑不住', '压抑', '室友关系', '关系紧张'],
    departments: ['psych'],
  },
  {
    category: '安全保卫',
    keywords: ['诈骗', '可疑', '打架', '霸凌', '消防', '失窃', '安全', '骚扰', '威胁', '超速', '食品安全', '卫生'],
    departments: ['security'],
  },
  {
    category: '网络服务',
    keywords: ['校园网', '网络', 'wifi', 'WiFi', '断网', '网速', '掉线', 'vpn', 'VPN', '系统', '账号', '密码'],
    departments: ['it'],
  },
]

const HIGH_RISK = [
  '不想活',
  '活着没意思',
  '想死',
  '自杀',
  '轻生',
  '结束生命',
  '自残',
  '割腕',
  '撑不住',
  '撑不下去',
  '崩溃了',
  '失联',
  '两天没回',
  '威胁我',
  '殴打',
  '霸凌',
  '着火',
  '冒烟',
  '漏电',
  '触电',
  '煤气',
  '中毒',
  '跳楼',
]

const MEDIUM_RISK = [
  '焦虑',
  '压抑',
  '失眠',
  '睡不着',
  '很害怕',
  '害怕',
  '冲突',
  '争吵',
  '排挤',
  '孤立',
  '骚扰',
  '诈骗',
  '漏水',
  '电梯',
  '食品安全',
  '卫生',
  '超速',
  '不想回寝室',
  '关系紧张',
  '情绪',
]

const PSYCH_CRISIS_WORDS = [
  '不想活',
  '活着没意思',
  '想死',
  '自杀',
  '轻生',
  '结束生命',
  '自残',
  '割腕',
  '撑不住',
  '撑不下去',
  '崩溃了',
  '跳楼',
]

const SAFETY_HAZARD_WORDS = ['着火', '冒烟', '漏电', '触电', '煤气', '中毒', '消防', '跳楼']

const URGENT_WORDS = ['紧急', '马上', '立刻', '现在', '严重', '危险', '救命', '很急', '尽快', '今天', '今晚']

const CATEGORY_DEPARTMENTS = {
  宿舍生活: ['dorm', 'logistics'],
  校园设施: ['logistics'],
  学籍教务: ['academic', 'office'],
  毕业就业: ['career', 'academic'],
  图书馆: ['library'],
  医疗健康: ['clinic'],
  奖助资助: ['office'],
  心理支持: ['psych'],
  安全保卫: ['security'],
  网络服务: ['it'],
  其他: ['office'],
}

export const STATUS_LABELS = {
  pending_review: '待审核',
  assigned: '已分派',
  processing: '处理中',
  awaiting_confirm: '待确认',
  completed: '已办结',
}

export const URGENCY_LABELS = {
  normal: '普通',
  high: '较急',
  urgent: '紧急',
}

export const RISK_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
}

export const scoreCategory = (text, explicitCategory) => {
  if (explicitCategory && explicitCategory !== '智能识别' && CATEGORY_DEPARTMENTS[explicitCategory]) {
    return explicitCategory
  }
  let best = { category: '其他', score: 0 }
  for (const rule of CATEGORY_RULES) {
    const score = rule.keywords.reduce((total, keyword) => {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return total + (keyword.length >= 3 ? 2 : 1)
      }
      return total
    }, 0)
    if (score > best.score) best = { category: rule.category, score }
  }
  return best.category
}

export const detectRisk = (text) => {
  const highHits = HIGH_RISK.filter((word) => text.includes(word))
  if (highHits.length) {
    const safetyHit = highHits.find((word) => SAFETY_HAZARD_WORDS.includes(word))
    if (safetyHit) {
      return {
        level: 'high',
        hits: highHits,
        reason: `命中「${safetyHit}」等紧急安全信号，建议立即联动保卫处并确认现场人员安全`,
        sentiment: '紧急 · 安全风险',
      }
    }
    return {
      level: 'high',
      hits: highHits,
      reason: `命中「${highHits[0]}」等危机表达，建议 15 分钟内电话联系、确认学生当下安全，并联动心理中心`,
      sentiment: '高危 · 需要立即支持',
    }
  }
  const mediumHits = MEDIUM_RISK.filter((word) => text.includes(word))
  if (mediumHits.length) {
    const safetyWords = ['漏水', '电梯', '食品安全', '卫生', '超速', '诈骗', '骚扰']
    const safetyHit = mediumHits.find((word) => safetyWords.includes(word))
    if (safetyHit) {
      return {
        level: 'medium',
        hits: mediumHits,
        reason: `检测到「${safetyHit}」等安全或设施风险信号，建议优先响应并现场核查`,
        sentiment: '担忧 · 希望尽快核实',
      }
    }
    return {
      level: 'medium',
      hits: mediumHits,
      reason: `检测到「${mediumHits[0]}」等压力或冲突信号，建议 24 小时内主动跟进`,
      sentiment: '焦虑 · 需要关注',
    }
  }
  return {
    level: 'low',
    hits: [],
    reason: '暂未发现高风险信号，按常规流程处置即可',
    sentiment: '中性 · 期待解决',
  }
}

export const detectUrgency = (text, risk, explicitUrgency) => {
  if (risk === 'high') return 'urgent'
  if (['high', 'urgent'].includes(explicitUrgency)) return explicitUrgency
  const hits = URGENT_WORDS.filter((word) => text.includes(word))
  if (hits.length >= 2) return 'urgent'
  if (hits.length === 1) return 'high'
  if (text.length > 90) return 'high'
  return 'normal'
}

const makeSummary = (text, category, location, risk) => {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const firstSentence = cleaned.split(/[。！？!?]/)[0].slice(0, 58)
  const suffix = cleaned.length > firstSentence.length ? '…' : ''
  const riskLine =
    risk === 'high'
      ? '存在需优先人工介入的风险信号。'
      : risk === 'medium'
        ? '存在需要优先关注的风险信号，建议优先回应。'
        : ''
  const hasLocation = location && !['线上', '线上咨询', '未填写地点'].includes(location)
  return `${hasLocation ? `学生在「${location}」反映：` : '学生反映：'}${firstSentence}${suffix} 已归类为「${category}」。${riskLine}`
}

export const suggestDepartments = (text, category) => {
  const base = text.includes('漏水') || text.includes('热水') || text.includes('门禁')
    ? ['dorm', 'logistics']
    : text.includes('消防') || text.includes('诈骗') || text.includes('超速')
      ? text.includes('消防')
        ? ['security', 'dorm']
        : ['security']
      : text.includes('食堂') || text.includes('食品')
        ? ['logistics', 'security']
        : text.includes('室友') && category === '心理支持'
          ? ['psych', 'dorm']
          : text.includes('电梯')
            ? ['logistics', 'security']
            : CATEGORY_DEPARTMENTS[category] || ['office']
  const result = [...base]
  if (text.includes('图书馆')) result.push('library')
  if (['空调', '漏水', '充电桩', '电梯'].some((word) => text.includes(word))) result.push('logistics')
  if (SAFETY_HAZARD_WORDS.some((word) => text.includes(word))) result.push('security')
  return [...new Set(result)]
}

export const analyzeRequest = ({ text = '', category: explicitCategory, location = '', urgency: explicitUrgency } = {}) => {
  const risk = detectRisk(text)
  const psychCrisis = PSYCH_CRISIS_WORDS.some((word) => text.includes(word))
  const category = psychCrisis ? '心理支持' : scoreCategory(text, explicitCategory)
  const urgency = detectUrgency(text, risk.level, explicitUrgency)
  const departments = suggestDepartments(text, category)
  const summary = makeSummary(text, category, location, risk.level)
  const deptNames = departments.map((id) => departmentMap[id]?.short || id).join('、')
  const signals = ['图书馆', '空调', '漏水', '充电桩', '电梯', '消防', '诈骗', '宿舍', '热水'].filter((word) => text.includes(word))
  const coordinationReason = signals.length
    ? `文本提到${signals.map((word) => `「${word}」`).join('、')}，建议核实后协调${deptNames}。`
    : `根据诉求类型「${category}」建议核实是否由${deptNames}跟进。`
  const missingInfo = []
  if (!location || ['线上', '线上咨询', '未填写地点'].includes(location)) missingInfo.push('具体地点（如适用）')
  if (!/(今天|昨天|明天|近期|近日|本周|上周|\d+\s*[年月日点时])/u.test(text)) missingInfo.push('发生时间或持续时长')

  const tags = [category]
  if (location) tags.push(location.replace(/学生公寓|教学楼|图书馆/g, (m) => m))
  if (risk.level !== 'low') tags.push(risk.level === 'high' ? '高风险预警' : '需重点关注')
  if (text.length > 80) tags.push('复合诉求')
  if (text.includes('多次') || text.includes('连续') || text.includes('一直')) tags.push('重复发生')

  const draft =
    risk.level === 'high'
      ? '同学你好，我看到你的消息了，谢谢你愿意告诉我。我现在马上联系你，我们先确认你此刻是安全的，好吗？'
      : `同学你好，已收到你关于「${category}」的反馈。我们会核实情况并安排跟进，有进展会及时同步给你。`

  return {
    category,
    urgency,
    risk: risk.level,
    riskReason: risk.reason,
    riskHits: risk.hits,
    sentiment: risk.sentiment,
    summary,
    tags: [...new Set(tags)].slice(0, 5),
    coordinationReason,
    missingInfo,
    suggestedDepartments: departments,
    suggestedDepartmentNames: departments.map((id) => departmentMap[id]?.name || id),
    confidence: Number((0.88 + Math.min(text.length, 120) / 1200).toFixed(2)),
    draft,
    slaMinutes: risk.level === 'high' ? 60 : urgency === 'urgent' ? 120 : 240,
  }
}

const normalize = (text) => text.toLowerCase().replace(/[\s，。！？、；：,.!?;:]/g, '')

export const searchKnowledge = (text) => {
  const normalized = normalize(text)
  const scored = knowledgeBase
    .map((item) => {
      const score = item.keywords.reduce((total, keyword) => {
        if (normalized.includes(normalize(keyword))) return total + (keyword.length >= 3 ? 3 : 2)
        return total
      }, 0)
      return { item, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return null
  const best = scored[0]
  return {
    ...best.item,
    matchScore: best.score,
    related: scored.slice(1, 3).map((entry) => entry.item.title),
  }
}

export const precheckRequest = ({ text, category, location }) => {
  const analysis = analyzeRequest({ text, category, location })
  const knowledge = searchKnowledge(text)
  const riskBlocksSelfService = analysis.risk !== 'low'
  const urgentBlocksSelfService = analysis.urgency === 'urgent' || analysis.urgency === 'high'
  const canSelfSolve = Boolean(knowledge) && !riskBlocksSelfService && !urgentBlocksSelfService

  let selfServiceAnswer = ''
  if (knowledge) {
    selfServiceAnswer = canSelfSolve
      ? knowledge.answer
      : `知识库里有相关信息，但你的情况涉及${analysis.risk === 'high' ? '需要优先关注的风险' : '需要人工协调的事项'}，建议直接提交工单，由辅导员跟进。`
  } else {
    selfServiceAnswer =
      analysis.risk === 'high'
        ? '听起来你现在很不容易。请立即联系身边可信任的人或辅导员；如有迫在眉睫的危险，请联系当地紧急救援服务。'
        : '暂时没有完全匹配的自助答案，建议把具体情况提交给辅导员，由中枢协调对应部门处理。'
  }

  return {
    analysis,
    knowledge: knowledge
      ? {
          id: knowledge.id,
          title: knowledge.title,
          summary: knowledge.summary,
          steps: knowledge.steps,
          departmentId: knowledge.departmentId,
          updatedAt: knowledge.updatedAt,
          matchScore: knowledge.matchScore,
          related: knowledge.related,
        }
      : null,
    answer: selfServiceAnswer,
    canSelfSolve,
    needsTicket: !canSelfSolve,
    quickReplies: canSelfSolve
      ? ['按这个指引办理', '我还是想提交工单', '转人工']
      : ['帮我提交工单', '先和辅导员聊聊'],
  }
}

export const makeTicketDraft = ({ text, category, location }) => {
  const analysis = analyzeRequest({ text, category, location })
  return {
    title: text.replace(/\s+/g, '').slice(0, 22) + (text.length > 22 ? '…' : ''),
    analysis,
  }
}

export const generateCounselorBrief = (tickets) => {
  const active = tickets.filter((ticket) => ticket.status !== 'completed')
  const high = active.filter((ticket) => ticket.risk === 'high')
  const pending = active.filter((ticket) => ticket.status === 'pending_review')
  const overdue = active.filter((ticket) => ticket.status !== 'awaiting_confirm' && new Date(ticket.dueAt).getTime() < Date.now())
  return {
    headline: high.length
      ? `有 ${high.length} 条高风险诉求需要优先介入`
      : overdue.length
        ? `有 ${overdue.length} 条工单已超时，需要跟进`
        : pending.length
        ? `有 ${pending.length} 条新诉求等待审核`
        : '当前工单均在时限内平稳推进',
    detail: `今日待审核 ${pending.length} 条 · 超时 ${overdue.length} 条 · 高风险 ${high.length} 条`,
    actions: [
      high.length ? `优先联系 ${high[0].studentName}` : null,
      overdue.length ? `督办 ${overdue[0].title}` : null,
      pending.length ? '完成新工单分派' : null,
    ].filter(Boolean),
  }
}
