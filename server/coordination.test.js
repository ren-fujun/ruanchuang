import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRequest } from './ai.js'
import { refineAnalysis } from './llm.js'

test('图书馆设施问题建议相关部门并给出可核对的依据', () => {
  const result = analyzeRequest({ text: '图书馆空调一直不工作，很多同学受到影响', location: '图书馆二楼' })
  assert.ok(result.suggestedDepartments.includes('library'))
  assert.ok(result.suggestedDepartments.includes('logistics'))
  assert.match(result.coordinationReason, /图书馆/)
  assert.match(result.coordinationReason, /空调/)
  assert.ok(result.missingInfo.includes('发生时间或持续时长'))
  assert.ok(!result.missingInfo.includes('具体地点（如适用）'))
  assert.doesNotMatch(result.draft, /已联系/)
})

test('缺少信息和高风险信号保留人工复核', () => {
  const result = analyzeRequest({ text: '宿舍今天发现漏电，情况紧急' })
  assert.equal(result.risk, 'high')
  assert.ok(result.suggestedDepartments.includes('security'))
  assert.ok(result.missingInfo.includes('具体地点（如适用）'))
  assert.ok(!result.missingInfo.includes('发生时间或持续时长'))
})

test('未配置模型时规则依据与建议保持一致', async () => {
  const key = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  try {
    const base = analyzeRequest({ text: '图书馆空调坏了' })
    assert.deepEqual(await refineAnalysis('图书馆空调坏了', base), base)
  } finally {
    if (key !== undefined) process.env.DEEPSEEK_API_KEY = key
  }
})
