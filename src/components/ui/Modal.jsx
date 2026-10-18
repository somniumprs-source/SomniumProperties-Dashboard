/**
 * Modal — overlay + container com entrada e saída animadas (AnimatePresence).
 * Renderizado num portal em <body>; fecha com Esc e clique no fundo.
 * Uso:
 *   <Modal open={open} onClose={close} title="Título" subtitle="..." size="md">
 *     ...body...
 *     <Modal.Footer>...</Modal.Footer>
 *   </Modal>
 */
import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { overlayVariants, dialogVariants } from '../../lib/motion.js'

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)]',
}

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, className = '' }) {
  const titleId = useId()
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

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="modal" variants={overlayVariants} initial="initial" animate="animate" exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 dark:bg-black/60 backdrop-blur-[2px]"
          onClick={onClose}>
          <motion.div variants={dialogVariants}
            role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
            className={`bg-surface-raised text-ink border border-line rounded-2xl shadow-xl w-full max-h-[calc(100dvh-2rem)] overflow-y-auto ${SIZE[size] || SIZE.md} ${className}`}
            onClick={e => e.stopPropagation()}>
            {(title || subtitle) && (
              <div className="flex items-start justify-between gap-4 p-5 border-b border-line">
                <div className="min-w-0">
                  {title && <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>}
                  {subtitle && <p className="text-caption text-ink-muted mt-0.5">{subtitle}</p>}
                </div>
                <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="p-5">{children}</div>
            {footer && <div className="px-5 py-4 bg-surface-muted/60 border-t border-line rounded-b-2xl">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

Modal.Footer = function ModalFooter({ children, className = '' }) {
  return <div className={`flex items-center justify-end gap-2 ${className}`}>{children}</div>
}
