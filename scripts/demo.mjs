// Local demo uses its own persistent store and never needs a model API key.
import { fileURLToPath } from 'node:url'
process.env.PORT ||= '18792'
process.env.ZHIHUI_DATA_FILE ||= fileURLToPath(new URL('../.tmp/teacher-demo/store.json', import.meta.url))
process.env.DEEPSEEK_API_KEY = ''
console.log('演示模式：本地规则 + GraphRAG + 风险筛查，独立演示数据。')
await import('../server/index.js')
