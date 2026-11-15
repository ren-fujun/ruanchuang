import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Flame, Inbox, Search, ShieldAlert, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useApi } from '../../lib/useApi'
import type { Ticket } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import { TicketCard } from '../../components/TicketCard'
import { EmptyState, SkeletonPage } from '../../components/ui'

const filters = [
  { key: 'all', label: '全部' },
  { key: 'pending_review', label: '待审核' },
  { key: 'processing', label: '处理中' },
  { key: 'awaiting_confirm', label: '待确认' },
  { key: 'completed', label: '已办结' },
]

const statusQuery: Record<string, string> = {
  all: 'all',
  pending_review: 'pending_review',
  processing: 'assigned,processing',
  awaiting_confirm: 'awaiting_confirm',
  completed: 'completed',
}

export function CounselorTickets() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = searchParams.get('status') || 'all'
  const initialRisk = searchParams.get('risk') || 'all'
  const [status, setStatus] = useState(filters.some((item) => item.key === initialStatus) ? initialStatus : 'all')
  const [risk, setRisk] = useState(initialRisk)
  const [overdue, setOverdue] = useState(searchParams.get('overdue') === 'true')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [draftQuery, setDraftQuery] = useState(searchParams.get('q') || '')
  const [searchOpen, setSearchOpen] = useState(searchParams.has('q') || searchParams.has('search'))

  const params = new URLSearchParams()
  params.set('status', statusQuery[status])
  if (risk !== 'all') params.set('risk', risk)
  if (overdue) params.set('overdue', 'true')
  if (query) params.set('q', query)
  const { data, loading, error, reload } = useApi<{ tickets: Ticket[]; counts: Record<string, number> }>(
    `/tickets?${params.toString()}`,
  )

  useEffect(() => {
    const nextStatus = searchParams.get('status')
    const nextRisk = searchParams.get('risk')
    const nextOverdue = searchParams.get('overdue') === 'true'
    setStatus(filters.some((item) => item.key === nextStatus) ? nextStatus! : 'all')
    setRisk(nextRisk || 'all')
    setOverdue(nextOverdue)
    const nextQuery = searchParams.get('q') || ''
    setQuery(nextQuery)
    setDraftQuery(nextQuery)
    if (nextQuery || searchParams.has('search')) setSearchOpen(true)
  }, [searchParams])

  const syncParams = (next: { status?: string; risk?: string; overdue?: boolean; query?: string }) => {
    const nextParams = new URLSearchParams()
    const nextStatus = next.status ?? status
    const nextRisk = next.risk ?? risk
    const nextOverdue = next.overdue ?? overdue
    if (nextStatus !== 'all') nextParams.set('status', nextStatus)
    if (nextRisk !== 'all') nextParams.set('risk', nextRisk)
    if (nextOverdue) nextParams.set('overdue', 'true')
    if (next.query ?? query) nextParams.set('q', next.query ?? query)
    setSearchParams(nextParams, { replace: true })
  }

  const changeStatus = (next: string) => {
    setStatus(next)
    syncParams({ status: next })
  }

  const changeRisk = (next: string) => {
    const value = risk === next ? 'all' : next
    setRisk(value)
    syncParams({ risk: value })
  }

  const toggleOverdue = () => {
    setOverdue((current) => {
      syncParams({ overdue: !current })
      return !current
    })
  }

  const submitSearch = () => {
    setQuery(draftQuery.trim())
    syncParams({ query: draftQuery.trim() })
  }

  const counts = data?.counts
  const tickets = data?.tickets || []

  return (
    <div className="page counselor-tickets-page">
      <PageHeader
        eyebrow="OPERATIONS DESK"
        title="工单台"
        right={
          <button className={`icon-button ${searchOpen ? 'dark' : ''}`} onClick={() => setSearchOpen((value) => !value)} aria-label="搜索">
            {searchOpen ? <X size={19} /> : <Search size={19} />}
          </button>
        }
      />

      <section className="ops-summary">
        <div>
          <span className="eyebrow">TOTAL</span>
          <strong>{String(counts?.all ?? '—').padStart(2, '0')}</strong>
          <small>全部工单</small>
        </div>
        <div>
          <span className="eyebrow">TO REVIEW</span>
          <strong>{String(counts?.pending_review ?? '—').padStart(2, '0')}</strong>
          <small>等待审核</small>
        </div>
        <div>
          <span className="eyebrow">ACTIVE</span>
          <strong>{String(counts?.active ?? '—').padStart(2, '0')}</strong>
          <small>协同在办</small>
        </div>
        <span className="ops-summary-mark"><SlidersHorizontal size={17} /></span>
      </section>

      {searchOpen && (
        <div className="ticket-search enter-down">
          <Search size={17} />
          <input
            autoFocus
            aria-label="搜索工单、学生、类型或编号"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitSearch()
            }}
            placeholder="搜索工单、学生、类型或编号"
          />
          <button onClick={submitSearch}>搜索</button>
        </div>
      )}

      <div className="filter-bar">
        {filters.map((item) => (
          <button key={item.key} className={status === item.key ? 'active' : ''} onClick={() => changeStatus(item.key)}>
            {item.label}
            {item.key === 'pending_review' && (counts?.pending_review || 0) > 0 && <i>{counts?.pending_review}</i>}
          </button>
        ))}
      </div>

      <div className="risk-filter-row">
        <button className={`risk-filter high ${risk === 'high' ? 'active' : ''}`} onClick={() => changeRisk('high')}>
          <ShieldAlert size={13} />
          高风险
        </button>
        <button className={`risk-filter overdue ${overdue ? 'active' : ''}`} onClick={toggleOverdue}>
          <Flame size={13} />
          已超时
        </button>
        <button className={`risk-filter medium ${risk === 'medium' ? 'active' : ''}`} onClick={() => changeRisk('medium')}>
          需关注
        </button>
        {(risk !== 'all' || overdue || query) && (
          <button
            className="risk-filter clear"
            onClick={() => {
              setRisk('all')
              setOverdue(false)
              setQuery('')
              setDraftQuery('')
              setSearchParams({}, { replace: true })
            }}
          >
            <X size={12} />
            清除
          </button>
        )}
      </div>

      {query && (
        <div className="search-result-label">
          <Search size={12} />“{query}”的搜索结果 · {tickets.length} 条
        </div>
      )}

      <div className="tickets-list counselor-ticket-list">
        {loading && !data ? (
          <SkeletonPage />
        ) : error && !data ? (
          <EmptyState title="工单加载失败" body={error} action={<button className="primary-button small" onClick={reload}>重新加载</button>} />
        ) : tickets.length ? (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              showStudent
              onClick={() => navigate(`/counselor/tickets/${ticket.id}`)}
            />
          ))
        ) : (
          <EmptyState
            icon={<Inbox size={24} />}
            title="没有匹配的工单"
            body="换一个筛选条件，或者清空搜索再看看。"
            action={
              <button className="secondary-button small" onClick={() => { setRisk('all'); setOverdue(false); setQuery(''); setDraftQuery(''); setSearchParams({}, { replace: true }) }}>
                清空筛选
              </button>
            }
          />
        )}
      </div>

      <div className="ops-ai-note">
        <span><Sparkles size={15} /></span>
        <p><strong>办理提示</strong> 优先核实高风险诉求，跟进超时工单的办理进展。</p>
      </div>
    </div>
  )
}
