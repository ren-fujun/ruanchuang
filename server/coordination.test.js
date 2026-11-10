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

test('普通宿舍报修识别类别并保留常规办理建议', () => {
  const result = analyzeRequest({ text: '宿舍热水无法使用', location: '学生公寓 3 号楼' })
  assert.equal(result.category, '宿舍生活')
  assert.equal(result.risk, 'low')
  assert.equal(result.urgency, 'normal')
  assert.ok(result.suggestedDepartments.includes('dorm'))
  assert.ok(result.suggestedDepartments.includes('logistics'))
  assert.match(result.coordinationReason, /热水/)
})

test('跨部门食品安全诉求同时建议后勤与保卫处', () => {
  const result = analyzeRequest({ text: '食堂食品安全有异味，今天多人反映', location: '一食堂' })
  assert.equal(result.category, '安全保卫')
  assert.equal(result.risk, 'medium')
  assert.ok(result.suggestedDepartments.includes('logistics'))
  assert.ok(result.suggestedDepartments.includes('security'))
  assert.ok(result.tags.includes('需重点关注'))
})

test('高风险危机表达触发优先介入及心理支持分类', () => {
  const result = analyzeRequest({ text: '我最近不想活了，已经撑不住', location: '宿舍' })
  assert.equal(result.category, '心理支持')
  assert.equal(result.risk, 'high')
  assert.equal(result.urgency, 'urgent')
  assert.ok(result.suggestedDepartments.includes('psych'))
  assert.match(result.draft, /确认你此刻是安全的/)
})

test('无匹配关键词时回退到其他类别和默认部门', () => {
  const result = analyzeRequest({ text: '请帮忙处理这件事情', location: '线上' })
  assert.equal(result.category, '其他')
  assert.equal(result.risk, 'low')
  assert.deepEqual(result.suggestedDepartments, ['office'])
  assert.ok(result.missingInfo.includes('具体地点（如适用）'))
  assert.match(result.coordinationReason, /其他/)
})
