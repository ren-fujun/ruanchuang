import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../../lib/useApi";
import type { Department, Ticket } from "../../types";
import { operationId, write, type Bundle } from "./api";
import { LoadState, Panel, statusLabel, useAction, useCData } from "./ui";

export function Bundles() {
  const resource = useCData<{ items: Bundle[] }>("/issue-bundles");
  const [page, setPage] = useState(1);
  const tickets = useApi<{ tickets: Ticket[]; hasMore: boolean }>(
    "/tickets?status=pending_review&pageSize=20&page=" + page,
  );
  const depts = useApi<{ departments: Department[] }>("/departments");
  const [selected, setSelected] = useState<Ticket[]>([]);
  const [title, setTitle] = useState(""),
    [department, setDepartment] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const action = useAction(resource.reload),
    navigate = useNavigate();
  const key = useRef(operationId());
  return (
    <div className="c-page">
      <h1>问题包</h1>
      <Panel title="已建立的问题包">
        <LoadState resource={resource}>
          {resource.data?.items.length ? (
            resource.data.items.map((b) => (
              <Link
                className="c-row"
                key={b.id}
                to={"/counselor/bundles/" + b.id}
              >
                <span>
                  <strong>{b.title}</strong>
                  <small>
                    {b.items.length} 项 · {statusLabel(b.status)}
                  </small>
                </span>
                查看回执 →
              </Link>
            ))
          ) : (
            <p>暂无问题包。</p>
          )}
        </LoadState>
      </Panel>
      <Panel title="人工核对并创建">
        <form
          className="c-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const result = await write<{ item: Bundle }>("/issue-bundles", {
                title,
                departmentId: department,
                note,
                ticketIds: selected.map((t) => t.id),
                reviewed: true,
                requestId: key.current,
              });
              if (!result.item?.id)
                throw new Error("服务返回缺少问题包编号，请联系集成人员核对。");
              navigate("/counselor/bundles/" + result.item.id);
            }, "问题包已建立");
          }}
        >
          <label>
            问题包名称
            <input
              required
              maxLength={100}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                key.current = operationId();
              }}
            />
          </label>
          <label>
            目标部门
            <select
              required
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                key.current = operationId();
              }}
            >
              <option value="">请选择</option>
              {depts.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {depts.error && (
            <p role="alert">
              {depts.error}
              <button type="button" onClick={depts.reload}>
                重新加载部门
              </button>
            </p>
          )}
          <fieldset disabled={action.busy}>
            <legend>选择待审核诉求</legend>
            <LoadState resource={tickets}>
              {tickets.data?.tickets.map((t) => (
                <label className="c-choice" key={t.id}>
                  <input
                    type="checkbox"
                    checked={selected.some((x) => x.id === t.id)}
                    onChange={(e) => {
                      setSelected(
                        e.target.checked
                          ? [...selected, t]
                          : selected.filter((x) => x.id !== t.id),
                      );
                      setConfirmed(false);
                      key.current = operationId();
                    }}
                  />
                  <span>
                    {t.title}
                    <small>
                      {t.studentName} · {t.category} ·{" "}
                      {t.risk === "high" ? "高风险" : "常规核对"}
                    </small>
                  </span>
                  <Link to={"/counselor/tickets/" + t.id}>详情</Link>
                </label>
              ))}
              {!tickets.data?.tickets.length && <p>当前没有待审核诉求。</p>}
            </LoadState>
            <div className="c-actions">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              <span>第 {page} 页</span>
              <button
                type="button"
                disabled={!tickets.data?.hasMore}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          </fieldset>
          <div className="c-review">
            <h3>本次核对 · {selected.length} 项</h3>
            {selected.map((t) => (
              <p key={t.id}>
                {t.id}　{t.title}
              </p>
            ))}
          </div>
          <label>
            转交说明
            <textarea
              value={note}
              maxLength={1000}
              onChange={(e) => {
                setNote(e.target.value);
                key.current = operationId();
              }}
            />
          </label>
          <label className="c-choice">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我已逐条核对诉求、风险和目标部门
          </label>
          {action.feedback}
          <button
            className="c-primary"
            disabled={
              action.busy || !confirmed || !selected.length || !department
            }
          >
            建立待转交问题包
          </button>
        </form>
      </Panel>
    </div>
  );
}
export function BundleDetail() {
  const { id } = useParams();
  const resource = useCData<{ item: Bundle }>(
    "/issue-bundles/" + encodeURIComponent(id || ""),
  );
  const action = useAction(resource.reload),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const key = useRef(operationId());
  const b = resource.data?.item;
  return (
    <div className="c-page">
      <Link to="/counselor/bundles">← 返回问题包</Link>
      <h1>核对与逐条回执</h1>
      <LoadState resource={resource}>
        {b && (
          <>
            <Panel title={b.title}>
              <p>
                {statusLabel(b.status)} · 版本 {b.version}
              </p>
              {b.reason && <p>{b.reason}</p>}
              <p>
                已回执 {b.items.filter((i) => i.result).length} /{" "}
                {b.items.length} 项，学生已确认{" "}
                {b.items.filter((i) => i.studentConfirmed).length} 项
              </p>
              {b.items.map((i) => (
                <article className="c-review" key={i.ticketId}>
                  <Link to={"/counselor/tickets/" + i.ticketId}>
                    <h3>{i.title}</h3>
                  </Link>
                  <p>
                    {statusLabel(i.status)}
                    {i.reopened ? " · 已重新办理" : ""}
                  </p>
                  <p>{i.result || "等待部门反馈单项结果"}</p>
                  <small>
                    {i.studentConfirmed ? "学生已确认" : "学生待确认"}
                  </small>
                </article>
              ))}
            </Panel>
            <Panel title="转交与回访">
              <form
                className="c-form"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <label>
                  说明
                  <textarea
                    value={reason}
                    required
                    maxLength={1000}
                    onChange={(e) => {
                      setReason(e.target.value);
                      key.current = operationId();
                    }}
                  />
                </label>
                <label className="c-choice">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  已核对本包全部诉求及目标部门
                </label>
                {action.feedback}
                <div className="c-actions">
                  {["draft", "returned"].includes(b.status) && (
                    <button
                      type="button"
                      className="c-primary"
                      disabled={action.busy || !confirmed}
                      onClick={() =>
                        void action.run(
                          () =>
                            write("/issue-bundles/" + b.id + "/send", {
                              version: b.version,
                              reviewed: true,
                              reason,
                              requestId: key.current,
                            }),
                          "问题包已转交",
                          () => {
                            key.current = operationId();
                            setReason("");
                          },
                        )
                      }
                    >
                      确认转交
                    </button>
                  )}
                  {["sent", "accepted", "processing"].includes(b.status) && (
                    <button
                      type="button"
                      disabled={action.busy || !reason.trim()}
                      onClick={() =>
                        void action.run(
                          () =>
                            write("/issue-bundles/" + b.id + "/urge", {
                              version: b.version,
                              reason,
                              requestId: key.current,
                            }),
                          "催办已提交",
                          () => {
                            key.current = operationId();
                            setReason("");
                          },
                        )
                      }
                    >
                      催办
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={action.busy || !reason.trim()}
                    onClick={() =>
                      void action.run(
                        () =>
                          write("/issue-bundles/" + b.id + "/follow-ups", {
                            version: b.version,
                            text: reason,
                            requestId: key.current,
                          }),
                        "回访已记录",
                        () => {
                          key.current = operationId();
                          setReason("");
                        },
                      )
                    }
                  >
                    记录回访
                  </button>
                </div>
              </form>
            </Panel>
          </>
        )}
      </LoadState>
    </div>
  );
}
