import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appointmentAdvice, ruleAppointmentAdvice } from './appointment-advice.js'

test('试行规则提供可编辑时长，未知事项不猜测', () => {
  assert.equal(ruleAppointmentAdvice('我就找老师签个字').minutes, 5)
  assert.equal(ruleAppointmentAdvice('想聊聊学业').minutes, 20)
  assert.equal(ruleAppointmentAdvice('我想找老师').minutes, null)
})
test('纠正、口语和多事项采用当前意图或人工选择', () => {
  assert.equal(ruleAppointmentAdvice('我不是要签字，是学业面谈').minutes, 20)
  assert.equal(ruleAppointmentAdvice('老师签个名就行').minutes, 5)
  assert.equal(ruleAppointmentAdvice('上一轮：老师签字。本轮：改成学习计划').minutes, 20)
  assert.equal(ruleAppointmentAdvice('要签字，也想聊学业预警').minutes, null)
})
test('含敏感标记的描述不发送模型', async () => {
  const prior = process.env.APPOINTMENT_ADVICE_LLM
  process.env.APPOINTMENT_ADVICE_LLM = 'true'
  try {
    let calls = 0
    const result = await appointmentAdvice('学号123456789想找老师', () => { calls++; throw new Error('不应调用') })
    assert.equal(calls, 0)
    assert.equal(result.engine, 'rule')
    assert.equal(result.minutes, null)
  } finally {
    if (prior === undefined) delete process.env.APPOINTMENT_ADVICE_LLM
    else process.env.APPOINTMENT_ADVICE_LLM = prior
  }
})
test('模型结果只接受允许的类型和时长，出错回退', async () => {
  const prior = process.env.APPOINTMENT_ADVICE_LLM
  process.env.APPOINTMENT_ADVICE_LLM = 'true'
  try {
    const good = await appointmentAdvice('老师在单子末尾手写确认', async () => ({ ok: true, data: { category: 'signature', minutes: 5 } }))
    assert.equal(good.engine, 'model')
    const invalid = await appointmentAdvice('老师在单子末尾手写确认', async () => ({ ok: true, data: { category: 'signature', minutes: 999 } }))
    assert.equal(invalid.minutes, null)
    assert.equal(invalid.engine, 'rule')
    const failed = await appointmentAdvice('其他', async () => { throw new Error('timeout') })
    assert.equal(failed.minutes, null)
  } finally {
    if (prior === undefined) delete process.env.APPOINTMENT_ADVICE_LLM
    else process.env.APPOINTMENT_ADVICE_LLM = prior
  }
})
