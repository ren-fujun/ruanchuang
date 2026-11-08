import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircleAlert,
  Clock3,
  DoorOpen,
  Flame,
  Inbox,
  Radar,
  ShieldAlert,
  Sparkles,
  TimerReset,
  Users,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import { greeting, shortCountdown, todayLabel } from '../../lib/format'
import type { CounselorDashboard, Ticket } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import {
  Avatar,
  EmptyState,
  ProgressRing,
  RiskBadge,
  SectionHead,
  SkeletonPage,
  SlaCountdown,
  StatusPill,
} from '../../components/ui'
import { TicketCard } from '../../components/TicketCard'

export function CounselorHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi<CounselorDashboard>('/counselor/dashboard')

  if (loading && !data) return <SkeletonPage />
  if (error && !data) {
    return (
      <div className="page">
        <EmptyState title="中枢暂时离线" body={error} action={<button className="primary-button small" onClick={reload}>重新连接</button>} />
      </div>
    )
  }
  if (!data || !user) return null

  const { stats, brief, urgent, queue, week, departments, unread } = data
  const topRisk = urgent.find((ticket) => ticket.risk === 'high') || urgent[0]
  const weekMax = Math.max(...week.map((day) => Math.max(day.created, day.completed)), 1)
  const weekTotal = week.reduce((sum, day) => sum + day.created, 0)

  return (
    <div className="page counselor-home">
      <PageHeader
        eyebrow="COMMAND CENTER"
        title={`${greeting()}，陈老师`}
        right={
          <div className="counselor-head-actions">
            <button className="icon-button" onClick={() => navigate('/counselor/messages')} aria-label="消息">
              <Bell size={19} />
              {unread > 0 && <i className="notification-dot">{unread}</i>}
            </button>
            <button onClick={() => navigate('/counselor/profile')} className="avatar-button" aria-label="我的">
              <Avatar name={user.name} tone={user.avatarTone} size={42} online />
            </button>
          </div>
        }
      />

      <div className="counselor-date-line">
        <span>{todayLabel()}</span>
        <span className="duty-pill"><i />值班中</span>
      </div>

      <section className="command-hero">
        <div className="command-grid-lines" />
        <div className="command-hero-top">
          <span className="command-live"><i className="live-dot" />TODAY · 中枢实时</span>
          <span className="command-ai"><Sparkles size={12} />AI 已梳理 {stats.todayNew} 条新动态</span>
        </div>
        <div className="command-hero-main">
          <div className="command-copy">
            <h1>{brief.headline}</h1>
            <p>{brief.detail}</p>
          </div>
          <ProgressRing value={stats.closureRate} size={108} stroke={8} label={`${stats.closureRate}%`} sublabel="本周闭环" tone="lime" />
        </div>
        <div className="command-stats">
          <button onClick={() => navigate('/counselor/tickets?status=pending_review')}>
            <span>待审核</span>
            <strong>{String(stats.pending).padStart(2, '0')}</strong>
          </button>
          <button onClick={() => navigate('/counselor/tickets?status=processing')}>
            <span>处理中</span>
            <strong>{String(stats.processing).padStart(2, '0')}</strong>
          </button>
          <button className={stats.overdue ? 'has-alert' : ''} onClick={() => navigate('/counselor/tickets?overdue=true')}>
            <span>已超时</span>
            <strong>{String(stats.overdue).padStart(2, '0')}</strong>
          </button>
        </div>
        <div className="command-hero-foot">
          <div className="command-actions">
            {brief.actions.slice(0, 2).map((action) => (
              <span key={action}><Sparkles size={11} />{action}</span>
            ))}
          </div>
          <button onClick={() => navigate('/counselor/tickets')}>
            进入工单台
            <ArrowRight size={15} />
          </button>
        </div>
        <span className="command-orbit orbit-c1" />
        <span className="command-orbit orbit-c2" />
      </section>

      <section className="quick-command-grid">
        <button onClick={() => navigate('/counselor/tickets?status=pending_review')}>
          <span className="quick-command-icon mint"><Inbox size={18} /></span>
          <strong>待我审核</strong>
          <small>{stats.pending} 条</small>
          <ChevronRight size={14} />
        </button>
        <button onClick={() => navigate('/counselor/tickets?risk=high')}>
          <span className="quick-command-icon coral"><ShieldAlert size={18} /></span>
          <strong>高风险</strong>
          <small>{stats.highRisk} 条</small>
          <ChevronRight size={14} />
        </button>
        <button onClick={() => navigate('/counselor/tickets?overdue=true')}>
          <span className="quick-command-icon gold"><TimerReset size={18} /></span>
          <strong>超时督办</strong>
          <small>{stats.overdue} 条</small>
          <ChevronRight size={14} />
        </button>
        <button onClick={() => navigate('/counselor/insights')}>
          <span className="quick-command-icon blue"><Radar size={18} /></span>
          <strong>数据洞察</strong>
          <small>本周</small>
          <ChevronRight size={14} />
        </button>
        <button className="quick-command-wide" onClick={() => navigate('/counselor/dorm-check')}>
          <span className="quick-command-icon lime"><DoorOpen size={18} /></span>
          <strong>宿舍查寝</strong>
          <small>{stats.dormPending} 间待查</small>
          <ChevronRight size={14} />
        </button>
      </section>

      {topRisk && (
        <section className="risk-radar-card">
          <div className="risk-radar-visual">
            <span className="radar-ring r1" />
            <span className="radar-ring r2" />
            <span className="radar-ring r3" />
            <span className="radar-sweep" />
            <span className="radar-blip" />
            <ShieldAlert size={18} className="radar-icon" />
          </div>
          <div className="risk-radar-content">
            <div className="risk-radar-top">
              <span className="risk-live"><i />需要优先介入</span>
              <span className="risk-student">
                <Avatar name={topRisk.studentName} tone="peach" size={24} />
                {topRisk.studentName}
              </span>
            </div>
            <h3>{topRisk.title}</h3>
            <p>{topRisk.ai.riskReason}</p>
            <div className="risk-radar-actions">
              <button className="risk-cta" onClick={() => navigate(`/counselor/tickets/${topRisk.id}`)}>
                查看并介入
                <ArrowUpRight size={14} />
              </button>
              <span><Clock3 size={12} />{shortCountdown(topRisk.minutesLeft)}</span>
            </div>
          </div>
        </section>
      )}

      <section className="home-section">
        <SectionHead
          eyebrow="SLA WATCH"
          title="限时督办"
          action="全部工单"
          onAction={() => navigate('/counselor/tickets')}
        />
        {urgent.length ? (
          <div className="urgent-track">
            {urgent.slice(0, 4).map((ticket: Ticket) => (
              <button
                className={`urgent-card ${ticket.overdue ? 'overdue' : ''} ${ticket.risk === 'high' ? 'high' : ''}`}
                key={ticket.id}
                onClick={() => navigate(`/counselor/tickets/${ticket.id}`)}
              >
                <div className="urgent-card-top">
                  <span className={`urgent-flag ${ticket.risk}`}>
                    {ticket.overdue ? <Flame size={12} /> : <AlertTriangle size={12} />}
                    {ticket.overdue ? '已超时' : ticket.risk === 'high' ? '高风险' : '临界'}
                  </span>
                  <span className="urgent-id">#{ticket.id.slice(-4)}</span>
                </div>
                <h3>{ticket.title}</h3>
                <div className="urgent-student">
                  <Avatar name={ticket.studentName} tone="lime" size={22} />
                  {ticket.studentName} · {ticket.category}
                </div>
                <div className="urgent-card-foot">
                  <SlaCountdown ticket={ticket} compact />
                  <span>进入工单 <ArrowUpRight size={12} /></span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="所有工单都在时限内" body="今天没有需要紧急介入的督办事项。" />
        )}
      </section>

      <section className="home-section">
        <SectionHead
          eyebrow="REVIEW QUEUE"
          title="待我审核"
          action={`${stats.pending} 条待处理`}
          onAction={() => navigate('/counselor/tickets?status=pending_review')}
        />
        <div className="counselor-queue">
          {queue.length ? (
            queue.slice(0, 3).map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                showStudent
                compact
                onClick={() => navigate(`/counselor/tickets/${ticket.id}`)}
              />
            ))
          ) : (
            <EmptyState icon={<CircleAlert size={22} />} title="审核队列已清空" body="新的学生诉求会在这里出现。" />
          )}
        </div>
      </section>

      <section className="week-card">
        <div className="week-card-head">
          <div>
            <span className="eyebrow">WEEKLY RHYTHM</span>
            <h3>本周诉求节奏</h3>
          </div>
          <div className="week-total">
            <strong>{weekTotal}</strong>
            <span>条新诉求</span>
          </div>
        </div>
        <div className="week-chart">
          {week.map((day) => (
            <div className="week-col" key={day.key}>
              <div className="week-bars">
                <span
                  className="week-bar created"
                  style={{ height: `${Math.max(4, (day.created / weekMax) * 100)}%` }}
                  title={`受理 ${day.created}`}
                />
                <span
                  className="week-bar completed"
                  style={{ height: `${Math.max(4, (day.completed / weekMax) * 100)}%` }}
                  title={`办结 ${day.completed}`}
                />
              </div>
              <em>{day.label}</em>
            </div>
          ))}
        </div>
        <div className="week-legend">
          <span><i className="created" />受理</span>
          <span><i className="completed" />办结</span>
          <span className="week-insight"><Sparkles size={11} />高峰集中在晚间</span>
        </div>
      </section>

      <section className="home-section">
        <SectionHead
          eyebrow="COLLABORATION LOAD"
          title="部门协同负载"
          action="查看权责"
          onAction={() => navigate('/counselor/profile')}
        />
        <div className="dept-load-list">
          {departments.slice(0, 4).map((department) => (
            <div className="dept-load-row" key={department.id}>
              <span className="dept-load-icon" style={{ background: department.soft, color: department.color }}>
                {department.short.slice(0, 1)}
              </span>
              <div className="dept-load-main">
                <div>
                  <strong>{department.short}</strong>
                  <span>{department.active} 个在办</span>
                </div>
                <div className="dept-load-bar">
                  <i style={{ width: `${department.load || 30}%`, background: department.color }} />
                </div>
              </div>
              <span className="dept-load-avg">{department.avgHours}h</span>
            </div>
          ))}
        </div>
      </section>

      <section className="counselor-satisfaction">
        <div>
          <span className="eyebrow">SERVICE PULSE</span>
          <h3>被认真对待的诉求，正在变成信任。</h3>
          <p>近 30 天平均满意度 <strong>{stats.satisfaction}</strong> / 5.0，按时办结率 <strong>{stats.onTimeRate}%</strong>。</p>
        </div>
        <div className="satisfaction-ring">
          <ProgressRing value={stats.onTimeRate} size={80} stroke={6} label={`${stats.onTimeRate}%`} sublabel="按时" tone="coral" />
        </div>
      </section>

      <footer className="app-footer">
        <Sparkles size={13} />
        今日中枢已同步 · 所有工单均可追溯
      </footer>
    </div>
  )
}
