import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api } from "../../lib/api";
import { useResource } from "../../lib/context";
import { statusLabels } from "../../lib/format";
import { State, TicketRow } from "./components";
export default function TicketList() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  useEffect(() => setQuery(params.get("q") || ""), [params]);
  const raw = Number(params.get("page") || 1);
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  const filters = {
    q: params.get("q") || "",
    status: params.get("status") || "",
    riskLevel: params.get("riskLevel") || "",
    isOverdue: params.get("isOverdue") || "",
    page,
    pageSize: 10,
  };
  const { data, error, loading, reload } = useResource(
    () => api.tickets(filters),
    [params.toString()],
  );
  function update(key: string, value: string) {
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    if (key !== "page") p.delete("page");
    setParams(p);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TICKET WORKSPACE</div>
          <h1>
            工单工作台<span className="heading-dot">.</span>
          </h1>
          <p>从倾听到解决，让每一次流转清晰可循。</p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void reload()}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          刷新工单
        </button>
      </div>
      <section className="card list-card">
        <div className="tabs" aria-label="工单状态筛选">
          {[
            ["", "全部工单"],
            ["PENDING_REVIEW", "待审核"],
            ["ASSIGNED,PROCESSING", "处理中"],
            ["REJECTED", "待重新分派"],
            ["PENDING_CONFIRM", "待确认"],
            ["CONFIRMED,ARCHIVED", "已办结"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={filters.status === v ? "active" : ""}
              onClick={() => update("status", v)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="filters">
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              update("q", query.trim());
            }}
          >
            <Search size={18} />
            <input
              aria-label="搜索工单"
              placeholder="搜索工单标题、编号或学生姓名"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit">搜索</button>
          </form>
          <div className="filter-selects">
            <SlidersHorizontal size={17} />
            <select
              aria-label="风险筛选"
              value={filters.riskLevel}
              onChange={(e) => update("riskLevel", e.target.value)}
            >
              <option value="">全部风险</option>
              <option value="HIGH">高风险</option>
              <option value="MEDIUM">中风险</option>
              <option value="LOW">低风险</option>
            </select>
            <select
              aria-label="超时筛选"
              value={filters.isOverdue}
              onChange={(e) => update("isOverdue", e.target.value)}
            >
              <option value="">全部时效</option>
              <option value="true">已超时</option>
              <option value="false">未超时</option>
            </select>
          </div>
        </div>
        <div className="list-meta">
          <span>
            {loading ? "正在同步…" : `共 ${data?.total ?? 0} 件诉求`} ·
            按提交时间倒序
          </span>
          {params.toString() && (
            <button
              onClick={() => {
                setParams({});
                setQuery("");
              }}
            >
              <X size={14} />
              清除筛选
            </button>
          )}
        </div>
        {filters.status &&
          !(filters.status in statusLabels) &&
          !["ASSIGNED,PROCESSING", "CONFIRMED,ARCHIVED"].includes(
            filters.status,
          ) && (
            <div className="list-meta">
              当前状态组合：
              {filters.status
                .split(",")
                .map((s) => statusLabels[s as keyof typeof statusLabels] || s)
                .join("、")}
            </div>
          )}
        {error ? (
          <State error={error} retry={reload} />
        ) : !data ? (
          <State loading />
        ) : !data.list.length ? (
          <State empty="没有匹配的工单，试试调整筛选条件" />
        ) : (
          data.list.map((t) => <TicketRow key={t.ticketId} ticket={t} />)
        )}
        {data && (
          <div className="pagination">
            <span>
              每页 10 条 · 第 {page} / {Math.max(1, Math.ceil(data.total / 10))}{" "}
              页
            </span>
            <div>
              <button
                aria-label="上一页"
                disabled={page <= 1 || loading}
                onClick={() => update("page", String(page - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <span>{page}</span>
              <button
                aria-label="下一页"
                disabled={page * 10 >= data.total || loading}
                onClick={() => update("page", String(page + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
