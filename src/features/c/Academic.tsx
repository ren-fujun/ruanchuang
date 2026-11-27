import { Link, useSearchParams } from "react-router-dom";
import { Panel, LoadState, statusLabel, useCData } from "./ui";
import type { AcademicCase } from "./api";
import type { PortalRole } from "./config";
import { AcademicCollaboration } from "../b/Collaboration";
import { request } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

export function Academic({ role }: { role: PortalRole }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const caseId = role === "counselor" ? params.get("case") : null;
  const resource = useCData<{ items: AcademicCase[] }>(
    role === "counselor" ? "/b/cases" : "/academic/cases/mine",
  );
  const items = (resource.data?.items ?? []).filter(item => !caseId || item.id === caseId);
  return (
    <div className="c-page">
      <h1>{role === "student" ? "学业支持" : "学业跟进"}</h1>
      {caseId && <Link className="c-outline" to="/counselor/academic">查看全部学业事项</Link>}
      {role === "student" && (
        <Panel title="学业咨询">
          <Link className="c-primary" to="/student/assistant">
            咨询有来源的学业问答
          </Link>
          <Link className="c-outline" to="/student/leaves">
            申请请假
          </Link>
        </Panel>
      )}
      {role === "counselor" && (
        <div className="c-actions">
          <Link className="c-outline" to="/counselor/leaves">
            请假审批
          </Link>
          <Link className="c-outline" to="/counselor/knowledge">
            知识纠错
          </Link>
        </div>
      )}
      <LoadState resource={resource}>
        {items.length ? (
          items.map((c) => (
            <Panel key={c.id} title={c.course}>
              <p>
                {c.studentName} · {statusLabel(c.status)} · 版本 {c.version}
              </p>
              {role === "counselor" && c.followUp && <p>{c.followUp.statusLabel} · {c.followUp.reason}</p>}
              <p>
                教务结果　
                {c.result
                  ? c.result.value === "passed"
                    ? "通过"
                    : "未通过，继续跟进"
                  : "等待回写"}
              </p>
              {c.records.map((r, i) => (
                <p key={i}>
                  {statusLabel(r.type)} ·{" "}
                  {new Date(r.at).toLocaleString("zh-CN")}
                </p>
              ))}
              {role === "counselor" && user && (
                <AcademicCollaboration
                  item={c}
                  userId={user.id}
                  refresh={async () => {
                    resource.reload();
                  }}
                  call={(path, body, method = "POST") =>
                    request(path, {
                      method: body === undefined ? "GET" : method,
                      body:
                        body === undefined ? undefined : JSON.stringify(body),
                    })
                  }
                />
              )}
            </Panel>
          ))
        ) : (
          <p className="c-state">{caseId ? "找不到该学业事项。" : "当前没有分配给你的学业任务。"}</p>
        )}
      </LoadState>
    </div>
  );
}
