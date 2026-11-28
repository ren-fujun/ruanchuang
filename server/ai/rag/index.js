import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { tokenize } from '../knowledge.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const dataDir = () => path.resolve(process.env.RAG_DATA_DIR || path.join(root, 'server/data/rag'))
const snapshotPath = () => path.join(dataDir(), 'index.json')
const atomicJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(data)); fs.renameSync(`${file}.tmp`, file) }
export function ragConfig() {
  return { qdrant: (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, ''),
    embeddingBase: (process.env.EMBEDDING_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, ''),
    model: process.env.EMBEDDING_MODEL || 'text-embedding-v4', dimensions: 1024 }
}
async function jsonFetch(url, init, fetchImpl = fetch) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`Service HTTP ${response.status}`)
  return response.json()
}
export async function embed(texts, { fetchImpl = fetch } = {}) {
  if (!process.env.EMBEDDING_API_KEY) throw new Error('EMBEDDING_API_KEY not configured')
  const cfg = ragConfig()
  const body = await jsonFetch(`${cfg.embeddingBase}/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}` },
    body: JSON.stringify({ model: cfg.model, input: texts, dimensions: cfg.dimensions, encoding_format: 'float' }) }, fetchImpl)
  const vectors = [...(body.data || [])].sort((a, b) => a.index - b.index).map(item => item.embedding)
  if (vectors.length !== texts.length || vectors.some(v => !Array.isArray(v) || v.length !== cfg.dimensions || v.some(n => !Number.isFinite(n)))) throw new Error('Invalid embedding shape')
  return { vectors, usage: body.usage || null, model: body.model || cfg.model }
}
async function qdrant(route, body, method = 'POST', fetchImpl = fetch) {
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.QDRANT_API_KEY) headers['api-key'] = process.env.QDRANT_API_KEY
  return jsonFetch(`${ragConfig().qdrant}${route}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, fetchImpl)
}
export function chunkText(text, size = 650, overlap = 80) {
  const clean = text.replace(/\r/g, '').replace(/\n-\s*\d+\s*-\n/g, '\n').trim()
  const chunks = []; let current = ''
  for (const para of clean.split(/\n\s*\n/).filter(Boolean)) {
    if (current && current.length + para.length > size) { chunks.push(current); current = current.slice(-overlap) }
    for (let offset = 0; offset < para.length; offset += size - overlap) {
      const part = para.slice(offset, offset + size - overlap)
      if (current.length + part.length > size) { chunks.push(current); current = current.slice(-overlap) }
      current += `${current ? '\n' : ''}${part}`
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}
export function loadCorpus(manifest, sourceDir) {
  if (!Array.isArray(manifest)) throw new Error('Manifest must be an array')
  const chunks = [], seen = new Set(), ids = new Set()
  for (const doc of manifest) {
    if (doc.reviewed !== true) continue
    if (!doc.id || ids.has(doc.id)) throw new Error('Duplicate or missing document id')
    ids.add(doc.id)
    if (!doc.reviewedAt || !Number.isFinite(Date.parse(doc.reviewedAt)) || !doc.title || !/^https:\/\//.test(doc.source || '') || !doc.scope?.school || !['policy', 'reference'].includes(doc.kind)) throw new Error(`Incomplete reviewed metadata: ${doc.id}`)
    for (const field of ['effectiveFrom', 'effectiveUntil']) if (doc[field] && !Number.isFinite(Date.parse(doc[field]))) throw new Error(`Invalid validity date: ${doc.id}`)
    const file = path.resolve(sourceDir, doc.file || '')
    if (!file.startsWith(`${path.resolve(sourceDir)}${path.sep}`) || !/\.(md|txt)$/.test(file)) throw new Error('Invalid source file')
    const text = fs.readFileSync(file, 'utf8').trim()
    if (text.length < 100 || /链接汇总只提供入口|链接入口，不代替/.test(text)) throw new Error(`Not substantive source: ${doc.id}`)
    for (const [position, excerpt] of chunkText(text).entries()) {
      const digest = hash(`${JSON.stringify(doc.scope)}:${doc.kind}:${excerpt.replace(/\s+/g, '')}`)
      if (seen.has(digest)) continue
      seen.add(digest)
      chunks.push({ id: hash(`${doc.id}:${position}:${digest}`).slice(0, 32), title: doc.title, excerpt, source: doc.source, scope: doc.scope,
        kind: doc.kind, reviewedAt: doc.reviewedAt, effectiveFrom: doc.effectiveFrom || null, effectiveUntil: doc.effectiveUntil || null,
        policyVersion: doc.policyVersion || '未标明版本', documentId: doc.id, position, digest })
    }
  }
  return chunks
}
export function permitted(c, scope, now = Date.now()) {
  if (c.effectiveFrom && Date.parse(c.effectiveFrom) > now || c.effectiveUntil && Date.parse(c.effectiveUntil) <= now) return false
  if (c.scope.school !== scope.school || c.scope.college && c.scope.college !== scope.college) return false
  if (Array.isArray(c.scope.grades) && c.scope.grades.length && !c.scope.grades.some(g => String(g).replace(/\D/g, '') === String(scope.grade || '').replace(/\D/g, ''))) return false
  return true
}
export function lexicalSearch(query, chunks, limit = 20) {
  const terms = [...new Set(tokenize(query))], tokenized = chunks.map(c => tokenize(`${c.title} ${c.excerpt}`))
  const average = tokenized.reduce((n, t) => n + t.length, 0) / (chunks.length || 1)
  return chunks.map((chunk, i) => {
    const tokens = tokenized[i]; let score = 0
    for (const term of terms) {
      const tf = tokens.filter(t => t === term).length
      const df = tokenized.filter(t => t.includes(term)).length
      if (tf) score += Math.log(1 + (chunks.length - df + .5) / (df + .5)) * tf * 2.4 / (tf + 1.4 * (.25 + .75 * tokens.length / (average || 1)))
    }
    return { id: chunk.id, score }
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
}
export function fuse(lexical, dense, limit = 6) {
  const scores = new Map()
  for (const ranking of [lexical, dense]) ranking.forEach((row, i) => scores.set(String(row.id), (scores.get(String(row.id)) || 0) + 1 / (60 + i + 1)))
  return [...scores].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
}
export async function importCorpus({ manifest, sourceDir, fetchImpl = fetch, embedImpl = embed } = {}) {
  const chunks = loadCorpus(manifest, sourceDir)
  if (!chunks.length) throw new Error('No reviewed full-text documents. Review rag-catalog.json first.')
  if (chunks.length > Number(process.env.RAG_IMPORT_MAX_CHUNKS || 500)) throw new Error('Import chunk limit exceeded')
  const cfg = ragConfig(), cacheFile = path.join(dataDir(), 'embedding-cache.json')
  let cache = {}
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch {}
  const vectors = [], usage = [], keyFor = c => hash(`${cfg.embeddingBase}:${cfg.model}:${cfg.dimensions}:${c.title}:${c.digest}`)
  const missing = chunks.filter(c => !cache[keyFor(c)])
  for (let start = 0; start < missing.length; start += 10) {
    const batch = missing.slice(start, start + 10), generated = await embedImpl(batch.map(c => `${c.title}\n${c.excerpt}`), { fetchImpl })
    batch.forEach((c, i) => cache[keyFor(c)] = generated.vectors[i]); usage.push(generated.usage)
    atomicJson(cacheFile, cache)
  }
  chunks.forEach(c => vectors.push(cache[keyFor(c)]))
  const collection = `zhixing_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
  try {
    await qdrant(`/collections/${collection}`, { vectors: { size: cfg.dimensions, distance: 'Cosine' } }, 'PUT', fetchImpl)
    for (let start = 0; start < chunks.length; start += 64) {
      await qdrant(`/collections/${collection}/points?wait=true`, { points: chunks.slice(start, start + 64).map((c, i) => ({ id: c.id, vector: vectors[start + i], payload: { chunkId: c.id } })) }, 'PUT', fetchImpl)
    }
    const snapshot = { schema: 1, collection, model: cfg.model, embeddingBase: cfg.embeddingBase, dimensions: cfg.dimensions, chunks, importedAt: new Date().toISOString(), usage }
    atomicJson(snapshotPath(), snapshot)
    return { collection, chunks: chunks.length, embedded: missing.length, reused: chunks.length - missing.length, usage, pricingStatus: 'not-calculated' }
  } catch (error) {
    await qdrant(`/collections/${collection}`, undefined, 'DELETE', fetchImpl).catch(() => {})
    throw error
  }
}
export async function retrieve(query, { scope = {}, fetchImpl = fetch, embedImpl = embed } = {}) {
  let snapshot
  try { snapshot = JSON.parse(fs.readFileSync(snapshotPath(), 'utf8')) } catch { return { citations: [], engine: 'unavailable', reason: 'index-not-imported' } }
  const candidates = snapshot.chunks.filter(c => permitted(c, scope))
  if (!candidates.length) return { citations: [], engine: 'unavailable', reason: 'no-applicable-reviewed-documents' }
  const lexical = lexicalSearch(query, candidates)
  let dense = [], engine = 'hybrid', reason = null, usage = null
  try {
    const cfg = ragConfig()
    if (cfg.model !== snapshot.model || cfg.embeddingBase !== snapshot.embeddingBase || cfg.dimensions !== snapshot.dimensions) throw new Error('Embedding configuration changed; rebuild index')
    const embedding = await embedImpl([query], { fetchImpl }); usage = embedding.usage
    const response = await qdrant(`/collections/${snapshot.collection}/points/query`, { query: embedding.vectors[0], limit: 20,
      filter: { must: [{ key: 'chunkId', match: { any: candidates.map(c => c.id) } }] } }, 'POST', fetchImpl)
    dense = response.result?.points || []
  } catch { engine = 'bm25-degraded'; reason = 'vector-service-unavailable-or-config-changed' }
  const byId = new Map(candidates.map(c => [c.id, c]))
  return { citations: fuse(lexical, dense.filter(c => byId.has(String(c.id)))).map(id => byId.get(id)), engine, reason, usage }
}
