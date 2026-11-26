import test from 'node:test'
import assert from 'node:assert/strict'
import { answerFromReviewedKnowledge } from './b/knowledge-answer.js'

test('model enhancement only runs when enabled and safely falls back', async () => {
  const original = process.env.STUDENT_KNOWLEDGE_LLM
  const entry = { answer: '请联系测试教务部门。', sourceExcerpt: '请联系测试教务部门。' }
  try {
    delete process.env.STUDENT_KNOWLEDGE_LLM
    assert.equal((await answerFromReviewedKnowledge('怎么办', entry, () => { throw Error('unexpected') })).engine, 'reviewed-entry')
    process.env.STUDENT_KNOWLEDGE_LLM = 'true'
    assert.equal((await answerFromReviewedKnowledge('怎么办', entry, async () => ({ ok: true, data: { answer: '请联系测试教务部门。' } }))).engine, 'model-assisted')
    assert.equal((await answerFromReviewedKnowledge('怎么办', entry, async () => ({ ok: true, data: { answer: '保证立即办理' } }))).answer, entry.answer)
    assert.equal((await answerFromReviewedKnowledge('怎么办', entry, async () => { throw Error('offline') })).answer, entry.answer)
  } finally {
    if (original === undefined) delete process.env.STUDENT_KNOWLEDGE_LLM
    else process.env.STUDENT_KNOWLEDGE_LLM = original
  }
})
