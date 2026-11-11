/**
 * B 部分 · GraphRAG 检索匹配演示（交付标准：GraphRAG 检索匹配演示样例）
 *
 * 用法（仓库根目录）：
 *   node scripts/ai/demo-graphrag.mjs            打印检索样例，并导出 JSON 供 C 大屏 / 答辩材料使用
 *   node scripts/ai/demo-graphrag.mjs --quiet    只导出 JSON，不打印
 *
 * 演示内容：
 *   1. 权责—流程图谱总览（节点 / 边 / 权责事项 / 会签规则 / 卡点 / 阶段）
 *   2. 8 条「诉求原文 → 子图检索」样例：命中权责、主责与协同部门、会签规则、复合工单判定、
 *      派单路径、SLA、置信度、多跳证据链
 *   3. 单条权责子图（duty → dept / countersign / bottleneck 双向边）
 *   4. 诉求事件图谱：用历史工单给权责节点回填权重，输出卡点排序与一句话归因结论
 *
 * 产物：scripts/ai/out/graphrag-demo.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  attributionSummary,
  dutySubgraph,
  dutiesByCategory,
  graphSummary,
  graphVisualization,
  queryGraph,
  rankBottlenecks,
} from '../../server/ai/graphrag.js'
import { departmentMap } from '../../server/seed.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'out')
const quiet = process.argv.includes('--quiet')

const line = (char = '─', width = 92) => char.repeat(width)
const deptName = (id) => departmentMap[id]?.name || id
const short = (id) => departmentMap[id]?.short || id

/** 检索演示样例：既覆盖单选派，也覆盖复合工单与会签触发 */
const CASES = [
  {
    id: 'G-01',
    desc: '宿舍漏水 + 用电隐患（单诉求触发两项权责 → 复合工单 + 保卫处会签）',
    text: '宿舍卫生间水龙头漏水，已经漏到柜子里，插排附近也渗水，怕漏电',
    options: { category: '宿舍生活', preferredDepts: ['dorm'], riskLevel: 'high' },
  },
  {
    id: 'G-02',
    desc: '消防通道占用 + 飞线充电（安全类会签宿管中心）',
    text: '宿舍楼消防通道被电动车占用，还有飞线充电，万一着火跑不出去',
    options: { category: '安全保卫', preferredDepts: ['security'], riskLevel: 'high' },
  },
  {
    id: 'G-03',
    desc: '心理危机表达（心理中心主责 + 学院会签，SLA 收紧）',
    text: '我最近压力很大，撑不住了，觉得活着没意思，不想回寝室',
    options: { category: '心理支持', preferredDepts: ['psych'], riskLevel: 'high' },
  },
  {
    id: 'G-04',
    desc: '食堂吃出异物并腹泻（食品安全会签保卫处 + 校医院）',
    text: '今天中午在食堂吃出虫子，之后一直腹泻，肚子很痛',
    options: { category: '餐饮服务', preferredDepts: ['canteen'], riskLevel: 'high' },
  },
  {
    id: 'G-05',
    desc: '电梯困人（特种设备安全，会签保卫处）',
    text: '图书馆电梯突然卡住，有人被困在里面了，很危险',
    options: { category: '安全保卫', preferredDepts: ['logistics', 'security'], riskLevel: 'high' },
  },
  {
    id: 'G-06',
    desc: '校园卡丢失（单一权责事项 → 直线派单，可自助办理）',
    text: '校园卡丢了，应该怎么补办？',
    options: { category: '校园卡服务', preferredDepts: [], riskLevel: 'low' },
  },
  {
    id: 'G-07',
    desc: '宿舍校园网掉线（信息中心主责，低风险直线派单）',
    text: '宿舍校园网一直掉线，认证页面打不开，网课都上不了',
    options: { category: '网络信息', preferredDepts: ['it'], riskLevel: 'low' },
  },
  {
    id: 'G-08',
    desc: '表述模糊（图谱未命中明确权责 → 人工确认归属，不硬派单）',
    text: '就是有点问题，你们看着办吧',
    options: { category: '其他', preferredDepts: [], riskLevel: 'low' },
  },
]

/** 事件图谱演示数据：模拟「同一权责事项反复超时」的工单沉淀 */
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString()
const daysAgo = (days) => hoursAgo(days * 24)

const SAMPLE_TICKETS = [
  { id: 'T-1001', title: '宿舍水龙头漏水', description: '卫生间漏水到柜子', category: '宿舍生活', risk: 'high', status: 'completed', createdAt: daysAgo(6), updatedAt: daysAgo(6), dueAt: hoursAgo(6 * 24 - 4) },
  { id: 'T-1002', title: '宿舍空调不制冷', description: '报修后无人上门', category: '宿舍生活', risk: 'medium', status: 'completed', createdAt: daysAgo(5), updatedAt: daysAgo(2), dueAt: daysAgo(4) },
  { id: 'T-1003', title: '宿舍热水器故障', description: '三天没有热水', category: '宿舍生活', risk: 'medium', status: 'completed', createdAt: daysAgo(4), updatedAt: daysAgo(1), dueAt: daysAgo(3) },
  { id: 'T-1004', title: '宿舍楼走廊灯不亮', description: '夜间通行不安全', category: '宿舍生活', risk: 'low', status: 'processing', createdAt: daysAgo(2), updatedAt: daysAgo(1), dueAt: hoursAgo(20) },
  { id: 'T-1005', title: '食堂菜品有异物', description: '吃出头发', category: '餐饮服务', risk: 'high', status: 'completed', createdAt: daysAgo(7), updatedAt: daysAgo(6), dueAt: daysAgo(6) },
  { id: 'T-1006', title: '食堂窗口排队过长', description: '希望增加窗口', category: '餐饮服务', risk: 'low', status: 'completed', createdAt: daysAgo(3), updatedAt: daysAgo(3), dueAt: daysAgo(2) },
  { id: 'T-1007', title: '校园网频繁掉线', description: '认证页面打不开', category: '网络信息', risk: 'low', status: 'completed', createdAt: daysAgo(2), updatedAt: hoursAgo(6), dueAt: hoursAgo(30) },
  { id: 'T-1008', title: '校园网速度慢', description: '下载很慢', category: '网络信息', risk: 'low', status: 'completed', createdAt: daysAgo(1), updatedAt: hoursAgo(8), dueAt: hoursAgo(2) },
]

const report = {
  generatedAt: new Date().toISOString(),
  engine: 'graph-traversal',
  overview: graphSummary(),
  cases: [],
  dutySubgraph: null,
  eventGraph: null,
}

if (!quiet) {
  const summary = report.overview
  console.log(line('='))
  console.log('GraphRAG · 权责流程知识图谱检索演示（B 部分）')
  console.log(line('='))
  console.log(
    `图谱规模：${summary.stats.nodes} 节点 / ${summary.stats.edges} 条加权边｜权责事项 ${summary.stats.duties} 项｜` +
      `部门 ${summary.stats.departments} 个｜会签规则 ${summary.stats.countersignRules} 条｜卡点 ${summary.stats.bottlenecks} 个｜阶段 ${summary.stats.stages} 个`,
  )
  console.log(`关系类型：${summary.edgeTypes.join('、')}`)
  console.log('')
}

for (const item of CASES) {
  const graph = queryGraph(item.text, item.options)
  report.cases.push({
    id: item.id,
    desc: item.desc,
    text: item.text,
    options: item.options,
    result: {
      matched: graph.matched,
      primaryDuty: graph.primaryDuty,
      primaryDept: graph.primaryDept,
      ownerDepts: graph.ownerDepts || [],
      collaboratorDepts: graph.collaboratorDepts || [],
      countersign: graph.countersign,
      complexity: graph.complexity,
      complexityReason: graph.complexityReason,
      dispatchPath: graph.dispatchPath,
      bottlenecks: graph.bottlenecks,
      escalation: graph.escalation,
      slaMinutes: graph.slaMinutes,
      confidence: graph.confidence,
      duties: graph.duties,
      evidence: graph.evidence,
    },
  })

  if (quiet) continue
  console.log(line())
  console.log(`[${item.id}] ${item.desc}`)
  console.log(`诉求原文：${item.text}`)
  if (!graph.matched) {
    console.log(`  ✗ 图谱未命中：${graph.complexityReason}（置信度 ${graph.confidence}）`)
    console.log('')
    continue
  }
  console.log(
    `  命中权责：${graph.duties
      .map((duty) => `${duty.name}(${duty.score}${duty.selected ? '·入选' : ''})`)
      .join('；')}`,
  )
  console.log(`  主责部门：${deptName(graph.primaryDept)}${graph.ownerDepts.length > 1 ? `（联合主办：${graph.ownerDepts.map(short).join(' + ')}）` : ''}`)
  console.log(`  协同部门：${graph.collaboratorDepts.map(short).join('、') || '无'}`)
  console.log(
    `  会签判定：${graph.countersign.required ? graph.countersign.departments.map((dept) => `${dept.short}（${dept.reason}）`).join('；') : '无需会签'}`,
  )
  console.log(`  工单复杂度：${graph.complexity === 'compound' ? '复合工单' : '单一事项'} — ${graph.complexityReason}`)
  console.log(`  SLA / 置信度：${graph.slaMinutes} 分钟 / ${graph.confidence}`)
  console.log('  派单路径：')
  for (const step of graph.dispatchPath) {
    console.log(`    ${step.order}. [${step.stage}] ${step.actor} → ${step.action}（${step.slaMinutes} 分钟）`)
  }
  if (graph.bottlenecks.length) console.log(`  已知卡点：${graph.bottlenecks.map((item2) => `${item2.name}（${item2.hint}）`).join('；')}`)
  if (graph.evidence.length) {
    console.log('  多跳证据链（节选）：')
    for (const edge of graph.evidence.slice(0, 4)) console.log(`    · ${edge.label}（权重 ${edge.weight}）`)
  }
  console.log('')
}

// ── 单条权责子图 ───────────────────────────────────────────
const sampleDuty = dutiesByCategory('宿舍生活')[0]
if (sampleDuty) {
  const sub = dutySubgraph(sampleDuty.id)
  report.dutySubgraph = sub
  if (!quiet && sub) {
    console.log(line('='))
    console.log(`权责子图示例：${sub.duty.name}（${deptName(sub.duty.ownerDept)} · SLA ${sub.duty.slaMinutes} 分钟）`)
    console.log(line('='))
    for (const edge of sub.incoming) console.log(`  ← ${edge.from?.label || edge.source} —${edge.label}→ ${sub.duty.name}`)
    for (const edge of sub.outgoing) console.log(`  → ${sub.duty.name} —${edge.label}→ ${edge.to?.label || edge.target}`)
    console.log('')
  }
}

// ── 诉求事件图谱：卡点归因 ─────────────────────────────────
const ranked = rankBottlenecks(SAMPLE_TICKETS, { limit: 4 })
const summary = attributionSummary(SAMPLE_TICKETS)
report.eventGraph = { ranked, summary, sampleTicketIds: SAMPLE_TICKETS.map((ticket) => ticket.id) }

if (!quiet) {
  console.log(line('='))
  console.log('诉求事件图谱 · 卡点归因（用历史工单给权责节点回填权重）')
  console.log(line('='))
  console.log('权责事项'.padEnd(24) + '部门'.padEnd(14) + '单量  超时  超时率  高风险  均耗时(h)  卡点权重')
  for (const item of ranked) {
    console.log(
      item.dutyName.padEnd(22) +
        deptName(item.deptId).padEnd(12) +
        String(item.total).padStart(4) +
        String(item.overdue).padStart(6) +
        `${Math.round(item.overdueRate * 100)}%`.padStart(8) +
        String(item.highRisk).padStart(8) +
        String(item.avgHandleHours).padStart(11) +
        String(item.score).padStart(11),
    )
  }
  console.log('')
  console.log(`一句话归因：${summary.headline}`)
  console.log(`改进建议：${summary.suggestion}`)
  console.log(`证据工单：${summary.evidenceTicketIds.join('、')}`)
  console.log('')
}

const visualization = graphVisualization()
report.visualization = { nodeCount: visualization.nodes.length, edgeCount: visualization.edges.length }

fs.mkdirSync(OUT_DIR, { recursive: true })
const outFile = path.join(OUT_DIR, 'graphrag-demo.json')
fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (!quiet) {
  console.log(line('='))
  console.log(`演示样例已导出：${path.relative(process.cwd(), outFile)}`)
  console.log(line('='))
}
