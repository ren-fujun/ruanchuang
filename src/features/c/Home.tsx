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
  ["tickets", "工作台", ClipboardList],
  ["academic", "学业跟进", BookOpen],
  ["insights", "协同洞察", ChartNoAxesColumn],
  ["bundles", "问题包", Layers],
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
export function PortalHome({ role }: { role: PortalRole }) {
  const student = role === "student";
  const dashboard = useApi<StudentHomeData | CounselorDashboard>(
    student ? "/student/home" : "/counselor/dashboard",
  );
  const appointments = useCData<{ items: Appointment[] }>("/appointments");
  const bundles = useCData<{ items: Bundle[] }>(
    student ? null : "/issue-bundles",
  );
  const { user } = useAuth();
  const [text, setText] = useState("");
  const navigate = useNavigate();
  const data = dashboard.data;
  if (!data) return <LoadState resource={dashboard} />;
  const todayAppointments =
    appointments.data?.items.filter(
      (a) =>
        a.status !== "cancelled" &&
        new Date(a.startsAt).toDateString() === new Date().toDateString(),
    ) || [];
  const s = data as StudentHomeData,
    c = data as CounselorDashboard;
  const metrics = student
    ? [
        [s.stats.total, "我的诉求"],
        [s.stats.active, "正在跟进"],
        [s.stats.completed, "已完成"],
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
                    onClick={() => start(String(category))}
                  >
                    <Icon />
                    {String(label)}
                  </button>
                ))}
                <Link to="/student/assistant">
                  <BookOpen />
                  AI 问答
                </Link>
              </div>
            </section>
          )}
          <Panel title={student ? "正在跟进" : "重点待办"}>
            <TicketRows
              role={role}
              tickets={student ? s.activeTickets : c.queue}
            />
          </Panel>
          {!student && (
            <Panel title="问题包">
              <LoadState resource={bundles}>
                {bundles.data?.items?.slice(0, 2).map((b) => (
                  <Link
                    className="c-row"
                    key={b.id}
                    to={"/counselor/bundles/" + b.id}
                  >
                    <Layers />
                    <span className="c-grow">
                      <strong>{b.title}</strong>
                      <small>
                        {b.items.length} 项诉求 ·{" "}
                        {b.items.filter((i) => i.result).length} 项回执
                      </small>
                    </span>
                    查看回执 <ChevronRight />
                  </Link>
                ))}
                {!bundles.data?.items?.length && <p>暂无问题包。</p>}
              </LoadState>
              <Link className="c-outline" to="/counselor/bundles">
                核对并创建问题包
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
          <Panel title="今日安排">
            <LoadState resource={appointments}>
              {todayAppointments.map((a) => (
                <Link
                  className="c-row"
                  key={a.id}
                  to={"/" + role + "/appointments"}
                >
                  <CalendarDays />
                  <span>
                    <strong>
                      {new Date(a.startsAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                    <small>{a.topic}</small>
                  </span>
                </Link>
              ))}
              {!todayAppointments.length && <p>暂无预约安排。</p>}
            </LoadState>
            <Link className="c-outline" to={"/" + role + "/appointments"}>
              {student ? "申请预约" : "管理排班"}
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
