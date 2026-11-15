import type {
  Dashboard,
  Dictionaries,
  Filters,
  Page,
  SplitItem,
  Ticket,
  User,
} from "../types";
export class ApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public status: number,
  ) {
    super(message);
  }
}
const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  const token = localStorage.getItem("zhihui_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(base + path, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const body = await res.json();
    if (!res.ok || body.code !== 0) {
      if (res.status === 401 && path !== "/auth/login") {
        localStorage.removeItem("zhihui_token");
        window.dispatchEvent(new Event("zhihui:auth-expired"));
      }
      throw new ApiError(
        body.msg || "服务暂不可用，请稍后重试",
        body.code,
        res.status,
      );
    }
    return body.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof DOMException && error.name === "AbortError"
        ? "请求超时，请稍后重试"
        : "网络连接失败，请检查连接后重试",
      0,
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}
const post = <T>(path: string, data: unknown = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) });
const ticketPath = (id: string) =>
  `/counselor/tickets/${encodeURIComponent(id)}`;
export const api = {
  login: (account: string, password: string) =>
    post<{ token: string; user: User }>("/auth/login", { account, password }),
  me: () => request<User>("/auth/me"),
  dicts: () => request<Dictionaries>("/dicts/responsibility"),
  dashboard: () => request<Dashboard>("/counselor/dashboard"),
  tickets: (filters: Filters) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== "") query.set(k, String(v));
    });
    return request<Page<Ticket>>(`/counselor/tickets?${query}`);
  },
  ticket: (id: string) => request<Ticket>(ticketPath(id)),
  review: (id: string, approved: boolean, remark: string) =>
    post<Ticket>(ticketPath(id) + "/review", { approved, remark }),
  assign: (
    id: string,
    data: {
      deptId: string;
      handlerId: string;
      remark: string;
      slaHours: number;
    },
  ) => post<Ticket>(ticketPath(id) + "/assign", data),
  split: (id: string, children: SplitItem[]) =>
    post<Ticket>(ticketPath(id) + "/split", { children }),
  urge: (id: string, remark: string) =>
    post<Ticket>(ticketPath(id) + "/urge", { remark }),
  note: (id: string, text: string) =>
    post<Ticket>(ticketPath(id) + "/notes", { text }),
  remind: (id: string) => post<Ticket>(ticketPath(id) + "/remind-confirm"),
  archive: (id: string) => post<Ticket>(ticketPath(id) + "/archive"),
};
