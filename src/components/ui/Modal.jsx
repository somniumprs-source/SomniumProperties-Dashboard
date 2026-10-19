/**
 * Modal — overlay + container com entrada e saída animadas (AnimatePresence).
 * Renderizado num portal em <body>; fecha com Esc e clique no fundo.
 * Foco: entra no diálogo ao abrir, fica preso lá dentro (Tab) e volta ao
 * elemento de origem ao fechar. O Esc não chega a outros atalhos globais.
 * Uso:
 *   <Modal open={open} onClose={close} title="Título" subtitle="..." size="md">
 *     ...body...
 *     <Modal.Footer>...</Modal.Footer>
 *   </Modal>
 * `bare` entrega o corpo sem margem interna; `top` ancora a janela no terço
 * superior (paleta de comandos); `label` dá nome acessível quando não há título.
 */
import { useEffect, useId, useRef } from 'react'
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

// Janelas abertas, da mais antiga para a mais recente: só a de cima reage ao teclado.
const pilha = []

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, className = '', bare = false, top = false, label }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const marca = {}
    pilha.push(marca)
    const origem = document.activeElement
    const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const raf = requestAnimationFrame(() => {
      const el = dialogRef.current
      if (!el || el.contains(document.activeElement)) return
      const alvo = el.querySelector('[autofocus]') || el.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea') || el
      alvo.focus({ preventScroll: true })
    })
    function onKey(e) {
      const el = dialogRef.current
      if (!el || pilha[pilha.length - 1] !== marca) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key === 'Tab') {
        const itens = [...el.querySelectorAll(FOCAVEIS)].filter(n => n.offsetParent !== null)
        if (!itens.length) { e.preventDefault(); return }
        const primeiro = itens[0], ultimo = itens[itens.length - 1]
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
      }
    }
    // Captura: o modal trata o Esc antes dos atalhos globais da página.
    window.addEventListener('keydown', onKey, true)
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
      pilha.splice(pilha.indexOf(marca), 1)
      if (!pilha.length) document.body.style.overflow = ''
      if (origem && typeof origem.focus === 'function' && document.contains(origem)) origem.focus({ preventScroll: true })
    }
  }, [open])

  // propagate: se quem usa o Modal o desmontar dentro de um <AnimatePresence>, a saída anima na mesma.
  return createPortal(
    <AnimatePresence propagate>
      {open && (
        <motion.div key="modal" variants={overlayVariants} initial="initial" animate="animate" exit="exit"
          className={`fixed inset-0 z-50 flex justify-center p-4 bg-ink/40 dark:bg-black/60 backdrop-blur-[2px] ${top ? 'items-start pt-[12vh]' : 'items-center'}`}
          onClick={onClose}>
          <motion.div variants={dialogVariants} ref={dialogRef} tabIndex={-1}
            role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label}
            className={`bg-surface-raised text-ink border border-line rounded-2xl shadow-xl w-full outline-none max-h-[calc(100dvh-2rem)] overflow-y-auto ${SIZE[size] || SIZE.md} ${className}`}
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
            {bare ? children : <div className="p-5">{children}</div>}
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
