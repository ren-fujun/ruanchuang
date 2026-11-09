import type {
  CounselorDashboard,
  DormCheckData,
  DormRecord,
  InsightsData,
  Notification,
  PrecheckResult,
  StudentHomeData,
  Ticket,
  TicketDetailData,
  User,
} from '../types'

const TOKEN_KEY = 'zhihui_token'
const API_BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (token: string) => {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/**
 * Shared API boundary. During the v1 backend rollout we accept the current raw
 * payload as well as the agreed { code, msg, data } envelope. Remove the raw
 * payload branch once the API service has completed its envelope migration.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  let payload: any = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const isEnvelope = payload && typeof payload === 'object' && typeof payload.code === 'number'
  if (isEnvelope && (!response.ok || payload.code !== 0)) {
    if ((payload.code === 40101 || response.status === 401) && !path.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent('zhihui:auth-expired'))
    }
    throw new ApiError(payload?.msg || payload?.message || '网络不太稳定，请稍后再试。', response.status)
  }
  if (!response.ok) {
    if (response.status === 401 && !path.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent('zhihui:auth-expired'))
    }
    throw new ApiError(payload?.msg || payload?.message || '网络不太稳定，请稍后再试。', response.status)
  }
  return (isEnvelope ? payload.data : payload) as T
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  login: (account: string, password: string, role: 'student' | 'counselor') =>
    post<{ token: string; user: User }>('/auth/login', { account, password, role }),
  demo: (role: 'student' | 'counselor') => post<{ token: string; user: User }>('/auth/demo', { role }),
  me: () => request<{ user: User; unread: number }>('/me'),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  studentHome: () => request<StudentHomeData>('/student/home'),
  counselorDashboard: () => request<CounselorDashboard>('/counselor/dashboard'),
  tickets: (params: string) => request<{ tickets: Ticket[]; counts: Record<string, number> }>(`/tickets?${params}`),
  ticket: (id: string) => request<TicketDetailData>(`/tickets/${id}`),
  precheck: (body: { text: string; category?: string; location?: string }) =>
    post<PrecheckResult>('/ai/precheck', body),
  createTicket: (body: {
    title?: string
    description: string
    category: string
    location: string
    urgency: string
    attachments?: { name: string; type: string; size: string }[]
  }) => post<{ ticket: Ticket }>('/tickets', body),
  confirmTicket: (id: string, body: { score?: number; comment?: string; tags?: string[] }) =>
    post<{ ticket: Ticket }>(`/tickets/${id}/confirm`, body),
  rateTicket: (id: string, body: { score: number; comment: string; tags: string[] }) =>
    post<{ ticket: Ticket }>(`/tickets/${id}/rate`, body),
  urgeStudent: (id: string, note?: string) =>
    post<{ ticket: Ticket }>(`/tickets/${id}/urge-student`, { note }),
  notFound: () => Promise.reject(new ApiError('页面不存在', 404)),
  notifications: () => request<{ notifications: Notification[]; unread: number }>('/notifications'),
  readAll: () => post<{ ok: boolean }>('/notifications/read-all'),
  readNotification: (id: string) => post<{ ok: boolean }>(`/notifications/${id}/read`),
  reviewTicket: (id: string, body: { departmentIds: string[]; note?: string }) =>
    patch<{ ticket: Ticket }>(`/tickets/${id}/review`, body),
  progressTicket: (id: string, body: { action: 'accept' | 'resolve'; result?: string }) =>
    patch<{ ticket: Ticket }>(`/tickets/${id}/progress`, body),
  urgeTicket: (id: string, note?: string) =>
    patch<{ ticket: Ticket }>(`/tickets/${id}/urge`, { note }),
  noteTicket: (id: string, text: string) =>
    post<{ ticket: Ticket }>(`/tickets/${id}/note`, { text }),
  splitTicket: (id: string, items: { title: string; departmentId: string; description?: string }[]) =>
    post<{ parent: Ticket; children: Ticket[] }>(`/tickets/${id}/split`, { items }),
  remindConfirm: (id: string) =>
    patch<{ ticket: Ticket }>(`/tickets/${id}/remind-confirm`),
  insights: () => request<InsightsData>('/counselor/insights'),
  dormCheck: () => request<DormCheckData>('/counselor/dorm-check'),
  submitDormCheck: (body: {
    roomId: string
    absentStudents: string[]
    issues: string[]
    note?: string
    attachments?: { name: string; type: string; size: string }[]
  }) =>
    post<{ record: DormRecord; message: string }>('/counselor/dorm-check', body),
  departments: () => request<{ departments: any[] }>('/departments'),
}
