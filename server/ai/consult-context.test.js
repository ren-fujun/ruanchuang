import test from 'node:test'
import assert from 'node:assert/strict'
import { consultationContext, contextSummary, contextAdvice } from './consult-context.js'
import { createConsultService } from './consult.js'

test('facts require verbatim sources and turn provenance', () => {
  const context = consultationContext({ turns: [] }, '我的综测分数有误', { facts: [
    { quote: '综测分数有误', sourceTurn: 1 }, { quote: '已获得审批', sourceTurn: 1 }, { quote: '我的综测', sourceTurn: 9 }
  ] })
  assert.equal(context.facts.length, 2)
  assert.ok(context.facts.every(f => f.sourceTurn === 1))
  assert.doesNotMatch(contextSummary(context), /审批/)
})
test('correction removes replaced statements and updates duration from unified rules', () => {
  const session = { turns: [{ text: '我想找老师签字' }], context: { facts: [{ text: '我想找老师签字', sourceTurn: 1 }] } }
  const context = consultationContext(session, '不是签字，是学业面谈', { facts: [{ quote: '签字', sourceTurn: 1 }] })
  assert.deepEqual(context.facts.map(f => f.sourceTurn), [2])
  assert.equal(contextAdvice(context).minutes, 20)
})
test('validated steps and materials share citations; fake items cannot leak into draft', async () => {
  const db = {}, citation = { id: 'p', excerpt: '复核应准备成绩单，提交申请。', source: 'https://example.org/p', title: '合成政策' }
  const service = createConsultService({ db, save() {}, retrieve: async () => ({ citations: [citation], engine: 'hybrid' }),
    generate: async ({ prompt }) => ({ ok: true, data: prompt.id.endsWith('understand') ? { topic: '综测复核' } : {
      insufficient: false, claims: [{ text: '准备成绩单。', kind: 'material', citationIds: ['p'] }, { text: '提交申请。', kind: 'step', citationIds: ['p'] }], materials: ['伪造收费凭证'] } }) })
  const result = await service.consult({ id: 's' }, { text: '综测复核怎么做' })
  assert.equal(result.nextSteps[0].text, '提交申请。')
  assert.equal(result.actionDraft.materials[0].text, '准备成绩单。')
  assert.doesNotMatch(JSON.stringify(result.actionDraft), /收费/)
  const snapshot = JSON.stringify(result.context)
  await service.consult({ id: 's' }, { text: '现在想改问签字', sessionId: result.sessionId })
  assert.equal(JSON.stringify(result.context), snapshot)
})
test('vague consultation asks one useful question; student can still enter an editable appointment', async () => {
  let retrieved = false
  const service = createConsultService({ db: {}, save() {}, retrieve: async () => { retrieved = true; return { citations: [] } }, generate: async () => ({ ok: true, data: {} }) })
  const result = await service.consult({ id: 's', college: '计算机学院', grade: '2023级' }, { text: '我想问综测' })
  assert.equal(retrieved, false)
  assert.equal(result.clarification.match(/？/g).length, 1)
  assert.doesNotMatch(result.clarification, /哪个学院|几年级/)
  assert.ok(result.actionDraft)
})
test('declared college or grade conflict stops retrieval without changing account scope', async () => {
  const service = createConsultService({ db: {}, save() {}, retrieve: async () => { throw new Error('must not retrieve') }, generate: async () => ({ ok: true, data: {} }) })
  for (const text of ['我是软件学院的，综测复核怎么办', '我是2024级，综测复核怎么办']) {
    const result = await service.consult({ id: 's', college: '计算机学院', grade: '2023级' }, { text })
    assert.match(result.clarification, /不一致/)
    assert.equal(result.telemetry.retrieval, undefined)
    assert.equal(result.scope.college, '计算机学院')
  }
})
test('later model output cannot resurrect statements replaced by an earlier correction', () => {
  const session = { turns: [{ text: '找老师签字' }], context: { facts: [{ text: '找老师签字', sourceTurn: 1 }] } }
  const corrected = consultationContext(session, '改成学业面谈')
  session.turns.push({ text: '改成学业面谈' }); session.context = corrected
  const next = consultationContext(session, '想聊学习计划', { facts: [{ quote: '找老师签字', sourceTurn: 1 }] })
  assert.equal(next.activeSinceTurn, 2)
  assert.doesNotMatch(contextSummary(next), /签字/)
  assert.equal(contextAdvice(next).minutes, 20)
})
test('summary avoids repeating extracted fragments beside their complete source statement', () => {
  const context = consultationContext({ turns: [] }, '综测分数有误，想了解复核', { facts: [{ quote: '综测分数有误', sourceTurn: 1 }] })
  assert.equal(contextSummary(context), '综测分数有误，想了解复核')
})
test('model history excludes replaced rounds on subsequent followups', async () => {
  const inputs = []
  const service = createConsultService({ db: {}, save() {}, retrieve: async () => ({ citations: [] }), generate: async ({ payload }) => { inputs.push(payload); return { ok: true, data: {} } } })
  const user = { id: 's' }
  const first = await service.consult(user, { text: '找老师签字' })
  await service.consult(user, { text: '改成学业面谈', sessionId: first.sessionId })
  await service.consult(user, { text: '想聊学习计划', sessionId: first.sessionId })
  assert.deepEqual(inputs[2].history.map(t => t.turn), [2])
  assert.doesNotMatch(JSON.stringify(inputs[2].context), /签字/)
})
