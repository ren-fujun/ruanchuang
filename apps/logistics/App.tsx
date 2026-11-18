import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { TrialPasswordGate } from '../../src/components/TrialPasswordGate'
import {
  logisticsApi,
  type LogisticsUser,
  type Repair,
  type RepairStatus,
} from './logisticsApi'

const statusMeta: Record<RepairStatus, { label: string; tone: string }> = {
  pending_assignment: { label: '待后勤分配', tone: 'pending' },
  processing: { label: '处理中', tone: 'active' },
  awaiting_feedback: { label: '待学生反馈', tone: 'waiting' },
  objection_pending_response: { label: '异议待回应', tone: 'danger' },
  pending_coordination: { label: '待辅导员协调', tone: 'coordination' },
  satisfied: { label: '已修复并确认', tone: 'done' },
  coordinated_closed: { label: '协调结案', tone: 'closed' },
}

type QueueFilter = 'open' | 'pending_assignment' | 'objections' | 'closed'

export function LogisticsApp() {
  const [checking, setChecking] = useState(Boolean(logisticsApi.token()))
  const [user, setUser] = useState<LogisticsUser | null>(null)
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [filter, setFilter] = useState<QueueFilter>('open')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionBusy, setActionBusy] = useState('')

  const loadRepairs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await logisticsApi.repairs()
      setRepairs(result.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '报修事项加载失败。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!logisticsApi.token()) {
      setChecking(false)
      return () => {
        active = false
      }
    }
    logisticsApi
      .me()
      .then((current) => {
        if (active) setUser(current)
      })
      .catch((cause) => {
        if (active) {
          logisticsApi.clearToken()
          setError(cause instanceof Error ? cause.message : '登录状态已失效。')
        }
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (user && !user.mustChangePassword) void loadRepairs()
  }, [user, loadRepairs])

  useEffect(() => {
    const expire = () => {
      logisticsApi.clearToken()
      setUser(null)
      setRepairs([])
      setError('登录状态已失效，请重新登录。')
    }
    window.addEventListener('zhihui:auth-expired', expire)
    return () => window.removeEventListener('zhihui:auth-expired', expire)
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'pending_assignment') {
      return repairs.filter((repair) => repair.status === 'pending_assignment')
    }
    if (filter === 'objections') {
      return repairs.filter((repair) =>
        ['objection_pending_response', 'pending_coordination'].includes(repair.status),
      )
    }
    if (filter === 'closed') return repairs.filter((repair) => repair.terminal)
    return repairs.filter((repair) => !repair.terminal)
  }, [filter, repairs])

  async function logout() {
    await logisticsApi.logout()
    setUser(null)
    setRepairs([])
  }

  async function runAction(
    repair: Repair,
    action: () => Promise<unknown>,
    message: string,
  ) {
    setActionBusy(repair.id)
    setError('')
    setNotice('')
    try {
      await action()
      await loadRepairs()
      setNotice(message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '报修操作失败。')
    } finally {
      setActionBusy('')
    }
  }

  if (checking) {
    return (
      <main className="logistics-center">
        <section className="loading-card" role="status">
          正在验证后勤身份…
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <LoginScreen
        initialError={error}
        onLogin={(nextUser) => {
          setError('')
          setUser(nextUser)
        }}
      />
    )
  }

  if (user.mustChangePassword) return <TrialPasswordGate tokenKey="zhihui_token" />

  return (
    <div className="workbench">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">智</span>
          <div>
            <strong>智汇中枢</strong>
            <small>后勤工作台</small>
          </div>
        </div>
        <nav>
          <button
            className={filter === 'open' ? 'active' : ''}
            onClick={() => setFilter('open')}
          >
            <span>01</span>
            直达报修
          </button>
          <button
            className={filter === 'objections' ? 'active' : ''}
            onClick={() => setFilter('objections')}
          >
            <span>02</span>
            异议与监督
          </button>
          <button
            className={filter === 'closed' ? 'active' : ''}
            onClick={() => setFilter('closed')}
          >
            <span>03</span>
            已结束记录
          </button>
        </nav>
        <div className="account">
          <strong>{user.name}</strong>
          <small>{user.title || user.department || '后勤保障处'}</small>
          <small>责任范围：{(user.repairScopes || []).join('、') || '未配置'}</small>
          <button onClick={() => void logout()}>退出登录</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="page-header">
          <div>
            <p>学生直达 · 一次处置 · 异议可追溯</p>
            <h1>后勤维修工作台</h1>
          </div>
          <button
            className="refresh"
            onClick={() => void loadRepairs()}
            disabled={loading}
          >
            {loading ? '刷新中…' : '刷新报修'}
          </button>
        </header>

        <section className="summary" aria-label="报修统计">
          <button onClick={() => setFilter('pending_assignment')}>
            <small>待领取</small>
            <strong>
              {repairs.filter((repair) => repair.status === 'pending_assignment').length}
            </strong>
          </button>
          <button onClick={() => setFilter('open')}>
            <small>处理中</small>
            <strong>
              {repairs.filter((repair) => repair.status === 'processing').length}
            </strong>
          </button>
          <button onClick={() => setFilter('objections')}>
            <small>异议处理</small>
            <strong>
              {
                repairs.filter((repair) =>
                  ['objection_pending_response', 'pending_coordination'].includes(
                    repair.status,
                  ),
                ).length
              }
            </strong>
          </button>
          <button onClick={() => setFilter('closed')}>
            <small>已结束</small>
            <strong>{repairs.filter((repair) => repair.terminal).length}</strong>
          </button>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => void loadRepairs()}>重试</button>
          </div>
        )}
        {notice && (
          <div className="notice-banner" role="status">
            {notice}
          </div>
        )}

        <div className="queue-heading">
          <div>
            <h2>{queueTitle(filter)}</h2>
            <p>只显示当前账号责任范围内且未被他人领取的报修。</p>
          </div>
          <span>{filtered.length} 项</span>
        </div>

        {loading && !repairs.length ? (
          <section className="loading-card" role="status">正在加载报修事项…</section>
        ) : filtered.length ? (
          <div className="bundle-list">
            {filtered.map((repair) => (
              <RepairCard
                key={repair.id}
                repair={repair}
                busy={actionBusy === repair.id}
                onClaim={() =>
                  void runAction(
                    repair,
                    () => logisticsApi.claim(repair),
                    '报修已领取，可以开始处理。',
                  )
                }
                onSubmitResult={(result) =>
                  void runAction(
                    repair,
                    () => logisticsApi.submitResult(repair, result),
                    '处理结果已提交，等待学生反馈。',
                  )
                }
                onRespond={(response) =>
                  void runAction(
                    repair,
                    () => logisticsApi.respond(repair, response),
                    '异议说明已提交，等待辅导员协调。',
                  )
                }
              />
            ))}
          </div>
        ) : (
          <section className="empty-card">
            <span>✓</span>
            <h2>{emptyTitle(filter)}</h2>
            <p>学生直接提交报修后，事项会进入责任范围内的后勤队列。</p>
          </section>
        )}
      </main>
    </div>
  )
}

function queueTitle(filter: QueueFilter) {
  return {
    open: '当前待办',
    pending_assignment: '待领取报修',
    objections: '异议与监督',
    closed: '已结束记录',
  }[filter]
}

function emptyTitle(filter: QueueFilter) {
  return {
    open: '当前没有待办报修',
    pending_assignment: '没有待领取报修',
    objections: '没有待处理异议',
    closed: '还没有结束记录',
  }[filter]
}

function LoginScreen({
  initialError,
  onLogin,
}: {
  initialError: string
  onLogin: (user: LogisticsUser) => void
}) {
  const [account, setAccount] = useState('logistics')
  const [password, setPassword] = useState('123456')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onLogin(await logisticsApi.login(account.trim(), password))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请检查账号密码。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <p className="eyebrow">ZHIHUI HUB · LOGISTICS</p>
        <h1>报修直达。<br />异议有终点。</h1>
        <p>学生直接提交报修，后勤按责任范围领取并提交一次处置结果。异议由后勤书面回应，再由辅导员核对双方记录后协调结案。</p>
        <div className="scope-note">
          <span>本轮边界</span>
          <strong>一次维修 · 一次异议</strong>
          <small>协调结案不代表设备已修复，也不会自动重开原单</small>
        </div>
      </section>

      <form className="login-card" onSubmit={submit}>
        <div>
          <span className="portal-label">后勤端</span>
          <h2>维修调度登录</h2>
          <p>使用后勤演示账号进入工作台。</p>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <label>
          账号
          <input
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button className="primary-button" disabled={busy}>
          {busy ? '正在登录…' : '进入后勤维修台'}
        </button>
        <p className="demo-hint">演示账号：logistics / 123456</p>
      </form>
    </main>
  )
}

function RepairCard({
  repair,
  busy,
  onClaim,
  onSubmitResult,
  onRespond,
}: {
  repair: Repair
  busy: boolean
  onClaim: () => void
  onSubmitResult: (result: string) => void
  onRespond: (response: string) => void
}) {
  const [result, setResult] = useState('')
  const [response, setResponse] = useState('')
  const meta = statusMeta[repair.status] || statusMeta.pending_assignment

  function submitResult(event: FormEvent) {
    event.preventDefault()
    if (result.trim()) onSubmitResult(result.trim())
  }

  function submitResponse(event: FormEvent) {
    event.preventDefault()
    if (response.trim()) onRespond(response.trim())
  }

  return (
    <article className={`repair-card ${repair.terminal ? 'terminal' : ''}`}>
      <header>
        <div>
          <span className={`status-pill ${meta.tone}`}>{meta.label}</span>
          <small>{repair.id}</small>
        </div>
        <span className="repair-type">{repair.repairType}</span>
      </header>
      <div className="repair-body">
        <h3>{repair.location}</h3>
        <p>{repair.description}</p>
        <dl>
          <div>
            <dt>校区</dt>
            <dd>{repair.campus}</dd>
          </div>
          <div>
            <dt>提交时间</dt>
            <dd>{formatTime(repair.createdAt)}</dd>
          </div>
          <div>
            <dt>领取人</dt>
            <dd>{repair.claimantName || '待后勤分配'}</dd>
          </div>
        </dl>

        {repair.result && (
          <RecordBlock title="后勤处置结果" text={repair.result.text} tone="result" />
        )}
        {repair.feedback?.decision === 'objection' && (
          <RecordBlock title="学生异议" text={repair.feedback.reason} tone="objection" />
        )}
        {repair.feedback?.decision === 'satisfied' && (
          <RecordBlock title="学生反馈" text="学生已确认维修结果。" tone="result" />
        )}
        {repair.response && (
          <RecordBlock title="后勤补充说明" text={repair.response.text} tone="response" />
        )}
        {repair.coordination && (
          <RecordBlock
            title="辅导员协调结案"
            text={`${repair.coordination.conclusion}\n后续：${repair.coordination.followUp}；负责人：${repair.coordination.owner}`}
            tone="coordinate"
          />
        )}
        {repair.responseDueAt && !repair.response && (
          <p className="deadline-note">
            后勤回应期限：{formatTime(repair.responseDueAt)}
            {repair.responseOverdue ? ' · 已到期，辅导员可直接协调' : ''}
          </p>
        )}

        {repair.status === 'pending_assignment' && (
          <button className="action-primary" disabled={busy} onClick={onClaim}>
            {busy ? '正在领取…' : '领取此报修'}
          </button>
        )}

        {repair.status === 'processing' && (
          <form className="resolve-form" onSubmit={submitResult}>
            <label htmlFor={`result-${repair.id}`}>本次处置结果</label>
            <textarea
              id={`result-${repair.id}`}
              value={result}
              maxLength={1000}
              placeholder="记录核查、维修措施和复测结果；原单只提交一次"
              onChange={(event) => setResult(event.target.value)}
              disabled={busy}
            />
            <div>
              <small>{result.length}/1000</small>
              <button className="action-primary" disabled={busy || !result.trim()}>
                {busy ? '正在提交…' : '提交本次结果'}
              </button>
            </div>
          </form>
        )}

        {repair.status === 'objection_pending_response' && (
          <form className="resolve-form objection-form" onSubmit={submitResponse}>
            <label htmlFor={`response-${repair.id}`}>异议书面说明</label>
            <textarea
              id={`response-${repair.id}`}
              value={response}
              maxLength={1000}
              placeholder="客观说明现场事实、范围限制或双方理解差异"
              onChange={(event) => setResponse(event.target.value)}
              disabled={busy}
            />
            <div>
              <small>回应一次后进入辅导员协调</small>
              <button className="action-primary" disabled={busy || !response.trim()}>
                {busy ? '正在提交…' : '提交异议说明'}
              </button>
            </div>
          </form>
        )}

        {repair.status === 'awaiting_feedback' && (
          <p className="waiting-note">等待学生确认。原单只允许一次反馈，不能再次提交处置结果。</p>
        )}
        {repair.status === 'pending_coordination' && (
          <p className="waiting-note">双方记录已齐备，等待辅导员协调结案。</p>
        )}
        {repair.terminal && (
          <p className="terminal-note">该报修已进入终态，后勤不能再修改结果或发起返工。</p>
        )}
      </div>
    </article>
  )
}

function RecordBlock({
  title,
  text,
  tone,
}: {
  title: string
  text: string
  tone: string
}) {
  return (
    <div className={`repair-record ${tone}`}>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
