import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { request } from "../../lib/api";
import { LoadState, Panel, useAction, useCData } from "./ui";
import type { PortalRole } from "./config";

interface Repair {
  id: string;
  version: number;
  repairType: string;
  location: string;
  description: string;
  status: string;
  statusLabel: string;
  studentName: string;
  createdAt: string;
  claimantName: string | null;
  responseOverdue: boolean;
  claimDueAt?: string | null;
  minutesUntilClaim?: number | null;
  claimOverdue?: boolean;
  terminal: boolean;
  result: { text: string } | null;
  feedback: { decision: string; reason: string } | null;
  response: { text: string } | null;
  coordination: {
    conclusion: string;
    followUp: string;
    owner: string;
    dueAt: string;
  } | null;
  history: { id: string; at: string; detail: string }[];
}
const send = (path: string, body: unknown) =>
  request(path, { method: "POST", body: JSON.stringify(body) });
const when = (date: string) => new Date(date).toLocaleString("zh-CN");
const repairNextSteps: Record<string, string> = {
    pending_assignment: "等待后勤在责任范围内领取，目前无需重复提交。",
    processing: "后勤正在处理，请保持联系方式畅通；有新结果会显示在这里。",
    awaiting_feedback:
      "请确认维修是否解决。若满意请确认；仍未解决可提交一次异议并说明原因。",
    objection_pending_response:
      "异议已送达后勤，等待书面说明；辅导员可以查看进度。",
    pending_coordination: "双方记录已齐备，等待辅导员核对并协调结案。",
    satisfied: "你已确认问题解决，本次报修已结束。",
    coordinated_closed:
      "辅导员已记录协调结论。如需再次现场服务，请按后续安排新建关联任务。",
};
const nextRepairStep = (status: string) =>
  repairNextSteps[status] || "请查看当前状态，有疑问可通过试用反馈联系团队。";
export function RepairList({ role }: { role: PortalRole }) {
  const resource = useCData<{ items: Repair[] }>("/repairs");
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const data =
    resource.data?.items.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (r.location + r.description + r.studentName + r.repairType).includes(
          query.trim(),
        ),
    ) || [];
  return (
    <div className="c-page">
      <h1>{role === "student" ? "我的报修" : "报修监督"}</h1>
      {role === "student" && (
        <Link className="c-primary" to="/student/repairs/new">
          提交报修
        </Link>
      )}
      <Panel title="报修事项">
        <div className="c-actions">
          <label>
            搜索
            <input
              className="c-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="地点、类型或学生"
            />
          </label>
          <label>
            状态
            <select
              className="c-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="pending_assignment">待后勤分配</option>
              <option value="processing">处理中</option>
              <option value="awaiting_feedback">待学生反馈</option>
              <option value="objection_pending_response">异议待回应</option>
              <option value="pending_coordination">待协调</option>
              <option value="satisfied">已确认解决</option>
              <option value="coordinated_closed">协调结案</option>
            </select>
          </label>
        </div>
        <LoadState resource={resource}>
          {role === "counselor" && data.length > 0 ? (
            <div className="c-table-wrap">
              <table className="c-table">
                <thead>
                  <tr>
                    <th>报修事项</th>
                    <th>学生</th>
                    <th>当前进度</th>
                    <th>提交时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.repairType} · {r.location}
                      </td>
                      <td>{r.studentName}</td>
                      <td>
                        {r.statusLabel}
                        {r.responseOverdue ? " · 异议回应超时" : ""}
                      </td>
                      <td>{when(r.createdAt)}</td>
                      <td>
                        <Link to={"/counselor/repairs/" + r.id}>
                          查看详情 →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            data.map((r) => (
              <Link
                className="c-row"
                key={r.id}
                to={"/" + role + "/repairs/" + r.id}
              >
                <span className="c-grow">
                  <strong>
                    {r.repairType} · {r.location}
                  </strong>
                  <small>
                    {r.studentName} · {r.statusLabel}
                    {r.responseOverdue ? " · 异议回应超时" : ""} ·{" "}
                    {when(r.createdAt)}
                  </small>
                </span>
                查看详情 →
              </Link>
            ))
          )}
          {!data.length && <p>当前没有符合条件的报修。</p>}
        </LoadState>
      </Panel>
    </div>
  );
}
export function RepairCreate() {
  const meta = useCData<{
    repairTypes: string[];
    campus: string;
    claimMinutes: number;
    locations: {
      campus: string;
      buildings: { id: string; name: string; rooms: string[] }[];
    }[];
  }>(
      "/repairs/meta",
    ),
    action = useAction();
  const [type, setType] = useState(""),
    [campus, setCampus] = useState(""),
    [buildingId, setBuildingId] = useState(""),
    [room, setRoom] = useState(""),
    [description, setDescription] = useState("");
  const key = useRef(crypto.randomUUID()),
    navigate = useNavigate();
  const campusEntry = meta.data?.locations.find((item) => item.campus === campus);
  const building = campusEntry?.buildings.find((item) => item.id === buildingId);
  useEffect(() => {
    if (meta.data?.locations.length && !campus) {
      setCampus(meta.data.locations[0].campus);
    }
  }, [campus, meta.data?.locations]);
  return (
    <div className="c-page">
      <h1>提交报修</h1>
      <Panel title="故障信息">
        <LoadState resource={meta}>
          <form
            className="c-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const result = (await send("/repairs", {
                  repairType: type,
                  campus,
                  buildingId,
                  room,
                  description,
                  requestId: key.current,
                })) as { repair: Repair };
                if (!result.repair?.id) throw Error("服务响应缺少报修编号");
                navigate("/student/repairs/" + result.repair.id);
              }, "报修已提交");
            }}
          >
            <p>提交后将进入后勤待分配队列，预计 {meta.data?.claimMinutes || 30} 分钟内有人接单。</p>
            <label>
              报修类型
              <select
                required
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  key.current = crypto.randomUUID();
                }}
              >
                <option value="">请选择</option>
                {meta.data?.repairTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              校区
              <select
                required
                value={campus}
                onChange={(e) => {
                  setCampus(e.target.value);
                  setBuildingId("");
                  setRoom("");
                  key.current = crypto.randomUUID();
                }}
              >
                {meta.data?.locations.map((item) => (
                  <option key={item.campus} value={item.campus}>{item.campus}</option>
                ))}
              </select>
            </label>
            <label>
              楼栋
              <select
                required
                value={buildingId}
                onChange={(e) => {
                  setBuildingId(e.target.value);
                  setRoom("");
                  key.current = crypto.randomUUID();
                }}
              >
                <option value="">请选择楼栋</option>
                {campusEntry?.buildings.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              房间或区域
              <select
                required
                disabled={!building}
                value={room}
                onChange={(e) => {
                  setRoom(e.target.value);
                  key.current = crypto.randomUUID();
                }}
              >
                <option value="">请选择房间或区域</option>
                {building?.rooms.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              故障描述
              <textarea
                required
                maxLength={1000}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  key.current = crypto.randomUUID();
                }}
              />
            </label>
            {action.feedback}
            <button
              className="c-primary"
              disabled={
                action.busy ||
                !type ||
                !campus ||
                !buildingId ||
                !room ||
                !description.trim()
              }
            >
              确认提交
            </button>
          </form>
        </LoadState>
      </Panel>
    </div>
  );
}
export function RepairDetail({ role }: { role: PortalRole }) {
  const { id } = useParams();
  const resource = useCData<{ repair: Repair }>(
    "/repairs/" + encodeURIComponent(id || ""),
  );
  const action = useAction(resource.reload),
    [reason, setReason] = useState(""),
    [note, setNote] = useState("");
  const [conclusion, setConclusion] = useState(""),
    [followUp, setFollowUp] = useState(""),
    [owner, setOwner] = useState(""),
    [dueAt, setDueAt] = useState("");
  const key = useRef(crypto.randomUUID());
  const changed = () => {
    key.current = crypto.randomUUID();
  };
  const act = (path: string, body: object, message: string) =>
    void action.run(
      () =>
        send("/repairs/" + id + "/" + path, {
          ...body,
          version: resource.data!.repair.version,
          requestId: key.current,
        }),
      message,
      () => {
        changed();
      },
    );
  const r = resource.data?.repair;
  return (
    <div className="c-page">
      <Link to={"/" + role + "/repairs"}>← 返回报修列表</Link>
      <h1>报修进度</h1>
      <LoadState resource={resource}>
        {r && (
          <>
            <Panel title={r.repairType + " · " + r.location}>
              <p>
                {r.statusLabel}
                {r.responseOverdue ? " · 异议回应已超时" : ""}
              </p>
              <div className="repair-next-step">
                <strong>下一步</strong>
                <span>{nextRepairStep(r.status)}</span>
              </div>
              {role === "student" && r.status === "pending_assignment" && (
                <p className="claim-estimate">
                  {r.claimOverdue
                    ? "已超过预计接单时间，系统已将事项保留在后勤待办中。"
                    : `预计 ${r.minutesUntilClaim ?? 30} 分钟内接单${
                        r.claimDueAt ? `，最晚约 ${new Date(r.claimDueAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""
                      }。`}
                </p>
              )}
              <p>{r.description}</p>
              <p>
                提交时间：{when(r.createdAt)} · 后勤：
                {r.claimantName || "待后勤分配"}
              </p>
              {r.result && <p>后勤处置结果：{r.result.text}</p>}
              {r.feedback && (
                <p>
                  学生反馈：
                  {r.feedback.decision === "satisfied"
                    ? "满意"
                    : r.feedback.reason}
                </p>
              )}
              {r.response && <p>后勤说明：{r.response.text}</p>}
              {r.coordination && (
                <p>
                  协调结论：{r.coordination.conclusion} · 后续：
                  {r.coordination.followUp} · 负责人：{r.coordination.owner} ·{" "}
                  {when(r.coordination.dueAt)}
                </p>
              )}
              <details>
                <summary>完整记录</summary>
                {r.history.map((h, i) => (
                  <p key={h.id || i}>
                    {when(h.at)}　{h.detail}
                  </p>
                ))}
              </details>
            </Panel>
            {role === "student" && r.status === "awaiting_feedback" && (
              <Panel title="确认维修结果">
                <div className="c-form">
                  <label>
                    异议原因
                    <textarea
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        changed();
                      }}
                    />
                  </label>
                  {action.feedback}
                  <div className="c-actions">
                    <button
                      className="c-primary"
                      disabled={action.busy}
                      onClick={() =>
                        act(
                          "feedback",
                          { decision: "satisfied" },
                          "已确认维修结果",
                        )
                      }
                    >
                      满意，确认解决
                    </button>
                    <button
                      disabled={action.busy || !reason.trim()}
                      onClick={() =>
                        act(
                          "feedback",
                          { decision: "objection", reason },
                          "异议已提交后勤",
                        )
                      }
                    >
                      提出一次异议
                    </button>
                  </div>
                </div>
              </Panel>
            )}
            {role === "counselor" && !r.terminal && (
              <Panel title="跟进提醒">
                <div className="c-form">
                  <label>
                    提醒说明
                    <textarea
                      value={note}
                      maxLength={1000}
                      onChange={(e) => {
                        setNote(e.target.value);
                        changed();
                      }}
                    />
                  </label>
                  {action.feedback}
                  <button
                    disabled={action.busy || !note.trim()}
                    onClick={() => act("remind", { note }, "提醒已发送")}
                  >
                    发送提醒
                  </button>
                </div>
              </Panel>
            )}
            {role === "counselor" &&
              (r.status === "pending_coordination" ||
                (r.status === "objection_pending_response" &&
                  r.responseOverdue)) && (
                <Panel title="协调结案">
                  <form
                    className="c-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(
                        "coordinate",
                        {
                          conclusion,
                          followUp,
                          owner,
                          dueAt: new Date(dueAt).toISOString(),
                        },
                        "协调结案已记录",
                      );
                    }}
                  >
                    <label>
                      事实与协调结论
                      <textarea
                        required
                        maxLength={1000}
                        value={conclusion}
                        onChange={(e) => {
                          setConclusion(e.target.value);
                          changed();
                        }}
                      />
                    </label>
                    <label>
                      后续动作
                      <textarea
                        required
                        maxLength={1000}
                        value={followUp}
                        onChange={(e) => {
                          setFollowUp(e.target.value);
                          changed();
                        }}
                      />
                    </label>
                    <label>
                      负责人
                      <input
                        required
                        value={owner}
                        onChange={(e) => {
                          setOwner(e.target.value);
                          changed();
                        }}
                      />
                    </label>
                    <label>
                      后续时间
                      <input
                        required
                        type="datetime-local"
                        value={dueAt}
                        onChange={(e) => {
                          setDueAt(e.target.value);
                          changed();
                        }}
                      />
                    </label>
                    <p>协调结案记录双方说明及后续安排。</p>
                    {action.feedback}
                    <button className="c-primary" disabled={action.busy}>
                      确认协调结案
                    </button>
                  </form>
                </Panel>
              )}
          </>
        )}
      </LoadState>
    </div>
  );
}
