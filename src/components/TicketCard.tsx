import { ChevronRight, MapPin, MessageSquareMore } from 'lucide-react'
import type { Ticket } from '../types'
import { relativeTime } from '../lib/format'
import { DeptStack, RiskBadge, SlaCountdown, StatusPill, UrgencyDot } from './ui'

export function TicketCard({
  ticket,
  onClick,
  showStudent = false,
  compact = false,
}: {
  ticket: Ticket
  onClick: () => void
  showStudent?: boolean
  compact?: boolean
}) {
  return (
    <button
      className={`ticket-card ${compact ? 'compact' : ''} ${ticket.risk === 'high' ? 'is-risk' : ''}`}
      onClick={onClick}
    >
      <span className={`ticket-accent urgency-${ticket.urgency}`} />
      <div className="ticket-card-top">
        <span className="ticket-category">
          <UrgencyDot urgency={ticket.urgency} />
          {ticket.category}
          {showStudent && <b className="student-inline">{ticket.studentName}</b>}
        </span>
        <StatusPill status={ticket.status} label={ticket.statusLabel} />
      </div>
      <h3>{ticket.title}</h3>
      {!compact && (
        <div className="ticket-meta">
          <span>
            <MapPin size={12} />
            {ticket.location}
          </span>
          <span className="ticket-meta-sep">·</span>
          <span>{relativeTime(ticket.updatedAt)}更新</span>
        </div>
      )}
      <div className="ticket-card-foot">
        <div className="ticket-dept-line">
          <DeptStack departments={ticket.departments.length ? ticket.departments : ticket.suggestedDepartments} />
          <span className="dept-hint">
            {ticket.departments.length ? '协同办理' : 'AI 建议'}
          </span>
        </div>
        <div className="ticket-foot-right">
          {ticket.risk !== 'low' ? (
            <RiskBadge risk={ticket.risk} />
          ) : (
            <SlaCountdown ticket={ticket} compact />
          )}
          <ChevronRight size={15} className="chev" />
        </div>
      </div>
      {ticket.rating && (
        <div className="ticket-rated">
          <MessageSquareMore size={12} />
          已评价 {ticket.rating.score} 星 · {ticket.rating.comment || '感谢反馈'}
        </div>
      )}
    </button>
  )
}
