import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chunkText, permitted, loadCorpus, fuse, lexicalSearch, importCorpus, retrieve, embed } from './index.js'
const scope = { school: '测试大学', college: '测试学院', grade: '2023级' }
test('chunks retain text including last fragment with bounded size', () => {
  const text = '综测申请材料及复核流程。'.repeat(180)
  const chunks = chunkText(text)
  assert.ok(chunks.length > 1); assert.ok(chunks.every(c => c.length <= 651)); assert.ok(chunks.at(-1).endsWith('流程。'))
})
test('scope and validity are enforced before retrieval', () => {
  const c = { scope: { school: '测试大学', college: '测试学院', grades: ['2023'] } }
  assert.equal(permitted(c, scope), true)
  assert.equal(permitted(c, { ...scope, college: '其他学院' }), false)
  assert.equal(permitted(c, { ...scope, grade: '' }), false)
  assert.equal(permitted({ ...c, effectiveUntil: '2020-01-01' }, scope), false)
})
test('rank fusion and lexical retrieval use actual matching candidates', () => {
  assert.deepEqual(fuse([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]), ['b', 'a', 'c'])
  assert.equal(lexicalSearch('综测复核', [{ id: 'a', title: '综测', excerpt: '提交复核材料' }, { id: 'b', title: '就业', excerpt: '软件开发' }])[0].id, 'a')
})
test('review is required; duplicate text deduplicates; traversal rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-unit-'))
  try {
    fs.writeFileSync(path.join(dir, 'policy.md'), '综测申请材料及复核流程。'.repeat(20))
    const doc = { id: 'a', title: '合成测试', file: 'policy.md', reviewed: true, reviewedAt: '2026-11-27', source: 'https://example.org', scope, kind: 'policy' }
    assert.equal(loadCorpus([{ ...doc, reviewed: false }], dir).length, 0)
    assert.equal(loadCorpus([doc, { ...doc, id: 'b' }], dir).length, 1)
    assert.throws(() => loadCorpus([{ ...doc, file: '../secret.md' }], dir), /Invalid source/)
  } finally { fs.rmSync(dir, { recursive: true }) }
})
test('import reuses embeddings, failure preserves index, queries filter IDs, unavailable vectors degrade', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-pipeline-')), previous = process.env.RAG_DATA_DIR
  process.env.RAG_DATA_DIR = dir
  try {
    fs.writeFileSync(path.join(dir, 'policy.md'), '综测申请材料及复核流程。'.repeat(20))
    const manifest = [{ id: 'a', title: '合成测试', file: 'policy.md', reviewed: true, reviewedAt: '2026-11-27', source: 'https://example.org', scope, kind: 'policy' }]
    let calls = 0, requestedFilter = null, fail = false
    const embedImpl = async texts => { calls++; return { vectors: texts.map(() => Array(1024).fill(.1)), usage: { total_tokens: 10 } } }
    const fetchImpl = async (url, init) => {
      if (fail && init.method === 'PUT') return { ok: false, status: 500 }
      if (url.includes('/points/query')) { requestedFilter = JSON.parse(init.body).filter; const snap = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'))); return { ok: true, json: async () => ({ result: { points: [{ id: snap.chunks[0].id, score: .9 }, { id: 'forbidden', score: 1 }] } }) } }
      return { ok: true, json: async () => ({ result: true }) }
    }
    const first = await importCorpus({ manifest, sourceDir: dir, embedImpl, fetchImpl })
    assert.equal(first.embedded, 1)
    const second = await importCorpus({ manifest, sourceDir: dir, embedImpl, fetchImpl }); assert.equal(second.reused, 1); assert.equal(calls, 1)
    const old = fs.readFileSync(path.join(dir, 'index.json'), 'utf8'); fail = true
    await assert.rejects(importCorpus({ manifest, sourceDir: dir, embedImpl, fetchImpl }))
    assert.equal(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'), old); fail = false
    const found = await retrieve('综测', { scope, embedImpl, fetchImpl }); assert.equal(found.engine, 'hybrid'); assert.equal(found.citations.length, 1)
    assert.equal(requestedFilter.must[0].match.any.length, 1)
    const unavailable = await retrieve('综测', { scope, embedImpl: async () => { throw new Error('offline') } }); assert.equal(unavailable.engine, 'bm25-degraded')
    assert.equal((await retrieve('综测', { scope: { ...scope, college: '其他学院' }, embedImpl, fetchImpl })).citations.length, 0)
  } finally { if (previous === undefined) delete process.env.RAG_DATA_DIR; else process.env.RAG_DATA_DIR = previous; fs.rmSync(dir, { recursive: true }) }
})
test('real embedding adapter rejects missing credentials and invalid dimensions', async () => {
  const previous = process.env.EMBEDDING_API_KEY
  try {
    delete process.env.EMBEDDING_API_KEY
    await assert.rejects(embed(['test']), /not configured/)
    process.env.EMBEDDING_API_KEY = 'synthetic-test-only'
    await assert.rejects(embed(['test'], { fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: [1] }] }) }) }), /shape/)
  } finally { if (previous === undefined) delete process.env.EMBEDDING_API_KEY; else process.env.EMBEDDING_API_KEY = previous }
})
