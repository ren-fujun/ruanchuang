import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import { contractApi } from '../lib/contractApi'
import type { TicketListData } from '../lib/contractApi'
import { ApiError } from '../lib/http'
import type { Ticket } from '../types'
import { BrandMark, DeptStack, RiskBadge, SlaCountdown, StatusPill } from '../components/ui'

type FilterKey = 'all' | 'active' | 'completed'
type HealthState = 'checking' | 'ok' | 'fail'

const filters: { key: FilterKey; label: string; status: string }[] = [
  { key: 'all', label: '全部', status: 'all' },
  { key: 'active', label: '进行中', status: 'pending_review,assigned,processing,awaiting_confirm' },
  { key: 'completed', label: '已办结', status: 'completed' },
]

export function ContractTicketsDemo() {
  const navigate = useNavigate()
  const mockEnabled = import.meta.env.VITE_USE_MOCK === 'true'
  const [filter, setFilter] = useState<FilterKey>('all')
  const [data, setData] = useState<TicketListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [healthKey, setHealthKey] = useState(0)
  const [health, setHealth] = useState<HealthState>('checking')
  const [healthError, setHealthError] = useState('')

  const selectedFilter = filters.find((item) => item.key === filter) || filters[0]
  const endpoint = useMemo(
    () => `/api/tickets?status=${selectedFilter.status}&page=1&pageSize=20`,
    [selectedFilter.status],
  )

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setData(null)
    contractApi
      .tickets({ status: selectedFilter.status, page: 1, pageSize: 20 }, mockEnabled)
      .then((result) => {
        if (alive) setData(result)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof ApiError ? err : new ApiError('列表加载失败', 50001, 0))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selectedFilter.status, reloadKey, mockEnabled])

  useEffect(() => {
    let alive = true
    setHealth('checking')
    setHealthError('')
    contractApi
      .health(mockEnabled)
      .then(() => {
        if (alive) setHealth('ok')
      })
      .catch((err: unknown) => {
        if (alive) {
          setHealth('fail')
          setHealthError(err instanceof ApiError ? `${err.code} · ${err.message}` : 'health 未通过')
        }
      })
    return () => {
      alive = false
    }
  }, [mockEnabled, healthKey])

  return (
    <div className="contract-demo">
      <div className="contract-demo-shell">
        <header className="contract-demo-head">
          <div className="contract-demo-brand">
            <BrandMark size={38} tone="dark" />
            <div>
              <strong>契约联调示例</strong>
              <span>学生工单列表 · v1</span>
            </div>
          </div>
          <button className="contract-demo-back" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={18} />
          </button>
        </header>

        <main className="contract-demo-body">
          <section className="contract-demo-intro">
            <div className="contract-demo-mode-row">
              <span className={`contract-mode-badge ${mockEnabled ? 'mock' : 'real'}`}>
                {mockEnabled ? 'MOCK' : 'REAL'}
              </span>
              <span className="contract-demo-endpoint"><code>GET {endpoint}</code></span>
            </div>
            <h1>我的诉求</h1>
            <p>
              {mockEnabled
                ? '当前由 MSW 拦截带 X-Contract-Demo 标记的请求，返回接口合同中的 envelope。'
                : '当前请求真实后端。需要已登录，并且后端已返回 {code,msg,data}。'}
            </p>
          </section>

          <section className={`contract-health ${health}`}>
            <span className="contract-health-icon">
              {health === 'checking' ? (
                <LoaderCircle size={16} className="spin" />
              ) : health === 'ok' ? (
                <CheckCircle2 size={16} />
              ) : (
                <WifiOff size={16} />
              )}
            </span>
            <div>
              <strong>
                {health === 'checking'
                  ? '正在检查 /api/health'
                  : health === 'ok'
                    ? 'health 已通过'
                    : 'health 未通过'}
              </strong>
              <span>
                {health === 'checking'
                  ? 'GET /api/health'
                  : health === 'ok'
                    ? 'HTTP 200 · code=0 · data.ok=true'
                    : healthError}
              </span>
            </div>
            <button onClick={() => setHealthKey((value) => value + 1)} aria-label="重新检查 health">
              <RefreshCw size={14} />
            </button>
          </section>

          <div className="filter-bar contract-filter-bar">
            {filters.map((item) => (
              <button
                key={item.key}
                className={filter === item.key ? 'active' : ''}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
            <button className="contract-refresh" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw size={13} />
              刷新
            </button>
          </div>

          <div className="contract-list-meta">
            <span>
              {loading ? '正在加载…' : `${data?.total ?? 0} 条工单`}
            </span>
            {data && <span>{data.pageSize} 条 / 页 · 第 {data.page} 页</span>}
          </div>

          {loading && !data ? (
            <div className="contract-skeleton-list">
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card short" />
            </div>
          ) : error ? (
            <section className="contract-error">
              <span className="contract-error-icon"><ShieldAlert size={20} /></span>
              <div>
                <strong>{error.code === 40101 ? '需要登录' : '列表加载失败'}</strong>
                <p>{error.message}</p>
                <code>{error.code} / HTTP {error.status}</code>
              </div>
              {error.code === 40101 && (
                <button className="primary-button small" onClick={() => navigate('/login')}>
                  去登录
                  <ChevronRight size={14} />
                </button>
              )}
            </section>
          ) : data && data.tickets.length === 0 ? (
            <section className="contract-empty">
              <Sparkles size={22} />
              <strong>这一栏暂时为空</strong>
              <p>切换筛选，或点刷新重新请求。</p>
            </section>
          ) : (
            <div className="contract-ticket-list">
              {data?.tickets.map((ticket) => (
                <TicketDemoCard ticket={ticket} key={ticket.id} />
              ))}
            </div>
          )}

          <section className="contract-code-note">
            <span><WifiOff size={13} />真实模式提示</span>
            <p>
              关闭 Mock 后，此页会直接请求 <code>/api/tickets</code>。如果 health 未通过，先按合同完成后端 envelope，
              再回到这里验证。
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}

function TicketDemoCard({ ticket }: { ticket: Ticket }) {
  return (
    <article className="contract-ticket">
      <div className="contract-ticket-top">
        <span className="contract-ticket-category">{ticket.category}</span>
        <StatusPill status={ticket.status} label={ticket.statusLabel} />
      </div>
      <h2>{ticket.title}</h2>
      <div className="contract-ticket-meta">
        <span>{ticket.studentName} · {ticket.location}</span>
        <RiskBadge risk={ticket.risk} />
      </div>
      <div className="contract-ticket-foot">
        <div>
          <DeptStack departments={ticket.departments} />
          <span>{ticket.departments.map((item) => item.short).join(' · ') || '等待分派'}</span>
        </div>
        <SlaCountdown ticket={ticket} compact />
      </div>
    </article>
  )
}
