import { buildQuery, http } from '../../lib/http'
import type { Ticket } from '../../types'

export interface TicketListParams {
  status?: string
  risk?: string
  overdue?: 'all' | 'true'
  q?: string
  page?: number
  pageSize?: number
}

export interface TicketListData {
  tickets: Ticket[]
  counts: {
    all: number
    pending_review: number
    active: number
    awaiting_confirm: number
    completed: number
  }
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export interface HealthData {
  ok: boolean
  service: string
  time: string
}

export const contractApi = {
  health: (mock = false) => http.get<HealthData>('/health', { mock }),

  tickets: (params: TicketListParams = {}, mock = false) => {
    const query = buildQuery({
      status: params.status || 'all',
      risk: params.risk || 'all',
      overdue: params.overdue || 'all',
      q: params.q || '',
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    })
    return http.get<TicketListData>(`/tickets${query}`, { mock })
  },
}
