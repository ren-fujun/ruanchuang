/**
 * B 部分 · GraphRAG 权责流程图谱（升级任务 1）
 *
 * 两套图谱合一实现：
 *   「权责 — 流程图谱」：部门 ↔ 权责事项 ↔ 会签规则 ↔ 办理阶段，固化派单路径与会签规则；
 *   「诉求事件图谱」  ：权责事项 ↔ 历史卡点（由工单数据统计加权），支撑归因与堵点识别。
 *
 * 检索方式不是「向量 top-k」，而是：要素/关键词命中权责节点 → 沿边做 1~2 跳子图扩展
 * → 输出主责、协同、会签、升级与办理路径，并保留每一跳的 evidence（可解释、可答辩）。
 *
 * 依赖注入说明：本模块不反向 import ai.js（避免循环依赖），
 * 分类 → 部门的先验由调用方通过 preferredDepts 传入。
 */

import { departmentMap } from '../seed.js'

const STAGES = [
  { id: 'accept', name: '受理', slaMinutes: 30, desc: '学生提交，辅导员接单核对要素' },
  { id: 'review', name: '审核', slaMinutes: 60, desc: '判定权责归属与是否需要会签' },
  { id: 'dispatch', name: '派单', slaMinutes: 15, desc: '按图谱路径分派主责与协同部门' },
  { id: 'handle', name: '处置', slaMinutes: 240, desc: '主责部门处置并回填结果' },
  { id: 'feedback', name: '反馈', slaMinutes: 120, desc: '学生确认办结与评价' },
  { id: 'archive', name: '归档', slaMinutes: 1440, desc: '沉淀事件图谱与效率统计' },
]

/** 历史卡点节点：来自工单复盘结论，权重会在 rankBottlenecks 中用真实数据回填 */
const BOTTLENECKS = [
  { id: 'bt-material', name: '物资申领与备件等待', dept: 'logistics', hint: '维修件需走物资申领流程，平均等待 1~2 天', suggestion: '对高频备件建立楼栋周转库存，先换后补' },
  { id: 'bt-night', name: '夜间上门响应偏慢', dept: 'dorm', hint: '22:00 后值班人手减少，到场时间拉长', suggestion: '夜间应急合并值班并预置应急联系人' },
  { id: 'bt-cross', name: '跨部门会签等待', dept: 'office', hint: '多部门会签缺少时限约束，容易停在中转', suggestion: '会签环节统一 60 分钟时限，超时自动抄送负责人' },
  { id: 'bt-auth', name: '认证系统重复报修', dept: 'it', hint: '同一账号问题重复提交，缺少一次性根治', suggestion: '按账号聚类合并工单，一次性排查根因' },
  { id: 'bt-stamp', name: '盖章与材料审核排队', dept: 'office', hint: '集中在截止日前，排队明显', suggestion: '提前发布材料清单与分流时段' },
  { id: 'bt-psych-slot', name: '心理中心预约排期', dept: 'psych', hint: '考试周预约紧张，首次咨询等待变长', suggestion: '考试周增设团体辅导与加急时段' },
  { id: 'bt-canteen-check', name: '食品安全送检周期', dept: 'canteen', hint: '留样送检需 1~2 个工作日', suggestion: '先封存留样并当场反馈，检验结果同步学生' },
]

/**
 * 权责事项节点（图谱核心实体）。
 * countersign 为会签规则：命中条件（always / 关键词）成立时必须多部门共同签署，
 * 这正是「漏会签」问题在图谱层的解法。
 */
export const DUTIES = [
  {
    id: 'duty-dorm-repair',
    name: '宿舍设施维修',
    categories: ['宿舍生活'],
    ownerDept: 'dorm',
    supportDepts: ['logistics'],
    keywords: ['宿舍', '寝室', '报修', '维修', '水龙头', '漏水', '渗水', '门锁', '空调', '床板', '下水道', '卫生间', '阳台', '灯具', '热水器'],
    slaMinutes: 120,
    bottlenecks: ['bt-material'],
    countersign: [],
  },
  {
    id: 'duty-dorm-power',
    name: '宿舍水电与用电安全',
    categories: ['宿舍生活', '安全保卫'],
    ownerDept: 'logistics',
    supportDepts: ['dorm'],
    keywords: ['断电', '停电', '跳闸', '漏电', '触电', '插座', '电线', '短路', '没电', '电闸', '热水', '停水', '爆管'],
    slaMinutes: 60,
    bottlenecks: ['bt-night'],
    countersign: [{ dept: 'security', reason: '用电与供水安全隐患需保卫处会签核查', trigger: ['漏电', '触电', '短路', '电线'] }],
  },
  {
    id: 'duty-dorm-conflict',
    name: '宿舍关系与调宿',
    categories: ['宿舍生活', '心理支持'],
    ownerDept: 'dorm',
    supportDepts: [],
    keywords: ['室友', '作息', '噪音', '矛盾', '冲突', '关系紧张', '调宿', '换宿舍', '排挤', '孤立'],
    slaMinutes: 240,
    bottlenecks: [],
    countersign: [{ dept: 'psych', reason: '涉及宿舍人际冲突，需心理中心会签评估', trigger: ['矛盾', '冲突', '关系紧张', '排挤', '孤立', '被骂', '吵架', '争吵', '噪音'] }],
  },
  {
    id: 'duty-campus-repair',
    name: '校园公共设施维修',
    categories: ['校园设施'],
    ownerDept: 'logistics',
    supportDepts: [],
    keywords: ['路灯', '教室', '饮水机', '座椅', '篮球场', '跑道', '充电桩', '停车', '操场', '公共设施', '损毁', '报修'],
    slaMinutes: 240,
    bottlenecks: ['bt-material'],
    countersign: [],
  },
  {
    id: 'duty-campus-elevator',
    name: '电梯与特种设备安全',
    categories: ['校园设施', '安全保卫'],
    ownerDept: 'logistics',
    supportDepts: [],
    keywords: ['电梯', '困人', '特种设备', '锅炉', '压力容器', '卡住'],
    slaMinutes: 60,
    bottlenecks: [],
    countersign: [{ dept: 'security', reason: '特种设备安全事件需保卫处会签备案', trigger: ['always'] }],
  },
  {
    id: 'duty-canteen-food',
    name: '食堂食品安全',
    categories: ['餐饮服务'],
    ownerDept: 'canteen',
    supportDepts: ['logistics'],
    keywords: ['食堂', '异物', '变质', '不新鲜', '吃出', '食物中毒', '腹泻', '发霉', '虫子', '食品安全', '留样'],
    slaMinutes: 60,
    bottlenecks: ['bt-canteen-check'],
    countersign: [
      { dept: 'security', reason: '食品安全事件需保卫处联合核查与留样封存', trigger: ['always'] },
      { dept: 'clinic', reason: '出现身体不适需校医院会签处置', trigger: ['腹泻', '食物中毒', '呕吐', '发烧'] },
    ],
  },
  {
    id: 'duty-canteen-service',
    name: '食堂服务与价格',
    categories: ['餐饮服务'],
    ownerDept: 'canteen',
    supportDepts: [],
    keywords: ['饭菜', '价格', '窗口', '排队', '打卡机', '份量', '服务态度', '外卖', '超市', '夜宵'],
    slaMinutes: 480,
    bottlenecks: [],
    countersign: [{ dept: 'finance', reason: '涉及收费争议需财务处会签核对', trigger: ['乱收费', '扣费', '多扣', '价格'] }],
  },
  {
    id: 'duty-net-campus',
    name: '校园网与账号服务',
    categories: ['网络服务'],
    ownerDept: 'it',
    supportDepts: [],
    keywords: ['校园网', '断网', '网速', '掉线', 'wifi', 'vpn', '认证', '账号', '密码', '教务系统', '登录不了', '系统故障'],
    slaMinutes: 180,
    bottlenecks: ['bt-auth'],
    countersign: [],
  },
  {
    id: 'duty-net-card',
    name: '校园卡与一卡通',
    categories: ['网络服务', '缴费财务'],
    ownerDept: 'it',
    supportDepts: [],
    keywords: ['校园卡', '一卡通', '饭卡', '补办', '挂失', '余额', '刷卡', '消磁', '充值'],
    slaMinutes: 180,
    bottlenecks: [],
    countersign: [{ dept: 'finance', reason: '涉及余额与扣费争议需财务处会签', trigger: ['余额', '扣费', '充值', '扣款'] }],
  },
  {
    id: 'duty-academic-course',
    name: '选课与培养方案',
    categories: ['教务教学'],
    ownerDept: 'academic',
    supportDepts: ['office'],
    keywords: ['选课', '课程', '培养方案', '学分', '调课', '停课', '教室', '课表', '辅修', '转专业', '教材'],
    slaMinutes: 480,
    bottlenecks: [],
    countersign: [],
  },
  {
    id: 'duty-academic-exam',
    name: '考试考务与成绩',
    categories: ['考试考务'],
    ownerDept: 'academic',
    supportDepts: [],
    keywords: ['考试', '补考', '缓考', '重修', '四六级', '成绩', '挂科', '监考', '考场', '作弊', '分数'],
    slaMinutes: 480,
    bottlenecks: [],
    countersign: [],
  },
  {
    id: 'duty-certificate',
    name: '学籍证明与盖章',
    categories: ['学籍证明'],
    ownerDept: 'office',
    supportDepts: ['academic'],
    keywords: ['在读证明', '学籍证明', '成绩单', '盖章', '学生证', '休学', '复学', '档案', '注册', '请假'],
    slaMinutes: 480,
    bottlenecks: ['bt-stamp'],
    countersign: [],
  },
  {
    id: 'duty-aid',
    name: '奖助资助与困难认定',
    categories: ['奖助资助'],
    ownerDept: 'office',
    supportDepts: [],
    keywords: ['助学金', '奖学金', '资助', '困难认定', '补助', '勤工助学', '贷款', '公示', '绿色通道'],
    slaMinutes: 480,
    bottlenecks: ['bt-stamp'],
    countersign: [{ dept: 'finance', reason: '涉及助学贷款与资金发放需财务处会签', trigger: ['贷款', '发放', '到账'] }],
  },
  {
    id: 'duty-finance-fee',
    name: '缴费退费争议',
    categories: ['缴费财务'],
    ownerDept: 'finance',
    supportDepts: [],
    keywords: ['学费', '住宿费', '缴费', '退费', '退款', '发票', '收据', '扣费', '乱收费', '银行卡'],
    slaMinutes: 480,
    bottlenecks: [],
    countersign: [{ dept: 'office', reason: '涉及学院收费口径解释需院办会签', trigger: ['always'] }],
  },
  {
    id: 'duty-psych-consult',
    name: '心理咨询与情绪支持',
    categories: ['心理支持'],
    ownerDept: 'psych',
    supportDepts: [],
    keywords: ['心理咨询', '预约', '情绪', '焦虑', '抑郁', '压力', '失眠', '睡不着', '孤独', '想聊聊'],
    slaMinutes: 120,
    bottlenecks: ['bt-psych-slot'],
    countersign: [],
  },
  {
    id: 'duty-psych-crisis',
    name: '心理危机干预',
    categories: ['心理支持', '安全保卫'],
    ownerDept: 'psych',
    supportDepts: [],
    keywords: ['不想活', '活着没意思', '想死', '自杀', '轻生', '自残', '割腕', '撑不住', '撑不下去', '崩溃', '失联', '跳楼', '想不开', '绝望', '不想回寝室'],
    slaMinutes: 60,
    bottlenecks: [],
    escalateTo: [{ dept: 'office', reason: '学院需同步掌握并参与线下跟进' }],
    countersign: [
      { dept: 'office', reason: '危机个案需学院会签并落实包保跟进', trigger: ['always'] },
      { dept: 'security', reason: '存在自伤、失联或危及他人风险，需保卫处协同', trigger: ['失联', '自残', '割腕', '跳楼', '自杀'] },
    ],
  },
  {
    id: 'duty-security-fraud',
    name: '诈骗与财产损失',
    categories: ['安全保卫', '缴费财务'],
    ownerDept: 'security',
    supportDepts: [],
    keywords: ['诈骗', '被骗', '刷单', '转账', '兼职', '贷款诈骗', '钓鱼', '盗刷', '假客服'],
    slaMinutes: 60,
    bottlenecks: [],
    countersign: [{ dept: 'finance', reason: '涉及资金止付与账户核查需财务处会签', trigger: ['always'] }],
  },
  {
    id: 'duty-security-violence',
    name: '冲突霸凌与人身安全',
    categories: ['安全保卫', '心理支持'],
    ownerDept: 'security',
    supportDepts: [],
    keywords: ['打架', '斗殴', '霸凌', '欺凌', '威胁', '骚扰', '恐吓', '人身安全', '酗酒', '陌生人'],
    slaMinutes: 60,
    bottlenecks: [],
    countersign: [
      { dept: 'psych', reason: '涉事学生需心理中心会签评估', trigger: ['always'] },
      { dept: 'office', reason: '学院需参与教育处理与家校沟通', trigger: ['always'] },
    ],
  },
  {
    id: 'duty-fire-hazard',
    name: '消防隐患与通道占用',
    categories: ['安全保卫', '宿舍生活'],
    ownerDept: 'security',
    supportDepts: [],
    keywords: ['消防', '灭火器', '通道', '疏散', '占用', '着火', '冒烟', '明火', '电动车充电', '堵塞'],
    slaMinutes: 60,
    bottlenecks: [],
    countersign: [
      { dept: 'dorm', reason: '宿舍区消防隐患需宿管中心会签整改', trigger: ['always'] },
      { dept: 'logistics', reason: '设施类整改需后勤会签落实', trigger: ['灭火器', '设施', '通道'] },
    ],
  },
  {
    id: 'duty-library',
    name: '图书馆服务',
    categories: ['图书馆'],
    ownerDept: 'library',
    supportDepts: [],
    keywords: ['图书馆', '借书', '还书', '续借', '数据库', '自习室', '研讨间', '占座', '闭馆', '文献'],
    slaMinutes: 480,
    bottlenecks: [],
    countersign: [],
  },
  {
    id: 'duty-clinic',
    name: '医疗健康与医保',
    categories: ['医疗健康'],
    ownerDept: 'clinic',
    supportDepts: [],
    keywords: ['校医院', '发烧', '受伤', '体检', '医保', '门诊', '疫苗', '过敏', '报销', '病假'],
    slaMinutes: 240,
    bottlenecks: [],
    countersign: [{ dept: 'finance', reason: '医保报销涉及财务会签', trigger: ['报销', '医保'] }],
  },
  {
    id: 'duty-grad',
    name: '毕业与就业手续',
    categories: ['毕业就业'],
    ownerDept: 'grad',
    supportDepts: [],
    keywords: ['毕业', '论文', '答辩', '三方', '就业', '实习', '学位', '离校', '延毕', '查重', '报到证', '简历'],
    slaMinutes: 480,
    bottlenecks: [],
    countersign: [
      { dept: 'academic', reason: '学位与成绩审核需教务处会签', trigger: ['always'] },
      { dept: 'career', reason: '就业手续需就业指导中心会签', trigger: ['三方', '就业', '报到证', '简历'] },
    ],
  },
  {
    id: 'duty-youth',
    name: '团学活动与第二课堂',
    categories: ['团学活动'],
    ownerDept: 'youth',
    supportDepts: ['sports'],
    keywords: ['社团', '团委', '志愿', '社会实践', '第二课堂', '素拓', '加分', '晚会', '比赛', '校运会'],
    slaMinutes: 480,
    bottlenecks: [],
    countersign: [],
  },
]

const DUTY_MAP = Object.fromEntries(DUTIES.map((duty) => [duty.id, duty]))
const BOTTLENECK_MAP = Object.fromEntries(BOTTLENECKS.map((item) => [item.id, item]))
const deptName = (id) => departmentMap[id]?.name || id
const deptShort = (id) => departmentMap[id]?.short || id

const clean = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

// ── 图谱构建：节点与边 ──────────────────────────────────────
const buildGraph = () => {
  const nodes = []
  const edges = []
  const push = (node) => {
    nodes.push(node)
    return node
  }
  const link = (source, target, type, label, weight = 1) => edges.push({ source, target, type, label, weight })

  for (const dept of Object.values(departmentMap)) {
    push({
      id: `dept:${dept.id}`,
      type: 'department',
      label: dept.name,
      short: dept.short,
      sla: dept.sla,
      phone: dept.phone,
      contact: dept.contact,
    })
  }

  for (const stage of STAGES) {
    push({ id: `stage:${stage.id}`, type: 'stage', label: stage.name, slaMinutes: stage.slaMinutes, desc: stage.desc })
  }
  for (let i = 0; i < STAGES.length - 1; i += 1) {
    link(`stage:${STAGES[i].id}`, `stage:${STAGES[i + 1].id}`, 'precedes', '流程先后')
  }

  for (const bottleneck of BOTTLENECKS) {
    push({ id: `bt:${bottleneck.id}`, type: 'bottleneck', label: bottleneck.name, dept: bottleneck.dept, hint: bottleneck.hint, suggestion: bottleneck.suggestion })
  }

  for (const duty of DUTIES) {
    push({
      id: `duty:${duty.id}`,
      type: 'duty',
      label: duty.name,
      ownerDept: duty.ownerDept,
      categories: duty.categories,
      slaMinutes: duty.slaMinutes,
      keywords: duty.keywords,
    })
    link(`dept:${duty.ownerDept}`, `duty:${duty.id}`, 'owns', '主责', 1)
    for (const dept of duty.supportDepts || []) link(`dept:${dept}`, `duty:${duty.id}`, 'supports', '协同', 0.6)
    link(`duty:${duty.id}`, 'stage:accept', 'enters', '进入流程')
    for (const id of duty.bottlenecks || []) link(`duty:${duty.id}`, `bt:${id}`, 'bottleneck_at', '历史卡点', 0.8)
    for (const item of duty.escalateTo || []) link(`duty:${duty.id}`, `dept:${item.dept}`, 'escalates_to', item.reason, 0.9)
    for (const rule of duty.countersign || []) {
      const csId = `cs:${duty.id}:${rule.dept}`
      push({
        id: csId,
        type: 'countersign',
        label: `${deptShort(rule.dept)}会签`,
        dept: rule.dept,
        reason: rule.reason,
        trigger: rule.trigger,
      })
      link(`duty:${duty.id}`, csId, 'requires_countersign', '触发会签')
      link(csId, `dept:${rule.dept}`, 'countersigned_by', rule.reason, 0.9)
    }
  }

  return { nodes, edges }
}

const graph = buildGraph()
const NODE_MAP = Object.fromEntries(graph.nodes.map((node) => [node.id, node]))

/** 图谱总览：给 C 的驾驶舱可视化与答辩展示用 */
export const graphSummary = () => ({
  stats: {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    duties: DUTIES.length,
    departments: Object.keys(departmentMap).length,
    countersignRules: graph.nodes.filter((node) => node.type === 'countersign').length,
    bottlenecks: BOTTLENECKS.length,
    stages: STAGES.length,
  },
  duties: DUTIES.map((duty) => ({
    id: duty.id,
    name: duty.name,
    ownerDept: duty.ownerDept,
    ownerDeptName: deptName(duty.ownerDept),
    supportDepts: duty.supportDepts || [],
    countersignDepts: (duty.countersign || []).map((item) => item.dept),
    slaMinutes: duty.slaMinutes,
    bottlenecks: duty.bottlenecks || [],
  })),
  bottlenecks: BOTTLENECKS,
  edgeTypes: [...new Set(graph.edges.map((edge) => edge.type))],
})

/** 完整节点 / 边：可直接喂给图谱可视化组件 */
export const graphVisualization = () => ({
  nodes: graph.nodes.map((node) => ({ ...node })),
  edges: graph.edges.map((edge) => ({ ...edge })),
})

/** 权重边表：出边索引，检索时做多跳扩展用 */
const OUT_EDGES = (() => {
  const map = new Map()
  for (const edge of graph.edges) {
    if (!map.has(edge.source)) map.set(edge.source, [])
    map.get(edge.source).push(edge)
  }
  return map
})()

const IN_EDGES = (() => {
  const map = new Map()
  for (const edge of graph.edges) {
    if (!map.has(edge.target)) map.set(edge.target, [])
    map.get(edge.target).push(edge)
  }
  return map
})()

const loadDeptIds = (text) =>
  Object.values(departmentMap)
    .filter((dept) => text.includes(dept.short) || text.includes(dept.name))
    .map((dept) => dept.id)

/** 关键词 → 权责事项打分。长关键词权重更高，命中词全部保留作为证据 */
const scoreDuties = (text, preferredDepts = []) => {
  const haystack = clean(text, 600).toLowerCase()
  return DUTIES.map((duty) => {
    let score = 0
    const matched = []
    for (const keyword of duty.keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        score += keyword.length >= 3 ? 2.4 : keyword.length === 2 ? 1.4 : 0.8
        matched.push(keyword)
      }
    }
    if (preferredDepts.includes(duty.ownerDept)) score += 1.6
    else if ((duty.supportDepts || []).some((dept) => preferredDepts.includes(dept))) score += 0.8
    if ((duty.categories || []).length && matched.length) score += 0.2
    return { duty, score: Number(score.toFixed(2)), matched }
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
}

const COMPOUND_CONNECTORS = ['和', '同时', '还有', '以及', '另外', '并且', '加上', '一方面', '而且', '又', '也']

const triggeredCountersign = (duty, haystack) =>
  (duty.countersign || []).filter(
    (rule) =>
      rule.trigger.includes('always') || rule.trigger.some((keyword) => haystack.includes(keyword.toLowerCase())),
  )

/**
 * 派单路径：主责 + 协同 + 会签 + 处置 + 反馈归档。
 * involvedDuties 为图谱命中的全部权责事项（复合工单时会有多条）。
 */
const buildDispatchPath = (involvedDuties, countersignRules, { ownerDepts, supportDepts }) => {
  const primary = involvedDuties[0]
  const path = [
    { order: 1, stage: '受理', actor: '辅导员', action: '接单核对诉求要素与地点，确认是否需要现场核查', slaMinutes: 30 },
    {
      order: 2,
      stage: '派单',
      actor: ownerDepts.map(deptShort).join(' + '),
      action:
        ownerDepts.length > 1
          ? `联合主办：${ownerDepts.map(deptName).join('、')}（对应权责：${involvedDuties.map((duty) => duty.name).join('、')}）`
          : `主责派单至${deptName(primary.ownerDept)}${supportDepts.length ? `，协同：${supportDepts.map(deptShort).join('、')}` : ''}`,
      slaMinutes: 15,
    },
  ]
  countersignRules.forEach((rule, index) => {
    path.push({
      order: 3 + index,
      stage: '会签',
      actor: deptShort(rule.dept),
      action: rule.reason,
      slaMinutes: 60,
      countersign: true,
    })
  })
  path.push({
    order: path.length + 1,
    stage: '处置',
    actor: ownerDepts.map(deptShort).join(' + '),
    action: '按权责处置并回填结果与凭证',
    slaMinutes: Math.min(...involvedDuties.map((duty) => duty.slaMinutes)),
  })
  path.push({
    order: path.length + 1,
    stage: '反馈归档',
    actor: '辅导员',
    action: '通知学生确认办结，办结数据沉淀进事件图谱',
    slaMinutes: 1440,
  })
  return path
}

/**
 * 图谱检索主入口：子图检索 + 会签判定 + 派单路径。
 * @param {string} text 诉求原文
 * @param {{ category?: string, preferredDepts?: string[], riskLevel?: string, limit?: number }} options
 */
export const queryGraph = (text, options = {}) => {
  const haystack = clean(text, 600).toLowerCase()
  const preferredDepts = options.preferredDepts || []
  const limit = options.limit || 3
  const ranked = scoreDuties(text, preferredDepts)
  const mentionedDepts = loadDeptIds(haystack)
  const threshold = options.threshold ?? 1.4

  if (!ranked.length || ranked[0].score < threshold) {
    return {
      matched: false,
      duties: [],
      primaryDuty: null,
      primaryDept: null,
      collaboratorDepts: [],
      countersign: { required: false, departments: [], rules: [] },
      dispatchPath: [],
      complexity: 'unknown',
      complexityReason: '图谱未命中明确权责事项，建议人工确认归属',
      bottlenecks: [],
      escalation: [],
      slaMinutes: null,
      confidence: 0.2,
      evidence: [],
      engine: 'graph-traversal',
    }
  }

  const top = ranked[0]
  const second = ranked[1]
  const compoundByScore = Boolean(second && second.score >= top.score * 0.55 && second.duty.ownerDept !== top.duty.ownerDept)
  const compoundByConnector = COMPOUND_CONNECTORS.some((word) => haystack.includes(word)) && ranked.length >= 2
  const involvedDuties = [top.duty]
  if (compoundByScore || compoundByConnector) {
    for (const entry of ranked.slice(1, limit)) {
      if (entry.score >= threshold && entry.duty.ownerDept !== top.duty.ownerDept) involvedDuties.push(entry.duty)
    }
  }

  const ownerDepts = [...new Set(involvedDuties.map((duty) => duty.ownerDept))]
  const supportDepts = [...new Set(involvedDuties.flatMap((duty) => duty.supportDepts || []))].filter(
    (dept) => !ownerDepts.includes(dept),
  )
  const countersignRulesRaw = involvedDuties.flatMap((duty) =>
    triggeredCountersign(duty, haystack).map((rule) => ({ ...rule, dutyId: duty.id, dutyName: duty.name })),
  )
  const countersignRules = []
  const seenCountersign = new Set()
  for (const rule of countersignRulesRaw) {
    const key = `${rule.dept}`
    if (seenCountersign.has(key) || ownerDepts.includes(rule.dept)) continue
    seenCountersign.add(key)
    countersignRules.push(rule)
  }

  const bottleneckIds = [...new Set(involvedDuties.flatMap((duty) => duty.bottlenecks || []))]
  const escalation = [...new Set(involvedDuties.flatMap((duty) => duty.escalateTo || []))]

  // 多跳证据：duty → dept / countersign / bottleneck，保留每一跳便于解释与可视化
  // 会签节点只保留「本次触发」的，避免证据链里出现与判定结论不一致的会签关系
  const triggeredCountersignNodes = new Set(countersignRules.map((rule) => `cs:${rule.dutyId}:${rule.dept}`))
  const evidence = []
  for (const duty of involvedDuties) {
    const nodeId = `duty:${duty.id}`
    for (const edge of IN_EDGES.get(nodeId) || []) {
      evidence.push({
        path: [`${edge.source}`, nodeId],
        type: edge.type,
        label: `${NODE_MAP[edge.source]?.label || edge.source} —${edge.label}→ ${duty.name}`,
        weight: edge.weight,
      })
    }
    for (const edge of OUT_EDGES.get(nodeId) || []) {
      if (edge.type === 'enters') continue
      if (edge.type === 'requires_countersign' && !triggeredCountersignNodes.has(edge.target)) continue
      evidence.push({
        path: [nodeId, edge.target],
        type: edge.type,
        label: `${duty.name} —${edge.label}→ ${NODE_MAP[edge.target]?.label || edge.target}`,
        weight: edge.weight,
      })
    }
  }

  const complexity = involvedDuties.length > 1 ? 'compound' : ownerDepts.length + supportDepts.length >= 3 ? 'compound' : 'single'
  const slaMinutes = Math.min(...involvedDuties.map((duty) => duty.slaMinutes))
  const confidence = Number(
    Math.min(0.95, 0.55 + Math.min(top.score, 8) / 20 + (complexity === 'compound' ? 0.03 : 0)).toFixed(2),
  )

  return {
    matched: true,
    duties: ranked.slice(0, limit).map((entry) => ({
      id: entry.duty.id,
      name: entry.duty.name,
      score: entry.score,
      ownerDept: entry.duty.ownerDept,
      ownerDeptName: deptName(entry.duty.ownerDept),
      matchedKeywords: entry.matched,
      selected: involvedDuties.includes(entry.duty),
    })),
    primaryDuty: { id: top.duty.id, name: top.duty.name, score: top.score },
    primaryDept: involvedDuties[0].ownerDept,
    ownerDepts,
    collaboratorDepts: [...new Set([...supportDepts, ...countersignRules.map((rule) => rule.dept), ...mentionedDepts])].filter(
      (dept) => !ownerDepts.includes(dept),
    ),
    countersign: {
      required: countersignRules.length > 0 || ownerDepts.length > 1,
      departments: countersignRules.map((rule) => ({
        id: rule.dept,
        name: deptName(rule.dept),
        short: deptShort(rule.dept),
        reason: rule.reason,
        dutyId: rule.dutyId,
      })),
      rules: countersignRules.map((rule) => ({
        id: `cs:${rule.dutyId}:${rule.dept}`,
        dutyId: rule.dutyId,
        dutyName: rule.dutyName,
        dept: rule.dept,
        reason: rule.reason,
      })),
      jointOwners: ownerDepts,
    },
    dispatchPath: buildDispatchPath(involvedDuties, countersignRules, { ownerDepts, supportDepts }),
    complexity,
    complexityReason:
      involvedDuties.length > 1
        ? `识别到 ${involvedDuties.length} 项权责（${involvedDuties.map((duty) => duty.name).join('、')}），属复合工单，需按会签路径推进`
        : '单一权责事项，按主责部门直线派单',
    bottlenecks: bottleneckIds.map((id) => ({ id, ...BOTTLENECK_MAP[id], deptName: deptName(BOTTLENECK_MAP[id]?.dept) })),
    escalation: escalation.map((item) => ({ dept: item.dept, deptName: deptName(item.dept), reason: item.reason })),
    slaMinutes,
    confidence,
    evidence: evidence.slice(0, 14),
    engine: 'graph-traversal',
  }
}

/** 按权责事项 id 取子图（供 /api/ai/graph/duty/:id 与前端详情页使用） */
export const dutySubgraph = (dutyId) => {
  const duty = DUTY_MAP[dutyId]
  if (!duty) return null
  const nodeId = `duty:${dutyId}`
  return {
    duty: { id: duty.id, name: duty.name, ownerDept: duty.ownerDept, categories: duty.categories, slaMinutes: duty.slaMinutes },
    incoming: (IN_EDGES.get(nodeId) || []).map((edge) => ({ ...edge, from: NODE_MAP[edge.source] })),
    outgoing: (OUT_EDGES.get(nodeId) || []).map((edge) => ({ ...edge, to: NODE_MAP[edge.target] })),
  }
}

/** 分类 → 权责事项：给评测脚本、归因与 /api/ai/graph 用 */
export const dutiesByCategory = (category) => DUTIES.filter((duty) => (duty.categories || []).includes(category))

const matchDutyForTicket = (ticket) => {
  if (!ticket) return null
  const byCategory = dutiesByCategory(ticket.category)
  if (byCategory.length) {
    const text = `${ticket.title || ''} ${ticket.description || ''}`.toLowerCase()
    const best = byCategory
      .map((duty) => ({ duty, score: duty.keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length }))
      .sort((a, b) => b.score - a.score)[0]
    return best?.duty || byCategory[0]
  }
  const ranked = scoreDuties(`${ticket.title || ''} ${ticket.description || ''}`)
  return ranked[0]?.duty || null
}

/**
 * 诉求事件图谱 · 卡点归因：用工单历史给权责节点与卡点节点回填权重。
 * 输出可直接作为「复盘归因 Agent」的证据链，也可给驾驶舱做大屏展示。
 */
export const rankBottlenecks = (tickets = [], { limit = 5, now = Date.now() } = {}) => {
  const stats = new Map()
  for (const ticket of tickets) {
    const duty = matchDutyForTicket(ticket)
    if (!duty) continue
    const entry = stats.get(duty.id) || {
      dutyId: duty.id,
      dutyName: duty.name,
      deptId: duty.ownerDept,
      deptName: deptName(duty.ownerDept),
      total: 0,
      overdue: 0,
      highRisk: 0,
      handleHours: [],
      bottleneckIds: duty.bottlenecks || [],
      evidence: [],
    }
    entry.total += 1
    if (ticket.risk === 'high') entry.highRisk += 1
    const doneAt = ticket.status === 'completed' ? new Date(ticket.updatedAt || ticket.createdAt).getTime() : now
    const created = new Date(ticket.createdAt).getTime()
    if (ticket.dueAt && doneAt > new Date(ticket.dueAt).getTime()) entry.overdue += 1
    if (Number.isFinite(created)) entry.handleHours.push((doneAt - created) / 3600000)
    if (entry.evidence.length < 3) entry.evidence.push(ticket.id)
    stats.set(duty.id, entry)
  }

  const maxTotal = Math.max(1, ...[...stats.values()].map((entry) => entry.total))
  return [...stats.values()]
    .map((entry) => {
      const overdueRate = entry.total ? entry.overdue / entry.total : 0
      const avgHandleHours = entry.handleHours.length
        ? Number((entry.handleHours.reduce((sum, item) => sum + item, 0) / entry.handleHours.length).toFixed(1))
        : 0
      const volumeWeight = entry.total / maxTotal
      // 小样本收缩（贝叶斯平滑）：单量只有 1 时 100% 超时率统计意义弱，
      // 用 (超时 + 0.5) / (单量 + 2) 把极小样本的比率往 0.5 附近拉，避免「1 单霸榜」。
      const smoothedOverdueRate = (entry.overdue + 0.5) / (entry.total + 2)
      const score = Number(
        (smoothedOverdueRate * 0.5 + volumeWeight * 0.3 + (entry.highRisk / Math.max(1, entry.total)) * 0.2).toFixed(3),
      )
      const bottleneck = entry.bottleneckIds.length ? BOTTLENECK_MAP[entry.bottleneckIds[0]] : null
      return {
        dutyId: entry.dutyId,
        dutyName: entry.dutyName,
        deptId: entry.deptId,
        deptName: entry.deptName,
        total: entry.total,
        overdue: entry.overdue,
        overdueRate: Number(overdueRate.toFixed(2)),
        smoothedOverdueRate: Number(smoothedOverdueRate.toFixed(3)),
        sampleAdequate: entry.total >= 2,
        highRisk: entry.highRisk,
        avgHandleHours,
        score,
        bottleneck: bottleneck ? { id: bottleneck.id, name: bottleneck.name, hint: bottleneck.hint } : null,
        suggestion: bottleneck ? bottleneck.suggestion : '建议复核该权责事项的时限与人员配置',
        evidence: entry.evidence,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** 归因结论：一句话结论 + 建议，供答辩 90~120s 环节直接朗读 */
export const attributionSummary = (tickets = []) => {
  const ranked = rankBottlenecks(tickets, { limit: 3 })
  if (!ranked.length) return { headline: '暂无可归因的工单数据', top: [], suggestion: '' }
  const top = ranked[0]
  const sampleNote = top.sampleAdequate ? '' : `（当前仅 ${top.total} 单，样本量偏小，结论供参考）`
  const headline = `${top.dutyName}是当前最集中的流程卡点：${top.total} 单中有 ${top.overdue} 单超时（超时率 ${Math.round(top.overdueRate * 100)}%）${
    top.bottleneck ? `，主要卡在「${top.bottleneck.name}」` : ''
  }${sampleNote}`
  return {
    headline,
    top: ranked,
    suggestion: top.suggestion,
    sampleNote,
    evidenceTicketIds: top.evidence,
  }
}

export const dutyIds = () => DUTIES.map((duty) => duty.id)
export const bottleneckList = () => BOTTLENECKS.map((item) => ({ ...item, deptName: deptName(item.dept) }))
