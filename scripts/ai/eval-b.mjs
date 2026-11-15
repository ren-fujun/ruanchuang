/**
 * B 部分 · 认知链路评测脚本（交付标准：AI 服务稳定、幻觉可控）
 *
 * 用法（仓库根目录）：
 *   node scripts/ai/eval-b.mjs            仅用本地规则跑，秒级完成
 *   node scripts/ai/eval-b.mjs --llm      若配置了 DEEPSEEK_API_KEY，则连模型一起跑
 *
 * 覆盖：分类修正、风险标签（含行为时序融合）、GraphRAG 会签判定、复合工单识别、
 *       知识库分层阈值、幻觉护栏与部门白名单。退出码非 0 表示有用例未通过。
 */
import { runCognitionChain } from '../../server/ai/agents.js'
import { guardAnswerText } from '../../server/ai/guard.js'
import { searchKnowledgeDetailed } from '../../server/ai/knowledge.js'
import { departmentMap } from '../../server/seed.js'

const useLlm = process.argv.includes('--llm')
const DEPT_IDS = Object.keys(departmentMap)

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString()

/** 行为时序样例：24 小时内 3 单、其中 2 单在夜间 */
const busyHistory = [
  { id: 'h1', createdAt: hoursAgo(20), updatedAt: hoursAgo(19), dueAt: hoursAgo(18), category: '宿舍生活', risk: 'low', status: 'completed' },
  { id: 'h2', createdAt: hoursAgo(6), updatedAt: hoursAgo(5), dueAt: hoursAgo(4), category: '宿舍生活', risk: 'medium', status: 'processing' },
  { id: 'h3', createdAt: hoursAgo(2), updatedAt: hoursAgo(2), dueAt: hoursAgo(1), category: '宿舍生活', risk: 'high', status: 'pending_review' },
]

const CASES = [
  {
    id: 'B-01',
    desc: '宿舍漏水（含用电隐患）→ 高风险 + 复合工单 + 保卫处会签',
    text: '宿舍卫生间水龙头漏水，已经漏到柜子里，插排附近也渗水，怕漏电，请尽快处理',
    location: '学生公寓 3 号楼 412',
    expect: {
      risk: 'high',
      category: '宿舍生活',
      primaryDept: 'dorm',
      compound: true,
      countersignIncludes: ['security'],
    },
  },
  {
    id: 'B-02',
    desc: '宿舍漏水 + 断电 → 双主责联合派单（后勤 + 宿管）',
    text: '宿舍漏水而且插座没电了，晚上断电，室友都没法充电',
    expect: { risk: 'medium', compound: true, ownerDeptsInclude: ['dorm', 'logistics'] },
  },
  {
    id: 'B-03',
    desc: '心理危机表达 → 高风险 + 心理中心主责 + 学院会签',
    text: '我最近压力很大，撑不住了，觉得活着没意思，不想回寝室',
    expect: { risk: 'high', category: '心理支持', riskLevel: 'high', countersignIncludes: ['office'] },
  },
  {
    id: 'B-04',
    desc: '食堂吃出异物并腹泻 → 食品安全会签保卫处 + 校医院',
    text: '今天中午在食堂吃出虫子，之后一直腹泻，肚子很痛',
    expect: { category: '餐饮服务', primaryDept: 'canteen', countersignIncludes: ['security', 'clinic'], riskLevel: 'high' },
  },
  {
    id: 'B-05',
    desc: '消防通道占用 → 风险筛查从规则低风险提升为高风险',
    text: '宿舍楼消防通道被电动车占用，还有飞线充电，万一着火跑不出去',
    expect: { risk: 'high', category: '安全保卫', countersignIncludes: ['dorm'] },
  },
  {
    id: 'B-06',
    desc: '校园卡丢失 → 知识库高置信命中，允许自助解决',
    text: '校园卡丢了，应该怎么补办？',
    expect: { risk: 'low', kbId: 'kb-card', kbTier: 'confident', canSelfSolve: true },
  },
  {
    id: 'B-07',
    desc: '奖助材料咨询 → 命中知识库但不越权承诺',
    text: '助学金材料要交到哪里，截止时间是什么时候？',
    expect: { risk: 'low', kbId: 'kb-aid' },
  },
  {
    id: 'B-08',
    desc: '只提「宿舍」两个字 → 阈值拦截，不给自助答案',
    text: '宿舍',
    expect: { tierNot: 'confident' },
  },
  {
    id: 'B-09',
    desc: '宿舍人际冲突 → 心理中心会签',
    text: '室友半夜打游戏很吵，跟他沟通还被骂，我想申请调宿',
    expect: { primaryDept: 'dorm', countersignIncludes: ['psych'], riskLevelAtLeast: 'medium' },
  },
  {
    id: 'B-10',
    desc: '电梯困人 → 特种设备安全会签保卫处',
    text: '图书馆电梯突然卡住，有人被困在里面了，很危险',
    expect: { countersignIncludes: ['security'], riskLevel: 'high' },
  },
  {
    id: 'B-11',
    desc: '挂科焦虑 + 危机表达 → 心理危机权责 + 学院会签',
    text: '挂科两门怕延毕，感觉真的撑不下去了',
    expect: { risk: 'high', riskLevel: 'high', countersignIncludes: ['office'] },
  },
  {
    id: 'B-12',
    desc: '行为时序融合：同文本 + 24h 内 3 次夜间提交 → 中风险',
    text: '宿舍空调不制冷，希望安排维修',
    history: busyHistory,
    expect: { riskLevel: 'medium' },
  },
  {
    id: 'B-13',
    desc: '同一文本无异常历史 → 低风险（对照组）',
    text: '宿舍空调不制冷，希望安排维修',
    history: [],
    expect: { riskLevel: 'low' },
  },
  {
    id: 'B-14',
    desc: '网络故障 → 信息中心主责，低风险',
    text: '宿舍校园网一直掉线，认证页面打不开，网课都上不了',
    expect: { risk: 'low', primaryDept: 'it' },
  },
  {
    id: 'B-15',
    desc: '部门白名单：全量用例的派单部门必须都存在于部门字典',
    text: '操场的路灯坏了三盏，晚上跑步看不清路',
    expect: { risk: 'low' },
  },
  {
    id: 'B-16',
    desc: '电脑卡住不触发校园卡补办指引',
    text: '电脑卡住了打不开',
    expect: { tierNot: 'confident', canSelfSolve: false },
  },
  {
    id: 'B-17',
    desc: '信用卡补办不触发校园卡补办指引',
    text: '银行信用卡丢了应该怎么补办',
    expect: { tierNot: 'confident', canSelfSolve: false },
  },
  {
    id: 'B-18',
    desc: '图书馆设施故障不触发借阅指引',
    text: '图书馆四楼空调温度太低，想反馈一下。',
    expect: { tierNot: 'confident', canSelfSolve: false },
  },
  {
    id: 'B-19',
    desc: '预约场馆不触发心理咨询预约指引',
    text: '预约体育馆的篮球场',
    expect: { tierNot: 'confident', canSelfSolve: false },
  },
  {
    id: 'B-20',
    desc: '宿舍报修语境下优先命中校园网故障指引，兼容全角 WiFi 输入',
    text: '宿舍 ＷｉＦｉ 掉线怎么报修',
    expect: { kbId: 'kb-net', kbTier: 'confident', canSelfSolve: true },
  },
  {
    id: 'B-21',
    desc: '在籍证明同义表达仍可自助查询',
    text: '我的在籍证明要在哪里开？',
    expect: { kbId: 'kb-proof', kbTier: 'confident', canSelfSolve: true },
  },
  {
    id: 'B-22',
    desc: '图书馆开放时间仍可自助查询',
    text: '图书馆几点关门？',
    expect: { kbId: 'kb-library', kbTier: 'confident', canSelfSolve: true },
  },
  {
    id: 'B-23',
    desc: '助学贷款申请材料不误用奖助学金指引',
    text: '申请助学贷款需要提交什么材料',
    expect: { tierNot: 'confident', canSelfSolve: false },
  },
]

const RISK_ORDER = { low: 0, medium: 1, high: 2 }

const results = []
for (const item of CASES) {
  const chain = await runCognitionChain({
    text: item.text,
    location: item.location,
    history: item.history || [],
    useLlm,
  })
  const fails = []
  const expect = item.expect || {}
  const graph = chain.graph || {}
  const countersignIds = (graph.countersign?.departments || []).map((dept) => dept.id)
  const ownerIds = graph.ownerDepts || []
  const collaborationIds = [...ownerIds, ...(graph.collaboratorDepts || [])]

  if (expect.risk && chain.analysis.risk !== expect.risk) fails.push(`risk 期望 ${expect.risk}，实际 ${chain.analysis.risk}`)
  if (expect.riskLevel && chain.risk.level !== expect.riskLevel) fails.push(`风险标签期望 ${expect.riskLevel}，实际 ${chain.risk.level}`)
  if (expect.riskLevelAtLeast && RISK_ORDER[chain.risk.level] < RISK_ORDER[expect.riskLevelAtLeast]) {
    fails.push(`风险标签期望不低于 ${expect.riskLevelAtLeast}，实际 ${chain.risk.level}`)
  }
  if (expect.category && chain.analysis.category !== expect.category) fails.push(`分类期望 ${expect.category}，实际 ${chain.analysis.category}`)
  if (expect.primaryDept && graph.primaryDept !== expect.primaryDept) fails.push(`主责期望 ${expect.primaryDept}，实际 ${graph.primaryDept}`)
  if (expect.compound !== undefined && (graph.complexity === 'compound') !== expect.compound) {
    fails.push(`复合判定期望 ${expect.compound}，实际 ${graph.complexity}`)
  }
  for (const dept of expect.countersignIncludes || []) {
    if (!countersignIds.includes(dept) && !ownerIds.includes(dept)) fails.push(`会签/联合主办缺少 ${dept}`)
  }
  for (const dept of expect.ownerDeptsInclude || []) {
    if (!ownerIds.includes(dept)) fails.push(`联合主办缺少 ${dept}`)
  }
  if (expect.kbId && chain.knowledge?.id !== expect.kbId) fails.push(`知识库命中期望 ${expect.kbId}，实际 ${chain.knowledge?.id || '未命中'}`)
  if (expect.kbTier && chain.knowledge?.matchTier !== expect.kbTier) fails.push(`知识库层级期望 ${expect.kbTier}，实际 ${chain.knowledge?.matchTier}`)
  if (expect.tierNot) {
    const tier = searchKnowledgeDetailed(item.text).tier
    if (tier === expect.tierNot) fails.push(`知识库层级不应为 ${expect.tierNot}`)
  }
  if (expect.canSelfSolve !== undefined && chain.canSelfSolve !== expect.canSelfSolve) {
    fails.push(`自助解决期望 ${expect.canSelfSolve}，实际 ${chain.canSelfSolve}`)
  }
  for (const dept of chain.analysis.suggestedDepartments || []) {
    if (!DEPT_IDS.includes(dept)) fails.push(`派单部门越界：${dept}`)
  }
  for (const dept of collaborationIds) {
    if (!DEPT_IDS.includes(dept)) fails.push(`图谱部门越界：${dept}`)
  }
  if (chain.risk.level === 'low' && chain.analysis.risk === 'high') fails.push('风险筛查与规则判定冲突（未按不降级原则保持）')

  results.push({
    id: item.id,
    desc: item.desc,
    pass: fails.length === 0,
    fails,
    snapshot: {
      category: chain.analysis.category,
      urgency: chain.analysis.urgency,
      risk: chain.analysis.risk,
      riskLabel: chain.risk.level,
      riskScore: chain.risk.score,
      primaryDuty: graph.primaryDuty?.name || null,
      primaryDept: graph.primaryDept || null,
      countersign: countersignIds,
      complexity: graph.complexity,
      kb: chain.knowledge ? `${chain.knowledge.id}/${chain.knowledge.matchTier}` : null,
      canSelfSolve: chain.canSelfSolve,
    },
  })
}

// 幻觉护栏单点校验（无需模型）
const guardCases = [
  {
    name: '捏造电话应被拦截',
    result: guardAnswerText({
      answer: '请拨打 0571-9999 8888 联系宿管中心。',
      sources: ['宿管中心值班电话 0571-8820 3103'],
      fallback: '请拨打 0571-8820 3103 联系宿管中心。',
    }),
    expectOk: false,
  },
  {
    name: '来源内电话应通过',
    result: guardAnswerText({
      answer: '请拨打 0571-8820 3103 联系宿管中心。',
      sources: ['宿管中心值班电话 0571-8820 3103'],
      fallback: '回退文本',
    }),
    expectOk: true,
  },
  {
    name: '过度承诺应被拦截',
    result: guardAnswerText({ answer: '我们保证 2 小时内一定修好。', sources: ['报修后 2 小时内响应'], fallback: '回退文本' }),
    expectOk: false,
  },
]
for (const item of guardCases) {
  const pass = item.result.ok === item.expectOk
  results.push({ id: 'G', desc: `护栏 · ${item.name}`, pass, fails: pass ? [] : [`期望 ok=${item.expectOk}，实际 ${item.result.ok}`], snapshot: item.result.violations })
}

const passed = results.filter((item) => item.pass).length
const failed = results.length - passed
console.log(`\n=== B 部分认知链路评测（模型：${useLlm ? '启用' : '仅规则'}）===`)
for (const item of results) {
  const mark = item.pass ? '✓' : '✗'
  console.log(`${mark} [${item.id}] ${item.desc}`)
  console.log(`    ${typeof item.snapshot === 'string' ? item.snapshot : JSON.stringify(item.snapshot)}`)
  if (!item.pass) item.fails.forEach((line) => console.log(`    ↳ ${line}`))
}
console.log(`\n通过 ${passed}/${results.length}，失败 ${failed}`)
process.exit(failed ? 1 : 0)
