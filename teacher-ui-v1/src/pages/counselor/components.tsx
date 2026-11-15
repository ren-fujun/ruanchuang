import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Inbox,
  LoaderCircle,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Ticket, Status, Risk } from "../../types";
import { statusLabels, riskLabels, dateTime } from "../../lib/format";
import { useApp } from "../../lib/context";
export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill status-${status}`}>{statusLabels[status]}</span>
  );
}
export function RiskPill({ risk }: { risk: Risk }) {
  return (
    <span className={`risk risk-${risk}`}>
      <i />
      {riskLabels[risk]}
    </span>
  );
}
export function State({
  error,
  loading,
  retry,
  empty = "这里暂时没有工单",
}: {
  error?: string;
  loading?: boolean;
  retry?: () => void;
  empty?: string;
}) {
  return (
    <div className="state" role={error ? "alert" : "status"}>
      {error ? (
        <AlertCircle />
      ) : loading ? (
        <LoaderCircle className="spin" />
      ) : (
        <Inbox />
      )}
      <strong>{error || (loading ? "正在加载工作台…" : empty)}</strong>
      {error && (
        <button className="button secondary" onClick={retry}>
          重新加载
        </button>
      )}
    </div>
  );
}
export function TicketRow({ ticket: t }: { ticket: Ticket }) {
  const { dicts } = useApp();
  return (
    <Link className="ticket-row" to={`/counselor/tickets/${t.ticketId}`}>
      <div
        className={`category-icon ${t.riskLevel === "HIGH" ? "pink" : "purple"}`}
      >
        {dicts.categories
          .find((c) => c.value === t.category)
          ?.label.slice(0, 1) || "诉"}
      </div>
      <div className="ticket-copy">
        <div className="row-label">
          <span>{t.ticketId}</span>
          <RiskPill risk={t.riskLevel} />
          {t.isOverdue && <span className="overdue">已超时</span>}
        </div>
        <h3>{t.title}</h3>
        <p>
          {t.studentName} <b>·</b>{" "}
          {dicts.categories.find((c) => c.value === t.category)?.label ||
            t.category}{" "}
          <b>·</b> {dateTime(t.createdAt)}
        </p>
      </div>
      <StatusPill status={t.status} />
      <ArrowUpRight size={18} />
    </Link>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    panel.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          if (e.key === "Tab") {
            const items = panel.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,select,textarea,a[href]",
            );
            if (!items?.length) return;
            const first = items[0],
              last = items[items.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === panel.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
