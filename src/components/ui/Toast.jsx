/**
 * Toast — notificações temporárias com ícone, brand colors, animação.
 */
import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const TYPE_CONFIG = {
  success: { Icon: CheckCircle2, bg: 'bg-green-600',     ring: 'ring-green-500/20' },
  error:   { Icon: AlertCircle,  bg: 'bg-red-600',       ring: 'ring-red-500/20' },
  warning: { Icon: AlertCircle,  bg: 'bg-yellow-500',    ring: 'ring-yellow-500/20' },
  info:    { Icon: Info,         bg: 'bg-brand-dark',    ring: 'ring-brand-gold/20' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
        {toasts.map(t => {
          const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.info
          const Icon = cfg.Icon
          return (
            <div key={t.id}
              className={`pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white ring-4 ${cfg.bg} ${cfg.ring} animate-slide-up min-w-[240px]`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="p-1 rounded-md hover:bg-white/10 transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
