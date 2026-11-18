import { TrialFeedback } from "./TrialFeedback";
import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardList,
  GraduationCap,
  House,
  Layers,
  UserRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { TrialPasswordGate } from "../../components/TrialPasswordGate";
import type { PortalRole } from "./config";

export function PortalShell({ role }: { role: PortalRole }) {
  const { user } = useAuth();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  if (user?.mustChangePassword) return <TrialPasswordGate tokenKey="zhihui_token" />;
  const student = role === "student",
    root = "/" + role;
  const items = student
    ? ([
        ["home", "首页", House],
        ["tickets", "进度", ClipboardList],
        ["messages", "消息", Bell],
        ["academic", "学业支持", GraduationCap],
        ["leaves", "我的请假", ClipboardList],
        ["repairs", "报修", CalendarDays],
        ["profile", "我的", UserRound],
      ] as const)
    : ([
        ["home", "工作台", House],
        ["tickets", "工单", ClipboardList],
        ["repairs", "报修监督", Layers],
        ["academic", "学业跟进", BookOpen],
        ["leaves", "请假审批", ClipboardList],
        ["insights", "协同洞察", ChartNoAxesColumn],
        ["knowledge", "知识纠错", BookOpen],
        ["dorm-check", "宿舍查寝", House],
        ["profile", "我的", UserRound],
      ] as const);
  const dock = items.filter(([path]) =>
    student
      ? ["home", "tickets", "messages", "profile"].includes(path)
      : ["home", "tickets", "repairs", "profile"].includes(path),
  );
  return (
    <div className={"c-shell c-" + role}>
      <aside className="c-sidebar">
        <Link className="c-brand" to={root + "/home"}>
          <GraduationCap />
          <span>
            智汇中枢<small>高校综合服务</small>
          </span>
        </Link>
        {student && (
          <img className="c-mascot" alt="" src="/portals/student.png" />
        )}
        <nav aria-label="侧栏导航">
          {items.map(([path, label, Icon]) => (
            <NavLink key={path} to={root + "/" + path}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        {!student && (
          <img className="c-mascot" alt="" src="/portals/counselor.png" />
        )}
      </aside>
      <div className="c-content">
        <header className="c-top">
          <strong>{student ? "你好，" + user?.name : "辅导员工作台"}</strong>
          <span>
            {student ? user?.college : "立足服务 · 协同处置 · 保障校园"}
          </span>
          <Link aria-label="消息" to={root + "/messages"}>
            <Bell />
          </Link>
          <Link aria-label="我的" to={root + "/profile"}>
            <UserRound />
          </Link>
        </header>
        <div className="c-outlet">
          <Outlet />
        </div>
        <TrialFeedback />
      </div>
      <nav className="c-dock" aria-label="底部导航">
        {dock.map(([path, label, Icon]) => (
          <NavLink key={path} to={root + "/" + path}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
