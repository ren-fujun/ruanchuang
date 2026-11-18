import "./trial-feedback.css";
import { useRef, useState } from "react";
import { request } from "../../lib/api";

export function TrialFeedback({
  tokenKey = "zhihui_token",
}: {
  tokenKey?: string;
}) {
  const [open, setOpen] = useState(false),
    [type, setType] = useState("problem"),
    [description, setDescription] = useState(""),
    [rating, setRating] = useState(3);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const key = useRef(crypto.randomUUID());
  return (
    <div className="trial-feedback">
      <p>试用测试系统，非学校正式办理入口</p>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        试用反馈
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setMessage("");
            void request("/trial/feedback", {
              method: "POST",
              headers: {
                Authorization:
                  "Bearer " + (localStorage.getItem(tokenKey) || ""),
              },
              body: JSON.stringify({
                type,
                description,
                rating,
                pagePath: window.location.pathname,
                requestId: key.current,
              }),
            })
              .then(() => {
                setMessage("反馈已提交");
                setDescription("");
                key.current = crypto.randomUUID();
              })
              .catch((e) => setMessage(e.message || "提交失败"))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            反馈类型
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                key.current = crypto.randomUUID();
              }}
            >
              <option value="problem">问题</option>
              <option value="suggestion">建议</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>
            体验评分
            <select
              value={rating}
              onChange={(e) => {
                setRating(Number(e.target.value));
                key.current = crypto.randomUUID();
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 分
                </option>
              ))}
            </select>
          </label>
          <label>
            描述
            <textarea
              required
              maxLength={2000}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
          </label>
          <button disabled={busy}>提交反馈</button>
          <p role="status">{message}</p>
        </form>
      )}
    </div>
  );
}
