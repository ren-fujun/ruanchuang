import test from 'node:test'
import assert from 'node:assert/strict'
import { makeKnowledgeDrafts } from './b/knowledge-import.js'

const base = { title: '测试文件', source: '虚构资料', department: '测试部门', validUntil: '2099-01-01', text: '第一段原文\n\n第二段原文', authorId: 'test', makeId: () => crypto.randomUUID() }
test('import preserves paragraphs as unsearchable drafts with original evidence', () => {
  const items = makeKnowledgeDrafts(base)
  assert.equal(items.length, 2)
  assert.equal(items[0].sourceExcerpt, '第一段原文')
  assert.equal(items[1].answer, '第二段原文')
  assert.ok(items.every(item => item.status === 'draft' && item.keywords.length === 0 && item.authorId === 'test'))
})
test('import rejects invalid source, expired date and oversized content', () => {
  for (const invalid of [{ source: '' }, { validUntil: '2000-01-01' }, { text: 'a'.repeat(20001) }, { text: 'a'.repeat(4001) }]) {
    assert.throws(() => makeKnowledgeDrafts({ ...base, ...invalid }))
  }
})
