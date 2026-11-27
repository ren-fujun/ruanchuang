import { useRef, useState } from "react";
import type { PortalRole } from "./config";
import { operationId, write, type Appointment, type Slot } from "./api";
import { LoadState, Panel, statusLabel, useAction, useCData } from "./ui";
import { request } from "../../lib/api";

function MessageBody({ id }: { id: string }) {
  const data = useCData<{items: {id: string; text: string; at: string}[]}>(`/appointments/${id}/messages`);
  const [text, setText] = useState('');
  const action = useAction(() => data.reload());
  return <><LoadState resource={data}>{data.data?.items.map(m => <p key={m.id}>{new Date(m.at).toLocaleString('zh-CN')}：{m.text}</p>)}</LoadState><form onSubmit={e => { e.preventDefault(); void action.run(() => write(`/appointments/${id}/messages`, {text}), '留言已发送', () => setText('')); }}><label>留言<input value={text} maxLength={2000} onChange={e => setText(e.target.value)} /></label><button disabled={!text.trim() || action.busy}>发送</button>{action.feedback}</form></>;
}
function AppointmentMessages({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary>查看与发送留言</summary>{open && <MessageBody id={id} />}</details>;
}

type Advice = { item?: { category?: string; minutes: number | null; reason?: string; engine?: string } };
export function Appointments({ role }: { role: PortalRole }) {
  const student = role === "student";
  const list = useCData<{ items: Appointment[] }>("/appointments");
  const slots = useCData<{ items: Slot[] }>("/appointments/slots");
  const [slot, setSlot] = useState(""), [topic, setTopic] = useState(""), [minutes, setMinutes] = useState(15), [starts, setStarts] = useState(""), [ends, setEnds] = useState(""), [reason, setReason] = useState(""), [adviceBusy, setAdviceBusy] = useState(false), [adviceMessage, setAdviceMessage] = useState("");
  const key = useRef(operationId());
  const action = useAction(() => { list.reload(); slots.reload(); });
  const validTime = Number.isFinite(Date.parse(starts)) && Date.parse(starts) > Date.now() && Date.parse(ends) > Date.parse(starts);
  async function suggest() {
    if (!topic.trim()) { setAdviceMessage("请先描述预约事项，再获取建议。"); return; }
    setAdviceBusy(true); setAdviceMessage("");
    try {
      const result = await request<Advice>("/api/appointments/advice", { method: "POST", body: JSON.stringify({ text: topic }) });
      if (result.item?.minutes != null) setMinutes(result.item.minutes);
      setAdviceMessage(result.item?.reason || "请选择预约时长。");
    } catch { setAdviceMessage("暂时无法生成建议，请手动选择时长。"); }
    finally { setAdviceBusy(false); }
  }
  return <div className="c-page">
    <h1>{student ? "申请预约" : "预约与排班"}</h1>
    <Panel title={student ? "开放预约窗口" : "生成接待排班"}>
      <form className="c-form" onSubmit={(e) => { e.preventDefault(); void action.run(() => student ? write("/appointments", { slotId: slot, topic, minutes, requestId: key.current }) : write("/appointments/slots", { startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString(), requestId: key.current }), student ? "申请已提交" : "预约窗口已开放", () => { key.current = operationId(); setTopic(""); setSlot(""); setStarts(""); setEnds(""); }); }}>
        {student ? <>
          <LoadState resource={slots}><label>选择可预约窗口<select required value={slot} onChange={(e) => { setSlot(e.target.value); key.current = operationId(); }}><option value="">请选择</option>{slots.data?.items.filter((s) => s.available).map((s) => <option key={s.id} value={s.id}>{s.ownerName} · {new Date(s.startsAt).toLocaleString("zh-CN")} — {new Date(s.endsAt).toLocaleTimeString("zh-CN")}</option>)}</select></label>{!slots.data?.items.some((s) => s.available) && <p>当前没有开放窗口，请稍后查看。</p>}</LoadState>
          <label>预约事项<input required maxLength={200} value={topic} onChange={(e) => { setTopic(e.target.value); key.current = operationId(); }} /></label>
          <button type="button" disabled={adviceBusy} onClick={() => void suggest()}>{adviceBusy ? "正在生成建议…" : "获取事项建议"}</button>
          <label>预计时长（分钟）<input type="number" min="5" max="120" step="5" required value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>{adviceMessage && <p role="status">{adviceMessage}</p>}
        </> : <><label>开始时间<input required type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></label><label>结束时间<input required type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} /></label>{starts && ends && !validTime && <p role="alert">请填写晚于现在且结束时间晚于开始时间的时段。</p>}</>}
        {action.feedback}<button className="c-primary" disabled={action.busy || (student ? !slot || !topic.trim() : !validTime)}>{student ? "提交申请" : "开放预约窗口"}</button>
      </form>
    </Panel>
    {!student && <Panel title="已开放窗口"><LoadState resource={slots}>{slots.data?.items.map((s) => <div className="c-row" key={s.id}><span>{new Date(s.startsAt).toLocaleString("zh-CN")}<small>{s.available ? "开放预约" : "已结束"}</small></span><button disabled={action.busy} onClick={() => void action.run(() => write('/appointments/batch', { slotId: s.id }), '排班已生成')}>生成排班</button></div>)}{!slots.data?.items.length && <p>尚未开放窗口。</p>}</LoadState></Panel>}
    <Panel title={student ? "申请进度与候补结果" : "预约申请与排班结果"}><LoadState resource={list}><label>取消说明<input className="c-input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>{list.data?.items.map((a) => <div key={a.id}><div className="c-row"><span className="c-grow"><strong>{a.topic}</strong><small>{a.startsAt ? new Date(a.startsAt).toLocaleString("zh-CN") : "等待排班"} · {student ? a.ownerName : a.studentName} · {statusLabel(a.status)}{a.unread ? ` · ${a.unread} 条未读` : ''}</small></span>{['pending','scheduled','waitlisted'].includes(a.status) && <button disabled={action.busy} onClick={() => void action.run(() => write(`/appointments/${a.id}/cancel`, { version: a.version, reason, requestId: key.current }), "预约已取消", () => { key.current = operationId(); setReason(""); })}>取消预约</button>}</div><AppointmentMessages id={a.id} /></div>)}{!list.data?.items.length && <p>暂无申请记录。</p>}</LoadState></Panel>
  </div>;
}
