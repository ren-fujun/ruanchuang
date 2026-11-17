import { seedData } from '../../server/seed.js'
export function bTrialFixture() {
  const db = seedData(), student = db.users.find(x => x.id === 'stu-lin')
  Object.assign(student, { educationLevel: 'undergraduate', counselorIds: ['cou-chen'] })
  db.users.push(
    { ...student, id: 'stu-grad', account: 'graduate', name: '虚构研究生', educationLevel: 'postgraduate', classAdvisorIds: ['mentor-demo', 'mentor-other'] },
    { ...student, id: 'stu-unconfigured', account: 'unconfigured', name: '未配置学生', educationLevel: null },
    { id: 'mentor-demo', account: 'mentor', password: '123456', name: '班导师示例', role: 'mentor', college: student.college, classAdvisor: true },
    { id: 'mentor-other', account: 'mentor-other', password: '123456', name: '其他学业导师', role: 'mentor', college: student.college },
    { id: 'academic-demo', account: 'academic', password: '123456', name: '教务示例', role: 'academic', college: student.college },
    { id: 'review-demo', account: 'reviewer', password: '123456', name: '知识审核员', role: 'counselor', knowledgeReviewer: true },
  )
  db.b = { cases: [{ id: 'case-demo', studentId: student.id, studentName: student.name, college: student.college,
    mentorId: 'mentor-demo', counselorId: 'cou-chen', course: '高等数学', status: 'pending_contact', version: 1,
    records: [], result: null, createdAt: new Date().toISOString() }], knowledge: [], conversations: [], audit: [], leaves: [] }
  return db
}
