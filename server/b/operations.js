import crypto from 'node:crypto'

// Scoped to actor, operation and body. Versioned writes remain synchronous before save().
export function operation(req, res, state, target) {
  const requestId = req.body?.requestId
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100) {
    res.status(400).json({ message: '请提供8至100字的requestId' }); return null
  }
  state.operations ||= []
  const key = `${req.user.id}:${target}:${requestId}`
  const hash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex')
  const old = state.operations.find(x => x.key === key)
  if (old) {
    if (old.hash !== hash) res.status(409).json({ message: '同一requestId不能用于不同内容' })
    else res.status(old.status).json(old.response)
    return null
  }
  return (response, status = 200) => {
    state.operations.push({ key, hash, status, response })
    res.status(status).json(response)
  }
}

export function notice(db, userId, title, body) {
  db.notifications ||= []
  db.notifications.unshift({ id: crypto.randomUUID(), userId, type: 'system', title, body,
    ticketId: null, tone: 'gold', at: new Date().toISOString(), read: false })
}
