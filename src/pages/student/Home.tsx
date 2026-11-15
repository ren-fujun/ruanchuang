import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronRight,
  CreditCard,
  FileText,
  HeartHandshake,
  Sparkles,
  Wifi,
  Wrench,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import { formatTime, greeting, relativeTime, todayLabel } from '../../lib/format'
import type { Knowledge, StudentHomeData, TimelineEvent } from '../../types'
import { Avatar, EmptyState, SectionHead, SkeletonPage, SlaCountdown, StatusPill } from '../../components/ui'

const categories = [
  { name: '宿舍报修', for: '宿舍生活', icon: Wrench },
  { name: '心理咨询', for: '心理支持', icon: HeartHandshake },
  { name: '学籍证明', for: '学籍教务', icon: FileText },
  { name: '校园网络', for: '网络服务', icon: Wifi },
]

const knowledgeIcons: Record<string, any> = {
  'credit-card': CreditCard,
  wrench: Wrench,
  'file-text': FileText,
  heart: HeartHandshake,
  'graduation-cap': BookOpen,
  wifi: Wifi,
  'book-open': BookOpen,
  'shield-alert': Sparkles,
}

export function StudentHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi<StudentHomeData>('/student/home')

  if (loading && !data) return <SkeletonPage />
  if (error && !data) {
    return (
      <div className="page">
        <EmptyState
          title="中枢暂时没有响应"
          body={error}
          action={<button className="primary-button small" onClick={reload}>重新加载</button>}
        />
      </div>
    )
  }
  if (!data || !user) return null

  const { stats, featured, knowledge, updates, aiTip, unread } = data
  const featuredDept = featured?.departments.length ? featured.departments : featured?.suggestedDepartments || []

  return (
    <div className="page student-home student-home-v3 student-home-v4">
      <button className="secondary-button" onClick={() => navigate('/student/assistant')}>AI 咨询与追问</button>
      <header className="home-greeting">
        <div className="home-date-line">
          <span className="station-label"><i />{todayLabel()}</span>
        </div>
        <div className="home-greeting-row">
          <div>
            <h1>
              {greeting()}，{user.name.slice(-2)}
            </h1>
            <p>今天，也值得被听见。</p>
          </div>
          <div className="home-head-actions">
            <button className="icon-button glass-bell" onClick={() => navigate('/student/messages')} aria-label="消息">
              <Bell size={19} />
              {unread > 0 && <i className="notification-dot">{unread}</i>}
            </button>
            <button className="avatar-button" onClick={() => navigate('/student/profile')} aria-label="我的">
              <Avatar name={user.name} tone={user.avatarTone} size={46} online />
            </button>
          </div>
        </div>
      </header>

      <section className="student-hero simple-hero">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-topline">
          <span className="hero-live">
            <i className="live-dot" />
            AI 中枢在线
          </span>
        </div>
        <h2>
          有件事，
          <br />
          想说吗？
        </h2>
        <p className="hero-copy">先说出来，AI 会帮你找到对的人。</p>
        <button className="hero-ask" onClick={() => navigate('/student/new')}>
          <span className="hero-ask-icon"><Sparkles size={17} /></span>
          <span>描述你的问题…</span>
          <span className="hero-ask-arrow"><ArrowUpRight size={16} /></span>
        </button>
        <div className="hero-foot">
          <span className="hero-dept-line"><i />6 个协同部门在线</span>
        </div>
      </section>

      <section className="quick-start">
        <div className="quick-start-head">
          <h2>快速发起</h2>
        </div>
        <div className="quick-start-grid">
          {categories.map(({ name, for: target, icon: Icon }) => (
            <button
              className="quick-tile quick-tile-mini"
              key={name}
              onClick={() => navigate(`/student/new?category=${encodeURIComponent(target)}`)}
            >
              <span className="quick-tile-icon"><Icon size={18} /></span>
              <strong>{name}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="home-section home-progress-section">
        <SectionHead
          title="正在跟进"
          action="全部"
          onAction={() => navigate('/student/tickets')}
        />
        {featured ? (
          <button className="spotlight-ticket simple-ticket" onClick={() => navigate(`/student/tickets/${featured.id}`)}>
            <div className="simple-ticket-top">
              <span className="simple-ticket-category">{featured.category}</span>
              <StatusPill status={featured.status} label={featured.statusLabel} />
            </div>
            <h3>{featured.title}</h3>
            <div className="simple-ticket-meta">
              <div className="simple-ticket-depts">
                <div className="spotlight-dept-avatars">
                  {featuredDept.map((dept) => (
                    <span key={dept.id} style={{ background: dept.soft, color: dept.color }} title={dept.name}>
                      {dept.short.slice(0, 1)}
                    </span>
                  ))}
                </div>
                <span>{featuredDept.length ? featuredDept.map((dept) => dept.short).join(' · ') : '等待辅导员审核'}</span>
              </div>
              <SlaCountdown ticket={featured} />
            </div>
            <div className="simple-ticket-progress">
              <span style={{ width: `${featured.progress}%` }} />
            </div>
            <div className="simple-ticket-foot">
              <span>{relativeTime(featured.updatedAt)}更新</span>
              <b>查看详情 <ArrowRight size={13} /></b>
            </div>
          </button>
        ) : (
          <EmptyState
            icon={<Sparkles size={22} />}
            title="暂时没有进行中的诉求"
            body="遇到问题随时发起，AI 会先陪你理清。"
            action={<button className="primary-button small" onClick={() => navigate('/student/new')}>发起第一条诉求</button>}
          />
        )}
      </section>

      <section className="echo-ledger">
        <div className="echo-ledger-head">
          <span>我的诉求</span>
          <small>近 14 天</small>
        </div>
        <div className="student-stats">
          <button onClick={() => navigate('/student/tickets?filter=active')}>
            <strong>{String(stats.active).padStart(2, '0')}</strong>
            <span>正在路上</span>
          </button>
          <button onClick={() => navigate('/student/tickets?filter=awaiting_confirm')}>
            <strong>{String(stats.awaiting).padStart(2, '0')}</strong>
            <span>等你确认</span>
            {stats.awaiting > 0 && <b className="stat-dot" />}
          </button>
          <button onClick={() => navigate('/student/tickets?filter=completed')}>
            <strong>{String(stats.completed).padStart(2, '0')}</strong>
            <span>已经收尾</span>
          </button>
        </div>
      </section>

      <button className="ai-note-line" onClick={() => navigate('/student/tickets')}>
        <Sparkles size={14} />
        <span>{aiTip}</span>
        <ChevronRight size={15} />
      </button>

      <section className="home-section">
        <SectionHead title="办事指南" action="问 AI" onAction={() => navigate('/student/new')} />
        <div className="knowledge-track compact-track">
          {knowledge.slice(0, 4).map((item: Knowledge, index) => {
            const Icon = knowledgeIcons[item.icon] || BookOpen
            return (
              <button
                className={`knowledge-card knowledge-mini knowledge-${index % 4}`}
                key={item.id}
                onClick={() => navigate(`/student/new?category=${encodeURIComponent(item.category)}&hint=${encodeURIComponent(item.title)}`)}
              >
                <div className="knowledge-icon"><Icon size={18} /></div>
                <span className="knowledge-cat">{item.category}</span>
                <h3>{item.title}</h3>
                <i className="knowledge-arrow"><ArrowUpRight size={13} /></i>
              </button>
            )
          })}
        </div>
      </section>

      <section className="home-section home-updates">
        <SectionHead title="最近动态" />
        <div className="update-list compact-list">
          {updates.length ? (
            updates.slice(0, 3).map((event: TimelineEvent & { ticketId: string; ticketTitle: string }, index) => (
              <button
                className="update-item compact-update"
                key={event.id}
                onClick={() => navigate(`/student/tickets/${event.ticketId}`)}
              >
                <span className={`update-rail ${index === 0 ? 'latest' : ''}`}><i /></span>
                <div className="update-content">
                  <div className="update-top">
                    <strong>{event.title}</strong>
                    <time>{index === 0 ? formatTime(event.at) : relativeTime(event.at)}</time>
                  </div>
                  <span className="update-ticket">{event.ticketTitle}</span>
                </div>
                <ChevronRight size={15} className="update-chevron" />
              </button>
            ))
          ) : (
            <EmptyState title="还没有动态" body="提交诉求后，处理进展会在这里出现。" />
          )}
        </div>
      </section>
    </div>
  )
}
