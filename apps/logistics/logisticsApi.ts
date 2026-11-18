import { getToken, request, setToken } from '../../src/lib/api'

export type RepairStatus =
  | 'pending_assignment'
  | 'processing'
  | 'awaiting_feedback'
  | 'objection_pending_response'
  | 'pending_coordination'
  | 'satisfied'
  | 'coordinated_closed'

export interface LogisticsUser {
  id: string
  role: 'logistics'
  name: string
  account?: string
  department?: string
  title?: string
  repairScopes?: string[]
}

export interface RepairHistoryItem {
  id: string
  action: string
  actorId: string
  actorName: string
  at: string
  detail?: string
  responseDueAt?: string
}

export interface Repair {
  id: string
  status: RepairStatus
  statusLabel: string
  version: number
  studentId: string
  studentName: string
  counselorId: string | null
  campus: string
  repairType: string
  location: string
  description: string
  claimantId: string | null
  claimantName: string | null
  claimedAt: string | null
  result: { text: string; at: string } | null
  feedback: {
    decision: 'satisfied' | 'objection'
    reason: string
    at: string
  } | null
  response: { text: string; at: string } | null
  coordination: {
    conclusion: string
    followUp: string
    owner: string
    dueAt: string
    at: string
    responseOverdue: boolean
  } | null
  responseDueAt: string | null
  responseOverdue: boolean
  terminal: boolean
  createdAt: string
  updatedAt: string
  terminalAt: string | null
  history: RepairHistoryItem[]
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
  repairs() {
    return request<{ items: Repair[] }>('/repairs')
  },
  claim(repair: Repair) {
    return request<{ repair: Repair }>(
      `/repairs/${encodeURIComponent(repair.id)}/claim`,
      {
        method: 'POST',
        body: JSON.stringify({
          version: repair.version,
          requestId: crypto.randomUUID(),
        }),
      },
    )
  },
  submitResult(repair: Repair, result: string) {
    return request<{ repair: Repair }>(
      `/repairs/${encodeURIComponent(repair.id)}/result`,
      {
        method: 'POST',
        body: JSON.stringify({
          version: repair.version,
          result,
          requestId: crypto.randomUUID(),
        }),
      },
    )
  },
  respond(repair: Repair, response: string) {
    return request<{ repair: Repair }>(
      `/repairs/${encodeURIComponent(repair.id)}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({
          version: repair.version,
          response,
          requestId: crypto.randomUUID(),
        }),
      },
    )
  },
  clearToken() {
    setToken('')
  },
}
