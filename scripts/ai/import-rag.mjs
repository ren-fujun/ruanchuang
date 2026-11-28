import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importCorpus } from '../../server/ai/rag/index.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
try { process.loadEnvFile(path.join(root, '.env')) } catch {}
const sourceDir = path.join(root, 'server/knowledge-source')
const catalogFile = path.resolve(process.env.RAG_CATALOG || path.join(sourceDir, 'rag-catalog.json'))
try {
  const manifest = JSON.parse(fs.readFileSync(catalogFile, 'utf8'))
  if (process.argv.includes('--check')) {
    const { loadCorpus } = await import('../../server/ai/rag/index.js')
    console.log(JSON.stringify({ reviewed: manifest.filter(d => d.reviewed).length, chunks: loadCorpus(manifest, sourceDir).length, pending: manifest.filter(d => !d.reviewed).length }, null, 2))
  } else console.log(JSON.stringify(await importCorpus({ manifest, sourceDir }), null, 2))
} catch (error) { console.error(`RAG import failed: ${error.message}`); process.exitCode = 1 }
