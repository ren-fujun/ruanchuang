import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './assistant.css'
import { api, request } from '../../lib/api'
import { safeStudentPath } from './safe-student-path.mjs'

export function StudentAssistant() {
  const [text, setText] = useState(''),
    [reply, setReply] = useState<any>(null),
    [history, setHistory] = useState<{ text: string; answer: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const navigate = useNavigate()
  const send = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await request<any>('/b/assistant', {
        method: 'POST',
        body: JSON.stringify({ text, conversationId: reply?.conversationId }),
      })
      setReply(data)
      setHistory([...history, { text, answer: data.answer }])
      setText('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page b-assistant">
      <h1>AI 咨询与追问</h1>
      <p>根据已审核且有效的资料回答；无法确认时交给老师。</p>
      {history.map((h, i) => (
        <section
          className="card"
          style={{ padding: 16, marginTop: 16 }}
          key={i}
        >
          <strong>{h.text}</strong>
          <p>{h.answer}</p>
        </section>
      ))}
      {reply?.source && (
        <p>
          依据：{reply.source.title} v{reply.source.version} ·{' '}
          {reply.source.department}
          <br />
          {reply.source.source}
          <br />
          {reply.source.excerpt && <><strong>审核条目中录入的文件原文：</strong>{reply.source.excerpt}<br /></>}
          有效至 {reply.source.validUntil}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          aria-label="咨询内容"
          required
          minLength={2}
          maxLength={2000}
          style={{ width: '100%', minHeight: 100, marginTop: 16 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="primary-button"
          disabled={busy || history.length >= 6}
        >
          发送
        </button>
      </form>
      {reply?.action === 'guidance' && <p>业务流程提示 · {reply.policyVersion} · 不代表审批或办理结果</p>}
      {reply?.next && <button className="primary-button" disabled={busy} onClick={() => navigate(safeStudentPath(reply.next.path))}>{reply.next.label}</button>}
      {reply && reply.action !== 'guidance' && (
        <button
          className="secondary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const data = await api.createTicket({
                description: reply.summary,
                category: '其他',
                location: '待补充',
                urgency:
                  reply.action === 'urgent_handoff' ? 'urgent' : 'normal',
              })
              navigate('/student/tickets/' + data.ticket.id)
            } catch (e: any) {
              setError(e.message)
            } finally {
              setBusy(false)
            }
          }}
        >
          确认将摘要提交辅导员
        </button>
      )}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setReply(null)
          setHistory([])
          setText('')
          setError('')
        }}
      >
        新建对话
      </button>
    </div>
  )
}
