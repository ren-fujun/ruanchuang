import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importKnowledgeSources } from './b/knowledge-source-import.js'

test('team source files become traceable knowledge entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixing-kb-'))
  try {
    fs.writeFileSync(path.join(dir, 'policy.md'), '可凭学生证办理。', 'utf8')
    const [item] = importKnowledgeSources({ sourceDir: dir, catalog: [{ id: 'policy-demo', title: '示例办法', file: 'policy.md', source: 'https://example.edu.cn/policy', department: '测试部门', keywords: ['示例办理'], validUntil: '2099-01-01' }] })
    assert.equal(item.answer, '可凭学生证办理。')
    assert.equal(item.sourceExcerpt, item.answer)
    assert.deepEqual(item.keywords, ['示例办理'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('source import refuses traversal and unverifiable sources', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixing-kb-'))
  try {
    const base = { id: 'policy-demo', title: '示例办法', file: '../secret.txt', source: 'https://example.edu.cn/policy', department: '测试部门', keywords: ['示例办理'], validUntil: '2099-01-01' }
    assert.throws(() => importKnowledgeSources({ sourceDir: dir, catalog: [base] }))
    assert.throws(() => importKnowledgeSources({ sourceDir: dir, catalog: [{ ...base, file: 'missing.md', source: 'http://example.edu.cn/policy' }] }))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
