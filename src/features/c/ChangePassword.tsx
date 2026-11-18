import { useState } from "react";
import { request } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
export function ChangePassword() {
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNext] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { signOut } = useAuth();
  return (
    <main className="c-login">
      <h1>修改初始密码</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void request("/auth/change-password", {
            method: "POST",
            body: JSON.stringify({ currentPassword, newPassword }),
          })
            .then(() => window.location.reload())
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          当前密码
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          新密码
          <input
            required
            minLength={10}
            maxLength={256}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="c-primary" disabled={busy}>
          保存密码
        </button>
        <button type="button" onClick={() => void signOut()}>
          退出登录
        </button>
      </form>
    </main>
  );
}
