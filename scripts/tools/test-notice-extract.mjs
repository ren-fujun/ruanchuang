/** 会议抽取引擎自测：用真实风格的中文通知验证准确率 */
import { extractMeeting } from '../../server/noticeExtract.js'

const CASES = [
  {
    name: '标准长通知（年月日 + 冒号时间）',
    text: `关于召开2026年秋季学期学生工作会议的通知

各位辅导员、班主任：
为做好本学期学生工作总结与下一阶段部署，经研究决定召开学生工作会议。现将有关事项通知如下：
一、会议时间：2026年11月12日（星期四）14:30
二、会议地点：行政楼 5 楼 502 会议室
三、参会人员：全体辅导员、各班主任
四、会议要求：请提前 10 分钟入场，携带本学期工作总结材料。
联系人：沈清 0571-88205012`,
    expect: { date: '2026-11-12', startTime: '14:30', location: '行政楼 5 楼 502 会议室' },
  },
  {
    name: '月日 + 时间区间',
    text: '【教务处】定于11月20日上午9:00-11:00在图书馆报告厅举办选课政策宣讲会，请各班学习委员准时参加。',
    expect: { date: '2026-11-20', startTime: '09:00', endTime: '11:00', location: '图书馆报告厅' },
  },
  {
    name: '下周星期 + 下午中文点数',
    text: '各位同学：下周三下午3点在3号楼302教室召开毕业设计开题说明会，请务必参加，届时会有导师现场答疑。',
    expect: { weekday: true, startTime: '15:00', location: '3号楼302教室' },
  },
  {
    name: '明天 + 中文数字时间',
    text: '明天上午九点半在学院会议室开班会，讨论奖学金评定事宜，请全体同学参加。',
    expect: { relative: '明天', startTime: '09:30', location: '学院会议室' },
  },
  {
    name: '斜杠日期 + 晚上时间',
    text: '11/22 晚上7:00 在学生活动中心多功能厅举行迎新晚会彩排，请演职人员准时到场。',
    expect: { date: '2026-11-22', startTime: '19:00', location: '学生活动中心多功能厅' },
  },
  {
    name: '线上会议',
    text: '关于召开就业形势分析会的通知：本周五 14:00，腾讯会议 123-456-789，请毕业生参加。',
    expect: { weekday: true, startTime: '14:00', locationContains: '腾讯会议' },
  },
  {
    name: '只有地点没有时间（应进入待确认）',
    text: '关于宿管中心座谈会的通知：地点在公寓3号楼值班室，具体时间另行通知。',
    expect: { location: '公寓3号楼值班室', missingTime: true },
  },
  {
    name: '纯事务通知（非会议，不应进日程）',
    text: '停水通知：因管道维修，11月15日 8:00-18:00 学生公寓 1-6 号楼停水，请提前储水。',
    expect: { isMeeting: false },
  },
]

let pass = 0
for (const item of CASES) {
  const r = extractMeeting(item.text)
  const checks = []
  const e = item.expect

  if (e.date) checks.push([`日期=${e.date}`, r.date === e.date, r.date])
  if (e.relative) checks.push([`相对日=${e.relative}`, r.date !== '' && r.date === new Date(Date.now() + 86400000).toISOString().slice(0, 10), r.date])
  if (e.weekday) checks.push(['识别出星期(周几)', r.date !== '', r.date])
  if (e.startTime) checks.push([`开始=${e.startTime}`, r.startTime === e.startTime, r.startTime])
  if (e.endTime) checks.push([`结束=${e.endTime}`, r.endTime === e.endTime, r.endTime])
  if (e.location) checks.push([`地点=${e.location}`, r.location === e.location, r.location])
  if (e.locationContains) checks.push([`地点含"${e.locationContains}"`, r.location.includes(e.locationContains), r.location])
  if (e.missingTime) checks.push(['时间缺失已标记', r.missing.includes('日期') || r.missing.includes('具体时间'), r.missing.join('/')])
  if (e.isMeeting === false) checks.push(['判定为非会议', r.isMeeting === false, String(r.isMeeting)])

  const ok = checks.every((c) => c[1])
  if (ok) pass += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item.name}`)
  console.log(`      标题: ${r.title}`)
  console.log(`      时间: ${r.date || '(无)'} ${r.startTime || ''}${r.endTime ? '-' + r.endTime : ''}  |  地点: ${r.location || '(无)'}`)
  console.log(`      置信度: ${r.confidence}  缺失: ${r.missing.join('、') || '无'}  是否会议: ${r.isMeeting}`)
  for (const [label, good, actual] of checks) {
    if (!good) console.log(`      x ${label}  实际得到: ${actual || '(空)'}`)
  }
  console.log('')
}
console.log(`===== ${pass}/${CASES.length} 用例通过 =====`)
