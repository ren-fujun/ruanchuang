import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareAcademicBatch } from './academic-batch.js'
const row = { studentId: '001', course: '数学', mentorId: 'm1', counselorId: 'c1' }
test('valid batch normalizes identifiers and creates a new version', () => {
  const result = prepareAcademicBatch([{ ...row, studentId: ' 001 ' }], { previousVersion: 1 })
  assert.equal(result.batch.version, 2)
  assert.equal(result.batch.items[0].studentId, '001')
  assert.ok(result.batch.id)
})
test('invalid and duplicate rows return errors without a batch', () => {
  const result = prepareAcademicBatch([row, row, { ...row, mentorId: '' }])
  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(e => e.row), [2, 3])
  assert.equal(result.batch, undefined)
})
test('rejects empty lists and invalid versions', () => {
  assert.throws(() => prepareAcademicBatch([]))
  assert.throws(() => prepareAcademicBatch([row], { previousVersion: -1 }))
})
