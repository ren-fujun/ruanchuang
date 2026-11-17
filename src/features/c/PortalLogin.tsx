import { useState } from "react";
import { Navigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { PortalRole } from "./config";

export function PortalLogin({ role }: { role: PortalRole }) {
  const { user, signIn, demoSignIn, signOut } = useAuth();
  const [account, setAccount] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (user?.role === role)
    return <Navigate to={"/" + role + "/home"} replace />;
  async function enter(demo = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (demo) await demoSignIn(role);
      else await signIn(account, password, role);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="c-login">
      <GraduationCap size={48} />
      <h1>智汇中枢</h1>
      <h2>{role === "student" ? "学生端" : "辅导员端"}登录</h2>
      {user ? (
        <>
          <p>当前身份不适用于此入口。</p>
          <button onClick={() => void signOut()}>退出当前账号</button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enter();
          }}
        >
          <label>
            账号
            <input
              required
              autoComplete="username"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </label>
          <label>
            密码
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="c-primary" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void enter(true)}
          >
            体验{role === "student" ? "学生" : "辅导员"}演示账号
          </button>
        </form>
      )}
    </main>
  );
}
