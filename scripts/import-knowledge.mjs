import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importKnowledgeSources } from '../server/b/knowledge-source-import.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.resolve(process.env.KNOWLEDGE_SOURCE_DIR || path.join(root, 'server', 'knowledge-source'))
const catalogFile = path.join(sourceDir, 'catalog.json')
const outputFile = path.resolve(process.env.KNOWLEDGE_OUTPUT_FILE || path.join(root, 'server', 'b', 'imported-knowledge.json'))

if (!fs.existsSync(catalogFile)) {
  console.error(`未找到资料清单：${catalogFile}`)
  process.exitCode = 1
} else {
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'))
    const items = importKnowledgeSources({ sourceDir, catalog })
    const temp = `${outputFile}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
    fs.renameSync(temp, outputFile)
    console.log(`已导入 ${items.length} 条学校资料到 ${path.relative(root, outputFile) || outputFile}`)
  } catch (error) {
    console.error(`知识库导入失败：${error.message}`)
    process.exitCode = 1
  }
}
