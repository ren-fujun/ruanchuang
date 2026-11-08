import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { useApi } from '../../lib/useApi'
import type { Ticket } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import { TicketCard } from '../../components/TicketCard'
import { EmptyState, SkeletonPage } from '../../components/ui'

const filters = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'awaiting_confirm', label: '待确认' },
  { key: 'completed', label: '已办结' },
]

const statusQuery: Record<string, string> = {
  all: 'all',
  active: 'pending_review,assigned,processing,awaiting_confirm',
  awaiting_confirm: 'awaiting_confirm',
  completed: 'completed',
}

export function StudentTickets() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = searchParams.get('filter') || 'active'
  const [filter, setFilter] = useState(filters.some((item) => item.key === initial) ? initial : 'active')
  const { data, loading, error, reload } = useApi<{ tickets: Ticket[]; counts: Record<string, number> }>(
    `/tickets?status=${statusQuery[filter]}`,
  )

  useEffect(() => {
    const next = searchParams.get('filter')
    if (next && filters.some((item) => item.key === next) && next !== filter) setFilter(next)
  }, [searchParams])

  const changeFilter = (next: string) => {
    setFilter(next)
    setSearchParams(next === 'active' ? {} : { filter: next }, { replace: true })
  }

  const counts = data?.counts
  const tickets = data?.tickets || []

  return (
    <div className="page tickets-page student-tickets-page">
      <PageHeader title="我的诉求" />

      <div className="tickets-summary-line">
        <strong>{counts?.all ?? '—'}</strong>
        <span>条诉求</span>
        <i />
        <span>{counts?.active ?? 0} 条正在推进</span>
        <i />
        <span>{counts?.completed ?? 0} 条已收尾</span>
      </div>

      <div className="filter-bar">
        {filters.map((item) => (
          <button
            key={item.key}
            className={filter === item.key ? 'active' : ''}
            onClick={() => changeFilter(item.key)}
          >
            {item.label}
            {item.key === 'awaiting_confirm' && (counts?.awaiting_confirm || 0) > 0 && (
              <i>{counts?.awaiting_confirm}</i>
            )}
          </button>
        ))}
      </div>

      <div className="tickets-list">
        {loading && !data ? (
          <SkeletonPage />
        ) : error && !data ? (
          <EmptyState
            title="列表加载失败"
            body={error}
            action={<button className="primary-button small" onClick={reload}>重新加载</button>}
          />
        ) : tickets.length ? (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => navigate(`/student/tickets/${ticket.id}`)}
            />
          ))
        ) : (
          <EmptyState
            icon={<ClipboardList size={24} />}
            title={filter === 'completed' ? '还没有办结的诉求' : '这一栏暂时是空的'}
            body={filter === 'completed' ? '办结的诉求会留在这里。' : '有问题，随时发起。'}
            action={
              filter !== 'completed' ? (
                <button className="primary-button small" onClick={() => navigate('/student/new')}>
                  发起诉求
                </button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  )
}
