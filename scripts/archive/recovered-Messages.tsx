?import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  Inbox,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate, formatTime, relativeTime } from '../lib/format'
import type { Notification } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { EmptyState, SkeletonPage } from '../components/ui'

const noteIcons: Record<string, any> = {
  risk: ShieldAlert,
  sla: Clock3,
  ticket: Inbox,
  ai: Sparkles,
  system: Bell,
  reminder: BellRing,
}

export function MessagesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()
  const { data, loading, error, setData, reload } = useApi<{ notifications: Notification[]; unread: number }>('/notifications')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const notifications = useMemo(() => {
    const items = data?.notifications || []
    return filter === 'unread' ? items.filter((item) => !item.read) : items
  }, [data, filter])

  const groups = useMemo(() => {
    const today: Notification[] = []
    const yesterday: Notification[] = []
    const earlier: Notification[] = []
    const now = new Date()
    notifications.forEach((note) => {
      const date = new Date(note.at)
      const diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000)
      if (diff <= 0) today.push(note)
      else if (diff === 1) yesterday.push(note)
      else earlier.push(note)
    })
    return [
      { label: '今天', items: today },
      { label: '昨天', items: yesterday },
      { label: '更早', items: earlier },
    ].filter((group) => group.items.length)
  }, [notifications])

  const markAll = async () => {
    try {
      await api.readAll()
      setData((current) => (current ? { ...current, notifications: current.notifications.map((note) => ({ ...note, read: true })), unread: 0 } : current))
      toast('消息已全部标记为已�?', 'success')
      window.dispatchEvent(new CustomEvent('zhihui:refresh-unread'))
    } catch (err: any) {
      toast(err?.message || '操作失败', 'error')
    }
  }

  const openNote = async (note: Notification) => {
    if (!note.read) {
      setData((current) =>
        current
          ? {
              ...current,
              unread: Math.max(0, current.unread - 1),
              notifications: current.notifications.map((item) => (item.id === note.id ? { ...item, read: true } : item)),
            }
          : current,
      )
      try {
        await api.readNotification(note.id)
        window.dispatchEvent(new CustomEvent('zhihui:refresh-unread'))
      } catch {
        // Navigation should not be blocked by a read receipt.
      }
    }
    if (note.ticketId?.startsWith('ZX')) {
      navigate(user?.role === 'student' ? `/student/tickets/${note.ticketId}` : `/counselor/tickets/${note.ticketId}`)
    }
  }

  const unread = data?.unread || 0

  return (
    <div className="page messages-page">
      <PageHeader
        eyebrow="INBOX"
        title="消息"
        right={
          <button className="text-button subtle" onClick={markAll} disabled={!unread}>
            <CheckCheck size={15} />
            全部已�?
          </button>
        }
      />

      <section className="inbox-hero">
        <div className="inbox-hero-copy">
          <div className="eyebrow">STAY IN THE LOOP</div>
          <h2>{unread ? <>�?<em>{unread}</em> 条新的回�?/> : '�?有回响，都已看�?'}</h2>
          <p>{unread ? '工单进展、�?�师提醒和校�?��点，都安放在这里�? : '有新进展时，我们会�?�?时间提醒你�??}</p>
        </div>
        <span className="inbox-orbit"><BellRing size={24} /></span>
      </section>

      <div className="filter-bar compact">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
        <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
          �??
          {unread > 0 && <i>{unread}</i>}
        </button>
      </div>

      {loading && !data ? (
        <SkeletonPage />
      ) : error && !data ? (
        <EmptyState title="消息加载失败" body={error} action={<button className="primary-button small" onClick={reload}>重新加载</button>} />
      ) : notifications.length === 0 ? (
        <EmptyState icon={<Inbox size={24} />} title={filter === 'unread' ? '没有�??消息' : '这里还很安静'} body="工单有新进展、�?�师提醒你时，消�?��出现在这里�?? />
      ) : (
        <div className="message-groups">
          {groups.map((group) => (
            <section key={group.label} className="message-group">
              <div className="message-group-head">
                <span>{group.label}</span>
                <i />
              </div>
              {group.items.map((note) => {
                const Icon = noteIcons[note.type] || Bell
                return (
                  <button
                    className={`message-item tone-${note.tone} ${note.read ? 'read' : 'unread'}`}
                    key={note.id}
                    onClick={() => openNote(note)}
                  >
                    <span className="message-icon"><Icon size={18} /></span>
                    <span className="message-body">
                      <span className="message-meta">
                        <strong>{note.title}</strong>
                        <time>{formatTime(note.at)}</time>
                      </span>
                      <span className="message-text">{note.body}</span>
                      <span className="message-date">{formatDate(note.at)} · {relativeTime(note.at)}</span>
                    </span>
                    {!note.read ? <i className="message-unread-dot" /> : <ChevronRight size={15} className="message-chevron" />}
                  </button>
                )
              })}
            </section>
          ))}
        </div>
      )}

      <div className="message-footnote">
        <FileText size={13} />
        消息与工单�?录同步保留，�?��对应工单�?��时回�?      </div>
    </div>
  )
}
