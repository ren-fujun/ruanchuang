/**
 * 通知/会议信息抽取引擎
 *
 * 老师发布的通知往往是一大段会议安排（含议题、参会人、要求等），
 * 但学生真正关心的只有两个字段：**什么时间、在哪儿**。
 * 这里用可解释的规则做抽取，保证：
 *   1. 零依赖、离线可用、结果可追溯（每条都带 evidence 原文片段）；
 *   2. 抽取不确定时降低 confidence，前端据此提示老师手动确认/修正；
 *   3. 绝不猜造——抽不到就留空，让老师补，而不是编一个假时间。
 *
 * 可选：配置 DEEPSEEK_API_KEY 后由 llm.js 做一次增强校正，失败自动回退到本规则。
 */

const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

const WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

const pad = (n) => String(n).padStart(2, '0')
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** 中文数字转阿拉伯数字，支持「十」「十五」「二十」「二十五」这类写法 */
export const cnToNumber = (raw) => {
  if (raw == null) return null
  const text = String(raw).trim()
  if (/^\d+$/.test(text)) return Number(text)
  if (!text) return null
  if (text === '十') return 10
  const tenIndex = text.indexOf('十')
  if (tenIndex >= 0) {
    const head = text.slice(0, tenIndex)
    const tail = text.slice(tenIndex + 1)
    const tens = head === '' ? 1 : CN_DIGITS[head]
    const ones = tail === '' ? 0 : CN_DIGITS[tail]
    if (tens == null || ones == null) return null
    return tens * 10 + ones
  }
  if (text.length === 1 && CN_DIGITS[text] != null) return CN_DIGITS[text]
  return null
}

/** 相对日期起点的当天 0 点，避免跨天时把「今天」算错 */
const startOfDay = (base) => new Date(base.getFullYear(), base.getMonth(), base.getDate())

/**
 * 抽取会议时间。
 * 支持：2026年11月12日 / 11月12日 / 11-12 / 11/12 / 下周三 / 本周五 / 周三 / 今天 / 明天 / 后天
 * 时间支持：14:00 / 14：00 / 下午2点 / 上午9点30分 / 14点-16点 / 14:00-16:30
 */
export const extractTime = (text, base = new Date()) => {
  const today = startOfDay(base)
  let date = null
  let dateEvidence = ''
  let explicitYear = false

  // 1) 绝对日期：2026年11月12日 / 11月12日 / 11-12
  const abs =
    text.match(/(\d{4})\s*[年\-\/.]\s*(\d{1,2})\s*[月\-\/.]\s*(\d{1,2})\s*[日号]?/) ||
    text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/) ||
    text.match(/(?<!\d)(\d{1,2})\s*[-\/]\s*(\d{1,2})(?!\d)/)
  if (abs) {
    const groups = abs.slice(1).filter((v) => v != null)
    if (groups.length === 3) {
      const [y, m, d] = groups.map(Number)
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        date = new Date(y, m - 1, d)
        explicitYear = true
      }
    } else {
      const month = Number(groups[0])
      const day = Number(groups[1])
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        date = new Date(today.getFullYear(), month - 1, day)
        // 只写了月日且已经过去，按「明年的那一天」理解
        if (date < today) date = new Date(today.getFullYear() + 1, month - 1, day)
      }
    }
    dateEvidence = abs[0]
  }

  // 2) 相对星期：下周三 / 本周五 / 周三 / 星期日
  if (!date) {
    const week = text.match(/(下{1,2}|本|这)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/)
    if (week) {
      const target = WEEKDAY[week[2]]
      if (target) {
        const current = today.getDay() === 0 ? 7 : today.getDay()
        let delta = target - current
        // 「下周三」必须落在下一周（+7~13 天），否则今天说「下周三」会被算成本周三
        if (week[1] && week[1].startsWith('下')) delta += week[1].length >= 2 ? 14 : 7
        // 只写「周三」且已过，顺延到下周
        else if (!week[1] && delta < 0) delta += 7
        date = new Date(today)
        date.setDate(date.getDate() + delta)
        dateEvidence = week[0].trim()
      }
    }
  }

  // 3) 相对日：今天 / 明天 / 后天 / 大后天
  if (!date) {
    const rel = text.match(/(今|明|后|大后)\s*天/)
    if (rel) {
      const delta = { 今: 0, 明: 1, 后: 2, 大后: 3 }[rel[1]]
      date = new Date(today)
      date.setDate(date.getDate() + delta)
      dateEvidence = rel[0]
    }
  }

  // 4) 时间点：优先 冒号写法，其次「下午3点」这类
  let startTime = null
  let endTime = null
  let timeEvidence = ''

  // 「晚上7:00」这类写法里，上下午信息在数字之前，冒号正则本身取不到，
  // 所以要单独往回看一小段来定上午/下午，否则 19:00 会被记成 07:00。
  const parseHour = (hour, period) => {
    if (hour == null) return null
    let h = hour
    if ((period === '下午' || period === '晚上' || period === '傍晚') && h < 12) h += 12
    if (period === '中午' && h < 12) h += 12
    if (period === '凌晨' && h === 12) h = 0
    return h <= 23 ? h : null
  }
  const periodBefore = (index) => {
    const slice = text.slice(Math.max(0, index - 4), index)
    return (slice.match(/(上午|早上|凌晨|中午|下午|晚上|傍晚)\s*$/) || [])[1] || ''
  }

  const colonRange = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:[-~－—至到]\s*(\d{1,2})\s*[:：]\s*(\d{2}))?/)
  if (colonRange) {
    const headPeriod = periodBefore(colonRange.index)
    const h1 = parseHour(Number(colonRange[1]), headPeriod)
    if (h1 != null) startTime = `${pad(h1)}:${colonRange[2]}`
    if (colonRange[3]) {
      const h2 = parseHour(Number(colonRange[3]), headPeriod)
      if (h2 != null) endTime = `${pad(h2)}:${colonRange[4]}`
    }
    timeEvidence = colonRange[0]
  } else {
    // 分钟部分支持「30分」「半」（九点半 == 09:30），且区间两端各自带上下午前缀
    const cnTime = text.match(
      /(上午|早上|凌晨|中午|下午|晚上|傍晚)?\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[点時时]\s*(?:(\d{1,2})\s*分?|(半))?\s*(?:[-~－—至到]\s*(上午|早上|中午|下午|晚上|傍晚)?\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[点時时])?/,
    )
    if (cnTime) {
      const period = cnTime[1] || ''
      const minute = cnTime[4] ? 30 : cnTime[3] ? Number(cnTime[3]) : 0
      const hour = parseHour(cnToNumber(cnTime[2]), period)
      if (hour != null && minute <= 59) {
        startTime = `${pad(hour)}:${pad(minute)}`
        const endHourRaw = cnTime[6] ? cnToNumber(cnTime[6]) : null
        const endHour = parseHour(endHourRaw, cnTime[5] || period)
        if (endHour != null) endTime = `${pad(endHour)}:${pad(minute)}`
      }
      timeEvidence = cnTime[0].trim()
    }
  }

  const confidence = date && startTime ? 0.96 : date ? 0.72 : startTime ? 0.55 : 0
  return {
    date: date ? toDateKey(date) : '',
    startTime: startTime || '',
    endTime: endTime || '',
    allDay: Boolean(date) && !startTime,
    confidence,
    evidence: { date: dateEvidence, time: timeEvidence },
    explicitYear,
  }
}

/**
 * 抽取会议地点。校园场景写法很杂：
 *   「地点：图书馆报告厅」「在 3 号楼 302 会议室」「行政楼 5 楼会议室」「腾讯会议 123-456-789」
 * 采用触发词优先、无序兜底的方式，并在标点/停用词处截断。
 */
export const extractLocation = (text) => {
  // 停用字：出现这些字说明已经越过地点、进入后续动作或说明。
  // 这里必须是「字符集合」而不是带 | 的分支串——早期版本把分支串塞进
  // [^...] 里，整个字符类被解释成字面字符，导致地点几乎永远抽不到。
  const STOP_CHARS = [
    ' ', '\t', '\n', '\r', '\u3000',
    '，', ',', '。', '；', ';', '、', '！', '!', '？', '?', '：', ':', '（', '(', '）', ')', '【', '】', '《', '》',
    '时', '于', '在', '的', '和', '与', '及', '或', '等', '各', '该', '此',
    '举', '开', '召', '请', '望', '要', '须', '务', '注', '参', '准', '提', '届', '如', '另', '联', '备',
    '全', '届', '完', '进', '到', '为', '将', '把', '由', '自', '从', '向', '对',
  ]
  const STOP = `[^${[...new Set(STOP_CHARS)].join('')}]`
  // 场地词：复合词必须排在前面（「多功能厅」若排在「厅」后面就只会匹配到「厅」）
  const VENUE_WORD =
    '学生活动中心|活动中心|多功能厅|报告厅|大礼堂|礼堂|会议室|会议厅|阶梯教室|教室|值班室|接待室|服务大厅|办事大厅|一站式大厅|体育馆|体育场|图书馆|教学楼|实验楼|工作室|实验室|食堂|广场|操场|公寓楼|宿舍楼|大楼|中心'
  // 多段场地：「行政楼 5 楼 502 会议室」「学生活动中心多功能厅」都能整段拿到。
  // 两个坑都踩过：{n,m} 若直接跟在 | 分支串后，只约束最后一个分支；
  // 若写作 (?:场地词|楼|5){n,m}，量词又会落到单字符选项「5」上。
  // 正确写法是把「候选词」与「候选单字字符类」拆成两个分组。
  // 字符类里必须包含「行政/教学/实验/图书」等常见楼名首字，否则站点名会从中间截断。
  const VENUE_PHRASE = `(?:${VENUE_WORD}|[\\d\\s楼层馆厅室场号栋幢座、和与及一二三四五六七八九十行政教学实验图书办公综合实训公寓宿舍体育]{2,40}?)(?:${VENUE_WORD})`

  const patterns = [
    // 「地点：xxx」「地点在xxx」「会场：xxx」——显式标注，可信度最高。
    // 这里特意允许空格（「行政楼 5 楼 502 会议室」中间就有空格），
    // 改用一个前瞻来终止：遇到句读、换行，或「请/准时/联系人」这类后续说明词即停。
    {
      re: /(?:会议地点|地点|地址|场地|会场|会场地点)\s*(?:设于|位于|定于|在|为)?\s*[:：]?\s*([^\n\r，。；;、！!？?]{2,40}?)(?=\s*(?:[\n\r，。；;、！!？?]|请|望|各位|全体|务必|要求|注意|准时|提前|如有|届时|联系人|联系电话|备注|另行|参会|参加|出席|签到|携带|负责|主持|主持|议程|议程)|$)/,
      confidence: 0.95,
      // 截取到的片段里可能还有更完整的场地短语（如「行政楼 5 楼 502 会议室」），优先取整段
      prefer: new RegExp(`(${VENUE_PHRASE})`),
    },
    // 没有「在/于」的裸写法：「图书馆报告厅举办…」「学生活动中心多功能厅举行…」
    // 必须排在单场地词规则之前，否则「图书馆」「学生活动中心」会先把整段截断
    { re: new RegExp(`(${VENUE_PHRASE})`), confidence: 0.8 },
    // 「在xxx报告厅」「于xxx会议室」——允许地点前面带 0~30 个描述字
    { re: new RegExp(`(?:在|于)\\s*(${STOP}{0,30}?(?:${VENUE_WORD}))`), confidence: 0.85 },
  ]

  // 尾部修剪：抽出来的片段常会带上「举行/召开/集合」等动作字，按字逐个削掉
  const TRIM = /[的在和与及为等各该此了着过从对于将把由自向把开举召参请望要须务注准提联备完进场到说讲做去来并并且又也就都还]$/
  const clean = (raw) => {
    let value = String(raw).trim()
    for (let i = 0; i < 8 && value.length > 2 && TRIM.test(value); i += 1) {
      value = value.slice(0, -1)
    }
    return value.replace(/^[的\s]+/, '').trim()
  }

  for (const { re, confidence, prefer } of patterns) {
    const hit = text.match(re)
    if (!hit) continue
    let raw = hit[1]
    if (prefer) {
      const fuller = raw.match(prefer)
      if (fuller && fuller[1].length > raw.length) raw = fuller[1]
    }
    const value = clean(raw)
    if (value.length >= 2) return { value, confidence, evidence: hit[0].trim() }
  }
  // 线上会议兜底
  const online = text.match(/(腾讯会议|钉钉|飞书|Zoom|zoom|企业微信)[^\d]{0,8}(\d[\d\s-]{6,})/)
  if (online) return { value: `${online[1]} ${online[2].trim()}`, confidence: 0.9, evidence: online[0].trim() }
  return { value: '', confidence: 0, evidence: '' }
}

/** 抽取会议主题：优先「关于……的通知/会议」，否则取会议名，最后才用首句 */
export const extractTitle = (text) => {
  // 会议名前允许带修饰字，但不能把年份/时间/在/于吞进来
  const NAME = '宣讲会|动员会|说明会|交流会|座谈会|研讨会|讲座|培训|答辩会|答辩|班会|例会|见面会|招聘会|双选会|推介会|大会|会议'
  const about = text.match(new RegExp(`关于[^，。；\\n0-9]{2,24}?(?:${NAME})`))
  if (about) return about[0].trim()
  const aboutNotice = text.match(/关于[^，。；\n]{2,30}?(?:的通知|的安排|的公告|的方案)/)
  if (aboutNotice) return aboutNotice[0]
  const meeting = text.match(new RegExp(`(?:^|[，。；;、！!？?\\s]|在|于)([^，。；;、！!？?\\n0-9]{2,12}?(?:${NAME}))`))
  const hit = meeting || text.match(new RegExp(`([^，。；;、！!？?\\n0-9]{2,12}?(?:${NAME}))`))
  if (hit) return hit[1].replace(/^[的\s]+/, '').trim()
  const firstSentence = text.replace(/\s+/g, ' ').trim().split(/[。！？\n]/)[0] || ''
  return firstSentence.slice(0, 26)
}

/**
 * 判定这条通知是否属于「要记进日程的会议」。
 * 纯事务性通知（如停水停电、放假安排）不含会议场景词时不算。
 */
export const looksLikeMeeting = (text) => {
  const MEETING_WORDS = [
    '会议', '大会', '座谈会', '讲座', '宣讲', '培训', '答辩', '班会', '例会', '研讨会',
    '交流会', '动员会', '见面会', '说明会', '招聘会', '双选会', '推介会', '开题', '中期检查',
  ]
  const hasMeetingWord = MEETING_WORDS.some((word) => text.includes(word))
  const hasPlaceholder = /(腾讯会议|钉钉会议|飞书会议|Zoom|zoom)/.test(text)
  return hasMeetingWord || hasPlaceholder
}

/** 从整段通知中抽取结构化会议信息 */
export const extractMeeting = (rawText, base = new Date()) => {
  const text = String(rawText || '')
  const time = extractTime(text, base)
  const location = extractLocation(text)
  const title = extractTitle(text)
  const isMeeting = looksLikeMeeting(text)

  let confidence = Math.round((time.confidence * 0.6 + location.confidence * 0.4) * 100) / 100
  if (!isMeeting) confidence = Math.round(confidence * 0.6 * 100) / 100

  const missing = []
  if (!time.date) missing.push('日期')
  if (!time.startTime) missing.push('具体时间')
  if (!location.value) missing.push('地点')

  return {
    title,
    date: time.date,
    startTime: time.startTime,
    endTime: time.endTime,
    allDay: time.allDay,
    location: location.value,
    isMeeting,
    confidence,
    missing,
    evidence: {
      date: time.evidence.date,
      time: time.evidence.time,
      location: location.evidence,
    },
  }
}

/** 会议结束时刻（用于排序与过期判断），未填结束时间默认 90 分钟 */
export const meetingEndsAt = (meeting) => {
  const duration = meeting.endTime && meeting.startTime ? diffMinutes(meeting.startTime, meeting.endTime) : 90
  return new Date(`${meeting.date}T${meeting.startTime || '23:59'}:00`).getTime() + Math.max(duration, 30) * 60000
}

const diffMinutes = (start, end) => {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

/** 与「现在」的距离，用于生成「今天 / 明天 / 3 天后」这类人类可读标签 */
export const relativeDayLabel = (dateKey, base = new Date()) => {
  if (!dateKey) return '时间待定'
  const target = startOfDay(new Date(`${dateKey}T00:00:00`))
  const today = startOfDay(base)
  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days === 2) return '后天'
  if (days < 0) return `已结束`
  if (days <= 7) return `${days} 天后`
  return `${days} 天后`
}
