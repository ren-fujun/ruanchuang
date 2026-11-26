import fs from 'node:fs'
import path from 'node:path'

const requiredText = (value, field, max = 4000) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new Error(`资料 ${field} 未填写或长度无效`)
  }
  return value.trim()
}

const readUtf8Source = (sourceDir, file) => {
  if (typeof file !== 'string' || !/^[a-zA-Z0-9_\-./]+\.(?:txt|md)$/i.test(file)) {
    throw new Error('资料正文只支持 knowledge-source 文件夹内的 .txt 或 .md 文件')
  }
  const resolvedDir = path.resolve(sourceDir)
  const resolvedFile = path.resolve(resolvedDir, file)
  if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) throw new Error('资料正文路径无效')
  if (!fs.existsSync(resolvedFile)) throw new Error(`找不到资料正文：${file}`)
  const text = fs.readFileSync(resolvedFile, 'utf8').replace(/^\uFEFF/, '').trim()
  if (!text || text.length > 60000) throw new Error(`资料正文 ${file} 须为 1 至 60000 字`)
  return text
}

/**
 * Convert project-maintained source files into immutable, published knowledge records.
 * This is deliberately separate from counselor drafts: entries here originate from
 * files committed by the team and must include a public HTTPS source for traceability.
 */
export function importKnowledgeSources({ sourceDir, catalog }) {
  if (!Array.isArray(catalog)) throw new Error('资料清单必须是数组')
  const ids = new Set()
  return catalog.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('资料清单中存在无效条目')
    const id = requiredText(entry.id, '编号', 80)
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new Error(`资料编号无效或重复：${id}`)
    ids.add(id)
    const source = requiredText(entry.source, '来源链接', 1000)
    let url
    try { url = new URL(source) } catch { throw new Error(`资料 ${id} 的来源链接无效`) }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`资料 ${id} 的来源必须是 HTTPS 链接`)
    if (!Array.isArray(entry.keywords) || !entry.keywords.length || entry.keywords.length > 20 || !entry.keywords.every((word) => typeof word === 'string' && word.trim().length >= 2 && word.trim().length <= 30)) {
      throw new Error(`资料 ${id} 的关键词无效`)
    }
    const validUntil = requiredText(entry.validUntil, '有效期', 40)
    if (!Number.isFinite(Date.parse(validUntil))) throw new Error(`资料 ${id} 的有效期无效`)
    const answer = readUtf8Source(sourceDir, entry.file)
    return {
      id,
      title: requiredText(entry.title, '标题', 300),
      answer,
      sourceExcerpt: answer,
      department: requiredText(entry.department, '责任部门', 300),
      source: url.href,
      keywords: entry.keywords.map((word) => word.trim()),
      validUntil,
    }
  })
}
