import test from 'node:test'
import assert from 'node:assert/strict'
import {safeStudentPath} from '../../src/features/b/safe-student-path.mjs'
import {workflowGuidance} from './policy.js'

test('assistant only navigates to explicit student destinations',()=>{
 for(const path of ['/student/leaves','/student/repairs/new']) assert.equal(safeStudentPath(path),path)
 for(const path of ['/student/../counselor/home','/student/%2e%2e/counselor/home','/student/\\evil','//evil.test','https://evil.test','/student/leaves?redirect=//evil.test',null,{}]) assert.equal(safeStudentPath(path),'/student/home')
 assert.equal(safeStudentPath(workflowGuidance('宿舍漏水报修',{}).next.path),'/student/repairs/new')
 assert.equal(safeStudentPath(workflowGuidance('请假',{}).next.path),'/student/leaves')
})
