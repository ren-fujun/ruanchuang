import { departmentMap, knowledgeBase } from './seed.js'
import { searchKnowledge as searchKnowledgeDetailed } from './ai/knowledge.js'

const CATEGORY_RULES = [
  {
    category: '宿舍生活',
    keywords: ['宿舍', '寝室', '热水', '洗澡', '漏水', '门锁', '床板', '卫生间', '下水道', '阳台', '噪音', '门禁', '快递柜', '空调', '熄灯', '查寝', '室友', '调宿', '住宿'],
    departments: ['dorm', 'logistics'],
  },
  {
    category: '餐饮服务',
    keywords: ['食堂', '餐厅', '饭菜', '价格', '吃出', '异物', '变质', '不新鲜', '食品安全', '打卡机', '饭卡', '外卖', '超市', '夜宵', '窗口', '排队'],
    departments: ['canteen', 'logistics'],
  },
  {
    category: '校园设施',
    keywords: ['操场', '电梯', '路灯', '充电桩', '快递', '饮水机', '座椅', '班车', '停车', '场馆', '体育场', '篮球场', '跑道', '健身', '浴室', '开水房', '维修', '报修'],
    departments: ['logistics'],
  },
  {
    category: '教务教学',
    keywords: ['选课', '课程', '培养方案', '教学', '老师', '调课', '停课', '教室', '课表', '学分', '辅修', '转专业', '教材', '评教', '教学事故'],
    departments: ['academic', 'office'],
  },
  {
    category: '考试考务',
    keywords: ['考试', '补考', '缓考', '重修', '四六级', '成绩', '分数', '挂科', '作弊', '监考', '考场', '等级考试', '作弊处理'],
    departments: ['academic'],
  },
  {
    category: '学籍证明',
    keywords: ['学籍', '证明', '学生证', '在读', '成绩单', '盖章', '休学', '复学', '转学', '档案', '注册', '请假', '销假'],
    departments: ['academic', 'office'],
  },
  {
    category: '毕业就业',
    keywords: ['毕业', '论文', '答辩', '三方', '就业', '实习', '学位', '离校', '毕设', '开题', '查重', '招聘', '双选会', '简历', '求职', '报到证'],
    departments: ['grad', 'career', 'academic'],
  },
  {
    category: '图书馆',
    keywords: ['图书馆', '借书', '还书', '续借', '数据库', '自习室', '文献', '研讨间', '占座', '闭馆'],
    departments: ['library'],
  },
  {
    category: '医疗健康',
    keywords: ['校医院', '发烧', '受伤', '体检', '医保', '生病', '药品', '门诊', '疫苗', '过敏', '报销', '病假'],
    departments: ['clinic'],
  },
  {
    category: '奖助资助',
    keywords: ['助学金', '奖学金', '资助', '贷款', '困难认定', '补助', '公示', '勤工助学', '绿色通道', '减免'],
    departments: ['office'],
  },
  {
    category: '缴费财务',
    keywords: ['学费', '住宿费', '缴费', '退款', '退费', '发票', '收据', '扣费', '银行卡', '助学贷款还款', '一卡通充值'],
    departments: ['finance'],
  },
  {
    category: '心理支持',
    keywords: ['情绪', '焦虑', '抑郁', '压力', '失眠', '睡不着', '心理咨询', '崩溃', '不想活', '轻生', '撑不住', '压抑', '室友关系', '关系紧张', '孤独', '想不开'],
    departments: ['psych'],
  },
  {
    category: '安全保卫',
    keywords: ['诈骗', '可疑', '打架', '霸凌', '消防', '失窃', '偷', '安全', '骚扰', '威胁', '超速', '隐患', '门禁卡', '陌生人', '酗酒'],
    departments: ['security'],
  },
  {
    category: '网络服务',
    keywords: ['校园网', '网络', 'wifi', 'WiFi', '断网', '网速', '掉线', 'vpn', 'VPN', '系统', '账号', '密码', '教务系统', '登录不了', '一卡通', '校园卡'],
    departments: ['it'],
  },
  {
    category: '团学活动',
    keywords: ['社团', '团委', '志愿服务', '志愿', '社会实践', '活动', '报名', 'pu', '第二课堂', '素拓', '加分', '晚会', '比赛', '校运会'],
    departments: ['youth', 'sports'],
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
  '打架',
  '失窃',
  '被偷',
  '挂科',
  '退学',
  '延毕',
  '占座',
  '异物',
  '变质',
  '乱收费',
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
  '想不开',
]

const SAFETY_HAZARD_WORDS = ['着火', '冒烟', '漏电', '触电', '煤气', '中毒', '消防', '跳楼']

const URGENT_WORDS = ['紧急', '马上', '立刻', '现在', '严重', '危险', '救命', '很急', '尽快', '今天', '今晚', '马上要', '截止']

/** 分类 → 主责部门。由 CATEGORY_RULES 派生，避免关键词表和部门表各写一份、改一处漏一处。 */
const FALLBACK_DEPARTMENTS = ['office']

const CATEGORY_DEPARTMENTS = {
  ...Object.fromEntries(
    CATEGORY_RULES.map(({ category, departments }) => [category, departments]),
  ),
  其他: FALLBACK_DEPARTMENTS,
}

/**
 * 关键场景的追加协同部门：只做「加人」不做「换人」。
 * 例如食堂吃出异物，主责是饮食中心，但涉及食品安全必须同时叫上保卫处核查。
 */
const DEPARTMENT_SUPPLEMENTS = [
  { keywords: ['吃出', '异物', '变质', '不新鲜', '食物中毒', '食品安全'], add: ['security'] },
  { keywords: ['消防', '灭火器', '通道', '疏散'], add: ['security', 'dorm'] },
  { keywords: ['打架', '斗殴', '霸凌', '欺凌', '威胁', '骚扰'], add: ['security', 'psych'] },
  { keywords: ['诈骗', '被骗', '转账', '刷单'], add: ['security', 'finance'] },
  { keywords: ['漏水', '热水', '门禁', '空调', '床板', '下水道'], add: ['dorm', 'logistics'] },
  { keywords: ['室友', '关系紧张', '矛盾', '冲突'], add: ['psych'] },
  { keywords: ['延毕', '学位', '答辩', '论文'], add: ['grad'] },
  { keywords: ['退费', '退款', '扣费', '乱收费'], add: ['finance'] },
  { keywords: ['一卡通', '校园卡', '教务系统', '系统登录'], add: ['it'] },
  { keywords: ['电梯'], add: ['logistics', 'security'] },
]

/** 分类元数据：前端据此渲染全校服务入口，避免前后端各写一份 */
export const CATEGORY_META = [
  { name: '宿舍生活', icon: 'building', color: '#F3A987', soft: '#FBE9DF' },
  { name: '餐饮服务', icon: 'utensils', color: '#DE9B72', soft: '#FBEDE3' },
  { name: '校园设施', icon: 'wrench', color: '#88B7D9', soft: '#E4F0F8' },
  { name: '教务教学', icon: 'book-open', color: '#9C8BE8', soft: '#EFEBFA' },
  { name: '考试考务', icon: 'clipboard', color: '#8FA9E8', soft: '#E9EEFB' },
  { name: '学籍证明', icon: 'file-text', color: '#B49ADB', soft: '#F0EAF8' },
  { name: '毕业就业', icon: 'graduation-cap', color: '#D9B370', soft: '#FBF2DF' },
  { name: '图书馆', icon: 'library', color: '#79BFAE', soft: '#E7F6F1' },
  { name: '医疗健康', icon: 'stethoscope', color: '#E6A0A8', soft: '#FBEBEE' },
  { name: '奖助资助', icon: 'credit-card', color: '#C9A6E8', soft: '#F3EBFB' },
  { name: '缴费财务', icon: 'wallet', color: '#7FBFA8', soft: '#E6F5EF' },
  { name: '心理支持', icon: 'heart', color: '#E6A4B4', soft: '#FAE8ED' },
  { name: '安全保卫', icon: 'shield', color: '#E5BE65', soft: '#FAF1D9' },
  { name: '网络服务', icon: 'wifi', color: '#83C5B0', soft: '#E3F4EE' },
  { name: '团学活动', icon: 'users', color: '#C99BD8', soft: '#F4EAF8' },
]

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
  if (explicitUrgency && explicitUrgency !== 'normal') return explicitUrgency
  if (risk === 'high') return 'urgent'
  const hits = URGENT_WORDS.filter((word) => text.includes(word))
  if (hits.length >= 2) return 'urgent'
  if (hits.length === 1) return 'high'
  if (text.length > 90) return 'high'
  return 'normal'
}

export const makeSummary = (text, category, location, risk) => {
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

/** 关键词命中工具，haystack 需先转小写 */
const matchesKeywords = (haystack, keywords) =>
  keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))

/**
 * 分派覆盖规则（数据驱动）：按顺序匹配，第一条命中者决定主责部门。
 * 顺序即优先级，语义等价于原来的嵌套三元；新增场景插一行即可，不用再动控制流。
 *   keywords    命中任一即算匹配
 *   when        额外条件（如同时要求分类），可选
 *   departments 命中后取代分类默认部门
 */
const DISPATCH_OVERRIDES = [
  { keywords: ['漏水', '热水', '门禁'], departments: ['dorm', 'logistics'] },
  { keywords: ['消防'], departments: ['security', 'dorm'] },
  { keywords: ['诈骗', '超速'], departments: ['security'] },
  { keywords: ['食堂', '食品'], departments: ['logistics', 'security'] },
  {
    keywords: ['室友'],
    when: ({ category }) => category === '心理支持',
    departments: ['psych', 'dorm'],
  },
  { keywords: ['电梯'], departments: ['logistics', 'security'] },
]

/**
 * 追加协同规则（数据驱动）：所有命中者的 add 全部并入，只做「加人」不做「换人」。
 * 与上方 DEPARTMENT_SUPPLEMENTS 结构完全相同，需要启用时直接展开进来即可。
 */
const DISPATCH_ESCALATIONS = [
  { keywords: SAFETY_HAZARD_WORDS, add: ['security'] },
  // ...DEPARTMENT_SUPPLEMENTS,   ← 想启用现成的场景协同表，放开这一行
]

export const suggestDepartments = (text, category) => {
  const haystack = String(text || '').toLowerCase()
  const override = DISPATCH_OVERRIDES.find(
    (rule) =>
      matchesKeywords(haystack, rule.keywords) &&
      (!rule.when || rule.when({ category, text: haystack })),
  )
  const base = override?.departments || CATEGORY_DEPARTMENTS[category] || FALLBACK_DEPARTMENTS
  const escalated = DISPATCH_ESCALATIONS.filter((rule) =>
    matchesKeywords(haystack, rule.keywords),
  ).flatMap((rule) => rule.add)
  return [...new Set([...base, ...escalated])]
}

export const analyzeRequest = ({ text = '', category: explicitCategory, location = '', urgency: explicitUrgency } = {}) => {
  const risk = detectRisk(text)
  const psychCrisis = PSYCH_CRISIS_WORDS.some((word) => text.includes(word))
  const category = psychCrisis ? '心理支持' : scoreCategory(text, explicitCategory)
  const urgency = detectUrgency(text, risk.level, explicitUrgency)
  const departments = suggestDepartments(text, category)
  const summary = makeSummary(text, category, location, risk.level)
  const deptNames = departments.map((id) => departmentMap[id]?.short || id).join('、')

  const tags = [category]
  if (location) tags.push(location.replace(/学生公寓|教学楼|图书馆/g, (m) => m))
  if (risk.level !== 'low') tags.push(risk.level === 'high' ? '高风险预警' : '需重点关注')
  if (text.length > 80) tags.push('复合诉求')
  if (text.includes('多次') || text.includes('连续') || text.includes('一直')) tags.push('重复发生')

  const draft =
    risk.level === 'high'
      ? '同学你好，我看到你的消息了，谢谢你愿意告诉我。我现在马上联系你，我们先确认你此刻是安全的，好吗？'
      : `同学你好，已收到你关于「${category}」的反馈。我们已联系${deptNames}跟进，有进展会第一时间同步给你。`

  return {
    category,
    urgency,
    risk: risk.level,
    riskReason: risk.reason,
    riskHits: risk.hits,
    sentiment: risk.sentiment,
    summary,
    tags: [...new Set(tags)].slice(0, 5),
    suggestedDepartments: departments,
    suggestedDepartmentNames: departments.map((id) => departmentMap[id]?.name || id),
    confidence: Number((0.88 + Math.min(text.length, 120) / 1200).toFixed(2)),
    draft,
    slaMinutes: risk.level === 'high' ? 60 : urgency === 'urgent' ? 120 : 240,
  }
}

/**
 * 知识库检索：实现已迁到 ai/knowledge.js（BM25 + 同义词 + 分层阈值），
 * 这里保留同名导出，返回结构与旧版一致，避免调用方改动。
 */
export const searchKnowledge = (text) => searchKnowledgeDetailed(text)

export const precheckRequest = ({ text, category, location }) => {
  const analysis = analyzeRequest({ text, category, location })
  const knowledge = searchKnowledge(text)
  const riskBlocksSelfService = analysis.risk !== 'low'
  const urgentBlocksSelfService = analysis.urgency === 'urgent' || analysis.urgency === 'high'
  // 只有高置信命中才允许自助，probable 只作参考（阈值调优，降低「抢答」带来的错答率）
  const confidentMatch = knowledge?.matchTier === 'confident'
  const canSelfSolve = Boolean(knowledge) && confidentMatch && !riskBlocksSelfService && !urgentBlocksSelfService

  let selfServiceAnswer = ''
  if (knowledge) {
    selfServiceAnswer = canSelfSolve
      ? knowledge.answer
      : `知识库里有相关信息，但你的情况涉及${analysis.risk === 'high' ? '需要优先关注的风险' : '需要人工协调的事项'}，建议直接提交工单，由辅导员跟进。`
  } else {
    selfServiceAnswer =
      analysis.risk === 'high'
        ? '听起来你现在很不容易。请先不要独自承受，可以拨打 24 小时心理援助热线 0571-8820 8125；如果情况紧急，请立即联系辅导员或拨打 120。你也可以直接提交诉求，我们会尽快找到你。'
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
          matchTier: knowledge.matchTier,
          confidence: knowledge.confidence,
          matchedTerms: knowledge.matchedTerms,
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
  const overdue = active.filter((ticket) => new Date(ticket.dueAt).getTime() < Date.now())
  return {
    headline: high.length
      ? `有 ${high.length} 条高风险诉求需要优先介入`
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
