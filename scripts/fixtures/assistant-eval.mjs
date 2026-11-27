const repair = '/student/repairs'
const start = (topic) => ({ action: 'guidance', topic, next: repair + '/new', answer: '后勤', policy: true })
const progress = (topic, answer) => ({ action: 'guidance', topic, next: repair, answer, policy: true })
const handoff = { action: 'handoff', next: null, source: null, answer: '辅导员' }
const urgent = { action: 'urgent_handoff', next: null, source: null, answer: '紧急' }
const hours = { action: 'guidance', topic: 'hours', answer: '值班室', policy: true }
const leak = ['宿舍漏水怎么办', start('leak')]
const heater = ['宿舍热水器坏了', start('repair')]
const leave = ['本科生怎么请假', { action: 'guidance', next: '/student/leaves', answer: '辅导员', policy: true }]
const card = ['校园卡补办在哪里', { action: 'answer', source: 'card', answer: '服务大厅' }]
const item = (id, group, ...turns) => ({ id, group, turns })

export const consultationCases = [
  item('N01','常规识别', leak),
  item('N02','常规识别', ['墙面渗水要怎么处理', start('leak')]),
  item('N03','常规识别', heater),
  item('N04','常规识别', ['宿舍几点关门', hours]),
  item('N05','常规识别', ['食堂档口卫生不干净', { action: 'guidance', topic: 'hygiene', next: null, answer: '投诉渠道', policy: true }]),
  item('N06','常规识别', leave),
  item('N07','常规识别', ['宿舍的空调不凉了', start('repair')]),
  item('N08','常规识别', ['寝室门禁是几点', hours]),
  item('F01','报修追问', leak, ['怎么办', start('leak')]),
  item('F02','报修追问', leak, ['补救无效', progress('leak','提出一次异议')]),
  item('F03','报修追问', leak, ['师傅昨天来过，今天又滴了', progress('leak','提出一次异议')]),
  item('F04','报修追问', heater, ['昨天下午提交后一直没有回复', progress('repair','4 小时')]),
  item('F05','报修追问', leak, ['宿舍漏水已经报修了，还没接单', progress('leak','4 小时')]),
  item('F06','报修追问', ['空调已经修过还是不行', progress('repair','提出一次异议')]),
  item('F07','报修追问', leak, ['补救无效', progress('leak','提出一次异议')], ['那怎么办', progress('leak','提出一次异议')]),
  item('F08','报修追问', heater, ['已报修', progress('repair','4 小时')], ['那需要多久', progress('repair','4 小时')]),
  item('F09','报修追问', ['我还没报修，怎么提交', start('repair')]),
  item('F10','报修追问', ['可以查一下维修进度吗', progress('repair','查看受理状态')]),
  item('S01','跨话题和转人工', leak, leave),
  item('S02','跨话题和转人工', leak, ['宿舍晚归怎么办', hours]),
  item('S03','跨话题和转人工', leak, ['换个问题，校园卡补办在哪里', card[1]], ['那去哪里', card[1]]),
  item('S04','跨话题和转人工', card, ['热水器坏了', start('repair')], ['怎么办', start('repair')]),
  item('S05','跨话题和转人工', leak, ['今天有点别的事情说不清', handoff], ['怎么办', handoff]),
  item('S06','跨话题和转人工', leak, ['我想找人工，继续问宿舍漏水', handoff]),
  item('S07','跨话题和转人工', card, ['有点别的事情说不清', handoff], ['那怎么办', handoff]),
  item('S08','跨话题和转人工', ['我不想找人工，宿舍漏水怎么办', start('leak')]),
  item('K01','知识依据', card),
  item('K02','知识依据', ['校车接驳办法是什么', handoff]),
  item('K03','知识依据', ['实验室钥匙领取在哪里', handoff]),
  item('K04','知识依据', ['新生体检预约怎么操作', handoff]),
  item('K05','知识依据', ['在读证明打印怎么申请', { action: 'answer', source:'proof', answer:'教务' }]),
  item('K06','知识依据', card, ['这个去哪里办', card[1]]),
  item('R01','风险和信息不足', ['宿舍漏水而且插座漏电', urgent]),
  item('R02','风险和信息不足', leak, ['现在有触电风险', urgent], ['怎么办', urgent]),
  item('R03','风险和信息不足', ['食堂生熟混放且电线冒火', urgent]),
  item('R04','风险和信息不足', ['有点事情说不清', handoff]),
  item('W01','跨流程指引', leave, ['那找谁', { action:'guidance', topic:'leave', next:'/student/leaves', answer:'所属辅导员' }]),
  { ...item('W02','跨流程指引', ['我是研究生，请假找谁', { action:'guidance', topic:'leave', next:'/student/leaves', answer:'所属班导师' }]), account:'graduate' },
  item('W03','跨流程指引', ['学业预警后谁会联系我面谈？', { action:'guidance', topic:'academic', next:null, answer:'自行协商' }], ['那怎么预约', { action:'guidance', topic:'appointment', next:'/student/appointments', answer:'周课表' }]),
  item('W04','跨流程指引', ['怎么预约辅导员', { action:'guidance', topic:'appointment', next:'/student/appointments', answer:'预约记录' }]),
  item('W05','跨流程指引', ['我想向学校反映问题', { action:'guidance', topic:'request', next:'/student/new', answer:'自行提交' }]),
  item('W06','跨流程指引', ['我想查看诉求进度', { action:'guidance', topic:'request', next:'/student/tickets', answer:'打开原事项' }], ['那怎么办', { action:'guidance', topic:'request', next:'/student/tickets' }]),
  item('W07','跨流程指引', ['我想查看诉求进度', { action:'guidance', topic:'request', next:'/student/tickets' }], ['换个问题，校车接驳办法是什么', handoff]),
  item('W08','跨流程指引', ['想找人工，宿舍漏水情况还不太好说', handoff]),
  item('W09','跨流程指引', ['选课退课最晚哪天', handoff]),
  item('W10','跨流程指引', leak, ['换个问题，我提交后的诉求进度怎么查看', { action:'guidance', topic:'request', next:'/student/tickets' }]),
]

export const liveConsultationCases = [
  item('L01', '已审核资料模型辅助', ['校园卡补办在哪里', {
    action: 'answer', source: 'card', engine: 'model-assisted',
  }]),
  item('L02', '规则优先', ['本科生请假找谁', {
    action: 'guidance', next: '/student/leaves', answer: '辅导员', engine: 'local-rules',
  }]),
  item('L03', '人工优先', ['我想找人工，宿舍漏水', { ...handoff, engine: 'local-rules' }]),
]
export const sprintConsultationCases = [
  ...['N01', 'F02', 'S03', 'K02', 'K03', 'K06', 'R01', 'W01', 'W02', 'W08']
    .map(id => consultationCases.find(scenario => scenario.id === id)),
  item('P01', '口语难例', ['导员最近的空档怎么找，我想见一面', {
    action: 'guidance', topic: 'appointment', next: '/student/appointments',
  }]),
  item('P02', '口语难例', ['有些情况，想跟学院反映一下', {
    action: 'guidance', topic: 'request', next: '/student/new',
  }]),
]

export const appointmentDurationCases = [
  { topic: '我就找老师签个字', category: 'signing', durationMinutes: 5 },
  { topic: '帮忙盖一下章', category: 'signing', durationMinutes: 5 },
  { topic: '想问问奖学金需要什么手续', category: 'consultation', durationMinutes: 15 },
  { topic: '咨询班级材料提交的流程', category: 'consultation', durationMinutes: 15 },
  { topic: '想谈一下学业预警之后的计划', category: 'academic', durationMinutes: 20 },
  { topic: '挂科了，想和老师聊聊怎么补考', category: 'academic', durationMinutes: 20 },
  { topic: '要签字，也想聊学业预警', category: 'unknown', durationMinutes: null },
  { topic: '有点事', category: 'unknown', durationMinutes: null },
  { topic: '找老师确认一张单，学号我到了再说', category: 'unknown', durationMinutes: null },
]

export const liveAppointmentDurationCases = [
  { topic: '只差老师在表格末尾留下手写确认', category: 'signing', durationMinutes: 5 },
  { topic: '见个面聊聊这学期几门课为什么都没过', category: 'academic', durationMinutes: 20 },
]

const knowledge = (id, keywords, answer, overrides = {}) => ({
  id, title: '虚构校园测试公告', version: 1, department: '测试部门', source: '合成评测资料',
  status: 'published', validUntil: '2099-01-01', keywords, answer, ...overrides,
})
export const consultationKnowledge = [
  knowledge('card',['校园卡补办'],'请到服务大厅补办。'),
  knowledge('proof',['在读证明打印'],'请到教务服务窗口询问。'),
  knowledge('expired',['校车接驳办法'],'过期资料。',{ validUntil:'2001-01-01' }),
  knowledge('draft',['实验室钥匙领取'],'审核中资料。',{ status:'draft' }),
  knowledge('tie-a',['新生体检预约'],'渠道 A。'),
  knowledge('tie-b',['新生体检预约'],'渠道 B。'),
]
