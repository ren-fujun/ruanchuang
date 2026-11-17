// Confirmed product rules; deliberately separate from school policy knowledge.
export function workflowGuidance(text, user) {
  if (/请假|批假/.test(text)) return {
    answer: user.educationLevel === 'undergraduate' ? '本科生请假由你选择的所属辅导员审批，请到“我的请假”提交。AI不能替老师批假。' :
      user.educationLevel === 'postgraduate' ? '研究生请假由你选择的所属班导师审批，请到“我的请假”提交。学业导师不自动具有班导师审批权限，AI不能批假。' :
      '请先联系管理员配置本科生或研究生身份及审批人关系，再到“我的请假”申请。AI不能替老师批假。',
    next: { label: '前往我的请假', path: '/student/leaves' },
  }
  if (/报修|维修|漏水|水龙头|空调故障/.test(text) && !/校园网|网络|wifi|ｗｉｆｉ|认证|断网|掉线/i.test(text)) return {
    answer: '报修按学生直接提交后勤的流程办理，辅导员查看进度并可协助询问。对结果不满意时，提交异议反馈后勤，由辅导员按需协调并留下终止结论，不无限循环返工。实际受理状态以页面回执为准；AI不能判定责任或自动结案。',
    next: { label: '前往报修填写页', path: '/student/new?category=宿舍生活' },
  }
  if (/学业预警|谁.*(面谈|联系)|导师.*职责|辅导员.*职责/.test(text)) return {
    answer: '关联导师和辅导员自行协商行动安排，由被指定人确认，不固定由哪一种身份承担联系或面谈；正式学业结果由教务核实。AI不能替双方决定职责。', next: null,
  }
  return null
}
