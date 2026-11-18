import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REPAIR_STATUS,
  claimRepair,
  coordinateRepair,
  createRepair,
  respondToRepairObjection,
  submitRepairFeedback,
  submitRepairResult,
} from './repair-workflow.js'

const student = { id: 's1', role: 'student', name: '学生一' }
const counselor = { id: 'c1', role: 'counselor', name: '辅导员' }
const logistics = { id: 'l1', role: 'logistics', name: '后勤一' }
const otherLogistics = { id: 'l2', role: 'logistics', name: '后勤二' }

function draft() {
  return createRepair({
    repairs: [],
    student,
    counselorId: counselor.id,
    repairType: '水电',
    location: '学生公寓 3 号楼 412',
    description: '水龙头持续漏水。',
    campus: '主校区',
    requestId: 'create-1',
  })
}

test('student repair is created directly without counselor review', () => {
  const repair = draft()
  assert.equal(repair.status, REPAIR_STATUS.PENDING_ASSIGNMENT)
  assert.equal(repair.studentId, student.id)
  assert.equal(repair.claimantId, null)
})

test('only one logistics account can claim', () => {
  const repair = draft()
  const claimed = claimRepair({
    repair,
    logistics,
    version: repair.version,
    requestId: 'claim-1',
  })
  assert.equal(claimed.status, REPAIR_STATUS.PROCESSING)
  assert.throws(
    () => claimRepair({
      repair: claimed,
      logistics: otherLogistics,
      version: claimed.version,
      requestId: 'claim-2',
    }),
    (error) => error.status === 409,
  )
})

test('one result leads to student feedback and one objection can be coordinated', () => {
  const claimed = claimRepair({
    repair: draft(),
    logistics,
    version: 1,
    requestId: 'claim-1',
  })
  const waiting = submitRepairResult({
    repair: claimed,
    logistics,
    version: claimed.version,
    result: '已更换阀门。',
    requestId: 'result-1',
  })
  assert.equal(waiting.status, REPAIR_STATUS.AWAITING_FEEDBACK)
  assert.throws(
    () => submitRepairResult({
      repair: waiting,
      logistics,
      version: waiting.version,
      result: '再次提交',
      requestId: 'result-2',
    }),
    (error) => error.status === 409,
  )

  const objected = submitRepairFeedback({
    repair: waiting,
    student,
    version: waiting.version,
    decision: 'objection',
    reason: '仍然漏水。',
    requestId: 'feedback-1',
    responseMinutes: 60,
  })
  assert.equal(objected.status, REPAIR_STATUS.OBJECTION_PENDING_RESPONSE)
  assert.throws(
    () => submitRepairFeedback({
      repair: objected,
      student,
      version: objected.version,
      decision: 'satisfied',
      requestId: 'feedback-2',
    }),
    (error) => error.status === 409,
  )

  const responded = respondToRepairObjection({
    repair: objected,
    logistics,
    version: objected.version,
    response: '原配件不匹配，已提出更换方案。',
    requestId: 'response-1',
  })
  const coordinated = coordinateRepair({
    repair: responded,
    counselor,
    version: responded.version,
    conclusion: '双方记录一致，设备仍需更换配件。',
    followUp: '一周内回访并新建关联维修任务。',
    owner: '后勤维修组',
    dueAt: '2026-11-25T10:00:00.000Z',
    requestId: 'coordinate-1',
  })
  assert.equal(coordinated.status, REPAIR_STATUS.COORDINATED_CLOSED)
  assert.equal(coordinated.terminalAt !== null, true)
})

test('counselor may close an unanswered objection after its deadline', () => {
  const claimed = claimRepair({
    repair: draft(),
    logistics,
    version: 1,
    requestId: 'claim-1',
  })
  const waiting = submitRepairResult({
    repair: claimed,
    logistics,
    version: claimed.version,
    result: '已完成疏通。',
    requestId: 'result-1',
  })
  const objected = submitRepairFeedback({
    repair: waiting,
    student,
    version: waiting.version,
    decision: 'objection',
    reason: '排水仍然缓慢。',
    requestId: 'feedback-1',
    responseMinutes: 1,
  })
  const later = new Date(Date.now() + 2 * 60_000)
  const coordinated = coordinateRepair({
    repair: objected,
    counselor,
    version: objected.version,
    conclusion: '后勤未在时限内补充说明。',
    followUp: '辅导员继续跟进。',
    owner: '辅导员',
    dueAt: '2026-11-26T10:00:00.000Z',
    requestId: 'coordinate-1',
    now: later,
  })
  assert.equal(coordinated.coordination.responseOverdue, true)
})
