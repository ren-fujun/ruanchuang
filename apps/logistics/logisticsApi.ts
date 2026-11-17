import { getToken, request, setToken } from '../../src/lib/api'

export interface LogisticsUser {
  id: string
  role: 'logistics'
  name: string
  account?: string
  department?: string
  title?: string
}

export interface LogisticsHistoryItem {
  id: string
  action: string
  actorId: string
  at: string
  result?: string
  reason?: string
}

export interface LogisticsWorkItem {
  bundleId: string
  ticketId: string
  title: string
  description: string
  location: string
  status: 'sent' | 'accepted' | 'resolved' | 'completed' | 'disputed' | 'returned'
  history: LogisticsHistoryItem[]
}

interface LoginResponse {
  token: string
  user: LogisticsUser
}

export const logisticsApi = {
  token: getToken,
  async login(account: string, password: string) {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ account, password, role: 'logistics' }),
    })
    if (result.user.role !== 'logistics') {
      throw new Error('当前账号不是后勤身份。')
    }
    setToken(result.token)
    return result.user
  },
  async me() {
    const result = await request<{ user: LogisticsUser }>('/me')
    if (result.user.role !== 'logistics') {
      setToken('')
      throw new Error('当前账号不是后勤身份。')
    }
    return result.user
  },
  async logout() {
    try {
      await request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
    } finally {
      setToken('')
    }
  },
  async workOrders() {
    return request<{ items: LogisticsWorkItem[] }>('/logistics/work-orders')
  },
  async act(
    bundleId: string,
    ticketId: string,
    body:
      | { action: 'accept' }
      | { action: 'resolve'; result: string }
      | { action: 'return'; result: string },
  ) {
    return request<{ item: LogisticsWorkItem }>(
      `/logistics/work-orders/${encodeURIComponent(bundleId)}/${encodeURIComponent(ticketId)}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )
  },
  clearToken() {
    setToken('')
  },
}
