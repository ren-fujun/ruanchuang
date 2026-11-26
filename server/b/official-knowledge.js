import entries from './official-knowledge.json' with { type: 'json' }
import importedEntries from './imported-knowledge.json' with { type: 'json' }

// Maintained by the project team from verified school publications, not user-submitted data.
export function validateOfficialKnowledge(items) {
  if (!Array.isArray(items)) throw new Error('基础知识库必须是数组')
  const ids = new Set()
  return items.map(item => {
    if (!item || typeof item !== 'object' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id || '') || ids.has(item.id)) throw new Error('基础知识库编号无效或重复')
    ids.add(item.id)
    if (![item.title, item.answer, item.sourceExcerpt, item.department].every(x => typeof x === 'string' && x.trim() && x.length <= 4000)) throw new Error('基础知识库必须填写标题、答案、原文和部门')
    let url
    try { url = new URL(item.source) } catch { throw new Error('基础知识库来源必须是学校发布网页的HTTPS链接') }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('基础知识库来源必须是HTTPS链接')
    if (!Array.isArray(item.keywords) || !item.keywords.length || item.keywords.length > 20 || !item.keywords.every(x => typeof x === 'string' && x.trim().length >= 2 && x.length <= 30)) throw new Error('基础知识库关键词无效')
    if (typeof item.validUntil !== 'string' || !Number.isFinite(Date.parse(item.validUntil))) throw new Error('基础知识库有效期无效')
    return { id: `official-${item.id}`, title: item.title.trim(), answer: item.answer.trim(), sourceExcerpt: item.sourceExcerpt.trim(), department: item.department.trim(), source: url.href, keywords: item.keywords.map(x => x.trim()), validUntil: item.validUntil, status: 'published', version: 1 }
  })
}
// `official-knowledge.json` is for hand-curated records; imported entries are
// generated from team-maintained source files by `npm run knowledge:import`.
export const officialKnowledge = validateOfficialKnowledge([...entries, ...importedEntries])
