// Convert explicitly supplied source text into reviewable drafts; never publish it.
export function makeKnowledgeDrafts({ title, source, department, validUntil, text, authorId, makeId, now = Date.now() }) {
  for (const value of [title, source, department]) {
    if (typeof value !== 'string' || !value.trim() || value.length > 300) throw new Error('请填写文件名称、来源和责任部门（每项不超过300字）')
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw new Error('文件正文须为1至20000字')
  if (!Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) <= now) throw new Error('请填写未来的有效期')
  const paragraphs = text.trim().split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)
  if (paragraphs.length > 20 || paragraphs.some(x => x.length > 4000)) throw new Error('请分段导入：最多20段，每段不超过4000字')
  return paragraphs.map((paragraph, index) => ({
    id: makeId(), family: makeId(), version: 1,
    title: paragraphs.length === 1 ? title.trim() : `${title.trim()}（第${index + 1}段）`,
    answer: paragraph, sourceExcerpt: paragraph, source: source.trim(),
    department: department.trim(), validUntil, keywords: [], status: 'draft',
    authorId, createdAt: new Date(now).toISOString(),
  }))
}
