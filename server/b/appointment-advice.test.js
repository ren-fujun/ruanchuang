import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appointmentAdvice, ruleAppointmentAdvice } from './appointment-advice.js'

test('试行规则提供可编辑时长，未知事项不猜测', () => {
  assert.equal(ruleAppointmentAdvice('我就找老师签个字').minutes, 5)
  assert.equal(ruleAppointmentAdvice('想聊聊学业').minutes, 20)
  assert.equal(ruleAppointmentAdvice('我想找老师').minutes, null)
})
test('模型结果只接受允许的类型和时长，出错回退', async () => {
  const prior = process.env.APPOINTMENT_ADVICE_LLM
  process.env.APPOINTMENT_ADVICE_LLM = 'true'
  try {
    const good = await appointmentAdvice('请签字', async () => ({ ok: true, data: { category: 'signature', minutes: 5 } }))
    assert.equal(good.engine, 'model')
    const invalid = await appointmentAdvice('请签字', async () => ({ ok: true, data: { category: 'signature', minutes: 999 } }))
    assert.equal(invalid.minutes, 5)
    assert.equal(invalid.engine, 'rule')
    const failed = await appointmentAdvice('其他', async () => { throw new Error('timeout') })
    assert.equal(failed.minutes, null)
  } finally {
    if (prior === undefined) delete process.env.APPOINTMENT_ADVICE_LLM
    else process.env.APPOINTMENT_ADVICE_LLM = prior
  }
})
