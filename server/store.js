import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedData } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dataFile = process.env.ZHIHUI_DATA_FILE
  ? path.resolve(process.env.ZHIHUI_DATA_FILE)
  : path.join(dataDir, 'store.json')

const ensureLoaded = () => {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true })
  if (fs.existsSync(dataFile)) {
    try {
      const raw = fs.readFileSync(dataFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.tickets) && Array.isArray(parsed.users)) return parsed
    } catch (error) {
      console.error('读取本地数据失败，将重新初始化演示数据：', error.message)
    }
  }
  const initial = seedData()
  fs.mkdirSync(path.dirname(dataFile), { recursive: true })
  fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2), 'utf8')
  return initial
}

export const db = ensureLoaded()

let saveTimer = null
export const save = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const payload = JSON.stringify(db, null, 2)
    const temp = `${dataFile}.tmp`
    fs.writeFileSync(temp, payload, 'utf8')
    fs.renameSync(temp, dataFile)
  }, 20)
}

export const saveNow = () => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2), 'utf8')
}

export { dataFile }
