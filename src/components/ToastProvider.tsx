import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastContextType {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType, duration?: number) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: ReactNode
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const toast: Toast = { id, message, type, duration }
    setToasts(prev => [...prev, toast])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      className="toast-container position-fixed bottom-0 end-0 p-3"
      style={{ zIndex: 1100 }}
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: string) => void
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id)
    }, toast.duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return '✓'
      case 'error': return '✕'
      case 'warning': return '⚠'
      case 'info': return 'ℹ'
    }
  }

  const getBgClass = () => {
    switch (toast.type) {
      case 'success': return 'bg-success'
      case 'error': return 'bg-danger'
      case 'warning': return 'bg-warning'
      case 'info': return 'bg-info'
    }
  }

  const getTextClass = () => {
    return toast.type === 'warning' ? 'text-dark' : 'text-white'
  }

  return (
    <div
      className={`toast show align-items-center ${getBgClass()} ${getTextClass()} border-0 mb-2`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      style={{ minWidth: '280px' }}
    >
      <div className="d-flex">
        <div className="toast-body d-flex align-items-center gap-2">
          <span className="fs-5" aria-hidden="true">{getIcon()}</span>
          <span>{toast.message}</span>
        </div>
        <button
          type="button"
          className={`btn-close ${toast.type !== 'warning' ? 'btn-close-white' : ''} me-2 m-auto`}
          aria-label="Dismiss notification"
          onClick={() => onDismiss(toast.id)}
        />
      </div>
      <div 
        ref={progressRef}
        className="toast-progress"
        style={{
          height: '3px',
          background: 'rgba(255,255,255,0.3)',
          animation: `shrink ${toast.duration}ms linear forwards`,
        }}
      />
    </div>
  )
}
