import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  logisticsApi,
  type LogisticsUser,
  type LogisticsWorkItem,
} from './logisticsApi'

const statusMeta: Record<
  LogisticsWorkItem['status'],
  { label: string; tone: string }
> = {
  sent: { label: '待接收', tone: 'pending' },
  accepted: { label: '处理中', tone: 'active' },
  resolved: { label: '已处理，待学生确认', tone: 'done' },
  completed: { label: '学生已确认', tone: 'done' },
  disputed: { label: '学生反馈未解决', tone: 'danger' },
  returned: { label: '已退回辅导员', tone: 'danger' },
}

export function LogisticsApp() {
  const [checking, setChecking] = useState(Boolean(logisticsApi.token()))
  const [user, setUser] = useState<LogisticsUser | null>(null)
  const [items, setItems] = useState<LogisticsWorkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionBusy, setActionBusy] = useState('')

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await logisticsApi.workOrders()
      setItems(result.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '事项加载失败。')
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
    if (user) void loadOrders()
  }, [user, loadOrders])

  useEffect(() => {
    const expire = () => {
      logisticsApi.clearToken()
      setUser(null)
      setItems([])
      setError('登录状态已失效，请重新登录。')
    }
    window.addEventListener('zhihui:auth-expired', expire)
    return () => window.removeEventListener('zhihui:auth-expired', expire)
  }, [])

  const groups = useMemo(() => {
    const result = new Map<string, LogisticsWorkItem[]>()
    for (const item of items) {
      const current = result.get(item.bundleId) || []
      current.push(item)
      result.set(item.bundleId, current)
    }
    return [...result.entries()]
  }, [items])

  async function logout() {
    await logisticsApi.logout()
    setUser(null)
    setItems([])
  }

  async function handleAction(
    item: LogisticsWorkItem,
    action: 'accept' | 'resolve' | 'return',
    result?: string,
  ) {
    const key = `${item.bundleId}:${item.ticketId}`
    setActionBusy(key)
    setError('')
    setNotice('')
    try {
      await logisticsApi.act(
        item.bundleId,
        item.ticketId,
        action === 'accept'
          ? { action }
          : { action, result: result || '' },
      )
      await loadOrders()
      setNotice(
        action === 'accept'
          ? '事项已接收，可以开始办理。'
          : action === 'return' ? '事项已退回辅导员核对。' : '处理结果已提交，等待学生确认。',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '事项操作失败。')
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
          <button className="active">
            <span>01</span>
            问题包办理
          </button>
          <button disabled>
            <span>02</span>
            历史记录
            <small>后续开放</small>
          </button>
        </nav>
        <div className="account">
          <strong>{user.name}</strong>
          <small>{user.title || user.department || '后勤保障处'}</small>
          <button onClick={() => void logout()}>退出登录</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="page-header">
          <div>
            <p>按分派范围受理 · 保留逐项记录</p>
            <h1>后勤事项办理</h1>
          </div>
          <button className="refresh" onClick={() => void loadOrders()} disabled={loading}>
            {loading ? '刷新中…' : '刷新事项'}
          </button>
        </header>

        <section className="summary" aria-label="事项统计">
          <div>
            <small>问题包</small>
            <strong>{groups.length}</strong>
          </div>
          <div>
            <small>待接收</small>
            <strong>{items.filter((item) => item.status === 'sent').length}</strong>
          </div>
          <div>
            <small>处理中</small>
            <strong>{items.filter((item) => item.status === 'accepted').length}</strong>
          </div>
          <div>
            <small>已处理</small>
            <strong>{items.filter((item) => item.status === 'resolved').length}</strong>
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => void loadOrders()}>重试</button>
          </div>
        )}
        {notice && (
          <div className="notice-banner" role="status">
            {notice}
          </div>
        )}

        {loading && !groups.length ? (
          <section className="loading-card" role="status">正在加载后勤事项…</section>
        ) : groups.length ? (
          <div className="bundle-list">
            {groups.map(([bundleId, bundleItems], index) => (
              <BundleCard
                key={bundleId}
                bundleId={bundleId}
                items={bundleItems}
                number={index + 1}
                actionBusy={actionBusy}
                onAction={handleAction}
              />
            ))}
          </div>
        ) : (
          <section className="empty-card">
            <span>✓</span>
            <h2>当前没有待办事项</h2>
            <p>辅导员转交新的问题包后，会在这里按包展示。</p>
          </section>
        )}
      </main>
    </div>
  )
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
        <h1>让每一项诉求<br />都有明确回执。</h1>
        <p>仅接收辅导员确认并转交给本账号的问题包。成绩、面谈记录和内部备注不会出现在后勤端。</p>
        <div className="scope-note">
          <span>权限边界</span>
          <strong>只读已分派事项</strong>
          <small>不支持跨部门查看或整包代办</small>
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
          {busy ? '正在登录…' : '进入后勤工作台'}
        </button>
        <p className="demo-hint">演示账号：logistics / 123456</p>
      </form>
    </main>
  )
}

function BundleCard({
  bundleId,
  items,
  number,
  actionBusy,
  onAction,
}: {
  bundleId: string
  items: LogisticsWorkItem[]
  number: number
  actionBusy: string
  onAction: (
    item: LogisticsWorkItem,
    action: 'accept' | 'resolve' | 'return',
    result?: string,
  ) => void
}) {
  return (
    <article className="bundle-card">
      <header>
        <div>
          <span>问题包 {String(number).padStart(2, '0')}</span>
          <h2>后勤事项逐项办理</h2>
          <small>编号 {bundleId.slice(0, 8)}</small>
        </div>
        <div className="bundle-count">
          <strong>{items.length}</strong>
          <span>项事项</span>
        </div>
      </header>
      <div className="item-list">
        {items.map((item) => (
          <WorkItemCard
            key={item.ticketId}
            item={item}
            busy={actionBusy === `${item.bundleId}:${item.ticketId}`}
            onAction={onAction}
          />
        ))}
      </div>
    </article>
  )
}

function WorkItemCard({
  item,
  busy,
  onAction,
}: {
  item: LogisticsWorkItem
  busy: boolean
  onAction: (
    item: LogisticsWorkItem,
    action: 'accept' | 'resolve' | 'return',
    result?: string,
  ) => void
}) {
  const meta = statusMeta[item.status] || statusMeta.sent
  const [result, setResult] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const latestResult = [...item.history]
    .reverse()
    .find((entry) => entry.action === 'resolve')?.result

  function resolve(event: FormEvent) {
    event.preventDefault()
    const text = result.trim()
    if (!text) return
    onAction(item, 'resolve', text)
  }

  return (
    <section className="work-item">
      <div className="item-topline">
        <span className={`status-pill ${meta.tone}`}>{meta.label}</span>
        <small>{item.ticketId}</small>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <dl>
        <div>
          <dt>地点</dt>
          <dd>{item.location || '未填写'}</dd>
        </div>
        <div>
          <dt>经办状态</dt>
          <dd>{meta.label}</dd>
        </div>
      </dl>
      {latestResult && (
        <div className="result-record">
          <strong>最近处理结果</strong>
          <p>{latestResult}</p>
        </div>
      )}
      {item.status === 'sent' && (
        <div className="item-actions">
          <button
            className="action-primary"
            disabled={busy}
            onClick={() => onAction(item, 'accept')}
          >
            {busy ? '正在接收…' : '接收此事项'}
          </button>
        </div>
      )}
      {item.status === 'accepted' && (
        <form className="resolve-form" onSubmit={resolve}>
          <label htmlFor={`result-${item.ticketId}`}>处理结果</label>
          <textarea
            id={`result-${item.ticketId}`}
            value={result}
            maxLength={1000}
            placeholder="记录现场核查、维修措施和复测结果"
            onChange={(event) => setResult(event.target.value)}
            disabled={busy}
          />
          <div>
            <small>{result.length}/1000</small>
            <button
              className="action-primary"
              disabled={busy || !result.trim()}
            >
              {busy ? '正在提交…' : '提交处理结果'}
            </button>
          </div>
        </form>
      )}
      {item.status === 'disputed' && (
        <p className="disputed-note">学生反馈尚未解决，等待辅导员重新转交。</p>
      )}
      {['sent', 'accepted'].includes(item.status) && (
        <div className="resolve-form">
          <label htmlFor={`return-${item.ticketId}`}>退回原因</label>
          <textarea id={`return-${item.ticketId}`} value={returnReason} maxLength={1000} disabled={busy} onChange={(event) => setReturnReason(event.target.value)} />
          <button type="button" disabled={busy || !returnReason.trim()} onClick={() => onAction(item, 'return', returnReason.trim())}>退回辅导员</button>
        </div>
      )}
      {item.status === 'returned' && <p className="disputed-note">已退回，等待辅导员核对。</p>}
    </section>
  )
}
