import test from 'node:test'
import assert from 'node:assert/strict'
import { validateOfficialKnowledge } from './b/official-knowledge.js'

const sample = { id: 'demo', title: '虚构测试资料', answer: '请咨询测试部门。', sourceExcerpt: '请咨询测试部门。', department: '测试部门', source: 'https://example.edu.cn/test', keywords: ['虚构测试'], validUntil: '2099-01-01T00:00:00Z' }
test('curated source has stable identity and original evidence', () => {
  const [item] = validateOfficialKnowledge([sample])
  assert.equal(item.id, 'official-demo')
  assert.equal(item.sourceExcerpt, sample.sourceExcerpt)
  assert.equal(item.status, 'published')
})
test('malformed records or duplicate identifiers fail rather than silently publish', () => {
  for (const records of [[{ ...sample, source: 'http://example.edu.cn' }], [{ ...sample, sourceExcerpt: '' }], [sample, sample]]) assert.throws(() => validateOfficialKnowledge(records))
})
