import { useState, useEffect, lazy, Suspense } from "react";
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import {
  Orbit,
  LayoutDashboard,
  Tickets,
  ChartNoAxesCombined,
  LogOut,
  ArrowRight,
  ShieldCheck,
  PanelLeftClose,
  Menu,
} from "lucide-react";
import { api } from "./lib/api";
import { AppContext, useResource } from "./lib/context";
import { State } from "./pages/counselor/components";
const Dashboard = lazy(() => import("./pages/counselor/Dashboard"));
import TicketList from "./pages/counselor/TicketList";
import TicketDetail from "./pages/counselor/TicketDetail";
function Login() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function login(a = account, p = password) {
    setBusy(true);
    setError("");
    try {
      const result = await api.login(a, p);
      localStorage.setItem("zhihui_token", result.token);
      navigate("/counselor/dashboard", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section>
        <div className="brand">
          <Orbit />
          <div>
            智汇中枢<small>ZHIHUI ORBIT</small>
          </div>
        </div>
        <span className="eyebrow">CAMPUS REQUEST ORCHESTRATION</span>
        <h1>
          让每一份诉求，
          <br />
          都有回应。
        </h1>
        <p>连接学生与部门，让协同有序，让关怀可见。</p>
        <div className="orbit-art">
          <Orbit size={150} />
        </div>
      </section>
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          void login();
        }}
      >
        <span className="eyebrow">COUNSELOR WORKSPACE</span>
        <h2>欢迎回到中枢</h2>
        <p>登录教师工作台，开始今天的协同工作。</p>
        <label>
          教师账号
          <input
            required
            autoComplete="username"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="请输入账号"
          />
        </label>
        <label>
          登录密码
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "正在登录…" : "登录工作台"}
          <ArrowRight size={17} />
        </button>
        {import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true" && (
          <>
            <div className="divider">本地演示模式 · 数据为模拟数据</div>
            <button
              type="button"
              className="button secondary full"
              disabled={busy}
              onClick={() => void login("counselor01", "demo123")}
            >
              一键体验教师端
            </button>
            <small className="muted">演示账号 counselor01 / demo123</small>
          </>
        )}
        <div className="security">
          <ShieldCheck size={15} /> 仅展示授权范围内的学生诉求
        </div>
      </form>
    </div>
  );
}
function Workspace() {
  const resource = useResource(async () => ({
    user: await api.me(),
    dicts: await api.dicts(),
  }));
  const [toast, setToast] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!localStorage.getItem("zhihui_token"))
    return <Navigate to="/login" replace />;
  if (!resource.data)
    return (
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      />
    );
  if (resource.data.user.role !== "COUNSELOR")
    return <State error="当前账号没有教师工作台访问权限" />;
  const { user, dicts } = resource.data;
  return (
    <AppContext.Provider value={{ user, dicts, toast: setToast }}>
      <div className="workspace">
        <aside className={`sidebar ${navOpen ? "open" : ""}`}>
          <div className="brand">
            <Orbit />
            <div>
              智汇中枢<small>ZHIHUI ORBIT</small>
            </div>
            <button
              className="icon-button mobile-only"
              aria-label="关闭导航"
              onClick={() => setNavOpen(false)}
            >
              <PanelLeftClose />
            </button>
          </div>
          <div className="workspace-label">
            教师协同工作台 <span>WORKSPACE</span>
          </div>
          <nav onClick={() => setNavOpen(false)}>
            <NavLink to="/counselor/dashboard">
              <LayoutDashboard />
              中枢总览<span>01</span>
            </NavLink>
            <NavLink to="/counselor/tickets">
              <Tickets />
              工单工作台<span>02</span>
            </NavLink>
            <NavLink to="/counselor/insights">
              <ChartNoAxesCombined />
              数据洞察<span>03</span>
            </NavLink>
          </nav>
          <div className="sidebar-bottom">
            <div className="care-card">
              <div className="mini-orbit">
                <Orbit />
              </div>
              <strong>协同有序，关怀有温度</strong>
              <p>
                每一次认真跟进，
                <br />
                都让校园更好一点。
              </p>
              <span>
                <i /> 中枢协同在线
              </span>
            </div>
            <div className="sidebar-footer">
              智汇中枢 · 校园诉求协同督办
              <br />
              <span>CONNECT · COLLABORATE · CARE</span>
            </div>
          </div>
        </aside>
        {navOpen && (
          <button
            className="nav-scrim"
            aria-label="关闭导航"
            onClick={() => setNavOpen(false)}
          />
        )}
        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-only"
                aria-label="打开导航"
                onClick={() => setNavOpen(true)}
              >
                <Menu />
              </button>
              <span className="topbar-product">
                校园协同 / <strong>教师工作台</strong>
              </span>
            </div>
            <div className="topbar-right">
              {import.meta.env.DEV &&
                import.meta.env.VITE_USE_MOCK === "true" && (
                  <span className="demo-tag">Mock 演示</span>
                )}
              <span className="scope">{user.college}</span>
              <span className="avatar">{user.name.slice(-2)}</span>
              <div className="profile-name">
                {user.name}
                <small>辅导员</small>
              </div>
              <button
                className="icon-button"
                title="退出登录"
                aria-label="退出登录"
                onClick={() => {
                  localStorage.removeItem("zhihui_token");
                  navigate("/login");
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <div className="page">
            <Suspense fallback={<State loading />}>
              <Outlet />
            </Suspense>
          </div>
          <footer className="page-footer">
            <span>智汇中枢 / 把每一次求助，接住。</span>
            <span>授权范围内数据 · 每 30 秒同步</span>
          </footer>
        </main>
        {toast && (
          <div className="toast" role="status">
            <ShieldCheck size={18} />
            {toast}
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
export default function App() {
  const navigate = useNavigate();
  useEffect(() => {
    const expired = () => navigate("/login", { replace: true });
    window.addEventListener("zhihui:auth-expired", expired);
    return () => window.removeEventListener("zhihui:auth-expired", expired);
  }, [navigate]);
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/counselor" element={<Workspace />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="insights" element={<Dashboard insights />} />
      </Route>
      <Route
        path="/"
        element={<Navigate to="/counselor/dashboard" replace />}
      />
      <Route
        path="*"
        element={
          <div className="state">
            <h2>页面不存在</h2>
            <a href="/counselor/dashboard">返回工作台</a>
          </div>
        }
      />
    </Routes>
  );
}
