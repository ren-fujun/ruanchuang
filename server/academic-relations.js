export function academicRelationsValid(user, rows, users) {
  const active = person => person && !person.disabled && (!person.expiresAt || (Number.isFinite(Date.parse(person.expiresAt)) && Date.parse(person.expiresAt) > Date.now()))
  return rows.every(row => {
    const student=users.find(person=>person.id===row.studentId && person.role==='student')
    const mentor=users.find(person=>person.id===row.mentorId && person.role==='mentor')
    const counselor=users.find(person=>person.id===row.counselorId && person.role==='counselor')
    return Boolean(user.college && active(student) && active(mentor) && active(counselor) && student.college===user.college && mentor.college===user.college && Array.isArray(counselor.studentIds) && counselor.studentIds.includes(student.id) && (Array.isArray(student.counselorIds) ? student.counselorIds.includes(counselor.id) : student.counselor===counselor.name))
  })
}
