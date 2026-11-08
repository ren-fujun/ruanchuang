import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

interface ToastContextValue {
  toast: (message: string, tone?: Tone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: Tone = 'success') => {
      counter.current += 1
      const id = counter.current
      setItems((current) => [...current.slice(-2), { id, message, tone }])
      window.setTimeout(() => remove(id), 3200)
    },
    [remove],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div className={`toast toast-${item.tone}`} key={item.id}>
            <span className="toast-icon">
              {item.tone === 'success' ? (
                <CheckCircle2 size={17} />
              ) : item.tone === 'error' ? (
                <TriangleAlert size={17} />
              ) : (
                <Info size={17} />
              )}
            </span>
            <span>{item.message}</span>
            <button className="toast-close" onClick={() => remove(item.id)} aria-label="关闭提示">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
