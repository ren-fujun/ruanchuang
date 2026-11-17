import { useRef, useState } from "react";
import type { PortalRole } from "./config";
import { operationId, write, type Appointment, type Slot } from "./api";
import { LoadState, Panel, statusLabel, useAction, useCData } from "./ui";

export function Appointments({ role }: { role: PortalRole }) {
  const student = role === "student";
  const list = useCData<{ items: Appointment[] }>("/appointments");
  const slots = useCData<{ items: Slot[] }>("/appointments/slots");
  const [slot, setSlot] = useState(""),
    [topic, setTopic] = useState(""),
    [starts, setStarts] = useState(""),
    [ends, setEnds] = useState(""),
    [reason, setReason] = useState("");
  const key = useRef(operationId());
  const action = useAction(() => {
    list.reload();
    slots.reload();
  });
  const validTime =
    Number.isFinite(Date.parse(starts)) &&
    Date.parse(starts) > Date.now() &&
    Date.parse(ends) > Date.parse(starts);
  return (
    <div className="c-page">
      <h1>{student ? "申请预约" : "预约与排班"}</h1>
      <Panel title={student ? "选择预约时段" : "新增接待时段"}>
        <form
          className="c-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(
              () =>
                student
                  ? write("/appointments", {
                      slotId: slot,
                      topic,
                      requestId: key.current,
                    })
                  : write("/appointments/slots", {
                      startsAt: new Date(starts).toISOString(),
                      endsAt: new Date(ends).toISOString(),
                      requestId: key.current,
                    }),
              student ? "预约已提交" : "接待时段已发布",
              () => {
                key.current = operationId();
                setTopic("");
                setSlot("");
                setStarts("");
                setEnds("");
              },
            );
          }}
        >
          {student ? (
            <>
              <LoadState resource={slots}>
                <label>
                  可预约时段
                  <select
                    required
                    value={slot}
                    onChange={(e) => {
                      setSlot(e.target.value);
                      key.current = operationId();
                    }}
                  >
                    <option value="">请选择</option>
                    {slots.data?.items
                      .filter((s) => s.available)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.ownerName} ·{" "}
                          {new Date(s.startsAt).toLocaleString("zh-CN")} —{" "}
                          {new Date(s.endsAt).toLocaleTimeString("zh-CN")}
                        </option>
                      ))}
                  </select>
                </label>
                {!slots.data?.items.some((s) => s.available) && (
                  <p>暂无可预约时段。</p>
                )}
              </LoadState>
              <label>
                预约事项
                <input
                  required
                  maxLength={200}
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    key.current = operationId();
                  }}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                开始时间
                <input
                  required
                  type="datetime-local"
                  value={starts}
                  onChange={(e) => {
                    setStarts(e.target.value);
                    key.current = operationId();
                  }}
                />
              </label>
              <label>
                结束时间
                <input
                  required
                  type="datetime-local"
                  value={ends}
                  onChange={(e) => {
                    setEnds(e.target.value);
                    key.current = operationId();
                  }}
                />
              </label>
              {starts && ends && !validTime && (
                <p role="alert">开始时间须晚于现在，结束时间须晚于开始时间。</p>
              )}
            </>
          )}
          {action.feedback}
          <button
            className="c-primary"
            disabled={
              action.busy || (student ? !slot || !topic.trim() : !validTime)
            }
          >
            {student ? "提交预约" : "发布接待时段"}
          </button>
        </form>
      </Panel>
      {!student && (
        <Panel title="我的接待时段">
          <LoadState resource={slots}>
            {slots.data?.items.map((s) => (
              <div className="c-row" key={s.id}>
                <span>
                  {new Date(s.startsAt).toLocaleString("zh-CN")}
                  <small>{s.available ? "可预约" : "已预约"}</small>
                </span>
              </div>
            ))}
            {!slots.data?.items.length && <p>暂无接待时段。</p>}
          </LoadState>
        </Panel>
      )}
      <Panel title="预约记录">
        <LoadState resource={list}>
          <label>
            取消说明
            <input
              className="c-input"
              maxLength={200}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                key.current = operationId();
              }}
            />
          </label>
          {list.data?.items.map((a) => (
            <div className="c-row" key={a.id}>
              <span className="c-grow">
                <strong>{a.topic}</strong>
                <small>
                  {new Date(a.startsAt).toLocaleString("zh-CN")} · {a.ownerName}{" "}
                  · {statusLabel(a.status)}
                </small>
              </span>
              {a.status === "scheduled" && (
                <button
                  disabled={action.busy || !reason.trim()}
                  onClick={() =>
                    void action.run(
                      () =>
                        write("/appointments/" + a.id + "/cancel", {
                          version: a.version,
                          reason,
                          requestId: key.current,
                        }),
                      "预约已取消",
                      () => {
                        key.current = operationId();
                        setReason("");
                      },
                    )
                  }
                >
                  取消预约
                </button>
              )}
            </div>
          ))}
          {!list.data?.items.length && <p>暂无预约记录。</p>}
        </LoadState>
      </Panel>
    </div>
  );
}
