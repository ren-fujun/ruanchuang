import { seedData } from '../../server/seed.js'

// AI 编写的固定虚构样本；不调用外部模型，不包含真实学生数据。
export const scenarios = [
  ['宿舍水龙头持续漏水，请安排维修并检查管道。', '宿舍生活', 'logistics'],
  ['宿舍空调无法启动，请检查供电和设备。', '宿舍生活', 'logistics'],
  ['自习室照明灯损坏，影响晚间学习。', '校园设施', 'logistics'],
  ['食堂洗手池排水缓慢，需要疏通。', '校园设施', 'logistics'],
  ['高等数学重修课程时间与必修课冲突，希望核对。', '学业教务', 'academic'],
  ['课程成绩显示缺考，但已参加考试，请核实。', '学业教务', 'academic'],
  ['选课系统中找不到培养方案要求的课程。', '学业教务', 'academic'],
  ['考试教室通知与系统显示不同，需要确认。', '学业教务', 'academic'],
  ['宿舍网络频繁断线，无法访问学习平台。', '网络服务', 'it'],
  ['校园统一认证登录失败，请帮助检查。', '网络服务', 'it'],
  ['奖学金申请材料上传后没有显示提交记录。', '学生事务', 'office'],
  ['学籍证明申请一直没有反馈，想了解办理进度。', '学生事务', 'office'],
].map(([description, category, department], i) => ({
  id: `synthetic-${i + 1}`, account: `test${String(i + 1).padStart(2, '0')}`,
  name: `虚构学生${String(i + 1).padStart(2, '0')}`, description, category, department,
}))

export function fivePortalFixture() {
  const db = seedData()
  const template = db.users.find(u => u.id === 'stu-lin')
  for (const s of scenarios) db.users.push({ ...template, id: s.id, name: s.name,
    account: s.account, studentNo: s.account, phone: '测试无联系方式', room: '虚构测试楼101' })
  return db
}
