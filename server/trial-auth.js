import crypto from 'node:crypto'

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) throw new Error('密码长度须为10至256字符')
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}
export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256 || typeof encoded !== 'string') return false
  const parts = encoded.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false
  const expected = Buffer.from(parts[2], 'hex')
  const actual = crypto.scryptSync(password, Buffer.from(parts[1], 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}
export function createLoginLimiter({ limit = 10, windowMs = 15 * 60 * 1000, clock = Date.now } = {}) {
  const attempts = new Map()
  return {
    allowed(key) { const now=clock(); const record = attempts.get(key); if (record && now < record.until) return record.count < limit; if (record) attempts.delete(key); if (attempts.size >= 10000) { for (const [id, value] of attempts) if (now >= value.until) attempts.delete(id) } return attempts.size < 10000 },
    fail(key) {
      if (attempts.size >= 10000 && !attempts.has(key)) { for (const [id, value] of attempts) if (clock() >= value.until) attempts.delete(id); if (attempts.size >= 10000) return }
      const now = clock(); const old = attempts.get(key); const record = old && now < old.until ? old : { count: 0, until: now + windowMs }; record.count++; attempts.set(key, record)
    },
    clear(key) { attempts.delete(key) },
  }
}
