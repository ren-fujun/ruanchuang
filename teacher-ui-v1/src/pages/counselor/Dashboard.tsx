import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Clock3,
  ShieldAlert,
  Inbox,
  Activity,
  Sparkles,
  Printer,
  Network,
} from "lucide-react";
import { api } from "../../lib/api";
import { useApp, useResource } from "../../lib/context";
import { shortDate } from "../../lib/format";
import { State, TicketRow } from "./components";
const colors = [
  "#8b6bea",
  "#bba3ef",
  "#85bca9",
  "#e8bb82",
  "#82a7d0",
  "#d88ba7",
  "#b5ba80",
  "#a6a0ba",
];
export default function Dashboard({
  insights = false,
}: {
  insights?: boolean;
}) {
  const { user } = useApp();
  const { data: d, error, loading, reload } = useResource(api.dashboard);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {insights ? "DATA & INSIGHTS" : "OVERVIEW / 协同全景"}
          </div>
          <h1>
            {insights ? "每一份数据，都连接着回应。" : `你好，${user.name}老师`}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {insights
              ? "从诉求到办结，看见服务的进展与需要关注的地方。"
              : "把繁杂留给中枢，把时间留给学生。今天的协同，从这里开始。"}
          </p>
        </div>
        <div className="heading-actions">
          {insights && (
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={16} />
              打印报表
            </button>
          )}
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => void reload()}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            刷新数据
          </button>
        </div>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <button onClick={() => void reload()}>重试</button>
        </div>
      )}
      {!d ? (
        <State loading={loading} error={error} retry={reload} />
      ) : (
        <>
          {!insights && (
            <section className="welcome-banner">
              <div>
                <span className="banner-badge">
                  <i /> AI 协同中枢 · 为你梳理优先事项
                </span>
                <h2>
                  让诉求流转有序，
                  <br />
                  让每一次关怀及时抵达。
                </h2>
                <p>
                  当前有 <strong>{d.stats.pending}</strong> 件诉求等待审核，
                  <strong>{d.stats.highRisk}</strong> 件高风险诉求需要关注。
                </p>
                <Link
                  className="button dark"
                  to="/counselor/tickets?status=PENDING_REVIEW"
                >
                  开始处理待办
                  <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="banner-visual" aria-hidden="true">
                <div className="orbit-ring ring-one" />
                <div className="orbit-ring ring-two" />
                <div className="orbit-center">
                  <Sparkles size={39} />
                </div>
                <span className="orbit-label label-one">
                  <span className="node mint" />
                  学生诉求
                </span>
                <span className="orbit-label label-two">
                  <span className="node peach" />
                  部门协同
                </span>
                <span className="orbit-label label-three">
                  <span className="node purple" />
                  闭环跟进
                </span>
                <div className="orbit-caption">CONNECTED BY CARE</div>
              </div>
            </section>
          )}
          <section className="stats-grid" aria-label="工单统计">
            {[
              {
                label: "待审核诉求",
                value: d.stats.pending,
                caption: "等待你的回应",
                icon: Inbox,
                color: "purple",
                query: "status=PENDING_REVIEW",
              },
              {
                label: "协同处理中",
                value: d.stats.active,
                caption: "跨部门有序推进",
                icon: Activity,
                color: "mint",
                query: "status=ASSIGNED,PROCESSING",
              },
              {
                label: "超时待跟进",
                value: d.stats.overdue,
                caption: "需要加快处理",
                icon: Clock3,
                color: "peach",
                query: "isOverdue=true",
              },
              {
                label: "高风险关注",
                value: d.stats.highRisk,
                caption: "优先关注与联系",
                icon: ShieldAlert,
                color: "pink",
                query:
                  "riskLevel=HIGH&status=DRAFT,PENDING_REVIEW,ASSIGNED,PROCESSING,REJECTED,PENDING_CONFIRM",
              },
            ].map((s) => (
              <Link
                key={s.label}
                className="stat-card"
                to={"/counselor/tickets?" + s.query}
              >
                <div className="stat-top">
                  <span>{s.label}</span>
                  <span className={`stat-icon ${s.color}`}>
                    <s.icon size={19} />
                  </span>
                </div>
                <div className="stat-number">
                  {s.value}
                  <span>件</span>
                  <ArrowUpRight size={18} />
                </div>
                <p>
                  <i className={s.color} />
                  {s.caption}
                </p>
              </Link>
            ))}
          </section>
          <div className="dashboard-grid">
            <section className="card trend-card">
              <div className="section-heading">
                <div>
                  <h2>诉求流转趋势</h2>
                  <p>近 7 天 · 提交与办结情况</p>
                </div>
                <span className="subtle-badge">最近 7 天</span>
              </div>
              <div className="chart-legend">
                <span>
                  <i style={{ background: "#8b6bea" }} />
                  新增诉求
                </span>
                <span>
                  <i style={{ background: "#85bca9" }} />
                  确认办结
                </span>
              </div>
              <div
                className="chart"
                role="img"
                aria-label={d.trend
                  .map(
                    (t) =>
                      `${t.date}新增${t.submitted}件、办结${t.completed}件`,
                  )
                  .join("；")}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={d.trend}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="purpleFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#8b6bea"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor="#8b6bea"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="4 5"
                      vertical={false}
                      stroke="#eeeaf4"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#8c879a" }}
                      dy={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#8c879a" }}
                    />
                    <Tooltip
                      labelFormatter={(v) => String(v)}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #ece8f4",
                      }}
                    />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      name="新增诉求"
                      dataKey="submitted"
                      stroke="#8b6bea"
                      strokeWidth={2.5}
                      fill="url(#purpleFill)"
                    />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      name="确认办结"
                      dataKey="completed"
                      stroke="#85bca9"
                      strokeWidth={2.5}
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card category-card">
              <div className="section-heading">
                <div>
                  <h2>诉求分类分布</h2>
                  <p>授权范围内 · 全部工单</p>
                </div>
                <span className="dot-menu">•••</span>
              </div>
              {!d.stats.total ? (
                <State empty="暂无分类数据" />
              ) : (
                <>
                  <div className="donut">
                    <ResponsiveContainer width="100%" height={170}>
                      <PieChart>
                        <Pie
                          isAnimationActive={false}
                          data={d.categories}
                          innerRadius={55}
                          outerRadius={72}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          {d.categories.map((c, i) => (
                            <Cell
                              key={c.name}
                              fill={colors[i % colors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <strong>{d.stats.total}</strong>
                      <span>诉求总数</span>
                    </div>
                  </div>
                  <div className="category-legend">
                    {d.categories.map((c, i) => (
                      <div key={c.name}>
                        <i style={{ background: colors[i % colors.length] }} />
                        <span>{c.name}</span>
                        <strong>{c.value}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
          {!insights ? (
            <div className="dashboard-grid lower">
              <section className="card priority-card">
                <div className="section-heading">
                  <div>
                    <h2>
                      优先关注{" "}
                      <span className="count-bubble">{d.priority.length}</span>
                    </h2>
                    <p>高风险与超时诉求优先展示</p>
                  </div>
                  <Link className="text-link" to="/counselor/tickets">
                    全部工单
                    <ArrowRight size={15} />
                  </Link>
                </div>
                {d.priority.length ? (
                  d.priority.map((t) => (
                    <TicketRow key={t.ticketId} ticket={t} />
                  ))
                ) : (
                  <State empty="暂时没有需要跟进的诉求" />
                )}
              </section>
              <section className="card departments-card">
                <div className="section-heading">
                  <div>
                    <h2>协同部门</h2>
                    <p>连接校园服务，共同回应诉求</p>
                  </div>
                  <Network size={20} />
                </div>
                {d.departments.map((dept, i) => (
                  <div className="department-row" key={dept.deptId}>
                    <span
                      className={`dept-avatar ${["purple", "mint", "peach"][i % 3]}`}
                    >
                      {dept.name.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{dept.name}</strong>
                      <small>
                        {dept.total} 件诉求 · {dept.completed} 件已办结
                      </small>
                    </div>
                    <span className="dept-active">
                      {dept.active}
                      <small> 在办</small>
                    </span>
                  </div>
                ))}
              </section>
            </div>
          ) : (
            <>
              <div className="dashboard-grid lower">
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>风险分层</h2>
                      <p>风险提示仅用于协同分级，不构成诊断</p>
                    </div>
                  </div>
                  <div className="risk-bars">
                    {d.risks.map((r, i) => (
                      <div key={r.name}>
                        <div>
                          <span>{r.name}</span>
                          <strong>{r.value} 件</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${d.stats.total ? (r.value / d.stats.total) * 100 : 0}%`,
                              background: ["#85bca9", "#e8bb82", "#d88ba7"][i],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card outcome">
                  <span className="eyebrow">SERVICE PROGRESS</span>
                  <h2>每一个办结，都是一次回应。</h2>
                  <strong>
                    {d.stats.total
                      ? Math.round((d.stats.completed / d.stats.total) * 100)
                      : 0}
                    <span>%</span>
                  </strong>
                  <p>
                    {d.stats.total} 件诉求中，已有 {d.stats.completed}{" "}
                    件确认办结或归档。
                  </p>
                </section>
              </div>
              <section className="card efficiency">
                <div className="section-heading">
                  <div>
                    <h2>部门协同效率</h2>
                    <p>统计由服务端汇总 · 无已办结样本时不展示效率指标</p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>协同部门</th>
                        <th>诉求总量</th>
                        <th>在办</th>
                        <th>已办结</th>
                        <th>按时办结率</th>
                        <th>平均办结时长</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.departments.map((d) => (
                        <tr key={d.deptId}>
                          <td>{d.name}</td>
                          <td>{d.total}</td>
                          <td>{d.active}</td>
                          <td>{d.completed}</td>
                          <td>
                            {d.onTime === null ? "暂无样本" : `${d.onTime}%`}
                          </td>
                          <td>
                            {d.avgHours === null
                              ? "暂无样本"
                              : `${d.avgHours} 小时`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
