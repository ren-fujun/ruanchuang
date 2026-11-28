import { useRef, useState } from "react";
import type { PortalRole } from "./config";
import { operationId, write, type Appointment, type Slot } from "./api";
import { LoadState, Panel, statusLabel, useAction, useCData } from "./ui";
import { request } from "../../lib/api";
import { useSearchParams } from "react-router-dom";

function MessageBody({ id, onRefresh }: { id: string; onRefresh: () => void }) {
  const data = useCData<{ items: { id: string; text: string; at: string; senderName?: string }[] }>(`/appointments/${id}/messages`);
  const [text, setText] = useState("");
  const action = useAction(() => data.reload());
  return <><button type="button" onClick={() => { data.reload(); onRefresh(); }}>刷新留言</button><LoadState resource={data}>{data.data?.items.map(m => <p key={m.id}>{new Date(m.at).toLocaleString("zh-CN")} · {m.senderName || "参与者"}：{m.text}</p>)}</LoadState><form onSubmit={e => { e.preventDefault(); void action.run(() => write(`/appointments/${id}/messages`, { text }), "留言已发送", () => { setText(""); onRefresh(); }); }}><label>留言<input value={text} maxLength={2000} onChange={e => setText(e.target.value)} /></label><button disabled={!text.trim() || action.busy}>发送</button>{action.feedback}</form></>;
}
function AppointmentMessages({ id, unread, onRefresh }: { id: string; unread?: number; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary>预约留言{unread ? ` · ${unread} 条未读` : ""}</summary>{open && <MessageBody id={id} onRefresh={onRefresh} />}</details>;
}
type Advice = { item?: { category?: string; minutes: number | null; reason?: string; engine?: string } };
const date = (s?: string) => s ? new Date(s).toLocaleString("zh-CN", { weekday: "short", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "待排班";
const weekStart = (value: string) => { const d = new Date(value); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const weekLabel = (value: string) => { const d = weekStart(value); return `${d.getMonth() + 1}月${d.getDate()}日当周`; };
const weekDays = (value: string) => Array.from({ length: 7 }, (_, i) => { const d = weekStart(value); d.setDate(d.getDate() + i); return d; });
function OutcomeEditor({ appointment, onSaved }: { appointment: Appointment; onSaved: () => void }) {
  const [notes, setNotes] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const revision = useRef(0), current = useRef(appointment);
  current.current = appointment;
  const action = useAction(onSaved);
  async function organize() {
    const input = notes, rev = revision.current, version = appointment.version;
    setBusy(true); setMessage('');
    try {
      const { item } = await write<{ item: { draft: string; engine: string } }>(`/appointments/${appointment.id}/outcome-draft`, { notes: input, version });
      if (revision.current !== rev || current.current.version !== version) { setMessage('内容或预约已变化，保留当前输入。'); return; }
      if (item.engine === 'model-organized') { setNotes(item.draft); revision.current++; setMessage('已整理原始要点，请核对后确认保存。'); }
      else setMessage('本次保留原始要点，可直接编辑并保存。');
    } catch { setMessage('暂时无法整理，原始输入已保留。'); }
    finally { setBusy(false); }
  }
  return <div className="c-appointment-actions c-outcome-editor"><label>帮扶结果<textarea aria-label="帮扶结果" maxLength={2000} placeholder="填写处理要点，可用分号或换行分隔" value={notes} onChange={e => { revision.current++; setNotes(e.target.value); }} /></label><button disabled={busy || action.busy || !notes.trim() || notes.length > 1000} onClick={() => void organize()}>{busy ? '正在整理…' : '整理处理要点'}</button>{message && <p role="status">{message}</p>}<button disabled={busy || action.busy || !notes.trim()} onClick={() => void action.run(() => write(`/appointments/${appointment.id}/complete`, { outcome: notes, version: appointment.version, requestId: operationId() }, 'PATCH'), '帮扶结果已记录', () => { revision.current++; setNotes(''); })}>完成并记录结果</button>{action.feedback}</div>;
}
export function Appointments({ role }: { role: PortalRole }) {
  const [query] = useSearchParams();
  const initialTopic = (query.get('topic') || '').slice(0, 200);
  const initialMinutes = Number(query.get('minutes'));
  const consultationSessionId = query.get('consultationSessionId') || '';
  const consultationTurnText = query.get('consultationTurn');
  const consultationTurn = consultationTurnText === null ? undefined : Number(consultationTurnText);
  const [consultationSummary, setConsultationSummary] = useState(() => sessionStorage.getItem(`consultation-draft:${consultationSessionId}`) || initialTopic);
  const validInitialMinutes = Number.isInteger(initialMinutes) && initialMinutes >= 5 && initialMinutes <= 120 && initialMinutes % 5 === 0;
  const student = role === "student";
  const list = useCData<{ items: Appointment[] }>("/appointments");
  const slots = useCData<{ items: Slot[] }>("/appointments/slots");
  const [selected, setSelected] = useState<string[]>([]), [topic, setTopic] = useState(initialTopic), [minutes, setMinutes] = useState(validInitialMinutes ? initialMinutes : initialTopic ? 20 : 15), [starts, setStarts] = useState(""), [ends, setEnds] = useState(""), [reason, setReason] = useState(""), [deadline, setDeadline] = useState<Record<string, string>>({}), [adviceBusy, setAdviceBusy] = useState(false), [adviceMessage, setAdviceMessage] = useState("");
  const key = useRef(operationId()), topicRef = useRef(initialTopic), minutesRef = useRef(validInitialMinutes ? initialMinutes : initialTopic ? 20 : 15);
  const action = useAction(() => { list.reload(); slots.reload(); });
  const validTime = Number.isFinite(Date.parse(starts)) && Date.parse(starts) > Date.now() && Date.parse(ends) > Date.parse(starts);
  async function suggest() {
    const requestedTopic = topic.trim();
    if (!requestedTopic) { setAdviceMessage("请先描述预约事项，再获取建议。"); return; }
    const requestedMinutes = minutesRef.current;
    setAdviceBusy(true); setAdviceMessage("");
    try { const result = await request<Advice>("/appointments/advice", { method: "POST", body: JSON.stringify({ text: requestedTopic }) });
      if (topicRef.current === requestedTopic) { if (result.item?.minutes != null && requestedMinutes === minutesRef.current) { setMinutes(result.item.minutes); minutesRef.current = result.item.minutes; } setAdviceMessage(result.item?.reason || "请选择预约时长。"); }
    } catch { if (topicRef.current === requestedTopic) setAdviceMessage("暂时无法生成建议，请手动选择时长。"); }
    finally { setAdviceBusy(false); }
  }
  return <div className="c-page c-appointments">
    <h1>{student ? "申请预约" : "预约与排班"}</h1>
    <Panel title={student ? "开放预约窗口" : "生成接待窗口"}>
      <form className="c-form" onSubmit={e => { e.preventDefault(); void action.run(() => student ? write("/appointments", { slotIds: selected, topic, minutes, ...(consultationSessionId ? { consultationSessionId, consultationSummary, consultationTurn } : {}), requestId: key.current }) : write("/appointments/slots", { startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString(), requestId: key.current }), student ? "申请已提交" : "预约窗口已开放", () => { key.current = operationId(); setTopic(""); topicRef.current = ""; setSelected([]); setStarts(""); setEnds(""); }); }}>
        {student ? <>
          <label>预约事项<input required maxLength={200} value={topic} onChange={e => { setTopic(e.target.value); topicRef.current = e.target.value.trim(); key.current = operationId(); }} /></label>
          {consultationSessionId && <label>确认给老师的诉求摘要<textarea required maxLength={2000} value={consultationSummary} onChange={e => { setConsultationSummary(e.target.value); key.current = operationId(); }} /></label>}
          <button type="button" disabled={adviceBusy} onClick={() => void suggest()}>{adviceBusy ? "正在生成建议…" : "获取事项建议"}</button>
          <label>预计时长（分钟，可编辑）<input type="number" min="5" max="120" step="5" required value={minutes} onChange={e => { const value = Number(e.target.value); minutesRef.current = value; setMinutes(value); }} /></label>{adviceMessage && <p role="status">{adviceMessage}</p>}
          <LoadState resource={slots}><p>选择最多两个意向窗口，可横向浏览各周七日安排；已满窗口仍可申请候补。</p>{[...new Set((slots.data?.items || []).map(s => weekLabel(s.startsAt)))].map(week => { const first = slots.data!.items.find(s => weekLabel(s.startsAt) === week)!; return <section className="c-appointment-week" key={week}><h3>{week}</h3><div className="c-appointment-days">{weekDays(first.startsAt).map(day => { const daySlots = slots.data!.items.filter(s => { const d = new Date(s.startsAt); return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate(); }); return <div className="c-appointment-day" key={day.toISOString()}><strong>{day.toLocaleDateString("zh-CN", { weekday: "short", month: "numeric", day: "numeric" })}</strong>{daySlots.length ? daySlots.map(s => { const chosen = selected.includes(s.id), ended = Date.parse(s.endsAt) < Date.now(), full = !!s.full, selectable = !ended && (s.available || full); const state = ended ? "已结束" : full ? "已满 · 可申请候补" : s.available ? "可申请" : "未开放"; return <button type="button" key={s.id} className={`c-appointment-slot ${chosen ? "is-selected" : ""}`} disabled={!selectable || (!chosen && selected.length >= 2)} onClick={() => { setSelected(v => chosen ? v.filter(x => x !== s.id) : [...v, s.id]); key.current = operationId(); }}><strong>{new Date(s.startsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}–{new Date(s.endsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</strong><span>{s.ownerName}</span><small>{state}</small></button>; }) : <span>未开放</span>}</div>; })}</div></section>; })}{!slots.data?.items.length && <p>当前没有开放窗口，请稍后查看。</p>}</LoadState>
        </> : <><label>开始时间<input required type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} /></label><label>结束时间<input required type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} /></label>{starts && ends && !validTime && <p role="alert">请填写晚于现在且结束时间晚于开始时间的时段。</p>}</>}
        {action.feedback}<button className="c-primary" disabled={action.busy || (student ? selected.length === 0 || !topic.trim() : !validTime)}>{student ? `提交申请（${selected.length}/2）` : "开放预约窗口"}</button>
      </form>
    </Panel>
    {!student && <Panel title="已开放窗口"><LoadState resource={slots}>{slots.data?.items.map(s => <div className="c-row" key={s.id}><span>{date(s.startsAt)}<small>{s.available ? "开放预约" : "已满或已结束"}</small></span><button disabled={action.busy} onClick={() => void action.run(() => write("/appointments/batch", { slotId: s.id }), "排班已生成")}>生成排班</button></div>)}{!slots.data?.items.length && <p>尚未开放窗口。</p>}</LoadState></Panel>}
    <Panel title={student ? "申请进度与候补结果" : "预约申请与排班结果"}><LoadState resource={list}><label>取消说明<input className="c-input" maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></label>{list.data?.items.map(a => <div className="c-appointment-entry" key={a.id}><div className="c-row"><span className="c-grow"><strong>{a.topic}</strong><small>{date(a.startsAt)} · {student ? a.ownerName : a.studentName} · {statusLabel(a.status)}{a.unread ? ` · ${a.unread} 条未读` : ""}</small></span>{!student && (a.status === "pending" || a.status === "waitlisted") && <div className="c-appointment-actions"><input aria-label="办理截止时间" type="datetime-local" value={deadline[a.id] || ""} onChange={e => setDeadline(v => ({ ...v, [a.id]: e.target.value }))} /><button disabled={action.busy || !deadline[a.id]} onClick={() => void action.run(() => write(`/appointments/${a.id}/confirm-deadline`, { deadlineAt: new Date(deadline[a.id]).toISOString(), version: a.version, requestId: operationId() }, "PATCH"), "办理期限已设置")}>确认办理期限</button></div>}{(a.status === "pending" || a.status === "scheduled" || a.status === "waitlisted") && <button disabled={action.busy} onClick={() => void action.run(() => write(`/appointments/${a.id}/cancel`, { version: a.version, reason, requestId: key.current }), "预约已取消", () => { key.current = operationId(); setReason(""); })}>取消预约</button>}</div>{(a.status === "pending" || a.status === "waitlisted" || a.confirmDeadlineAt) && <p>办理截止时间：{a.confirmDeadlineAt ? date(a.confirmDeadlineAt) : "待辅导员设置"}</p>}{!student && a.consultationSummary && <section className="c-consultation-summary"><strong>学生确认的咨询交接摘要</strong><p>学生陈述：{a.consultationSummary.studentStatement}</p>{a.consultationSummary.policyReferences?.map((r,i)=><p key={i}>依据：{r.title} · {r.source}</p>)}{a.consultationSummary.materials?.map((m,i)=><p key={`material-${i}`}>依据中的材料要求：{m.text}</p>)}{a.consultationSummary.questions?.length ? <p>待确认问题：{a.consultationSummary.questions.join("；")}</p> : null}</section>}{student && a.outcome && <p>帮扶结果：{a.outcome}</p>}{!student && a.status === "scheduled" && <OutcomeEditor appointment={a} onSaved={() => { list.reload(); slots.reload(); }} />}<AppointmentMessages id={a.id} unread={a.unread} onRefresh={() => list.reload()} /></div>)}{!list.data?.items.length && <p>暂无申请记录。</p>}</LoadState></Panel>
  </div>;
}
