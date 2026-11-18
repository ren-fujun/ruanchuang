import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../../lib/api";
import { cRequest } from "./api";

export function useCData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const loadedPath = useRef<string | null>(null);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      setData(null);
      setError("");
      return;
    }
    let active = true;
    const controller = new AbortController();
    const samePath = loadedPath.current === path;
    if (!samePath) {
      setLoading(true);
      setData(null);
    }
    setError("");
    cRequest<T>(path, { signal: controller.signal })
      .then((value) => {
        if (active) {
          loadedPath.current = path;
          setData(value);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, revision]);
  return { data, error, loading, reload: () => setRevision((r) => r + 1) };
}
export function LoadState({
  resource,
  children,
}: {
  resource: { loading: boolean; error: string | null; reload: () => void };
  children?: ReactNode;
}) {
  if (resource.loading)
    return (
      <p role="status" className="c-state">
        正在加载…
      </p>
    );
  if (resource.error)
    return (
      <div className="c-state" role="alert">
        <p>{resource.error}</p>
        <button onClick={resource.reload}>重新加载</button>
      </div>
    );
  return <>{children}</>;
}
export function useAction(reload?: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const locked = useRef(false);
  async function run(
    task: () => Promise<unknown>,
    message: string,
    after?: () => void,
  ) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await task();
      setSuccess(message);
      reload?.();
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
      if (e instanceof ApiError && e.status === 409) reload?.();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    run,
    feedback: (
      <>
        {error && (
          <p role="alert" className="c-error">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="c-success">
            {success}
          </p>
        )}
      </>
    ),
  };
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="c-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export const statusLabel = (s: string) =>
  ({
    draft: "待核对",
    sent: "已转交",
    accepted: "已接收",
    returned: "已退回",
    processing: "处理中",
    awaiting_confirm: "待确认",
    completed: "已完成",
    reopened: "重新办理",
    scheduled: "已预约",
    cancelled: "已取消",
    pending_contact: "待联系",
    contacted: "已联系",
    interviewed: "已面谈",
    retake_reminded: "已提醒重修",
    referred: "已转介",
    pending_review: "待审核",
    assigned: "已分派",
    pending: "待处理",
  })[s] || s;
