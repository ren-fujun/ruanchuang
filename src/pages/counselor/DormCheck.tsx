import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  BedDouble,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import { formatTime, relativeTime } from '../../lib/format'
import type { DormCheckData, DormRecord, DormRoom, DormRoomStatus } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import { EmptyState, Sheet, SkeletonPage } from '../../components/ui'

const statusLabels: Record<DormRoomStatus, string> = {
  pending: '待查',
  checked: '正常',
  exception: '异常',
  absent: '未归',
}

const filters = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待查' },
  { key: 'checked', label: '正常' },
  { key: 'exception', label: '异常' },
] as const

const issueOptions = ['卫生', '用电安全', '消防通道', '晚归/未归']
const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export function DormCheck() {
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi<DormCheckData>('/counselor/dorm-check')
  const [filter, setFilter] = useState<(typeof filters)[number]['key']>('all')
  const [activeRoom, setActiveRoom] = useState<DormRoom | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [present, setPresent] = useState<Set<string>>(new Set())
  const [issues, setIssues] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [attachments, setAttachments] = useState<{ name: string; type: string; size: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const counts = data?.summary
  const filteredRooms = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data.rooms
    if (filter === 'exception') {
      return data.rooms.filter((room) => room.status === 'exception' || room.status === 'absent')
    }
    return data.rooms.filter((room) => room.status === filter)
  }, [data, filter])

  if (loading && !data) return <SkeletonPage />
  if (error && !data) {
    return (
      <div className="page dorm-page">
        <PageHeader title="宿舍查寝" back right={<button className="icon-button" onClick={reload}><RefreshCw size={17} /></button>} />
        <EmptyState title="查寝数据加载失败" body={error} action={<button className="primary-button small" onClick={reload}>重新加载</button>} />
      </div>
    )
  }
  if (!data) return null

  const absent = activeRoom ? activeRoom.students.filter((name) => !present.has(name)) : []
  const result: 'normal' | 'exception' = absent.length || issues.length ? 'exception' : 'normal'

  const openRoom = (room: DormRoom) => {
    const presentNames = new Set(room.students.filter((name) => !room.absentStudents.includes(name)))
    setActiveRoom(room)
    setPresent(presentNames)
    setIssues([])
    setNote('')
    setAttachments([])
    setSheetOpen(true)
  }

  const togglePresent = (name: string) => {
    setPresent((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleIssue = (issue: string) => {
    setIssues((current) =>
      current.includes(issue) ? current.filter((item) => item !== issue) : [...current, issue],
    )
  }

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 3 - attachments.length)
    setAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        name: file.name,
        type: file.type.startsWith('video') ? 'video' : 'image',
        size: formatSize(file.size),
      })),
    ])
    event.target.value = ''
  }

  const submit = async () => {
    if (!activeRoom) return
    setSubmitting(true)
    try {
      const response = await api.submitDormCheck({
        roomId: activeRoom.id,
        absentStudents: absent,
        issues,
        note,
        attachments,
      })
      toast(response.message, 'success')
      setSheetOpen(false)
      reload()
    } catch (err: any) {
      toast(err?.message || '查寝记录保存失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page dorm-page">
      <PageHeader
        title="宿舍查寝"
        back
        right={
          <button className="icon-button" onClick={reload} aria-label="刷新">
            <RefreshCw size={17} />
          </button>
        }
      />

      <section className="dorm-hero">
        <div className="dorm-hero-top">
          <span><Moon size={13} />夜间查寝</span>
          <em>{data.building} · {data.floor} 层</em>
        </div>
        <h1>
          {counts?.pending ? <>还有 <em>{counts.pending}</em> 间待查</> : '今晚查寝完成'}
        </h1>
        <p>已查 {counts?.checked} 间 · 正常 {counts?.normal} 间 · 异常 {(counts?.exception || 0) + (counts?.absent || 0)} 间</p>
        <div className="dorm-progress">
          <span style={{ width: `${counts?.progress || 0}%` }} />
        </div>
        <div className="dorm-hero-foot">
          <span>完成 {counts?.progress}%</span>
          <button onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            开始查寝
            <ArrowDown size={13} />
          </button>
        </div>
        <span className="dorm-hero-orb" />
      </section>

      <div className="dorm-filter-row">
        {filters.map((item) => {
          const count =
            item.key === 'all'
              ? counts?.total
              : item.key === 'exception'
                ? (counts?.exception || 0) + (counts?.absent || 0)
                : item.key === 'checked'
                  ? counts?.normal
                  : counts?.pending
          return (
            <button
              key={item.key}
              className={filter === item.key ? 'active' : ''}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span>{count ?? 0}</span>
            </button>
          )
        })}
      </div>

      <div className="dorm-room-grid" ref={gridRef}>
        {filteredRooms.map((room) => (
          <button
            className={`dorm-room dorm-room-${room.status}`}
            key={room.id}
            onClick={() => openRoom(room)}
          >
            <span className="dorm-room-head">
              <strong>{room.room}</strong>
              <i />
            </span>
            <span className="dorm-room-status">{statusLabels[room.status]}</span>
            <span className="dorm-room-meta">
              {room.todayCheckedAt
                ? `${room.presentCount}/${room.students.length} 在寝`
                : `${room.students.length} 人`}
            </span>
            <span className="dorm-room-time">
              {room.todayCheckedAt ? formatTime(room.todayCheckedAt) : '未查'}
            </span>
          </button>
        ))}
      </div>

      {filteredRooms.length === 0 && (
        <EmptyState title="没有匹配的房间" body="切换筛选条件再看看。" />
      )}

      <section className="dorm-records-section">
        <div className="dorm-section-head">
          <div>
            <span className="eyebrow">RECENT CHECKS</span>
            <h2>最近记录</h2>
          </div>
          <span>{data.records.length} 条</span>
        </div>
        <div className="dorm-record-list">
          {data.records.slice(0, 7).map((record) => (
            <DormRecordRow key={record.id} record={record} />
          ))}
        </div>
      </section>

      <div className="dorm-footnote">
        <ShieldAlert size={13} />
        异常与未归记录会保留在辅导员工作台，便于次日跟进。
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={activeRoom ? `查寝打卡 · ${activeRoom.room}` : '查寝打卡'}
        footer={
          <>
            <span className={`dorm-result-pill ${result}`}>
              {result === 'normal' ? '本次：正常' : '本次：异常'}
            </span>
            <button className="primary-button" onClick={submit} disabled={submitting}>
              {submitting ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
              {submitting ? '保存中…' : '确认打卡'}
            </button>
          </>
        }
      >
        {activeRoom && (
          <div className="dorm-sheet">
            <div className="dorm-sheet-room">
              <span className="dorm-sheet-icon"><BedDouble size={20} /></span>
              <div>
                <strong>{activeRoom.building} · {activeRoom.room}</strong>
                <small>{activeRoom.floor} 层 · {activeRoom.students.length} 人寝室</small>
              </div>
              <span className="dorm-sheet-inspector">查寝人：陈予安</span>
            </div>

            <div className="form-label-row">
              <label>在寝学生</label>
              <span>{present.size}/{activeRoom.students.length} 人</span>
            </div>
            <div className="dorm-student-grid">
              {activeRoom.students.map((name) => (
                <button
                  key={name}
                  className={present.has(name) ? 'present' : 'absent'}
                  onClick={() => togglePresent(name)}
                >
                  <span>{name.slice(-2)}</span>
                  {present.has(name) ? <Check size={11} /> : <CircleAlert size={11} />}
                </button>
              ))}
            </div>
            {absent.length > 0 && (
              <div className="dorm-absent-tip">
                <CircleAlert size={13} />
                未归：{absent.join('、')}
              </div>
            )}

            <div className="form-label-row">
              <label>检查项</label>
              <span>可多选</span>
            </div>
            <div className="dorm-issue-grid">
              {issueOptions.map((issue) => (
                <button
                  key={issue}
                  className={issues.includes(issue) ? 'active' : ''}
                  onClick={() => toggleIssue(issue)}
                >
                  {issues.includes(issue) && <Check size={11} />}
                  {issue}
                </button>
              ))}
            </div>

            <div className="form-label-row">
              <label>查寝备注</label>
              <span>选填</span>
            </div>
            <textarea
              className="dorm-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="记录晚归原因、卫生整改情况或需要次日跟进的事项…"
              maxLength={300}
            />

            <div className="dorm-attach-row">
              {attachments.map((file, index) => (
                <div className="dorm-attach" key={`${file.name}-${index}`}>
                  <Camera size={14} />
                  <span>{file.name}</span>
                  <button
                    onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                    aria-label="移除"
                  >
                    ×
                  </button>
                </div>
              ))}
              {attachments.length < 3 && (
                <button className="dorm-attach-add" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={15} />
                  添加照片
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
            </div>

            <div className="dorm-sheet-tip">
              <Sparkles size={12} />
              异常项将进入辅导员次日跟进清单
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function DormRecordRow({ record }: { record: DormRecord }) {
  const exception = record.result === 'exception'
  return (
    <div className="dorm-record">
      <span className={`dorm-record-dot ${exception ? 'exception' : ''}`} />
      <div className="dorm-record-main">
        <div>
          <strong>{record.room} 宿舍</strong>
          <span className={exception ? 'exception' : ''}>{exception ? '异常' : '正常'}</span>
        </div>
        <p>
          {record.absentStudents.length
            ? `未归：${record.absentStudents.join('、')}`
            : record.issues.length
              ? record.issues.join(' · ')
              : record.note || '人员在寝，情况正常'}
        </p>
        <small>{record.inspectorName} · {formatTime(record.checkedAt)} · {relativeTime(record.checkedAt)}</small>
      </div>
      <ChevronRight size={14} />
    </div>
  )
}
