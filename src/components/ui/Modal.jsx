/**
 * Modal — overlay + container animado.
 * Uso:
 *   <Modal open={open} onClose={close} title="Título" subtitle="..." size="md">
 *     ...body...
 *     <Modal.Footer>...</Modal.Footer>
 *   </Modal>
 */
import { useEffect } from 'react'
import { X } from 'lucide-react'

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)]',
}

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, className = '' }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}>
      <div className={`bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full ${SIZE[size] || SIZE.md} animate-scale-in ${className}`}
        onClick={e => e.stopPropagation()}>
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-100 dark:border-neutral-800">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{title}</h2>}
              {subtitle && <p className="text-caption text-gray-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 bg-gray-50 dark:bg-neutral-900/50 border-t border-gray-100 dark:border-neutral-800 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  )
}

Modal.Footer = function ModalFooter({ children, className = '' }) {
  return <div className={`flex items-center justify-end gap-2 ${className}`}>{children}</div>
}
