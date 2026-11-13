import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Sparkles,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/portal.css'
import './mentor.css'
type RecordItem = {
  type: string
  text?: string
  at: string
  scheduledAt?: string
}
type Case = {
  id: string
  studentName: string
  course: string
  status: string
  version: number
  records: RecordItem[]
  result?: { value: string; source: string }
  referral?: { status: string }
}
type Knowledge = {
  id: string
  title: string
  answer: string
  version: number
  status: string
  source: string
  department: string
  validUntil: string
  keywords: string[]
  review?: { note: string }
}
const labels: Record<string, string> = {
  pending_contact: '待联系',
  contacted: '已联系',
  interviewed: '已面谈',
  awaiting_result: '待正式结果',
  completed: '已完成',
  contact: '联系',
  interview: '面谈',
  remind: '重修提醒',
  referral: '转介请求',
  official_result: '教务结果',
  draft: '草稿',
  published: '已发布',
  withdrawn: '已撤回',
  superseded: '已替代',
  rejected: '已驳回',
}
function App() {
  const [user, setUser] = useState<any>(null),
    [account, setAccount] = useState('mentor'),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState<Case[]>([]),
    [selected, setSelected] = useState(''),
    [text, setText] = useState(''),
    [type, setType] = useState('contact'),
    [scheduledAt, setScheduledAt] = useState(''),
    [tab, setTab] = useState('cases'),
    [knowledge, setKnowledge] = useState<Knowledge[]>([])
  const [draft, setDraft] = useState({
      title: '',
      answer: '',
      keywords: '',
      source: '',
      department: '',
      validUntil: '',
      parentId: '',
    }),
    [note, setNote] = useState(''),
    [result, setResult] = useState('passed')
  const call = async (path: string, body?: unknown, method = 'POST') => {
    const response = await fetch('/api' + path, {
      method: body === undefined ? 'GET' : method,
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Bearer ' + (localStorage.getItem('b_portal_token') || ''),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('b_portal_token')
        setUser(null)
      }
      throw Error(data.message || '请求失败')
    }
    return data
  }
  const refresh = async () => {
    const data = await call('/b/cases')
    setItems(data.items)
  }
  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (localStorage.getItem('b_portal_token'))
      void run(async () => {
        const data = await call('/me')
        setUser(data.user)
        await refresh()
      })
  }, [])
  const current = items.find((c) => c.id === selected)
  const loadKb = async () => {
    setKnowledge((await call('/b/knowledge')).items)
  }
  return (
    <div className="portal mentor-purple">
      <aside>
        <div className="mentor-brand">
          <span>
            <GraduationCap size={25} />
          </span>
          <div>
            <strong>智汇中枢</strong>
            <small>导师工作台 · 学业陪伴</small>
          </div>
        </div>
        <div className="mentor-account">
          <span>{user?.name?.slice(-2) || '你好'}</span>
          <div>
            <strong>{user?.name || '欢迎来到工作台'}</strong>
            <small>
              {user
                ? (
                    {
                      mentor: '导师',
                      academic: '教务老师',
                      counselor: '辅导员',
                    } as Record<string, string>
                  )[user.role]
                : '每一步成长，都值得关注'}
            </small>
          </div>
        </div>
        {user && (
          <nav>
            <button
              aria-current={tab === 'cases' ? 'page' : undefined}
              onClick={() => {
                setTab('cases')
                void run(refresh)
              }}
            >
              <LayoutDashboard size={18} /> 学业跟进
            </button>
            {user.role === 'counselor' && (
              <button
                aria-current={tab === 'knowledge' ? 'page' : undefined}
                onClick={() => {
                  setTab('knowledge')
                  void run(loadKb)
                }}
              >
                <Library size={18} /> 知识审核与版本
              </button>
            )}
            <button
              onClick={() =>
                void run(async () => {
                  await call('/auth/logout', {})
                  localStorage.removeItem('b_portal_token')
                  setUser(null)
                  setTab('cases')
                  setItems([])
                  setKnowledge([])
                  setSelected('')
                })
              }
            >
              <LogOut size={18} /> 退出登录
            </button>
          </nav>
        )}
        <div className="mentor-sidebar-note">
          <ShieldCheck size={18} />
          <p>
            温和陪伴，认真跟进。
            <br />
            每一份记录，只对有权人员可见。
          </p>
        </div>
      </aside>
      <main>
        <header className="mentor-heading">
          <div>
            <span className="mentor-eyebrow">CAMPUS COMPANION</span>
            <h1>{tab === 'knowledge' ? '知识审核与版本' : '学业跟进'}</h1>
            <p>
              {user
                ? '把每一次联系，变成有回应的陪伴。'
                : '从这里，开启今天的学业陪伴。'}
            </p>
          </div>
          <span className="mentor-date">
            {new Intl.DateTimeFormat('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            }).format(new Date())}
          </span>
        </header>
        <div className="mentor-welcome">
          <div>
            <span className="mentor-welcome-label">
              <Sparkles size={15} /> 学业陪伴 · 协同有序
            </span>
            <h2>
              {tab === 'knowledge'
                ? '让每一份解答，都有据可循。'
                : '关注成长，也照顾每一步。'}
            </h2>
            <p>
              {tab === 'knowledge'
                ? '整理、审核与更新知识，让学生获得可靠的帮助。'
                : '联系、面谈与后续跟进，在这里清晰衔接。'}
            </p>
          </div>
          <span className="mentor-hero-icon">
            <BookOpen size={56} strokeWidth={1.25} />
          </span>
        </div>
        {user && tab === 'cases' && (
          <div className="mentor-stats">
            {[
              [
                '待联系',
                items.filter((c) => c.status === 'pending_contact').length,
              ],
              [
                '跟进中',
                items.filter(
                  (c) => !['pending_contact', 'completed'].includes(c.status),
                ).length,
              ],
              ['已完成', items.filter((c) => c.status === 'completed').length],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {value}
                  <small>项</small>
                </strong>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!user ? (
          <section className="mentor-login">
            <h2>欢迎回来</h2>
            <p>使用你的工作账号登录，查看授权范围内的学业任务。</p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  const data = await call('/auth/login', { account, password })
                  if (
                    !['mentor', 'academic', 'counselor'].includes(
                      data.user.role,
                    )
                  )
                    throw Error('该账号不是工作台身份')
                  localStorage.setItem('b_portal_token', data.token)
                  setUser(data.user)
                  setPassword('')
                  await refresh()
                })
              }}
            >
              <label>
                账号
                <input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  required
                />
              </label>
              <label>
                密码
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button disabled={busy}>登录</button>
            </form>
          </section>
        ) : tab === 'cases' ? (
          <>
            <section>
              <h2>授权任务 · {items.length}</h2>
              {!items.length && <p>暂无分配给你的任务。</p>}
              {items.map((c) => (
                <button
                  key={c.id}
                  className="case-row"
                  aria-pressed={selected === c.id}
                  onClick={() => {
                    setSelected(c.id)
                    setText('')
                    setType('contact')
                  }}
                >
                  <span className="mentor-student-avatar">
                    {c.studentName.slice(-2)}
                  </span>
                  <span className="mentor-case-copy">
                    <strong>{c.studentName}</strong>
                    <small>{c.course}</small>
                  </span>
                  <span className={`mentor-status ${c.status}`}>
                    {labels[c.status]}
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </section>
            {current && (
              <section>
                <h2>
                  {current.studentName} · {current.course}
                </h2>
                <p>
                  状态：{labels[current.status]} · 版本 {current.version}
                </p>
                {current.result && (
                  <p>
                    正式结果：
                    {current.result.value === 'passed' ? '通过' : '未通过'} ·
                    来源：{current.result.source}
                  </p>
                )}
                {current.referral && (
                  <p>协同支持请求已记录；专业评估及后续反馈须由人工承接。</p>
                )}
                <ul>
                  {current.records.map((r, i) => (
                    <li key={i}>
                      {labels[r.type] || r.type} ·{' '}
                      {new Date(r.at).toLocaleString()}
                      <p>{r.text || '仅共享办理状态，详细记录受权限限制'}</p>
                      {r.scheduledAt && (
                        <p>
                          下次联系：{new Date(r.scheduledAt).toLocaleString()}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {user.role === 'mentor' && current.status !== 'completed' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(async () => {
                        await call('/b/cases/' + current.id + '/events', {
                          type,
                          text,
                          scheduledAt: scheduledAt
                            ? new Date(scheduledAt).toISOString()
                            : undefined,
                          version: current.version,
                        })
                        setText('')
                        await refresh()
                      })
                    }}
                  >
                    <label>
                      办理动作
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                      >
                        {['contact', 'interview', 'remind', 'referral'].map(
                          (t) => (
                            <option key={t} value={t}>
                              {labels[t]}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      必要工作记录
                      <textarea
                        required
                        maxLength={2000}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                    <label>
                      下次联系时间（选填）
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                      />
                    </label>
                    <p>
                      不记录专业心理咨询详情；转介请求只向辅导员共享必要状态。
                    </p>
                    <button disabled={busy}>保存记录</button>
                  </form>
                )}
                {user.role === 'academic' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(async () => {
                        await call(
                          '/b/cases/' + current.id + '/result',
                          { result, source: text, version: current.version },
                          'PATCH',
                        )
                        setText('')
                        await refresh()
                      })
                    }}
                  >
                    <label>
                      正式结果
                      <select
                        value={result}
                        onChange={(e) => setResult(e.target.value)}
                      >
                        <option value="passed">通过</option>
                        <option value="failed">未通过</option>
                      </select>
                    </label>
                    <label>
                      教务结果来源
                      <input
                        required
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>回写正式结果</button>
                  </form>
                )}
              </section>
            )}
          </>
        ) : (
          <>
            <section>
              <h2>{draft.parentId ? '新修订版本' : '新增知识草稿'}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(async () => {
                    await call('/b/knowledge', {
                      ...draft,
                      keywords: draft.keywords
                        .split('、')
                        .map((x) => x.trim())
                        .filter(Boolean),
                      parentId: draft.parentId || undefined,
                    })
                    setDraft({
                      title: '',
                      answer: '',
                      keywords: '',
                      source: '',
                      department: '',
                      validUntil: '',
                      parentId: '',
                    })
                    await loadKb()
                  })
                }}
              >
                {(
                  [
                    'title',
                    'keywords',
                    'source',
                    'department',
                    'validUntil',
                  ] as const
                ).map((key, i) => (
                  <label key={key}>
                    {
                      [
                        '标题',
                        '关键词（用顿号分隔）',
                        '来源说明',
                        '责任部门',
                        '有效期',
                      ][i]
                    }
                    <input
                      required
                      type={key === 'validUntil' ? 'date' : 'text'}
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  经核对的标准答案
                  <textarea
                    required
                    value={draft.answer}
                    onChange={(e) =>
                      setDraft({ ...draft, answer: e.target.value })
                    }
                  />
                </label>
                <button disabled={busy}>保存草稿</button>
              </form>
            </section>
            <label>
              审核意见
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {knowledge.map((k) => (
              <section key={k.id}>
                <h2>
                  {k.title} · v{k.version}
                </h2>
                <p>
                  {labels[k.status]} · {k.department} · 有效至 {k.validUntil}
                </p>
                <p>{k.answer}</p>
                <p>来源：{k.source}</p>
                {k.review && <p>审核意见：{k.review.note}</p>}
                <button
                  disabled={busy}
                  onClick={() =>
                    setDraft({
                      title: k.title,
                      answer: k.answer,
                      keywords: k.keywords.join('、'),
                      source: k.source,
                      department: k.department,
                      validUntil: k.validUntil,
                      parentId: k.id,
                    })
                  }
                >
                  新建修订
                </button>
                {k.status === 'draft' &&
                  user.knowledgeReviewer &&
                  ['publish', 'reject'].map((action) => (
                    <button
                      key={action}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await call('/b/knowledge/' + k.id + '/review', {
                            action,
                            note,
                          })
                          await loadKb()
                        })
                      }
                    >
                      {action === 'publish' ? '审核发布' : '驳回'}
                    </button>
                  ))}
                {k.status === 'published' && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await call('/b/knowledge/' + k.id + '/withdraw', {})
                        await loadKb()
                      })
                    }
                  >
                    撤回
                  </button>
                )}
              </section>
            ))}
          </>
        )}
        <footer>
          AI仅辅助，学业结果以正式教务信息为准。转介请求不代表专业机构已受理。
        </footer>
      </main>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
