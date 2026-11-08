import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedData } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dataFile = process.env.ZHIHUI_DATA_FILE
  ? path.resolve(process.env.ZHIHUI_DATA_FILE)
  : path.join(dataDir, 'store.json')

fs.mkdirSync(path.dirname(dataFile), { recursive: true })
fs.writeFileSync(dataFile, JSON.stringify(seedData(), null, 2), 'utf8')
console.log(`演示数据已重置：${dataFile}`)
console.log('请重启 API 服务后生效。')
