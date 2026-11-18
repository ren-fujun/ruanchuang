// Assistant actions are limited to explicitly supported student destinations.
const allowed = new Set(['/student/leaves', '/student/repairs/new'])
export function safeStudentPath(value) {
  return typeof value === 'string' && allowed.has(value) ? value : '/student/home'
}
