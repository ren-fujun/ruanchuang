import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Layers,
  Wifi,
  Wrench,
  HeartHandshake,
  ShieldAlert,
  ChartNoAxesColumn,
} from "lucide-react";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../context/AuthContext";
import type { StudentHomeData, CounselorDashboard, Ticket } from "../../types";
import { LoadState, Panel, statusLabel, useCData } from "./ui";
import type { Appointment, Bundle } from "./api";
import type { PortalRole } from "./config";

const quickLinks = [
  ["home", "工作台", ClipboardList],
  ["academic", "学业跟进", BookOpen],
  ["leaves", "请假审批", ClipboardList],
  ["insights", "协同洞察", ChartNoAxesColumn],
  ["repairs", "报修监督", Layers],
] as const;
function TicketRows({
  tickets,
  role,
}: {
  tickets: Ticket[];
  role: PortalRole;
}) {
  return (
    <div>
      {tickets.slice(0, 2).map((t) => (
        <Link className="c-row" key={t.id} to={"/" + role + "/tickets/" + t.id}>
          <span className="c-icon">
            {t.category === "心理支持" ? (
              <HeartHandshake />
            ) : t.category === "安全保卫" ? (
              <ShieldAlert />
            ) : t.category === "学籍教务" ? (
              <GraduationCap />
            ) : (
              <Wrench />
            )}
          </span>
          <span className="c-grow">
            <strong>{t.title}</strong>
            <small>
              {t.category} ·{" "}
              <span className={t.risk === "high" ? "c-risk" : ""}>
                {t.risk === "high" ? "高风险 · " : ""}
                {statusLabel(t.status)}
              </span>
            </small>
          </span>
          <span
            className={
              role === "counselor" && t.status === "pending_review"
                ? "c-primary"
                : "c-outline"
            }
          >
            {role === "counselor" && t.status === "pending_review"
              ? "审核分派"
              : "查看进度"}
          </span>
        </Link>
      ))}
      {!tickets.length && <p className="c-state">当前没有待办工单。</p>}
    </div>
  );
}

function RepairRows({
  repairs,
}: {
  repairs: {
    id: string;
    location: string;
    repairType: string;
    status: string;
    statusLabel: string;
    responseOverdue: boolean;
  }[];
}) {
  return (
    <div>
      {repairs.slice(0, 3).map((repair) => (
        <Link
          className="c-row"
          key={repair.id}
          to={"/student/repairs/" + repair.id}
        >
          <span className="c-icon">
            <Wrench />
          </span>
          <span className="c-grow">
            <strong>
              {repair.repairType} · {repair.location}
            </strong>
            <small>
              {repair.statusLabel}
              {repair.responseOverdue ? " · 异议回应超时" : ""}
            </small>
          </span>
          <span className="c-outline">查看进度</span>
        </Link>
      ))}
    </div>
  );
}

export function PortalHome({ role }: { role: PortalRole }) {
  const student = role === "student";
  const dashboard = useApi<StudentHomeData | CounselorDashboard>(
    student ? "/student/home" : "/counselor/dashboard",
  );

  const repairs = useCData<{
    items: {
      id: string;
      location: string;
      repairType: string;
      status: string;
      statusLabel: string;
      responseOverdue: boolean;
      studentName: string;
    }[];
  }>("/repairs");
  const leaves = useCData<{
    items: { id: string; studentName: string; status: string }[];
  }>(student ? null : "/b/leaves");
  const academic = useCData<{
    items: {
      id: string;
      studentName: string;
      course: string;
      status: string;
      collaboration?: { status: string };
    }[];
  }>(student ? null : "/b/cases");
  const { user } = useAuth();
  const [text, setText] = useState("");
  const navigate = useNavigate();
  const data = dashboard.data;
  if (!data) return <LoadState resource={dashboard} />;
  const s = data as StudentHomeData,
    c = data as CounselorDashboard;
  const metrics = student
    ? [
        [s.stats.total + (repairs.data?.items.length || 0), "我的诉求"],
        [
          s.stats.active +
            (repairs.data?.items.filter((item) =>
              !["satisfied", "coordinated_closed"].includes(item.status),
            ).length || 0),
          "正在跟进",
        ],
        [
          s.stats.completed +
            (repairs.data?.items.filter((item) =>
              ["satisfied", "coordinated_closed"].includes(item.status),
            ).length || 0),
          "已完成",
        ],
      ]
    : [
        [c.stats.pending, "待审核"],
        [c.stats.processing, "协同在办"],
        [c.stats.overdue, "逾期"],
      ];
  function start(category = "") {
    navigate(
      "/student/new?" + new URLSearchParams({ category, description: text }),
    );
  }
  return (
    <div className="c-home">
      <div className="c-mobile-heading">
        <span>
          <BookOpen />
          智汇中枢　<small>{student ? "学生端" : "辅导员端"}</small>
        </span>
        {!student && (
          <>
            <h1>辅导员工作台</h1>
            <p>校园事务协同 · 学生服务保障</p>
            <img alt="" src="/portals/counselor-mobile.png" />
          </>
        )}
      </div>
      <section className="c-metrics">
        {metrics.map(([n, label], i) => (
          <Link
            key={label}
            to={
              student
                ? "/student/tickets"
                : i === 0
                  ? "/counselor/tickets?status=pending_review"
                  : i === 1
                    ? "/counselor/tickets?status=processing"
                    : "/counselor/tickets?overdue=true"
            }
          >
            <span>{label}</span>
            <b>{n}</b>
          </Link>
        ))}
      </section>
      {!student && (
        <nav className="c-mobile-tools">
          {quickLinks.map(([path, label, Icon]) => (
            <Link key={path} to={"/counselor/" + path}>
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      )}
      <div className="c-home-grid">
        <div className="c-home-main">
          {!student && (
            <Panel title="优先处理">
              <div className="c-priorities">
                <Link to="/counselor/leaves">
                  待批请假{" "}
                  <strong>
                    {leaves.data?.items.filter((x) => x.status === "pending")
                      .length ?? "—"}
                  </strong>
                </Link>
                <Link to="/counselor/repairs">
                  报修异议{" "}
                  <strong>
                    {repairs.data?.items.filter((x) =>
                      [
                        "objection_pending_response",
                        "pending_coordination",
                      ].includes(x.status),
                    ).length ?? "—"}
                  </strong>
                </Link>
                <Link to="/counselor/repairs">
                  异议超时{" "}
                  <strong>
                    {repairs.data?.items.filter((x) => x.responseOverdue)
                      .length ?? "—"}
                  </strong>
                </Link>
                <Link to="/counselor/academic">
                  待协商学业{" "}
                  <strong>
                    {academic.data?.items.filter(
                      (x) =>
                        x.status !== "completed" &&
                        (!x.collaboration ||
                          x.collaboration.status === "unassigned"),
                    ).length ?? "—"}
                  </strong>
                </Link>
              </div>
              {(leaves.error || repairs.error || academic.error) && (
                <p role="alert">部分待办加载失败，请进入对应页面重试。</p>
              )}
            </Panel>
          )}
          {student && (
            <section className="c-compose">
              <div>
                <h1>有件事，想说吗？</h1>
                <textarea
                  aria-label="描述你的问题"
                  placeholder="描述你的问题，如宿舍报修、学业咨询等…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={2000}
                />
                <button className="c-primary" onClick={() => start()}>
                  发起诉求 <ChevronRight />
                </button>
              </div>
              <img alt="" src="/portals/student.png" />
              <div className="c-quick">
                <strong>快速发起</strong>
                {[
                  ["宿舍生活", "宿舍报修", Wrench],
                  ["学籍教务", "学业咨询", GraduationCap],
                  ["网络服务", "校园网络", Wifi],
                ].map(([category, label, Icon]) => (
                  <button
                    key={String(category)}
                    onClick={() =>
                      String(category) === "宿舍生活"
                        ? navigate("/student/repairs/new")
                        : start(String(category))
                    }
                  >
                    <Icon />
                    {String(label)}
                  </button>
                ))}
                <Link to="/student/assistant">
                  <BookOpen />
                  AI 问答
                </Link>
                <Link to="/student/leaves">
                  <ClipboardList />
                  我的请假
                </Link>
              </div>
            </section>
          )}
          <Panel title={student ? "正在跟进" : "重点待办"}>
            {student && repairs.data?.items.some(
              (item) => !["satisfied", "coordinated_closed"].includes(item.status),
            ) && (
              <RepairRows
                repairs={repairs.data.items.filter(
                  (item) => !["satisfied", "coordinated_closed"].includes(item.status),
                )}
              />
            )}
            <TicketRows
              role={role}
              tickets={student ? s.activeTickets : c.queue}
            />
          </Panel>
          {!student && (
            <Panel title="报修监督">
              <p>查看所属学生报修进度、异议及协调记录。</p>
              <Link className="c-outline" to="/counselor/repairs">
                查看报修监督
              </Link>
            </Panel>
          )}
          {!student && (
            <Panel title="督办提醒">
              <TicketRows role={role} tickets={c.urgent} />
            </Panel>
          )}
        </div>
        <div className="c-home-side">
          {student && (
            <Panel title="消息">
              {s.notifications.slice(0, 2).map((n) => (
                <Link className="c-row" key={n.id} to="/student/messages">
                  <Bell />
                  <span>
                    <strong>{n.title}</strong>
                    <small>{n.body}</small>
                  </span>
                </Link>
              ))}
              {!s.notifications.length && <p>暂无消息。</p>}
            </Panel>
          )}
          <Panel title="请假申请与审批">
            <p>查看请假申请和处理结果。</p>
            <Link className="c-outline" to={"/" + role + "/leaves"}>
              {student ? "申请请假" : "处理请假"}
            </Link>
          </Panel>
          {student && (
            <Panel title="学业支持">
              <p>{user?.college}</p>
              <Link className="c-row" to="/student/academic">
                <BookOpen />
                查看学业任务
                <ChevronRight />
              </Link>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
