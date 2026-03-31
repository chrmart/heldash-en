import { createContext, useContext, useState, useCallback, useRef } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
  duration: number
  exiting: boolean
}

interface ToastContextValue {
  toast: (opts: { message: string; type: ToastType; duration?: number }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 200)
  }, [])

  const toast = useCallback(({ message, type, duration = 2500 }: { message: string; type: ToastType; duration?: number }) => {
    const id = ++counterRef.current
    setToasts(prev => {
      const next = [...prev, { id, message, type, duration, exiting: false }]
      // Max 3 — remove oldest first
      if (next.length > 3) {
        return next.slice(next.length - 3)
      }
      return next
    })
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  const borderColor: Record<ToastType, string> = {
    success: 'var(--status-online)',
    error: 'var(--status-offline)',
    warning: '#f59e0b',
    info: 'var(--accent)',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast ${t.exiting ? 'toast-exit' : ''}`}
            style={{ borderLeft: `3px solid ${borderColor[t.type]}` }}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
