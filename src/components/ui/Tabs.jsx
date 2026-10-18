import { useId } from 'react'
import { motion } from 'framer-motion'
import { tabIndicatorTransition as SLIDE } from '../../lib/motion.js'

/**
 * Segmented control / tab bar unificado.
 *
 * Props:
 *  - items:   [{ key, label, icon?, count?, disabled? }]
 *  - value:   key actual
 *  - onChange: (key) => void
 *  - size:    'sm' | 'md' (default md)
 *  - variant: 'segmented' (chip) | 'underline' (texto com sublinhado dourado)
 *  - fluid:   true → tabs ocupam toda a largura disponível
 */

const SIZES_SEG = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-ui px-3.5 py-2 gap-2',
}

const ICON_SIZES = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4' }

export function Tabs({ items, value, onChange, size = 'md', variant = 'segmented', fluid = false, className = '' }) {
  const id = useId()
  if (variant === 'underline') {
    return (
      <div role="tablist" className={`flex border-b border-line overflow-x-auto ${className}`}>
        {items.map(it => {
          const active = value === it.key
          const Icon = it.icon
          return (
            <button
              key={it.key}
              role="tab" aria-selected={active}
              onClick={() => !it.disabled && onChange(it.key)}
              disabled={it.disabled}
              className={`relative inline-flex items-center font-medium whitespace-nowrap transition-colors duration-fast disabled:opacity-40 ${SIZES_SEG[size] || SIZES_SEG.md} ${
                active ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}>
              {Icon && <Icon className={`${ICON_SIZES[size]} shrink-0`} />}
              <span>{it.label}</span>
              {it.count != null && (
                <span className={`ml-1 px-1.5 text-[11px] leading-4 rounded-full font-semibold num ${active ? 'bg-accent/20 text-accent-ink' : 'bg-surface-muted text-ink-muted'}`}>{it.count}</span>
              )}
              {active && <motion.span layoutId={`tabs-bar-${id}`} transition={SLIDE} className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-accent" />}
            </button>
          )
        })}
      </div>
    )
  }

  // Segmented (default): pill bar com fundo cinza
  return (
    <div role="tablist" className={`inline-flex items-center gap-0.5 rounded-xl bg-surface-muted p-1 ${fluid ? 'w-full' : ''} ${className}`}>
      {items.map(it => {
        const active = value === it.key
        const Icon = it.icon
        return (
          <button
            key={it.key}
            role="tab" aria-selected={active}
            onClick={() => !it.disabled && onChange(it.key)}
            disabled={it.disabled}
            className={`relative inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-base whitespace-nowrap disabled:opacity-40 ${fluid ? 'flex-1' : ''} ${SIZES_SEG[size] || SIZES_SEG.md} ${
              active
                ? 'text-ink'
                : 'bg-transparent text-ink-muted hover:text-ink'
            }`}>
            {active && <motion.span layoutId={`tabs-pill-${id}`} transition={SLIDE} className="absolute inset-0 rounded-lg bg-surface-raised border border-line shadow-xs" />}
            {Icon && <Icon className={`relative ${ICON_SIZES[size]} shrink-0`} />}
            <span className="relative">{it.label}</span>
            {it.count != null && (
              <span className={`relative ml-0.5 px-1.5 text-[11px] leading-4 rounded-full font-semibold num ${active ? 'bg-accent/20 text-accent-ink' : 'bg-line text-ink-muted'}`}>{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
