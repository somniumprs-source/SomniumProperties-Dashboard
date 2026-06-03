import { useRef, useState, useEffect } from 'react'

/**
 * Wrapper para tabelas largas: scroll horizontal suave (touch) + indicador
 * visual em telemóvel a mostrar que há mais conteúdo para o lado.
 * Substitui `<div className="overflow-x-auto">` à volta de tabelas.
 */
export function ScrollableTable({ children, className = '' }) {
  const ref = useRef(null)
  const [overflow, setOverflow] = useState(false)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 4)
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      el.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [children])

  return (
    <div className="relative">
      <div ref={ref} className={`overflow-x-auto ${className}`} style={{ WebkitOverflowScrolling: 'touch' }}>
        {children}
      </div>
      {overflow && !atEnd && (
        <div className="md:hidden pointer-events-none absolute right-0 top-0 bottom-0 w-9 bg-gradient-to-l from-white dark:from-neutral-900 to-transparent flex items-center justify-end pr-1">
          <span className="text-brand-gold text-xl animate-pulse">›</span>
        </div>
      )}
    </div>
  )
}
