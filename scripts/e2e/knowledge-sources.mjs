import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { seedData } from '../../server/seed.js'

const directory = await mkdtemp(path.join(tmpdir(), 'zhixing-kb-'))
const file = path.join(directory, 'store.json')
await writeFile(file, JSON.stringify(seedData()))
const port = process.env.KB_TEST_PORT || '18814'
const child = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: port, ZHIHUI_DATA_FILE: file, STUDENT_KNOWLEDGE_LLM: 'false', DEEPSEEK_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
let log = ''
child.stderr.on('data', b => { log += b })
try {
  await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(Error('启动超时 '+log)),10000)
    child.stdout.on('data',b=>{if(String(b).includes('已启动')){clearTimeout(timer);resolve()}})
    child.on('exit',code=>{clearTimeout(timer);reject(Error('服务退出 '+code+' '+log))})
  })
  const api = async (route, body, token) => {
    const response=await fetch(`http://127.0.0.1:${port}/api${route}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)})
    const data=await response.json()
    assert.equal(response.status,200,JSON.stringify(data))
    return data
  }
  const login=await api('/auth/login',{account:'20230118',password:'123456'})
  const cases=[
    ['2023级计算机学院综测总分公式怎么算','csu-evaluation-policy-02','70%'],
    ['综测加减分申请表需要什么证明材料','csu-evaluation-form-adjust','证明材料'],
    ['德美劳素质分申请表谁签字','csu-evaluation-form-moral','班导师签字'],
    ['中英文成绩单在读证明在哪办','csu-official-link-','在读证明'],
    ['计算机专业后端开发工程师需要什么技能','csu-career-guide-','后端开发'],
  ]
  for(const [question,prefix,expected] of cases){
    const reply=await api('/b/assistant',{text:question},login.token)
    assert.equal(reply.action,'answer',`${question}: ${reply.action} ${reply.answer}`)
    assert.ok(reply.source?.id.startsWith(`official-${prefix}`),`${question}: ${reply.source?.id}`)
    assert.ok(reply.answer.includes(expected),`${question}: ${reply.answer.slice(0,100)}`)
    console.log(`${question} => ${reply.source.title}`)
  }
} finally { child.kill() }
