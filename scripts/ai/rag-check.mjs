import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ragConfig, loadCorpus, embed } from '../../server/ai/rag/index.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
try { process.loadEnvFile(path.join(root, '.env')) } catch {}
const config = ragConfig(), sourceDir = path.join(root, 'server/knowledge-source')
const catalog = JSON.parse(fs.readFileSync(process.env.RAG_CATALOG || path.join(sourceDir, 'rag-catalog.json'), 'utf8'))
const report = { generationConfigured: Boolean(process.env.DEEPSEEK_API_KEY), embeddingConfigured: Boolean(process.env.EMBEDDING_API_KEY),
  model: config.model, dimensions: config.dimensions, reviewedDocuments: catalog.filter(d => d.reviewed).length, pendingDocuments: catalog.filter(d => !d.reviewed).length,
  chunks: 0, vectorService: 'not-run', realEmbedding: 'not-run', index: fs.existsSync(path.join(process.env.RAG_DATA_DIR || path.join(root, 'server/data/rag'), 'index.json')) }
try { report.chunks = loadCorpus(catalog, sourceDir).length } catch (error) { report.corpusError = error.message }
try {
  const response = await fetch(`${config.qdrant}/collections`, { headers: process.env.QDRANT_API_KEY ? { 'api-key': process.env.QDRANT_API_KEY } : {}, signal: AbortSignal.timeout(3000) })
  report.vectorService = response.ok ? 'reachable' : `http-${response.status}`
} catch { report.vectorService = 'unreachable' }
if (process.argv.includes('--live') && report.embeddingConfigured) {
  try { const result = await embed(['校园事务咨询配置检查']); report.realEmbedding = 'passed'; report.usage = result.usage }
  catch { report.realEmbedding = 'failed-check-provider-region-key-and-network' }
}
report.ready = report.generationConfigured && report.embeddingConfigured && report.chunks > 0 && report.vectorService === 'reachable' && report.index
console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2
