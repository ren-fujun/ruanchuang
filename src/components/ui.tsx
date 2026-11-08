import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  ShieldAlert,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import type { Department, Ticket } from '../types'
import { countdownText, initials, riskClass, shortCountdown, statusClass, urgencyClass } from '../lib/format'

export function BrandMark({ size = 40, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <span className={`brand-mark brand-mark-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="5.2" fill="var(--mark-core, #D8F26B)" />
        <circle cx="24" cy="9.5" r="3.2" fill="currentColor" opacity=".9" />
        <circle cx="38.2" cy="30.5" r="3.2" fill="currentColor" opacity=".62" />
        <circle cx="9.8" cy="30.5" r="3.2" fill="currentColor" opacity=".62" />
        <path d="M24 13v6M33.5 28.5 28.6 26M14.5 28.5 19.4 26" stroke="currentColor" strokeWidth="1.4" opacity=".45" />
        <path d="M13.2 17.2c5.8-7.6 15.7-9.4 22.1-3.6 3.2 2.9 4.4 6.4 3.9 9.8" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 4" opacity=".3" />
      </svg>
    </span>
  )
}

export function Avatar({
  name,
  tone = 'peach',
  size = 44,
  online = false,
  className = '',
}: {
  name: string
  tone?: string
  size?: number
  online?: boolean
  className?: string
}) {
  return (
    <span
      className={`avatar tone-${tone} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.29) }}
    >
      {initials(name)}
      {online && <i className="avatar-online" />}
    </span>
  )
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span className={`status-pill status-${statusClass(status)}`}>
      <i />
      {label}
    </span>
  )
}

export function RiskBadge({ risk, label }: { risk: string; label?: string }) {
  if (risk === 'low') {
    return (
      <span className="risk-badge risk-low">
        <i />
        {label || '低风险'}
      </span>
    )
  }
  const Icon = risk === 'high' ? ShieldAlert : AlertTriangle
  return (
    <span className={`risk-badge ${riskClass(risk)}`}>
      <Icon size={12} strokeWidth={2.4} />
      {label || (risk === 'high' ? '高风险' : '需关注')}
    </span>
  )
}

export function UrgencyDot({ urgency }: { urgency: string }) {
  return <i className={`urgency-dot ${urgencyClass(urgency)}`} title={urgency} />
}

export function DeptAvatar({ department, size = 32 }: { department: Department; size?: number }) {
  return (
    <span
      className="dept-avatar"
      style={{ width: size, height: size, background: department.soft, color: department.color, fontSize: size * 0.29 }}
      title={department.name}
    >
      {department.short.slice(0, 2)}
    </span>
  )
}

export function DeptStack({ departments, max = 3 }: { departments: Department[]; max?: number }) {
  if (!departments.length) {
    return (
      <span className="dept-stack-empty">
        <Sparkles size={12} />
        AI 建议分派
      </span>
    )
  }
  return (
    <span className="dept-stack">
      {departments.slice(0, max).map((department) => (
        <DeptAvatar department={department} key={department.id} size={28} />
      ))}
      {departments.length > max && <span className="dept-more">+{departments.length - max}</span>}
    </span>
  )
}

export function SectionHead({
  eyebrow,
  title,
  action,
  onAction,
  icon,
}: {
  eyebrow?: string
  title: string
  action?: string
  onAction?: () => void
  icon?: ReactNode
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>
          {icon}
          {title}
        </h2>
      </div>
      {action && (
        <button className="text-action" onClick={onAction}>
          {action}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}

export function SlaCountdown({
  ticket,
  compact = false,
  className = '',
}: {
  ticket: Pick<Ticket, 'dueAt' | 'status' | 'overdue'>
  compact?: boolean
  className?: string
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  if (ticket.status === 'completed') {
    return (
      <span className={`sla-countdown done ${className}`}>
        <Clock3 size={13} />
        已办结
      </span>
    )
  }
  if (ticket.status === 'awaiting_confirm') {
    return (
      <span className={`sla-countdown waiting ${className}`}>
        <Clock3 size={13} />
        等待学生确认
      </span>
    )
  }
  const minutes = Math.round((new Date(ticket.dueAt).getTime() - now) / 60000)
  const overdue = minutes < 0
  return (
    <span className={`sla-countdown ${overdue ? 'overdue' : minutes < 60 ? 'soon' : ''} ${className}`}>
      <Clock3 size={13} />
      {compact ? shortCountdown(minutes) : countdownText(minutes)}
    </span>
  )
}

export function Stars({
  value = 0,
  size = 16,
  onChange,
  className = '',
}: {
  value?: number
  size?: number
  onChange?: (score: number) => void
  className?: string
}) {
  return (
    <span className={`stars ${className}`}>
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          className={`star ${score <= value ? 'filled' : ''} ${onChange ? 'interactive' : ''}`}
          onClick={() => onChange?.(score)}
          disabled={!onChange}
          aria-label={`${score} 星`}
        >
          <Star size={size} fill={score <= value ? 'currentColor' : 'none'} strokeWidth={1.8} />
        </button>
      ))}
    </span>
  )
}

export function ProgressRing({
  value,
  size = 92,
  stroke = 7,
  label,
  sublabel,
  tone = 'lime',
}: {
  value: number
  size?: number
  stroke?: number
  label?: string
  sublabel?: string
  tone?: 'lime' | 'coral' | 'forest'
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div className={`progress-ring ring-${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="ring-track" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className="ring-fill"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (safeValue / 100) * circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">
        <strong>{label ?? `${safeValue}%`}</strong>
        {sublabel && <span>{sublabel}</span>}
      </div>
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet-backdrop" onClick={onClose} aria-label="关闭" />
      <div className="sheet-panel" ref={panelRef}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h3>{title}</h3>
          </div>
          <button className="icon-button soft" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <Sparkles size={24} />}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

export function SkeletonPage() {
  return (
    <div className="skeleton-page">
      <div className="skeleton skeleton-line w-40" />
      <div className="skeleton skeleton-hero" />
      <div className="skeleton-row">
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
      </div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card short" />
    </div>
  )
}

export function MiniSparkline({
  values,
  color = '#0F4A3C',
  height = 42,
}: {
  values: number[]
  color?: string
  height?: number
}) {
  const max = Math.max(...values, 1)
  const width = 132
  const step = width / Math.max(values.length - 1, 1)
  const points = values.map((value, index) => `${index * step},${height - (value / max) * (height - 8) - 4}`).join(' ')
  return (
    <svg className="sparkline" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CategoryIcon({
  name,
  size = 20,
}: {
  name: string
  size?: number
}) {
  const icons: Record<string, ReactNode> = {
    宿舍生活: <span style={{ fontSize: size }}>⌂</span>,
    校园设施: <span style={{ fontSize: size }}>◫</span>,
    学籍教务: <span style={{ fontSize: size }}>▤</span>,
    奖助资助: <span style={{ fontSize: size }}>✦</span>,
    心理支持: <span style={{ fontSize: size }}>♡</span>,
    安全保卫: <span style={{ fontSize: size }}>◇</span>,
    网络服务: <span style={{ fontSize: size }}>⌁</span>,
    其他: <span style={{ fontSize: size }}>·</span>,
  }
  return <>{icons[name] || icons['其他']}</>
}

export function StatDelta({ value }: { value: number }) {
  return (
    <span className={`stat-delta ${value >= 0 ? 'up' : 'down'}`}>
      <ArrowUpRight size={12} style={{ transform: value >= 0 ? undefined : 'rotate(90deg)' }} />
      {Math.abs(value)}%
    </span>
  )
}

export const toneStyle = (color: string, soft: string): CSSProperties => ({
  ['--dept-color' as string]: color,
  ['--dept-soft' as string]: soft,
})
