import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Sparkles,
  MapPin,
  Clock3,
  UserRound,
  Send,
  GitBranch,
  MessageSquare,
  Bell,
  CheckCheck,
  Archive,
  Plus,
  Trash2,
  ShieldAlert,
  Paperclip,
  RefreshCw,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useApp, useResource } from "../../lib/context";
import { dateTime, statusLabels } from "../../lib/format";
import type { SplitItem, Ticket } from "../../types";
import { Modal, State, StatusPill, RiskPill } from "./components";
type Action =
  "review" | "assign" | "split" | "urge" | "note" | "remind" | "archive";
const names: Record<Action, string> = {
  review: "审核诉求",
  assign: "分派工单",
  split: "拆分复合工单",
  urge: "发送催办",
  note: "添加内部备注",
  remind: "提醒学生确认",
  archive: "归档工单",
};
const permissionKeys = {
  review: "canReview",
  assign: "canAssign",
  split: "canSplit",
  urge: "canUrge",
  note: "canNote",
  remind: "canRemind",
  archive: "canArchive",
} as const;
export default function TicketDetail() {
  const { id = "" } = useParams();
  const { dicts, toast } = useApp();
  const {
    data: t,
    error,
    loading,
    reload,
  } = useResource(() => api.ticket(id), [id]);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [remark, setRemark] = useState("");
  const [approved, setApproved] = useState(true);
  const [deptId, setDeptId] = useState("");
  const [handlerId, setHandlerId] = useState("");
  const [slaHours, setSlaHours] = useState(24);
  const [children, setChildren] = useState<SplitItem[]>([]);
  function chooseDept(value: string) {
    setDeptId(value);
    const dept = dicts.departments.find((d) => d.deptId === value);
    setHandlerId(dept?.handlers[0]?.handlerId || "");
    setSlaHours(dept?.slaHours || 24);
  }
  function open(a: Action) {
    setAction(a);
    setFormError("");
    setRemark("");
    setApproved(true);
    chooseDept(t?.suggestedDeptIds[0] || "");
    setChildren([
      { title: "", content: "", deptId: "" },
      { title: "", content: "", deptId: "" },
    ]);
  }
  async function submit() {
    if (!t || !action || busy) return;
    setBusy(true);
    setFormError("");
    try {
      switch (action) {
        case "review":
          await api.review(id, approved, remark);
          break;
        case "assign":
          await api.assign(id, { deptId, handlerId, remark, slaHours });
          break;
        case "split":
          await api.split(id, children);
          break;
        case "urge":
          await api.urge(id, remark);
          break;
        case "note":
          await api.note(id, remark);
          break;
        case "remind":
          await api.remind(id);
          break;
        case "archive":
          await api.archive(id);
      }
      setAction(null);
      toast("操作成功，工单已更新");
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        await reload();
        toast("工单状态发生变化，已刷新详情，请检查当前可用操作");
      }
    } finally {
      setBusy(false);
    }
  }
  const department = dicts.departments.find((d) => d.deptId === t?.deptId);
  const handler = department?.handlers.find(
    (h) => h.handlerId === t?.handlerId,
  );
  const updateChild = (index: number, key: keyof SplitItem, value: string) =>
    setChildren((current) =>
      current.map((c, i) => (i === index ? { ...c, [key]: value } : c)),
    );
  return (
    <>
      <div className="detail-toolbar">
        <Link className="text-link" to="/counselor/tickets">
          <ArrowLeft size={16} />
          返回工单台
        </Link>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void reload()}
        >
          <RefreshCw size={15} />
          刷新详情
        </button>
      </div>
      {error && <State error={error} retry={reload} />}{" "}
      {!t ? (
        !error && <State loading />
      ) : (
        <>
          <section className="card detail-title">
            <div className="row-label">
              <span>{t.ticketId}</span>
              <RiskPill risk={t.riskLevel} />
              {t.isOverdue && (
                <span className="overdue">已超时 · 请优先跟进</span>
              )}
            </div>
            <div className="detail-title-line">
              <h1>{t.title}</h1>
              <StatusPill status={t.status} />
            </div>
            <div className="detail-meta">
              <span>
                <UserRound size={15} />
                {t.studentName} · {t.college}
              </span>
              <span>
                <MapPin size={15} />
                {t.location || "未填写地点"}
              </span>
              <span>
                <Clock3 size={15} />
                {dateTime(t.createdAt)} 提交
              </span>
            </div>
            {t.parentTicketId && (
              <Link
                className="text-link"
                to={`/counselor/tickets/${t.parentTicketId}`}
              >
                查看父工单 {t.parentTicketId}
                <ArrowUpRight size={15} />
              </Link>
            )}
          </section>
          <div className="detail-grid">
            <div className="detail-main">
              <section className="ai-card">
                <div className="section-heading">
                  <h2>
                    <Sparkles size={20} />
                    AI 诉求摘要
                  </h2>
                  <span className="subtle-badge">辅助研判 · 人工确认</span>
                </div>
                <p>{t.aiSummary || "暂无 AI 摘要，请以学生原始描述为准。"}</p>
                <div className="ai-risk">
                  <ShieldAlert size={18} />
                  <div>
                    <strong>风险识别依据</strong>
                    <p>{t.aiRiskReason || "暂无风险说明"}</p>
                  </div>
                </div>
                <div className="suggested">
                  <span>建议协同</span>
                  {t.suggestedDeptIds.map((id) => (
                    <span className="suggested-tag" key={id}>
                      {dicts.departments.find((d) => d.deptId === id)?.name ||
                        id}
                    </span>
                  ))}
                </div>
              </section>
              <section className="card detail-section">
                <h2>学生原始诉求</h2>
                <p className="original-content">{t.content}</p>
                <div className="metadata-pills">
                  <span>
                    {dicts.categories.find((c) => c.value === t.category)
                      ?.label || t.category}
                  </span>
                  <span>
                    紧急程度：
                    {
                      { NORMAL: "普通", URGENT: "紧急", CRITICAL: "非常紧急" }[
                        t.urgency
                      ]
                    }
                  </span>
                </div>
                {t.attachments.length > 0 && (
                  <div className="attachments">
                    {t.attachments.map((url, i) => {
                      let safe = false;
                      try {
                        safe = ["https:", "http:"].includes(
                          new URL(url).protocol,
                        );
                      } catch {}
                      return safe ? (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Paperclip size={16} />
                          查看附件 {i + 1}
                        </a>
                      ) : (
                        <span key={url}>附件链接无效</span>
                      );
                    })}
                  </div>
                )}
              </section>
              {t.rejectReason && (
                <section className="card rejection">
                  <h2>部门驳回 · 等待重新协调</h2>
                  <p>{t.rejectReason}</p>
                  <small>
                    请重新确认归属后分派。学生端显示“辅导员协调中”。
                  </small>
                </section>
              )}
              {t.solution && (
                <section className="card detail-section">
                  <h2>部门处置反馈</h2>
                  <p>{t.solution}</p>
                  <small className="muted">由部门端录入，教师端只读。</small>
                </section>
              )}
              {t.children.length > 0 && (
                <section className="card detail-section">
                  <h2>
                    <GitBranch size={18} />
                    关联子工单
                  </h2>
                  <p className="muted">
                    子工单独立流转，全部确认办结后才可归档父工单。
                  </p>
                  {t.children.map((child) => (
                    <ChildTicket key={child} id={child} />
                  ))}
                </section>
              )}
              <section className="card detail-section">
                <div className="section-heading">
                  <h2>流转时间线</h2>
                  <span className="muted">{t.logs.length} 条记录</span>
                </div>
                <ol className="timeline">
                  {[...t.logs]
                    .sort(
                      (a, b) =>
                        Date.parse(b.createdAt) - Date.parse(a.createdAt),
                    )
                    .map((log) => (
                      <li key={log.logId}>
                        <i />
                        <div>
                          <strong>{log.remark}</strong>
                          <p>
                            {dateTime(log.createdAt)} ·{" "}
                            {log.operatorRole === "COUNSELOR"
                              ? "辅导员"
                              : log.operatorRole === "STUDENT"
                                ? "学生"
                                : "协同部门"}{" "}
                            · {statusLabels[log.toStatus]}
                          </p>
                        </div>
                      </li>
                    ))}
                </ol>
              </section>
            </div>
            <aside className="detail-side">
              <section className="card action-panel">
                <div className="section-heading">
                  <h2>协同处理</h2>
                  <span className="live-dot" />
                </div>
                <div className="assignee">
                  <span className="muted">当前承办部门</span>
                  <strong>{department?.name || "等待分派"}</strong>
                  <p>
                    {handler
                      ? `经办人 · ${handler.name}`
                      : "审核后选择承办部门与经办人"}
                  </p>
                </div>
                <div className={`deadline ${t.isOverdue ? "late" : ""}`}>
                  <Clock3 size={17} />
                  <div>
                    <small>办结时限</small>
                    <strong>{dateTime(t.slaDeadline)}</strong>
                  </div>
                </div>
                <div className="action-buttons">
                  {(
                    [
                      { a: "review", icon: CheckCheck, primary: true },
                      { a: "assign", icon: Send, primary: true },
                      { a: "urge", icon: Bell },
                      { a: "split", icon: GitBranch },
                      { a: "note", icon: MessageSquare },
                      { a: "remind", icon: Bell },
                      { a: "archive", icon: Archive },
                    ] as const
                  )
                    .filter((item) => t.permissions[permissionKeys[item.a]])
                    .map((item) => (
                      <button
                        key={item.a}
                        className={`button ${"primary" in item ? "primary" : "secondary"} full`}
                        onClick={() => open(item.a)}
                      >
                        <item.icon size={16} />
                        {names[item.a]}
                      </button>
                    ))}
                </div>
                {!Object.values(t.permissions).some(Boolean) && (
                  <p className="muted">当前状态暂无可执行操作。</p>
                )}
                <p className="permission-note">
                  操作权限由服务端确认。部门接单与处置结果由部门端提交。
                </p>
              </section>
              <section className="card detail-section notes-section">
                <h2>
                  <MessageSquare size={17} />
                  内部协同备注
                </h2>
                <p className="muted">仅辅导员可见，不向学生展示。</p>
                {t.notes.length ? (
                  t.notes.map((n) => (
                    <div className="note" key={n.noteId}>
                      <p>{n.text}</p>
                      <small>
                        {n.actor} · {dateTime(n.createdAt)}
                      </small>
                    </div>
                  ))
                ) : (
                  <div className="empty-note">
                    暂无备注，记录下一步跟进计划。
                  </div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
      {action && t && (
        <Modal
          title={names[action]}
          onClose={() => setAction(null)}
          busy={busy}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="modal-subtitle">{t.title}</p>
            {action === "review" && (
              <>
                <label>
                  审核结果
                  <select
                    value={String(approved)}
                    onChange={(e) => setApproved(e.target.value === "true")}
                  >
                    <option value="true">审核通过，进入分派</option>
                    <option value="false">退回草稿，补充信息</option>
                  </select>
                </label>
                <label>
                  {approved ? "审核说明（选填）" : "退回原因"}
                  <textarea
                    required={!approved}
                    maxLength={1000}
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="请填写清晰、可执行的说明"
                  />
                </label>
              </>
            )}
            {action === "assign" && (
              <>
                <div className="notice">
                  PDF 约定为单部门分派；跨部门诉求请使用“拆分复合工单”。
                </div>
                <label>
                  承办部门
                  <select
                    required
                    value={deptId}
                    onChange={(e) => chooseDept(e.target.value)}
                  >
                    <option value="">请选择部门</option>
                    {dicts.departments.map((d) => (
                      <option key={d.deptId} value={d.deptId}>
                        {d.name}
                        {t.suggestedDeptIds.includes(d.deptId)
                          ? " · AI 建议"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    经办人
                    <select
                      required
                      value={handlerId}
                      onChange={(e) => setHandlerId(e.target.value)}
                    >
                      <option value="">请选择经办人</option>
                      {dicts.departments
                        .find((d) => d.deptId === deptId)
                        ?.handlers.map((h) => (
                          <option key={h.handlerId} value={h.handlerId}>
                            {h.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    办结时限（小时）
                    <input
                      type="number"
                      required
                      min={1}
                      max={168}
                      value={slaHours}
                      onChange={(e) => setSlaHours(Number(e.target.value))}
                    />
                  </label>
                </div>
                <p className="notice">
                  预计截止：
                  {dateTime(
                    new Date(Date.now() + slaHours * 3600000).toISOString(),
                  )}
                  （预览；实际以服务端返回为准）
                </p>
                <label>
                  分派说明
                  <textarea
                    maxLength={1000}
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="说明需要部门协同处理的事项"
                  />
                </label>
              </>
            )}
            {action === "split" && (
              <>
                <div className="notice">
                  拆分为 2–5
                  个独立子工单。父工单保留原状态；请为每项指定承办部门。
                </div>
                {children.map((c, i) => (
                  <fieldset className="split-item" key={i}>
                    <legend>子工单 {i + 1}</legend>
                    <label>
                      标题
                      <input
                        required
                        maxLength={40}
                        value={c.title}
                        onChange={(e) =>
                          updateChild(i, "title", e.target.value)
                        }
                        placeholder="明确一项独立处理事项"
                      />
                    </label>
                    <label>
                      描述
                      <textarea
                        required
                        maxLength={2000}
                        value={c.content}
                        onChange={(e) =>
                          updateChild(i, "content", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      承办部门
                      <select
                        required
                        value={c.deptId}
                        onChange={(e) =>
                          updateChild(i, "deptId", e.target.value)
                        }
                      >
                        <option value="">请选择部门</option>
                        {dicts.departments.map((d) => (
                          <option key={d.deptId} value={d.deptId}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {children.length > 2 && (
                      <button
                        className="text-link danger"
                        type="button"
                        onClick={() =>
                          setChildren(children.filter((_, n) => n !== i))
                        }
                      >
                        <Trash2 size={14} />
                        移除此项
                      </button>
                    )}
                  </fieldset>
                ))}
                <button
                  className="button secondary"
                  type="button"
                  disabled={children.length >= 5}
                  onClick={() =>
                    setChildren([
                      ...children,
                      { title: "", content: "", deptId: "" },
                    ])
                  }
                >
                  <Plus size={15} />
                  添加子工单
                </button>
              </>
            )}
            {(action === "note" || action === "urge") && (
              <label>
                {action === "note" ? "备注内容" : "催办说明"}
                <textarea
                  autoFocus
                  required
                  maxLength={1000}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder={
                    action === "note"
                      ? "记录已联系情况和后续跟进计划"
                      : "请说明需加快处理的原因与期望反馈时间"
                  }
                />
              </label>
            )}
            {action === "remind" && (
              <div className="notice">
                将向学生发送办结确认提醒。不会替学生确认，也不会改变工单状态。
              </div>
            )}
            {action === "archive" && (
              <div className="notice">
                归档后工单将只读。父工单仅在所有子工单确认办结后允许归档。
              </div>
            )}
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            {!t.permissions[permissionKeys[action]] && (
              <p className="form-error">
                当前状态不再允许此操作，请关闭弹窗查看最新工单。
              </p>
            )}
            <div className="modal-footer">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                disabled={busy || !t.permissions[permissionKeys[action]]}
              >
                {busy ? "正在提交…" : "确认" + names[action]}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function ChildTicket({ id }: { id: string }) {
  const { data, error } = useResource<Ticket>(() => api.ticket(id), [id]);
  return (
    <Link className="child-ticket" to={`/counselor/tickets/${id}`}>
      <div>
        <small>{id}</small>
        <strong>{data?.title || error || "正在加载子工单…"}</strong>
      </div>
      {data && <StatusPill status={data.status} />}
      <ArrowUpRight size={16} />
    </Link>
  );
}
