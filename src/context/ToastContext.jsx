import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((type, message, duration = 2800) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const ok    = useCallback((msg) => toast('ok',    msg), [toast])
  const warn  = useCallback((msg) => toast('warn',  msg), [toast])
  const info  = useCallback((msg) => toast('info',  msg), [toast])
  const error = useCallback((msg) => toast('error', msg), [toast])

  return (
    <ToastContext.Provider value={{ toast, ok, warn, info, error, toasts }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
