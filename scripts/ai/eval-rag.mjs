import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cases } from './rag-cases.mjs'
import { createConsultService } from '../../server/ai/consult.js'
import { retrieve } from '../../server/ai/rag/index.js'
import { chatJson } from '../../server/ai/llmClient.js'
import os from 'node:os'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
try { process.loadEnvFile(path.join(root, '.env')) } catch {}
if (!process.argv.includes('--live')) {
  console.log(JSON.stringify({ mode: 'fixtures-only-no-model-calls', cases: cases.length, dev: 20, test: 40, humanReview: 'pending', live: 'not-run', command: 'node scripts/ai/eval-rag.mjs --live --split test --limit 40' }, null, 2))
} else {
  const snapshotFile = path.join(process.env.RAG_DATA_DIR || path.join(root, 'server/data/rag'), 'index.json')
  if (!process.env.EMBEDDING_API_KEY || !process.env.DEEPSEEK_API_KEY || !fs.existsSync(snapshotFile)) throw new Error('真实评测未运行：请先配置两种模型并完成资料入库。')
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] }
  const split = arg('--split', 'test'), limit = Math.max(1, Math.min(60, Number(arg('--limit', '40')) || 40))
  const selected = cases.filter(c => split === 'all' || c.split === split).slice(0, limit)
  const db = {}, save = () => {}, service = createConsultService({ db, save, retrieve })
  const rows = [], started = new Date().toISOString()
  for (const c of selected) {
    const keywordStarted = performance.now()
    const user = { id: `synthetic-${c.id}`, role: 'student', ...c.scope }
    // 受控消融：关键词基线使用同一批已审核正文；不是旧B接口成绩。
    const oldKey = process.env.EMBEDDING_API_KEY; delete process.env.EMBEDDING_API_KEY
    let lexical
    try { lexical = await retrieve(c.turns.at(-1), { scope: c.scope }) } finally { process.env.EMBEDDING_API_KEY = oldKey }
    const keyword = { engine: 'keyword-extract-baseline', answer: lexical.citations[0]?.excerpt || '无适用资料', citations: lexical.citations, generationUsage: null, latencyMs: Math.round(performance.now() - keywordStarted) }
    const directStarted = performance.now()
    const direct = await chatJson({ cacheable: false, prompt: { id: 'rag.eval.direct', version: 'v1', maxTokens: 1200, temperature: .1,
      build: payload => ({ system: '你是学生事务助手。回答问题，不知道时说明不知道，不编造学校政策。只输出JSON对象：{"answer":"回答"}。', user: JSON.stringify(payload) }) }, payload: { turns: c.turns, scope: c.scope } })
    const directLatencyMs = Math.round(performance.now() - directStarted), hybridStarted = performance.now()
    let hybrid
    for (const text of c.turns) hybrid = await service.consult(user, { text, sessionId: hybrid?.sessionId })
    const observed = c.expected === 'urgent_handoff' ? hybrid.action === 'urgent_handoff' : c.expected.startsWith('insufficient') ? hybrid.engine === 'insufficient-evidence' : c.expected === 'cited-policy' ? hybrid.citations.some(r => c.relevantDocuments.includes(r.documentId)) : null
    rows.push({ case: c, keyword, direct: { ok: direct.ok, answer: direct.data?.answer || null, meta: direct.meta || null, reason: direct.reason || null, latencyMs: directLatencyMs }, hybrid, hybridTaskLatencyMs: Math.round(performance.now() - hybridStarted),
      structuralExpectationMet: observed, answerCorrectness: 'needs-human-review', citationEntailment: 'needs-human-review' })
    console.log(`${c.id}: ${hybrid.engine} (人工答案核对待完成)`)
  }
  const latency = rows.map(r => r.hybrid.telemetry.latencyMs).sort((a,b) => a-b)
  const retrievalRows = rows.filter(r => r.case.relevantDocuments?.length)
  const retrievalHits = retrievalRows.filter(r => r.case.relevantDocuments.some(id => r.hybrid.telemetry.retrieval?.topFiveDocumentIds?.includes(id))).length
  const report = { started, completed: new Date().toISOString(), evidence: 'real-model-and-real-vector-services', split, cases: rows.length,
    environment: { os: `${os.type()} ${os.release()}`, architecture: os.arch(), cpuModel: os.cpus()[0]?.model, logicalCores: os.cpus().length, totalMemoryBytes: os.totalmem(), nodeVersion: process.version },
    groupLatency: Object.fromEntries(['keyword', 'direct', 'hybrid'].map(group => { const times = rows.map(r => group === 'hybrid' ? r.hybridTaskLatencyMs : r[group].latencyMs).sort((a,b) => a-b); return [group, { count: times.length, p50Ms: times[Math.ceil(times.length * .5) - 1] ?? null, p95Ms: times[Math.ceil(times.length * .95) - 1] ?? null }] })),
    timingScope: 'Each group measures full task; direct sees all turns once, hybrid executes sequential turns. Sequential groups are not a concurrency load test. Legacy summary latency is hybrid final-turn only.',
    summary: { structuralChecksPassed: rows.filter(r => r.structuralExpectationMet === true).length, structuralChecksFailed: rows.filter(r => r.structuralExpectationMet === false).length,
      humanReviewPending: rows.length, answerAccuracy: null, citationSupportRate: null,
      retrievalRecallAtFive: retrievalRows.length ? retrievalHits / retrievalRows.length : null, retrievalGroundTruthStatus: 'synthetic-proposed-needs-human-review',
      latencyP50Ms: latency[Math.ceil(latency.length * .5) - 1] || null, latencyP95Ms: latency[Math.ceil(latency.length * .95) - 1] || null },
    warning: '固定合成题；自动结构检查不能视作答案准确率。关键词组为同语料抽取基线，不是旧接口。费用价格与缓存分类须另核对，失败重试可能缺少用量。',
    modelUsage: db.aiConsultUsage || [], rows }
  const file = path.join(root, '.tmp/rag-eval', `comparison-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2)); console.log(`报告：${file}`)
}
