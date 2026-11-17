import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../../lib/useApi";
import type { TicketDetailData } from "../../types";
import { operationId, write } from "./api";
import { LoadState, Panel, useAction } from "./ui";

export function TicketChanges() {
  const { id, action: kind } = useParams();
  const resource = useApi<TicketDetailData>(
    "/tickets/" + encodeURIComponent(id || ""),
  );
  const action = useAction(resource.reload),
    [text, setText] = useState("");
  const key = useRef(operationId());
  const reopen = kind === "reopen",
    ticket = resource.data?.ticket;
  const permitted =
    ["supplement", "reopen"].includes(kind || "") &&
    ticket &&
    (reopen
      ? ["completed", "awaiting_confirm"].includes(ticket.status)
      : ticket.status !== "completed");
  return (
    <div className="c-page">
      <Link to={"/student/tickets/" + id}>← 工单进度</Link>
      <h1>{reopen ? "申请重新办理" : "补充诉求材料"}</h1>
      <LoadState resource={resource}>
        {ticket && (
          <Panel title={ticket.title}>
            {permitted ? (
              <form
                className="c-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(
                    () =>
                      write(
                        "/tickets/" +
                          id +
                          (reopen ? "/reopen" : "/supplements"),
                        {
                          text,
                          expectedUpdatedAt: ticket.updatedAt,
                          requestId: key.current,
                        },
                      ),
                    reopen ? "重新办理申请已提交" : "补充说明已提交",
                    () => {
                      setText("");
                      key.current = operationId();
                    },
                  );
                }}
              >
                <label>
                  {reopen ? "未解决的问题与重开原因" : "补充说明"}
                  <textarea
                    required
                    maxLength={2000}
                    minLength={6}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      key.current = operationId();
                    }}
                  />
                </label>
                <p>
                  请填写必要的事项说明。涉及证明文件时，请按老师提供的渠道补交。
                </p>
                <button
                  className="c-primary"
                  disabled={action.busy || text.trim().length < 6}
                >
                  确认提交
                </button>
              </form>
            ) : (
              <p>当前状态暂不支持此操作，请返回查看最新进展。</p>
            )}
            {action.feedback}
          </Panel>
        )}
      </LoadState>
    </div>
  );
}
