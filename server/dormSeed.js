const now = Date.now()
const ago = (minutes) => new Date(now - minutes * 60000).toISOString()

const rooms = [
  ['401', ['林知夏', '许清和', '王雨桐', '赵一诺']],
  ['402', ['周子昂', '陈默', '苏念', '郑凯']],
  ['403', ['顾言', '沈知遥', '陆星野', '唐予晴']],
  ['404', ['江晚', '程屿', '宋知微', '贺川']],
  ['405', ['叶青', '林一', '周然', '许棠']],
  ['406', ['陈星', '沈墨', '苏禾', '顾南']],
  ['407', ['白露', '林深', '陆遥', '温言']],
  ['408', ['夏至', '江屿', '程月', '沈星']],
  ['409', ['宋清', '顾言', '叶宁', '周晚']],
  ['410', ['林溪', '陈默', '许知', '赵野']],
  ['411', ['苏念', '王雨桐', '唐棠', '顾清']],
  ['412', ['江予', '周知', '许清', '林夏']],
].map(([room, students]) => ({
  id: `b3-${room}`,
  building: '3号楼',
  floor: 4,
  room,
  students,
}))

const record = (roomId, checkedAt, overrides = {}) => {
  const room = rooms.find((item) => item.id === roomId)
  return {
    id: `DC-${roomId}-${checkedAt}`,
    roomId,
    building: room.building,
    floor: room.floor,
    room: room.room,
    inspectorId: 'cou-chen',
    inspectorName: '陈予安',
    checkedAt,
    result: 'normal',
    presentCount: room.students.length,
    absentStudents: [],
    issues: [],
    note: '',
    attachments: [],
    ...overrides,
  }
}

export const dormCheckSeed = () => ({
  rooms,
  records: [
    record('b3-407', ago(34)),
    record('b3-405', ago(52)),
    record('b3-403', ago(88), {
      result: 'exception',
      presentCount: 3,
      absentStudents: ['顾言'],
      issues: ['晚归/未归'],
      note: '顾言同学 22:30 仍未回寝，已电话联系，表示在图书馆自习，预计 23:00 前返回。',
      inspectorName: '张岚 · 宿管中心',
    }),
    record('b3-402', ago(116), {
      result: 'exception',
      issues: ['卫生'],
      note: '阳台有积水和纸箱，已提醒学生当场清理。',
    }),
    record('b3-401', ago(145)),
    record('b3-404', ago(1520), { note: '昨日例行查寝，情况正常。' }),
    record('b3-406', ago(1600), {
      result: 'exception',
      issues: ['用电安全'],
      note: '发现插线板串联使用，已现场整改。',
      inspectorName: '张岚 · 宿管中心',
    }),
  ],
})
