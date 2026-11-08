import { useCallback, useEffect, useState } from 'react'
import { request } from '../lib/api'

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    if (!path) {
      setData(null)
      setLoading(false)
      return
    }
    let alive = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    request<T>(path, { signal: controller.signal })
      .then((payload) => {
        if (!alive) return
        setData(payload)
        setLoading(false)
      })
      .catch((err) => {
        if (!alive || err?.name === 'AbortError') return
        setError(err?.message || '加载失败')
        setLoading(false)
      })
    return () => {
      alive = false
      controller.abort()
    }
  }, [path, tick])

  return { data, loading, error, reload, setData }
}
