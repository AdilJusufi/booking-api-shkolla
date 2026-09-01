import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastTone = 'ok' | 'error' | 'info'
interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Cap on simultaneously visible toasts — a burst of distinct messages shouldn't fill the screen. */
const MAX_VISIBLE_TOASTS = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++counter.current
    setToasts((prev) => {
      // Same message+tone already showing (e.g. a double-click, or a repeated
      // action): replace it instead of stacking a duplicate — moves it to the
      // end and restarts its 4s timer rather than piling up identical toasts.
      const deduped = prev.filter((t) => !(t.message === message && t.tone === tone))
      const next = [...deduped, { id, message, tone }]
      return next.length > MAX_VISIBLE_TOASTS ? next.slice(next.length - MAX_VISIBLE_TOASTS) : next
    })
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast duhet përdorur brenda ToastProvider')
  return ctx
}
