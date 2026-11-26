import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { write } from "./api";
import { Panel, LoadState, useAction, useCData } from "./ui";

interface Knowledge {
  id: string;
  title: string;
  answer: string;
  keywords: string[];
  source: string;
  sourceExcerpt?: string;
  department: string;
  validUntil: string;
  authorId: string;
  version: number;
  status: string;
  review?: { note: string };
}
const empty = {
  title: "",
  answer: "",
  keywords: "",
  source: "",
  sourceExcerpt: "",
  department: "",
  validUntil: "",
  parentId: "",
};
export function KnowledgeCorrections() {
  const { user } = useAuth();
  const resource = useCData<{ items: Knowledge[] }>("/b/knowledge");
  const action = useAction(resource.reload);
  const [draft, setDraft] = useState(empty);
  const [note, setNote] = useState("");
  const [imported, setImported] = useState({ title: "", source: "", department: "", validUntil: "", text: "" });
  const labels = {
    title: "标准答案标题",
    answer: "答案内容",
    keywords: "关键词（逗号分隔）",
    source: "依据来源",
    department: "责任部门",
    validUntil: "有效期",
  };
  const reviewer = Boolean(
    (user as typeof user & { knowledgeReviewer?: boolean })?.knowledgeReviewer,
  );
  const keys = draft.keywords
    .split(/[,，]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const valid =
    keys.length > 0 &&
    keys.length <= 20 &&
    keys.every((k) => k.length >= 2 && k.length <= 30) &&
    Date.parse(draft.validUntil) > Date.now();
  return (
    <div className="c-page">
      <h1>知识纠错与版本</h1>
      <Panel title="从文件正文生成草稿">
        <p>请先从文件复制正文并粘贴。系统按空行分段生成草稿；需补充关键词并由另一位审核人员核对原文后发布。</p>
        <form className="c-form" onSubmit={(e) => {
          e.preventDefault();
          if (!(Date.parse(imported.validUntil) > Date.now())) return;
          void action.run(() => write("/b/knowledge/import-text", { ...imported, validUntil: new Date(imported.validUntil).toISOString() }), "已生成草稿，请在下方修订并补充关键词", () => setImported({ title: "", source: "", department: "", validUntil: "", text: "" }));
        }}>
          {([["title", "文件名称"], ["source", "文件来源"], ["department", "责任部门"], ["validUntil", "有效期"]] as const).map(([key, label]) => <label key={key}>{label}<input required maxLength={300} type={key === "validUntil" ? "datetime-local" : "text"} value={imported[key]} onChange={(e) => setImported({ ...imported, [key]: e.target.value })} /></label>)}
          <label>文件正文<textarea required maxLength={20000} value={imported.text} onChange={(e) => setImported({ ...imported, text: e.target.value })} /></label>
          <p>最多20段，每段最多4000字。当前支持粘贴文本，请勿将虚构示例当作学校规定发布。</p>
          {action.feedback}
          <button className="c-primary" disabled={action.busy || !(Date.parse(imported.validUntil) > Date.now())}>生成待完善草稿</button>
        </form>
      </Panel>
      <Panel title={draft.parentId ? "提交修订版本" : "提出标准答案"}>
        <form
          className="c-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(
              () =>
                write("/b/knowledge", {
                  ...draft,
                  keywords: keys,
                  validUntil: new Date(draft.validUntil).toISOString(),
                  parentId: draft.parentId || undefined,
                }),
              "已提交待审核版本",
              () => setDraft(empty),
            );
          }}
        >
          {Object.entries(labels).map(([key, label]) => (
            <label key={key}>
              {label}
              {key === "answer" ? (
                <textarea
                  required
                  maxLength={4000}
                  value={draft.answer}
                  onChange={(e) =>
                    setDraft({ ...draft, answer: e.target.value })
                  }
                />
              ) : (
                <input
                  required
                  maxLength={4000}
                  type={key === "validUntil" ? "datetime-local" : "text"}
                  value={draft[key as keyof typeof draft]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          <label>文件原文摘录（选填，须由审核人核对）
            <textarea maxLength={4000} value={draft.sourceExcerpt} onChange={(e) => setDraft({ ...draft, sourceExcerpt: e.target.value })} />
          </label>
          <p>
            关键词每个 2–30 字，最多 20
            个。有效期应晚于现在，修订版本需独立审核后生效。
          </p>
          {action.feedback}
          <button className="c-primary" disabled={action.busy || !valid}>
            提交审核
          </button>
        </form>
      </Panel>
      <Panel title="可管理的知识版本">
        <LoadState resource={resource}>
          {reviewer && (
            <label>
              审核意见
              <input
                className="c-input"
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          )}
          {resource.data?.items.map((k) => (
            <article className="c-review" key={k.id}>
              <h3>
                {k.title} · v{k.version}
              </h3>
              <p>
                {{
                  draft: "待审核",
                  published: "已发布",
                  rejected: "已驳回",
                  withdrawn: "已撤回",
                  superseded: "已被新版本替代",
                }[k.status] || k.status}{" "}
                · {k.department}
              </p>
              <p>{k.answer}</p>
              <p>依据　{k.source}</p>
              {k.sourceExcerpt && <p>录入的文件原文　{k.sourceExcerpt}</p>}
              <p>有效至 {new Date(k.validUntil).toLocaleString("zh-CN")}</p>
              {k.review && <p>审核意见　{k.review.note}</p>}
              <div className="c-actions">
                {k.authorId === user?.id && (
                  <button
                    onClick={() => {
                      setDraft({
                        title: k.title,
                        answer: k.answer,
                        keywords: k.keywords.join("，"),
                        source: k.source,
                        sourceExcerpt: k.sourceExcerpt || "",
                        department: k.department,
                        validUntil: "",
                        parentId: k.id,
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    修订新版本
                  </button>
                )}
                {reviewer &&
                  k.authorId !== user?.id &&
                  k.status === "draft" &&
                  ["publish", "reject"].map((decision) => (
                    <button
                      key={decision}
                      disabled={action.busy || !note.trim()}
                      onClick={() =>
                        void action.run(
                          () =>
                            write("/b/knowledge/" + k.id + "/review", {
                              action: decision,
                              note,
                            }),
                          "审核已记录",
                          () => setNote(""),
                        )
                      }
                    >
                      {decision === "publish" ? "审核发布" : "驳回"}
                    </button>
                  ))}
                {(reviewer || k.authorId === user?.id) &&
                  k.status === "published" && (
                    <button
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(
                          () => write("/b/knowledge/" + k.id + "/withdraw", {}),
                          "版本已撤回",
                        )
                      }
                    >
                      撤回发布
                    </button>
                  )}
              </div>
            </article>
          ))}
          {!resource.data?.items.length && <p>暂无可管理的知识版本。</p>}
        </LoadState>
      </Panel>
    </div>
  );
}
