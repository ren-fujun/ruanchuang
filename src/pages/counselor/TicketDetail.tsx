import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  FileImage,
  FilePlus2,
  GitBranch,
  Hourglass,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Send,
  Sparkles,
  Split,
  Star,
  StickyNote,
  TimerReset,
  UserRound,
  Video,
  Zap,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import { formatDate, formatDateTime, formatTime, relativeTime } from '../../lib/format'
import type { Department, TicketDetailData, TimelineEvent } from '../../types'
import {
  Avatar,
  DeptAvatar,
  EmptyState,
  RiskBadge,
  Sheet,
  SkeletonPage,
  SlaCountdown,
  Stars,
  StatusPill,
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

const urgePresets = [
  '请经办部门关注办理时限，尽快反馈处置进展。',
  '学生较为着急，请优先安排现场核查。',
  '临近 SLA 时限，请同步当前处理节点。',
]

export function CounselorTicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi<TicketDetailData>(id ? `/tickets/${id}` : null)
  const { data: deptData } = useApi<{ departments: Department[] }>('/departments')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [reviewNote, setReviewNote] = useState('')
  const [urgeOpen, setUrgeOpen] = useState(false)
  const [urgeNote, setUrgeNote] = useState(urgePresets[0])
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveText, setResolveText] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteDepartment, setNoteDepartment] = useState('')
  const [noteNextStep, setNoteNextStep] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitItems, setSplitItems] = useState<{ title: string; departmentId: string }[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [aiExpanded, setAiExpanded] = useState(false)
  const [draftExpanded, setDraftExpanded] = useState(false)

  const ticket = data?.ticket
  const departments = deptData?.departments || []
  const timeline = useMemo(
    () => (ticket ? [...ticket.timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : []),
    [ticket],
  )

  if (loading && !data) return <SkeletonPage />
  if (error && !data) {
    return (
      <div className="page">
        <div className="counselor-detail-error-head">
          <button className="icon-button" onClick={() => navigate(-1)}><ArrowLeft size={19} /></button>
          <span>工单详情</span>
        </div>
        <EmptyState title="没有找到这张工单" body={error} action={<button className="primary-button small" onClick={reload}>重新加载</button>} />
      </div>
    )
  }
  if (!ticket || !data) return null

  const openReview = () => {
    setSelectedDepts(ticket.ai.suggestedDepartments.length ? ticket.ai.suggestedDepartments : ticket.departmentIds)
    setReviewNote('')
    setReviewOpen(true)
  }

  const toggleDept = (deptId: string) => {
    setSelectedDepts((current) =>
      current.includes(deptId) ? current.filter((item) => item !== deptId) : [...current, deptId].slice(0, 4),
    )
  }

  const submitReview = async () => {
    if (!selectedDepts.length) {
      toast('请至少选择一个协同部门。', 'error')
      return
    }
    setActionLoading(true)
    try {
      await api.reviewTicket(ticket.id, { departmentIds: selectedDepts, note: reviewNote })
      toast('工单已审核分派。', 'success')
      setReviewOpen(false)
      reload()
      window.dispatchEvent(new CustomEvent('zhihui:refresh-unread'))
    } catch (err: any) {
      toast(err?.message || '审核失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const submitUrge = async () => {
    setActionLoading(true)
    try {
      await api.urgeTicket(ticket.id, urgeNote)
      toast('催办已发送。', 'success')
      setUrgeOpen(false)
      reload()
    } catch (err: any) {
      toast(err?.message || '催办失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const acceptTicket = async () => {
    setActionLoading(true)
    try {
      await api.progressTicket(ticket.id, { action: 'accept' })
      toast('已记录接单。', 'success')
      setAcceptOpen(false)
      reload()
    } catch (err: any) {
      toast(err?.message || '操作失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const resolveTicket = async () => {
    if (resolveText.trim().length < 4) {
      toast('请填写具体的处置结果。', 'error')
      return
    }
    setActionLoading(true)
    try {
      await api.progressTicket(ticket.id, { action: 'resolve', result: resolveText })
      toast('已录入处置结果，等待学生确认。', 'success')
      setResolveOpen(false)
      setResolveText('')
      reload()
    } catch (err: any) {
      toast(err?.message || '录入失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const submitNote = async () => {
    if (!noteText.trim()) {
      toast('请填写跟进备注。', 'error')
      return
    }
    setActionLoading(true)
    try {
      const entry = [noteDepartment.trim() && `协同部门：${noteDepartment.trim()}`, `沟通情况：${noteText.trim()}`, noteNextStep.trim() && `下一步：${noteNextStep.trim()}`].filter(Boolean).join('；')
      await api.noteTicket(ticket.id, entry)
      toast('内部备注已保存。', 'success')
      setNoteOpen(false)
      setNoteText('')
      setNoteDepartment('')
      setNoteNextStep('')
      reload()
    } catch (err: any) {
      toast(err?.message || '备注保存失败', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const openSplit = () => {
    const suggested = ticket.departmentIds[0] || ticket.ai.suggestedDepartments[0] || departments[0]?.id || ''
    setSplitItems([{ title: `${ticket.title} · 协同事项`, departmentId: suggested }])
    setMoreOpen(false)
    setSplitOpen(true)
  }

  const submitSplit = async () => {
    const items = splitItems.filter((item) => item.title.trim() && item.departmentId)
    if (!items.length) {
      toast('请至少填写一个拆分事项。', 'error')
      return
    }
    setActionLoading(true)
    try {
      await api.splitTicket(ticket.id, items)
      toast('工单已拆分。', 'success')
      setSplitOpen(false)
      reload()
    } catch (err: any) {
      toast(err?.message || '拆分失败，请稍后再试。', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const remindConfirm = async () => {
    setActionLoading(true)
    try {
      await api.remindConfirm(ticket.id)
      toast('已提醒学生确认。', 'success')
      reload()
    } catch (err: any) {
      toast(err?.message || '提醒发送失败', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(ticket.ai.draft)
      toast('建议话术已复制', 'success')
    } catch {
      toast('复制失败，请长按选择文本', 'error')
    }
  }

  const statusTitle =
    ticket.status === 'pending_review'
      ? '等待你审核与分派'
      : ticket.status === 'assigned'
        ? '已分派，等待部门接单'
        : ticket.status === 'processing'
          ? '协同处理中'
          : ticket.status === 'awaiting_confirm'
            ? '已办结，等待学生确认'
            : '工单已闭环归档'

  const stepIndex =
    ticket.status === 'pending_review' ? 0 : ticket.status === 'assigned' ? 1 : ticket.status === 'processing' ? 2 : ticket.status === 'awaiting_confirm' ? 3 : 4
  const reviewSlaMinutes = selectedDepts.length
    ? Math.min(...selectedDepts.map((item) => departments.find((department) => department.id === item)?.sla || 240))
    : 0

  return (
    <div className="page counselor-detail-page">
      <section className={`detail-status-hero counselor-hero ${ticket.risk === 'high' ? 'risk' : ''}`}>
        <div className="detail-nav">
          <button className="icon-button on-dark" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={19} />
          </button>
          <span>REQUEST · {ticket.id}</span>
          <button className="icon-button on-dark" onClick={() => setMoreOpen(true)} aria-label="更多操作">
            <MoreHorizontal size={19} />
          </button>
        </div>
        <div className="counselor-hero-top">
          <div className="detail-badges">
            <StatusPill status={ticket.status} label={ticket.statusLabel} />
            <RiskBadge risk={ticket.risk} />
            <span className={`urgency-badge ${ticket.urgency}`}>{ticket.urgencyLabel}</span>
          </div>
          <span className="counselor-hero-ai"><Sparkles size={12} />AI 已整理</span>
        </div>
        <h1>{ticket.title}</h1>
        <p className="counselor-hero-status">{statusTitle}</p>
        <div className="counselor-student-row">
          <Avatar name={ticket.studentName} tone="peach" size={38} />
          <div>
            <strong>{ticket.studentName}</strong>
            <span>{ticket.college} · 2023 级 · 第 {data.student.historyCount} 次求助</span>
          </div>
          <button className="student-profile-link" onClick={() => setMoreOpen(true)}>
            学生上下文
            <ChevronRight size={13} />
          </button>
        </div>
        <div className="counselor-hero-metrics">
          <div><span>SLA 剩余</span><strong><SlaCountdown ticket={ticket} compact /></strong></div>
          <div><span>建议状态</span><strong>待人工复核</strong></div>
          <div><span>提交时间</span><strong>{formatDate(ticket.createdAt)} {formatTime(ticket.createdAt)}</strong></div>
        </div>
        <div className="counselor-hero-progress">
          {['待审核', '已分派', '协同处理', '待确认', '已办结'].map((label, index) => (
            <span className={stepIndex >= index ? 'done' : ''} key={label}><i />{label}</span>
          ))}
        </div>
        <span className="detail-hero-glow counselor-glow" />
      </section>

      <div className="detail-content counselor-detail-content">
        {ticket.risk === 'high' && (
          <section className="counselor-risk-banner">
            <span><AlertTriangle size={18} /></span>
            <div>
              <strong>高风险工单 · 建议 15 分钟内线下联系</strong>
              <p>{ticket.ai.riskReason}</p>
            </div>
            <button onClick={() => setNoteOpen(true)}>记录介入</button>
          </section>
        )}

        <section className="counselor-ai-brief">
          <div className="brief-head">
            <div className="brief-title">
              <span><Sparkles size={15} /></span>
              <div>
                <div className="eyebrow">AI ASSESSMENT</div>
                <h2>AI 研判摘要</h2>
              </div>
            </div>
            <span>仅供辅导员复核</span>
          </div>
          <p className="brief-summary">{ticket.ai.summary}</p>
          <p>{ticket.ai.coordinationReason || '部门建议请结合原始诉求人工核实。'}</p>
          {Boolean(ticket.ai.missingInfo?.length) && <p>建议补充：{ticket.ai.missingInfo?.join('、')}</p>}
          <div className="brief-risk-line">
            <ShieldLine risk={ticket.risk} />
            <span>{ticket.ai.riskReason}</span>
          </div>
          <div className="brief-grid">
            <div><span>识别类型</span><strong>{ticket.category}</strong></div>
            <div><span>情绪倾向</span><strong>{ticket.ai.sentiment}</strong></div>
            <div><span>建议部门</span><strong>{ticket.ai.suggestedDepartments.map((item) => departments.find((d) => d.id === item)?.short || item).join(' / ')}</strong></div>
            <div><span>紧急等级</span><strong className={`text-${ticket.urgency}`}>{ticket.urgencyLabel}</strong></div>
          </div>
          <div className="brief-tags">
            {ticket.ai.tags.map((tag) => <span key={tag}>#{tag}</span>)}
            <button onClick={() => setAiExpanded((value) => !value)}>
              {aiExpanded ? '收起' : '展开全部'}
              <ChevronDown size={13} className={aiExpanded ? 'rotated' : ''} />
            </button>
          </div>
          {aiExpanded && (
            <div className="brief-extra">
              <div><span>风险等级</span><strong>{ticket.riskLabel}</strong></div>
              <div><span>处理建议</span><strong>{ticket.ai.draft}</strong></div>
            </div>
          )}
        </section>

        {ticket.ai.draft && (
          <section className="counselor-draft">
            <button className="draft-toggle" onClick={() => setDraftExpanded((value) => !value)}>
              <span><MessageSquare size={15} />AI 建议首响话术</span>
              <ChevronDown size={15} className={draftExpanded ? 'rotated' : ''} />
            </button>
            {draftExpanded && (
              <div className="draft-body">
                <p>{ticket.ai.draft}</p>
                <button onClick={copyDraft}><Copy size={13} />复制话术</button>
              </div>
            )}
          </section>
        )}

        <section className="counselor-request-card">
          <div className="counselor-request-head">
            <div>
              <div className="eyebrow">ORIGINAL REQUEST</div>
              <h2>{ticket.title}</h2>
            </div>
            <span className="ticket-id-small">#{ticket.id.slice(-5)}</span>
          </div>
          <p>{ticket.description}</p>
          <div className="counselor-request-meta">
            <span><MapPin size={13} />{ticket.location}</span>
            <span><Clock3 size={13} />{formatDateTime(ticket.createdAt)}</span>
            <span><UserRound size={13} />{ticket.source}</span>
          </div>
          {ticket.attachments.length > 0 && (
            <div className="detail-attachments">
              {ticket.attachments.map((file) => (
                <div className="detail-attachment" key={file.name}>
                  <span>{file.type === 'video' ? <Video size={17} /> : <FileImage size={17} />}</span>
                  <div><strong>{file.name}</strong><small>{file.size}</small></div>
                  <span className="attachment-view">已保存</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="student-context-card">
          <div className="student-context-head">
            <Avatar name={ticket.studentName} tone="peach" size={44} online />
            <div>
              <strong>{data.student.name}</strong>
              <span>{data.student.college} · {data.student.grade}</span>
            </div>
            <span className="context-history">历史 {data.student.historyCount} 单</span>
          </div>
          <div className="context-tags">
            {data.student.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="context-note">
            <Sparkles size={13} />
            {ticket.category === '心理支持' || ticket.risk !== 'low'
              ? '该生近期有心理支持类诉求记录，建议本次沟通保持耐心、避免评判。'
              : '暂无其他需要特别关注的历史记录，按常规协同流程跟进即可。'}
          </div>
        </section>

        <section className="counselor-timeline-card">
          <div className="card-head">
            <div>
              <div className="eyebrow">TRACEABLE TIMELINE</div>
              <h2>处置轨迹</h2>
            </div>
            <span className="live-label"><i />全程留痕</span>
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
          <section className="counselor-dept-card">
            <div className="card-head compact">
              <div>
                <div className="eyebrow">COLLABORATION</div>
                <h2>协同部门</h2>
              </div>
              <button className="text-action" onClick={() => setUrgeOpen(true)}>一键催办<ChevronRight size={13} /></button>
            </div>
            {ticket.departments.map((department) => (
              <div className="collab-row" key={department.id}>
                <DeptAvatar department={department} size={38} />
                <div>
                  <strong>{department.name}</strong>
                  <span>{department.contact}</span>
                </div>
                <div className="collab-sla">
                  <span>SLA {department.sla / 60}h</span>
                  <strong>{department.onTime}% 按时</strong>
                </div>
              </div>
            ))}
          </section>
        )}

        {ticket.rating && (
          <section className="counselor-rating">
            <div>
              <div className="eyebrow">STUDENT FEEDBACK</div>
              <h3>学生评价</h3>
            </div>
            <Stars value={ticket.rating.score} size={16} />
            <p>{ticket.rating.comment || '学生未填写文字评价。'}</p>
            <div className="rating-tags">{ticket.rating.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </section>
        )}

        {ticket.notes.length > 0 && (
          <section className="counselor-notes">
            <div className="card-head compact">
              <div><div className="eyebrow">INTERNAL NOTES</div><h2>跟进备注</h2></div>
            </div>
            {ticket.notes.filter((note) => note.text).map((note) => (
              <div className="note-row" key={note.id}>
                <span className="note-mark" />
                <p>{note.text}</p>
                <small>{note.actor} · {relativeTime(note.at)}</small>
              </div>
            ))}
          </section>
        )}

        <button className="add-note-button" onClick={() => setNoteOpen(true)}>
          <StickyNote size={15} />
          记录部门协同与跟进
        </button>

        <footer className="detail-footer">
          <Sparkles size={13} />
          所有操作均记录操作人与时间，可追溯审计
        </footer>
      </div>

      {['pending_review', 'assigned', 'processing', 'awaiting_confirm'].includes(ticket.status) && (
        <div className="detail-action-bar counselor-action-bar">
          {ticket.status === 'assigned' && (
            <button className="icon-action-button" onClick={() => setUrgeOpen(true)} aria-label="催办">
              <BellRing size={18} />
            </button>
          )}
          {ticket.status === 'processing' && (
            <button className="icon-action-button" onClick={() => setUrgeOpen(true)} aria-label="催办">
              <BellRing size={18} />
            </button>
          )}
          {ticket.status === 'pending_review' ? (
            <button className="primary-button grow" onClick={openReview}>
              <ClipboardCheck size={17} />
              审核并分派
            </button>
          ) : ticket.status === 'assigned' ? (
            <button className="primary-button grow" onClick={() => setAcceptOpen(true)}>
              <CheckCheck size={17} />
              记录部门接单
            </button>
          ) : ticket.status === 'processing' ? (
            <button className="primary-button grow" onClick={() => setResolveOpen(true)}>
              <BadgeCheck size={17} />
              录入处置结果
            </button>
          ) : (
            <button className="primary-button grow" onClick={remindConfirm} disabled={actionLoading}>
              <Send size={17} />
              提醒学生确认
            </button>
          )}
          <button className="icon-action-button" onClick={() => setMoreOpen(true)} aria-label="更多">
            <MoreHorizontal size={19} />
          </button>
        </div>
      )}

      <Sheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="审核并分派"
        eyebrow="REVIEW & ROUTE"
        footer={
          <>
            <div className="sheet-footer-meta">
              <span>已选 {selectedDepts.length} 个部门</span>
              <small>SLA 按最严部门计算</small>
            </div>
            <button className="primary-button" onClick={submitReview} disabled={actionLoading}>
              {actionLoading ? '分派中…' : '确认分派'}
            </button>
          </>
        }
      >
        <div className="assign-recommend">
          <div className="assign-recommend-head">
            <span><Sparkles size={14} />AI 建议协同部门</span>
            <button onClick={() => setSelectedDepts(ticket.ai.suggestedDepartments)}>一键采纳</button>
          </div>
          <p>{ticket.ai.suggestedDepartments.map((item) => departments.find((d) => d.id === item)?.name || item).join('、')}</p>
        </div>
        <div className="form-label-row"><label>选择协同部门</label><span>最多 4 个</span></div>
        <div className="dept-select-grid">
          {departments.map((department) => {
            const selected = selectedDepts.includes(department.id)
            return (
              <button key={department.id} className={selected ? 'active' : ''} onClick={() => toggleDept(department.id)}>
                <span className="dept-select-symbol" style={{ background: department.soft, color: department.color }}>
                  {department.short.slice(0, 1)}
                </span>
                <span><strong>{department.short}</strong><small>{department.sla / 60}h 时限</small></span>
                <i className="dept-check">{selected && <Check size={11} />}</i>
              </button>
            )
          })}
        </div>
        <div className="form-label-row"><label>督办备注</label><span>选填</span></div>
        <textarea
          className="review-note"
          placeholder="补充说明、注意事项或对经办部门的督办要求…"
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          maxLength={200}
        />
        <div className="assign-preview">
          <div><TimerReset size={15} /><span>预计首响时限</span><strong>{reviewSlaMinutes ? `${reviewSlaMinutes / 60} 小时` : '待选择'}</strong></div>
          <div><BellRing size={15} /><span>学生通知</span><strong>自动同步</strong></div>
        </div>
      </Sheet>

      <Sheet
        open={urgeOpen}
        onClose={() => setUrgeOpen(false)}
        title="发起一次督办"
        eyebrow="SLA NUDGE"
        footer={
          <>
            <button className="secondary-button" onClick={() => setUrgeOpen(false)}>取消</button>
            <button className="primary-button" onClick={submitUrge} disabled={actionLoading}>{actionLoading ? '发送中…' : '发送催办'}</button>
          </>
        }
      >
        <div className="urge-sheet-info">
          <span><TimerReset size={18} /></span>
          <div>
            <strong>{ticket.departments.map((item) => item.short).join('、') || '经办部门'} · 当前时效</strong>
            <SlaCountdown ticket={ticket} />
          </div>
        </div>
        <div className="form-label-row"><label>催办说明</label><span>将同步给学生</span></div>
        <div className="preset-notes">
          {urgePresets.map((preset) => (
            <button key={preset} className={urgeNote === preset ? 'active' : ''} onClick={() => setUrgeNote(preset)}>
              {urgeNote === preset && <Check size={12} />}
              {preset}
            </button>
          ))}
        </div>
        <textarea className="review-note" value={urgeNote} onChange={(event) => setUrgeNote(event.target.value)} maxLength={160} />
      </Sheet>

      <Sheet
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title="记录部门接单"
        eyebrow="ACCEPT & PROCEED"
        footer={
          <>
            <button className="secondary-button" onClick={() => setAcceptOpen(false)}>取消</button>
            <button className="primary-button" onClick={acceptTicket} disabled={actionLoading}>{actionLoading ? '记录中…' : '确认接单'}</button>
          </>
        }
      >
        <div className="confirm-sheet">
          <span className="confirm-icon"><CheckCheck size={24} /></span>
          <p>确认{ticket.departments.map((item) => item.short).join('、')}已接收工单？确认后工单将进入「处理中」，并开始计算处置时限。</p>
        </div>
      </Sheet>

      <Sheet
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title="录入处置结果"
        eyebrow="RESOLUTION"
        footer={
          <>
            <button className="secondary-button" onClick={() => setResolveOpen(false)}>取消</button>
            <button className="primary-button" onClick={resolveTicket} disabled={actionLoading}>{actionLoading ? '提交中…' : '完成并通知学生'}</button>
          </>
        }
      >
        <div className="resolve-sheet">
          <div className="resolve-reminder">
            <Sparkles size={14} />
            请填写可被学生理解的处置结果。学生确认后，工单才会正式归档。
          </div>
          <div className="form-label-row"><label>处置结果</label><span>将同步至学生端</span></div>
          <textarea
            className="review-note tall"
            placeholder="例如：已更换 3 号楼热水回水阀，今晚 22:00 后恢复稳定。若仍有问题可直接联系维修组…"
            value={resolveText}
            onChange={(event) => setResolveText(event.target.value)}
            maxLength={400}
          />
          <div className="resolve-check">
            <span><Check size={12} />佐证材料已核验</span>
            <span><Check size={12} />学生联系方式可见</span>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="记录部门协同与跟进"
        eyebrow="INTERNAL NOTE"
        footer={
          <>
            <button className="secondary-button" onClick={() => setNoteOpen(false)}>取消</button>
            <button className="primary-button" onClick={submitNote} disabled={actionLoading}>{actionLoading ? '保存中…' : '保存备注'}</button>
          </>
        }
      >
        <div className="note-sheet">
          <div className="note-warning"><StickyNote size={14} />该备注仅辅导员可见，不会同步给学生。</div>
          <label>协同部门（选填）<input className="review-note" value={noteDepartment} onChange={(event) => setNoteDepartment(event.target.value)} maxLength={80} placeholder="例如：后勤保障处" /></label>
          <label>沟通情况与反馈<textarea className="review-note tall" placeholder="记录联系时间、方式及部门反馈…" value={noteText} onChange={(event) => setNoteText(event.target.value)} maxLength={300} /></label>
          <label>下一步（选填）<input className="review-note" value={noteNextStep} onChange={(event) => setNoteNextStep(event.target.value)} maxLength={150} placeholder="例如：周五联系负责人确认进度" /></label>
        </div>
      </Sheet>

      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="更多协同操作"
        eyebrow="MORE ACTIONS"
      >
        <div className="more-actions">
          <button onClick={openSplit}>
            <span className="menu-icon mint"><Split size={17} /></span>
            <span><strong>拆分为多部门工单</strong><small>适合复合诉求，分别追踪</small></span>
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setMoreOpen(false); setNoteOpen(true) }}>
            <span className="menu-icon blue"><StickyNote size={17} /></span>
            <span><strong>添加内部备注</strong><small>记录线下沟通与介入过程</small></span>
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setMoreOpen(false); setUrgeOpen(true) }}>
            <span className="menu-icon peach"><BellRing size={17} /></span>
            <span><strong>发起督办催办</strong><small>同步学生与经办部门</small></span>
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setMoreOpen(false); navigate('/counselor/insights') }}>
            <span className="menu-icon neutral"><Building2 size={17} /></span>
            <span><strong>查看学院协同数据</strong><small>部门效率与诉求热点</small></span>
            <ChevronRight size={16} />
          </button>
          <div className="more-context">
            <UserRound size={15} />
            学生上下文：{data.student.name} · 历史 {data.student.historyCount} 单 · {data.student.tags.join(' / ')}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        title="拆分复合工单"
        eyebrow="SPLIT THE REQUEST"
        footer={
          <>
            <button className="secondary-button" onClick={() => setSplitOpen(false)}>取消</button>
            <button className="primary-button" onClick={submitSplit} disabled={actionLoading}>{actionLoading ? '拆分中…' : '确认拆分'}</button>
          </>
        }
      >
        <div className="split-sheet">
          <div className="resolve-reminder">
            <Split size={14} />
            将一张工单拆成多个可独立追踪的事项，每个事项自动分派至对应部门。
          </div>
          {splitItems.map((item, index) => (
            <div className="split-item" key={index}>
              <div className="split-item-head">
                <span>子事项 {index + 1}</span>
                {splitItems.length > 1 && (
                  <button onClick={() => setSplitItems((current) => current.filter((_, i) => i !== index))}>移除</button>
                )}
              </div>
              <input
                value={item.title}
                onChange={(event) =>
                  setSplitItems((current) => current.map((row, i) => (i === index ? { ...row, title: event.target.value } : row)))
                }
                placeholder="子事项标题"
              />
              <select
                value={item.departmentId}
                onChange={(event) =>
                  setSplitItems((current) => current.map((row, i) => (i === index ? { ...row, departmentId: event.target.value } : row)))
                }
              >
                <option value="">选择承办部门</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            className="split-add"
            onClick={() =>
              setSplitItems((current) => [
                ...current,
                { title: '', departmentId: ticket.departmentIds[0] || departments[0]?.id || '' },
              ])
            }
          >
            + 再添加一个子事项
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function ShieldLine({ risk }: { risk: string }) {
  return (
    <span className={`shield-line ${risk}`}>
      {risk === 'high' ? <AlertTriangle size={14} /> : <Zap size={14} />}
    </span>
  )
}
