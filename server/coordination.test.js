import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRequest, precheckRequest, searchKnowledge } from './ai.js'
import { refineAnalysis } from './llm.js'
import { kbConfig, searchKnowledgeDetailed } from './ai/knowledge.js'

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

test('高风险不能被学生选择的较急等级下调', () => {
  const result = analyzeRequest({ text: '宿舍插座漏电并且有人触电', urgency: 'high' })
  assert.equal(result.risk, 'high')
  assert.equal(result.urgency, 'urgent')
})

test('模型返回未知等级时保留规则结果', async () => {
  const key = process.env.DEEPSEEK_API_KEY
  const originalFetch = globalThis.fetch
  process.env.DEEPSEEK_API_KEY = 'test-only'
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ risk: 'unknown', urgency: 'invalid' }) } }] }) })
  try {
    const base = analyzeRequest({ text: '宿舍插座漏电' })
    const result = await refineAnalysis('宿舍插座漏电', base)
    assert.equal(result.risk, base.risk)
    assert.equal(result.urgency, base.urgency)
  } finally {
    globalThis.fetch = originalFetch
    if (key === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = key
  }
})

test('知识库仅对足够明确且低风险的查询建议自助', () => {
  assert.equal(precheckRequest({ text: '宿舍' }).canSelfSolve, false)
  assert.equal(precheckRequest({ text: '校园卡丢了，补办需要带什么材料？' }).canSelfSolve, true)
  assert.equal(precheckRequest({ text: '校园卡丢了，宿舍漏电了怎么办？' }).canSelfSolve, false)
  assert.equal(precheckRequest({ text: '宿舍漏水和校园卡丢了怎么处理' }).canSelfSolve, false)
  assert.equal(precheckRequest({ text: '卡住' }).canSelfSolve, false)
  assert.equal(searchKnowledge('校园卡补办')?.id, searchKnowledgeDetailed('校园卡补办').item?.id)
})

test('异常输入和无效检索阈值不会导致不安全的判断', () => {
  assert.equal(analyzeRequest({ text: null }).risk, 'low')
  assert.equal(analyzeRequest({ text: 123 }).category, '其他')
  const ratio = process.env.KB_AMBIGUITY_RATIO
  const min = process.env.KB_MIN_SCORE
  const confident = process.env.KB_CONFIDENT_SCORE
  try {
    process.env.KB_AMBIGUITY_RATIO = '2'
    process.env.KB_MIN_SCORE = '6'
    process.env.KB_CONFIDENT_SCORE = '3'
    assert.ok(kbConfig().ambiguityRatio <= 1)
    assert.ok(kbConfig().confidentScore >= kbConfig().minScore)
  } finally {
    for (const [name, value] of [['KB_AMBIGUITY_RATIO', ratio], ['KB_MIN_SCORE', min], ['KB_CONFIDENT_SCORE', confident]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
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
