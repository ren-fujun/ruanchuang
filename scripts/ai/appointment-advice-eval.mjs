// Fixed fictional examples; rule output only. Model and human agreement must be measured separately.
import { ruleAppointmentAdvice } from '../../server/b/appointment-advice.js'
const cases = [
  ['我就找老师签个字', 'signature', 5], ['需要老师签名', 'signature', 5],
  ['表格需要盖章', 'signature', 5], ['想咨询请假流程', 'consultation', 15],
  ['想和老师谈话', 'consultation', 15], ['有事情请假咨询', 'consultation', 15],
  ['想聊一下学业问题', 'academic', 20], ['挂科后怎么办', 'academic', 20],
  ['讨论学习计划', 'academic', 20], ['申请学业面谈', 'academic', 20],
  ['想找老师', 'unknown', null], ['我有一个问题', 'unknown', null],
]
let pass = 0
for (const [text, category, minutes] of cases) {
  const result = ruleAppointmentAdvice(text)
  const ok = result.category === category && result.minutes === minutes
  pass += Number(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}: ${result.category}/${result.minutes}`)
}
console.log(`规则测试 ${pass}/${cases.length}；模型组、人工一致率、成本未运行。样例非真实使用准确率。`)
if (pass !== cases.length) process.exitCode = 1
