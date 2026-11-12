import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  Clock3,
  Inbox,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import { todayLabel } from '../../lib/format'
import type { CounselorDashboard } from '../../types'
import {
  EmptyState,
  SkeletonPage,
  StatusPill,
  RiskBadge,
} from '../../components/ui'

export function CounselorHome() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useApi<CounselorDashboard>(
    '/counselor/dashboard',
  )
  if (loading && !data) return <SkeletonPage />
  if (error && !data)
    return (
      <EmptyState
        title="概览加载失败"
        body={error}
        action={
          <button className="primary-button" onClick={reload}>
            重新加载
          </button>
        }
      />
    )
  if (!data) return null
  const { stats, brief, urgent, queue, week, departments } = data
  const weekMax = Math.max(
    ...week.flatMap((day) => [day.created, day.completed]),
    1,
  )
  const metrics = [
    {
      label: '待审核工单',
      value: stats.pending,
      note: '等待复核与分派',
      icon: Inbox,
      to: '?status=pending_review',
    },
    {
      label: '协同处理中',
      value: stats.processing,
      note: '跟进部门办理进展',
      icon: Clock3,
      to: '?status=processing',
    },
    {
      label: '超时待督办',
      value: stats.overdue,
      note: '及时联系经办部门',
      icon: ShieldAlert,
      to: '?overdue=true',
    },
    {
      label: '已办结工单',
      value: stats.completed,
      note: '查看办理结果与评价',
      icon: CheckCheck,
      to: '?status=completed',
    },
  ]
  return (
    <div className="page overview-page">
      <header className="overview-heading">
        <div>
          <h1>工作概览</h1>
          <p>{user?.name}，你好。今天的协同工作，从这里开始。</p>
        </div>
        <span className="overview-date">
          <CalendarDays size={15} />
          {todayLabel()}
        </span>
      </header>
      <section className="overview-metrics" aria-label="工单统计">
        {metrics.map(({ label, value, note, icon: Icon, to }) => (
          <Link
            className="overview-metric"
            to={'/counselor/tickets' + to}
            key={label}
          >
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>
              {value}
              <small>条</small>
            </strong>
            <p>
              {note}
              <ArrowUpRight size={14} />
            </p>
          </Link>
        ))}
      </section>
      <div className="overview-grid">
        <section className="overview-brief overview-panel" data-reveal>
          <div className="overview-section-head">
            <span className="overview-assistant">
              <Sparkles size={15} />
              今日协同简报
            </span>
            <span>新增 {stats.todayNew} 条</span>
          </div>
          <h2>{brief.headline}</h2>
          <p>
            待审核 {stats.pending} 条 · 超时 {stats.overdue} 条 · 高风险{' '}
            {stats.highRisk} 条
          </p>
          <div className="overview-brief-bottom">
            <Link
              className="primary-button"
              to="/counselor/tickets?status=pending_review"
            >
              开始处理
              <ArrowRight size={15} />
            </Link>
            <span>
              本周闭环率 <strong>{stats.closureRate}%</strong>
            </span>
          </div>
        </section>
        <section className="overview-priority overview-panel" data-reveal>
          <div className="overview-section-head">
            <h2>
              <ShieldAlert size={17} />
              重点关注
            </h2>
            <Link to="/counselor/tickets?risk=high">
              查看全部
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <p className="overview-caption">
            {stats.highRisk} 条高风险诉求，优先核实学生与现场情况
          </p>
          <div className="overview-priority-list">
            {urgent.slice(0, 2).map((ticket) => (
              <Link to={'/counselor/tickets/' + ticket.id} key={ticket.id}>
                <span className="overview-priority-dot" />
                <div>
                  <strong>{ticket.title}</strong>
                  <small>
                    {ticket.studentName} ·{' '}
                    {ticket.overdue ? '已超时，待跟进' : ticket.statusLabel}
                  </small>
                </div>
                <ArrowUpRight size={15} />
              </Link>
            ))}
            {!urgent.length && (
              <p className="overview-empty">当前没有需要优先督办的工单</p>
            )}
          </div>
        </section>
        <section className="overview-queue overview-panel" data-reveal>
          <div className="overview-section-head">
            <h2>
              待我审核 <small>{stats.pending}</small>
            </h2>
            <Link to="/counselor/tickets?status=pending_review">
              全部工单
              <ArrowRight size={14} />
            </Link>
          </div>
          <p className="overview-caption">
            核实诉求，明确责任部门，让每件事有序推进。
          </p>
          <div className="overview-table-label">
            <span>诉求 / 学生</span>
            <span>风险</span>
            <span>状态</span>
          </div>
          {queue.slice(0, 4).map((ticket) => (
            <Link
              className="overview-ticket-row"
              key={ticket.id}
              to={'/counselor/tickets/' + ticket.id}
            >
              <div>
                <strong>{ticket.title}</strong>
                <small>
                  {ticket.studentName} · {ticket.category}
                </small>
              </div>
              <RiskBadge risk={ticket.risk} />
              <StatusPill status={ticket.status} label={ticket.statusLabel} />
            </Link>
          ))}
          {!queue.length && (
            <p className="overview-empty">
              审核队列已清空，新的诉求会显示在这里。
            </p>
          )}
        </section>
        <section className="overview-trend overview-panel" data-reveal>
          <div className="overview-section-head">
            <h2>诉求趋势</h2>
            <span>近 7 日</span>
          </div>
          <div className="overview-trend-total">
            <strong>{week.reduce((sum, day) => sum + day.created, 0)}</strong>
            <span>条受理诉求</span>
          </div>
          <div className="overview-chart" aria-label="近七日受理与办结工单数量">
            {week.map((day) => (
              <div
                className="overview-chart-col"
                key={day.key}
                tabIndex={0}
                aria-label={
                  day.label +
                  '，受理 ' +
                  day.created +
                  '，办结 ' +
                  day.completed
                }
              >
                <div className="overview-bars">
                  <span
                    style={{ height: (day.created / weekMax) * 100 + '%' }}
                  />
                  <span
                    style={{ height: (day.completed / weekMax) * 100 + '%' }}
                  />
                </div>
                <small>{day.label}</small>
                <span className="overview-chart-tip">
                  受理 {day.created} · 办结 {day.completed}
                </span>
              </div>
            ))}
          </div>
          <div className="overview-chart-legend">
            <span>
              <i />
              受理
            </span>
            <span>
              <i />
              办结
            </span>
            <Link to="/counselor/insights">
              查看洞察
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </section>
        <section className="overview-departments overview-panel" data-reveal>
          <div className="overview-section-head">
            <h2>部门协同</h2>
            <Link to="/counselor/insights">
              协同效率
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="overview-department-grid">
            {departments.slice(0, 6).map((department) => (
              <div className="overview-department" key={department.id}>
                <span className="overview-department-icon">
                  {department.short.slice(0, 1)}
                </span>
                <div>
                  <strong>{department.short}</strong>
                  <small>{department.active} 条在办</small>
                </div>
                <span>
                  {department.onTime}%<small>按时办结</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
