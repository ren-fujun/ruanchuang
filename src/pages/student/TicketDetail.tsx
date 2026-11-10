import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileImage,
  FilePlus2,
  GitBranch,
  Hourglass,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Star,
  ThumbsUp,
  Video,
  Zap,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import { formatDate, formatDateTime, formatTime, relativeTime } from '../../lib/format'
import type { TicketDetailData, TimelineEvent } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import {
  DeptAvatar,
  EmptyState,
  ProgressRing,
  RiskBadge,
  SkeletonPage,
  SlaCountdown,
  Stars,
  StatusPill,
  Sheet,
} from '../../components/ui'

const eventIcons: Record<string, any> = {
  created: FilePlus2,
  ai: Sparkles,
  assigned: GitBranch,
  accepted: CheckCheck,
  note: MessageSquare,
  urge: BellRing,
  awaiting_confirm: Hourglass,
  completed: BadgeCheck,
  rated: Star,
  split: GitBranch,
  reminder: Send,
}

const ratingTags = ['响应及时', '态度有温度', '处理到位', '信息清晰']

export function StudentTicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi<TicketDetailData>(id ? `/tickets/${id}` : null)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [ratingMode, setRatingMode] = useState<'confirm' | 'rate'>('confirm')
  const [score, setScore] = useState(5)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const ticket = data?.ticket
  const timeline = useMemo(
    () => (ticket ? [...ticket.timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : []),
    [ticket],
  )

  if (loading && !data) return <SkeletonPage />
  if (error && !data) {
    return (
      <div className="page">
        <PageHeader title="工单详情" back />
        <EmptyState title="没有找到这张工单" body={error} action={<button className="primary-button small" onClick={reload}>重新加载</button>} />
      </div>
    )
  }
  if (!ticket || !data) return null

  const openRating = (mode: 'confirm' | 'rate') => {
    setRatingMode(mode)
    setScore(ticket.rating?.score || 5)
    setComment(ticket.rating?.comment || '')
    setTags(ticket.rating?.tags || [])
    setRatingOpen(true)
  }

  const toggleTag = (tag: string) => {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 4)))
  }

  const confirmTicket = async (withRating: boolean) => {
    setActionLoading(true)
    try {
      await api.confirmTicket(ticket.id, withRating ? { score, comment, tags } : {})
      toast('已确认办结。', 'success')
      setRatingOpen(false)
      reload()
      window.dispatchEvent(new CustomEvent('zhihui:refresh-unread'))
    } catch (err: any) {
      toast(err?.message || '操作失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const submitRating = async () => {
    setActionLoading(true)
    try {
      await api.rateTicket(ticket.id, { score, comment, tags })
      toast('评价已提交。', 'success')
      setRatingOpen(false)
      reload()
    } catch (err: any) {
      toast(err?.message || '评价失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const urge = async () => {
    setActionLoading(true)
    try {
      await api.urgeStudent(ticket.id, '想了解最新进展，辛苦老师帮忙看看。')
      toast('催办已发送。', 'success')
      reload()
    } catch (err: any) {
      toast(err?.message || '催办失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const statusTitle =
    ticket.status === 'pending_review'
      ? 'AI 已整理，等待老师审核'
      : ticket.status === 'assigned'
        ? '已找到对的人，等待接单'
        : ticket.status === 'processing'
          ? '正在协同处理中'
          : ticket.status === 'awaiting_confirm'
            ? '办理完成，等你确认'
            : '这件事，已收尾。'

  const statusCaption =
    ticket.status === 'pending_review'
      ? '辅导员会尽快复核。'
      : ticket.status === 'assigned'
        ? `已分派至${ticket.departments.map((item) => item.short).join('、')}，等待接单。`
        : ticket.status === 'processing'
          ? '部门正在处理，有进展会通知你。'
          : ticket.status === 'awaiting_confirm'
            ? '请确认问题是否解决。'
            : ticket.rating
              ? '感谢你的评价。'
              : '工单已归档。'

  return (
    <div className="page detail-page">
      <section className="detail-status-hero">
        <div className="detail-nav">
          <button className="icon-button on-dark" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={19} />
          </button>
          <span>REQUEST · {ticket.id}</span>
          <button className="icon-button on-dark" onClick={() => navigate('/student/messages')} aria-label="消息">
            <BellRing size={18} />
          </button>
        </div>
        <div className="detail-hero-body">
          <div className="detail-hero-copy">
            <div className="detail-badges">
              <StatusPill status={ticket.status} label={ticket.statusLabel} />
              <RiskBadge risk={ticket.risk} label={ticket.risk === 'low' ? '常规跟进' : ticket.risk === 'high' ? '优先关注' : '需关注'} />
            </div>
            <h1>{statusTitle}</h1>
            <p>{statusCaption}</p>
            <div className="detail-sla-row">
              <SlaCountdown ticket={ticket} />
              <span>{ticket.category}</span>
            </div>
          </div>
          <ProgressRing
            value={ticket.progress}
            size={92}
            stroke={7}
            label={`${ticket.progress}%`}
            sublabel="办理进度"
            tone="lime"
          />
        </div>
        <div className="detail-hero-depts">
          <span className="detail-depts-label">协同部门</span>
          {ticket.departments.length ? (
            <div className="detail-dept-list">
              {ticket.departments.map((department) => (
                <span className="detail-dept" key={department.id}>
                  <DeptAvatar department={department} size={24} />
                  {department.short}
                </span>
              ))}
            </div>
          ) : (
            <div className="detail-dept-list muted">
              {ticket.suggestedDepartments.map((department) => (
                <span className="detail-dept" key={department.id}>
                  <DeptAvatar department={department} size={24} />
                  {department.short}
                  <em>AI 建议</em>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="detail-simple-line">
          <span style={{ width: `${ticket.progress}%` }} />
        </div>
        <span className="detail-hero-glow" />
      </section>

      <div className="detail-content">
        <section className="detail-ai-card">
          <div className="detail-ai-head">
            <span className="ai-badge dark"><Sparkles size={13} /> AI 诉求摘要</span>
            <span className="confidence">初步建议，需人工复核</span>
          </div>
          <p className={`detail-ai-summary ${detailsOpen ? '' : 'clamped'}`}>{ticket.ai.summary}</p>
          <div className="ai-tags">
            {ticket.ai.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
          <button className="ai-expand" onClick={() => setDetailsOpen((value) => !value)}>
            <span>{detailsOpen ? '收起 AI 详情' : '查看 AI 详情'}</span>
            <ChevronDown size={15} className={detailsOpen ? 'rotated' : ''} />
          </button>
          {detailsOpen && (
            <div className="ai-extracted">
              <div><span>事件类型</span><strong>{ticket.category}</strong></div>
              <div><span>情绪倾向</span><strong>{ticket.ai.sentiment}</strong></div>
              <div><span>风险判断</span><strong>{ticket.ai.riskReason}</strong></div>
              <div><span>识别标签</span><strong>{ticket.ai.tags.join(' · ')}</strong></div>
            </div>
          )}
        </section>

        <section className="detail-section card">
          <div className="card-head">
            <h2>{ticket.title}</h2>
            <span className="ticket-id-small">#{ticket.id.slice(-5)}</span>
          </div>
          <p className="detail-description">{ticket.description}</p>
          <div className="detail-facts">
            <div><MapPin size={14} /><span>{ticket.location}</span></div>
            <div><Clock3 size={14} /><span>{formatDateTime(ticket.createdAt)} 提交</span></div>
          </div>
          {ticket.attachments.length > 0 && (
            <div className="detail-attachments">
              {ticket.attachments.map((file) => (
                <div className="detail-attachment" key={file.name}>
                  <span>{file.type === 'video' ? <Video size={17} /> : <FileImage size={17} />}</span>
                  <div>
                    <strong>{file.name}</strong>
                    <small>{file.size}</small>
                  </div>
                  <span className="attachment-view">已保存</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {ticket.rating && (
          <section className="rating-showcase">
            <div className="rating-showcase-head">
              <span className="rating-quote">“</span>
              <div>
                <h3>你为这次服务打了 {ticket.rating.score} 星</h3>
              </div>
              <Stars value={ticket.rating.score} size={15} />
            </div>
            <p>{ticket.rating.comment || '感谢你的反馈。'}</p>
            <div className="rating-tags">
              {ticket.rating.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </section>
        )}

        <section className="detail-section card timeline-card">
          <div className="card-head">
            <h2>办理动态</h2>
            <span className="live-label"><i />实时</span>
          </div>
          <div className="timeline">
            {timeline.map((event: TimelineEvent, index) => {
              const Icon = eventIcons[event.type] || MessageSquare
              const isLast = index === timeline.length - 1
              return (
                <div className={`timeline-item ${isLast ? 'latest' : ''} type-${event.type}`} key={event.id}>
                  <div className="timeline-rail">
                    <span className="timeline-icon"><Icon size={13} /></span>
                    {!isLast && <i className="timeline-line" />}
                  </div>
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <strong>{event.title}</strong>
                      <time>{relativeTime(event.at)}</time>
                    </div>
                    <p>{event.desc}</p>
                    <span className="timeline-actor">{event.actor} · {formatDate(event.at)} {formatTime(event.at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {ticket.departments.length > 0 && (
          <section className="detail-section card">
            <div className="card-head">
              <h2>谁在帮你</h2>
            </div>
            <div className="contact-list">
              {ticket.departments.map((department) => (
                <div className="contact-row" key={department.id}>
                  <DeptAvatar department={department} size={38} />
                  <div>
                    <strong>{department.name}</strong>
                    <span>{department.contact}</span>
                  </div>
                  <a href={`tel:${department.phone.replace(/[^0-9]/g, '')}`} className="contact-call" aria-label={`联系${department.name}`}>
                    <Phone size={15} />
                  </a>
                </div>
              ))}
            </div>
            <div className="privacy-note">
              <Zap size={13} />
              联系方式仅对经办人可见
            </div>
          </section>
        )}

        <footer className="detail-footer">
          <Sparkles size={13} />
          AI 辅助整理 · 隐私严格保护
        </footer>
      </div>

      {data.permissions.canConfirm && (
        <div className="detail-action-bar">
          <div className="action-bar-copy">
            <strong>问题解决了吗？</strong>
            <span>确认后将为本次办理评价</span>
          </div>
          <button className="primary-button" onClick={() => openRating('confirm')}>确认办结</button>
        </div>
      )}

      {data.permissions.canRate && !data.permissions.canConfirm && (
        <div className="detail-action-bar">
          <div className="action-bar-copy">
            <strong>还差一个评价</strong>
            <span>你的反馈会帮助部门改进</span>
          </div>
          <button className="primary-button" onClick={() => openRating('rate')}>补充评价</button>
        </div>
      )}

      {data.permissions.canStudentUrge && (
        <div className="detail-action-bar">
          <div className="action-bar-copy">
            <strong>{ticket.lastUrgedAt ? '已提醒过老师' : '想了解最新进展？'}</strong>
            <span>{ticket.lastUrgedAt ? `上次催办 ${relativeTime(ticket.lastUrgedAt)}` : '催办会同步给辅导员'}</span>
          </div>
          <button className="secondary-button compact-action" onClick={urge} disabled={actionLoading}>
            <BellRing size={15} />
            {actionLoading ? '发送中…' : '催一下'}
          </button>
        </div>
      )}

      <Sheet
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        title={ratingMode === 'confirm' ? '这次办理，解决问题了吗？' : '补充你的评价'}
        footer={
          <>
            <button className="secondary-button" onClick={() => (ratingMode === 'confirm' ? confirmTicket(false) : setRatingOpen(false))} disabled={actionLoading}>
              {ratingMode === 'confirm' ? '暂不评价，直接确认' : '稍后再说'}
            </button>
            <button className="primary-button" onClick={() => (ratingMode === 'confirm' ? confirmTicket(true) : submitRating())} disabled={actionLoading}>
              {actionLoading ? '提交中…' : ratingMode === 'confirm' ? '确认办结并评价' : '提交评价'}
            </button>
          </>
        }
      >
        <div className="rating-sheet-hero">
          <span className="rating-orb"><ThumbsUp size={24} /></span>
          <p>{ratingMode === 'confirm' ? '如果问题已经解决，请确认办结。' : '每一条反馈，都会被认真看见。'}</p>
          <Stars value={score} size={30} onChange={setScore} className="rating-stars" />
          <span className="rating-score-label">{['', '很不满意', '不太满意', '一般', '比较满意', '非常满意'][score]}</span>
        </div>
        <div className="rating-tag-grid">
          {ratingTags.map((tag) => (
            <button key={tag} className={tags.includes(tag) ? 'active' : ''} onClick={() => toggleTag(tag)}>
              {tags.includes(tag) && <Check size={12} />}
              {tag}
            </button>
          ))}
        </div>
        <textarea
          className="rating-comment"
          placeholder="想说点什么？（选填）"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={200}
        />
        <p className="sheet-privacy">评价将匿名进入部门服务数据统计</p>
      </Sheet>
    </div>
  )
}
