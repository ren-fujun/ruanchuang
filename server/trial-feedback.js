import crypto from 'node:crypto'

export function mountTrialFeedback(app, { db, save, requireAuth, trialMode }) {
  const version = /^[a-zA-Z0-9._-]{1,80}$/.test(process.env.TRIAL_BUILD_VERSION || '') ? process.env.TRIAL_BUILD_VERSION : 'unknown'
  app.post('/api/trial/feedback', requireAuth, (req, res) => {
    if (!trialMode) return res.status(404).json({message:'试用反馈未启用。'})
    const {type, description, rating, pagePath, requestId} = req.body || {}
    if (!['problem','suggestion','other'].includes(type) || typeof description !== 'string' || !description.trim() || description.trim().length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5 || typeof pagePath !== 'string' || !/^\/[a-zA-Z0-9/_-]{0,200}$/.test(pagePath) || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) return res.status(400).json({message:'反馈内容或页面路径无效。'})
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify({type,description:description.trim(),rating,pagePath})).digest('hex')
    db.trialFeedback ||= []
    const prior=db.trialFeedback.find(item=>item.actorId===req.user.id && item.requestId===requestId)
    if (prior) {
      if (prior.fingerprint !== fingerprint) return res.status(409).json({message:'请求编号已用于其他反馈。'})
      return res.status(200).json({item:{id:prior.id,createdAt:prior.createdAt}})
    }
    const item={id:crypto.randomUUID(),actorId:req.user.id,role:req.user.role,version,type,description:description.trim(),rating,pagePath,requestId,fingerprint,createdAt:new Date().toISOString()}
    db.trialFeedback.push(item);save()
    return res.status(201).json({item:{id:item.id,createdAt:item.createdAt}})
  })
  app.get('/api/trial/feedback', requireAuth, (req, res) => {
    if (!trialMode) return res.status(404).json({message:'试用反馈未启用。'})
    if (req.user.trialAdmin !== true) return res.status(403).json({message:'无权查看试用反馈。'})
    const items=(db.trialFeedback || []).map(({fingerprint,requestId,...item})=>item)
    return res.json({items})
  })
}
