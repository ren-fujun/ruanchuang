/**
 * B 部分 · 冒烟自检（不依赖模型、不依赖服务）
 * 用法：node scripts/ai/smoke-b.mjs
 */
import { runCognitionChain } from '../../server/ai/agents.js'
import { graphSummary } from '../../server/ai/graphrag.js'
import { knowledgeIndexStats } from '../../server/ai/knowledge.js'
import { riskLexiconSummary } from '../../server/ai/riskAgent.js'

const chain = await runCognitionChain({
  text: '宿舍卫生间水龙头漏水，已经漏到柜子里，插排附近也渗水，怕漏电',
  location: '学生公寓 3 号楼 412',
  useLlm: false,
})

console.log('图谱：', JSON.stringify(graphSummary().stats))
console.log('知识库：', JSON.stringify(knowledgeIndexStats()))
console.log('风险词典：', JSON.stringify(riskLexiconSummary()))
console.log('分类/风险/紧急：', chain.analysis.category, chain.analysis.risk, chain.analysis.urgency)
console.log('图谱主责：', chain.graph.primaryDept, chain.graph.primaryDuty?.name, chain.graph.complexity)
console.log('会签：', chain.graph.countersign.departments.map((item) => item.short).join('、') || '无')
console.log('风险标签：', chain.risk.level, chain.risk.score, chain.risk.signals.map((item) => item.label).slice(0, 3))
console.log('派单路径：', chain.graph.dispatchPath.map((item) => `${item.stage}·${item.actor}`).join(' → '))
console.log('trace：', chain.trace.map((item) => `${item.agent}(${item.ms}ms)`).join(' '))
