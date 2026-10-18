/**
 * Toast — notificações temporárias com entrada/saída animadas.
 * Superfície neutra com ícone semântico; erros ficam mais tempo.
 * Mensagens iguais em simultâneo não se repetem.
 */
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { toastVariants } from '../../lib/motion.js'

const ToastContext = createContext(null)

const TYPE_CONFIG = {
  success: { Icon: CheckCircle2, icon: 'text-success' },
  error:   { Icon: AlertCircle,  icon: 'text-danger' },
  warning: { Icon: AlertCircle,  icon: 'text-warning' },
  info:    { Icon: Info,         icon: 'text-ink-muted' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const addToast = useCallback((message, type = 'success', duration) => {
    const ms = duration ?? (type === 'error' ? 5000 : 3000)
    const id = ++seq.current
    setToasts(prev => prev.some(t => t.message === message && t.type === type)
      ? prev
      : [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms)
  }, [])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  // Ponte global: helpers fora da árvore React (ex.: openDocument em lib/api.js)
  // disparam `somnium:toast` para garantir feedback mesmo sem acesso ao contexto.
  useEffect(() => {
    const onToast = (e) => { const d = e.detail || {}; if (d.message) addToast(d.message, d.type || 'info') }
    window.addEventListener('somnium:toast', onToast)
    return () => window.removeEventListener('somnium:toast', onToast)
  }, [addToast])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div role="status" aria-live="polite"
        className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col items-end gap-2 pointer-events-none sm:max-w-md">
        <AnimatePresence initial={false}>
          {toasts.map(t => {
            const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.info
            const Icon = cfg.Icon
            return (
              <motion.div key={t.id} layout variants={toastVariants} initial="initial" animate="animate" exit="exit"
                className="pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-xl border border-line bg-surface-raised text-ink shadow-lg text-sm w-full sm:w-auto sm:min-w-[260px]">
                <Icon className={`w-4 h-4 shrink-0 ${cfg.icon}`} />
                <span className="flex-1">{t.message}</span>
                <button onClick={() => dismiss(t.id)} aria-label="Fechar" className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
