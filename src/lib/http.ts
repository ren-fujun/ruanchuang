export interface ApiEnvelope<T> {
  code: number
  msg: string
  data: T
}

export class ApiError extends Error {
  code: number
  status: number

  constructor(message: string, code: number, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** 仅用于契约示例页：给 MSW 打标，避免影响现有业务页面。 */
  mock?: boolean
  /** 允许调用方显式覆盖 token；不传则读 localStorage。 */
  token?: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const TOKEN_KEY = 'zhihui_token'

const buildUrl = (path: string) => {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError('接口返回了非 JSON 内容，请检查后端/代理是否指向正确服务。', 50001, response.status)
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, mock = false, token, headers: inputHeaders, ...init } = options
  const headers = new Headers(inputHeaders)
  const finalToken = token === undefined ? localStorage.getItem(TOKEN_KEY) : token

  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if (finalToken) headers.set('Authorization', `Bearer ${finalToken}`)
  if (mock) headers.set('X-Contract-Demo', '1')

  let response: Response
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('网络连接失败，请检查 API 地址或后端是否启动。', 50001, 0)
  }

  const payload = (await parseJson(response)) as ApiEnvelope<T> | null

  if (!payload || typeof payload !== 'object' || typeof payload.code !== 'number') {
    throw new ApiError('接口未按 v1 返回 {code,msg,data}，请先完成 envelope 包装。', 50001, response.status)
  }

  if (!response.ok || payload.code !== 0) {
    if (payload.code === 40101) {
      window.dispatchEvent(new CustomEvent('zhihui:auth-expired'))
    }
    throw new ApiError(payload.msg || '请求失败，请稍后再试。', payload.code, response.status)
  }

  return payload.data
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
}

export const buildQuery = (params: Record<string, string | number | boolean | null | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY)
