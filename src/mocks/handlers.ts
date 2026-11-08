import { delay, http, HttpResponse, passthrough } from 'msw'
import { mockTickets } from './fixtures/tickets'

const isContractDemo = (request: Request) => request.headers.get('X-Contract-Demo') === '1'

const envelope = <T>(data: T) => ({ code: 0, msg: 'ok', data })

const error = (status: number, code: number, msg: string) =>
  HttpResponse.json({ code, msg, data: null }, { status })

const filterTickets = (url: URL) => {
  const status = url.searchParams.get('status') || 'all'
  const risk = url.searchParams.get('risk') || 'all'
  const overdue = url.searchParams.get('overdue') || 'all'

  let list = [...mockTickets]
  if (status !== 'all') {
    const allowed = new Set(status.split(','))
    list = list.filter((ticket) => allowed.has(ticket.status))
  }
  if (risk !== 'all') list = list.filter((ticket) => ticket.risk === risk)
  if (overdue === 'true') list = list.filter((ticket) => ticket.overdue)

  return list
}

export const handlers = [
  http.get('*/api/health', async ({ request }) => {
    if (!isContractDemo(request)) return passthrough()
    await delay(150)
    return HttpResponse.json(
      envelope({
        ok: true,
        service: '智汇中枢 API',
        time: new Date().toISOString(),
      }),
    )
  }),

  http.get('*/api/tickets', async ({ request }) => {
    if (!isContractDemo(request)) return passthrough()

    const scenario = request.headers.get('X-Mock-Scenario')
    if (scenario === 'slow') await delay(5000)
    else await delay(320)

    if (scenario === '401') return error(401, 40101, '登录状态已失效，请重新进入。')
    if (scenario === '500') return error(500, 50001, '中枢开小差了，请稍后再试。')

    const url = new URL(request.url)
    const list = scenario === 'empty' ? [] : filterTickets(url)
    const page = Math.max(1, Number(url.searchParams.get('page') || 1))
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') || 20)))
    const start = (page - 1) * pageSize
    const paged = list.slice(start, start + pageSize)

    return HttpResponse.json(
      envelope({
        tickets: paged,
        counts: {
          all: mockTickets.length,
          pending_review: mockTickets.filter((ticket) => ticket.status === 'pending_review').length,
          active: mockTickets.filter((ticket) => ticket.status !== 'completed').length,
          awaiting_confirm: mockTickets.filter((ticket) => ticket.status === 'awaiting_confirm').length,
          completed: mockTickets.filter((ticket) => ticket.status === 'completed').length,
        },
        page,
        pageSize,
        total: list.length,
        hasMore: start + pageSize < list.length,
      }),
    )
  }),
]
