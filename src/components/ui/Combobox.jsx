// Combobox pesquisável com filtro client-side, accent-insensitive e teclado
import { useEffect, useMemo, useRef, useState } from 'react'

const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Combobox({ value, onChange, options = [], placeholder = 'Pesquisar…', label, className = '', allowFree = true, disabled = false, onCreateNew, createLabel = 'Criar' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(0)
  const ref = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return options.slice(0, 50)
    return options.filter(o => norm(o).includes(q)).slice(0, 50)
  }, [query, options])

  // Match exacto pelo query? Se sim, não oferecer "Criar".
  const exactMatch = useMemo(() => {
    const q = norm(query)
    return !!q && options.some(o => norm(o) === q)
  }, [query, options])
  const showCreate = !!onCreateNew && query.trim().length >= 2 && !exactMatch

  const choose = v => { onChange(v); setQuery(v); setOpen(false) }
  const triggerCreate = () => { setOpen(false); onCreateNew?.(query.trim()) }

  const onKeyDown = e => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHover(h => Math.min(filtered.length - 1, h + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHover(h => Math.max(0, h - 1)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[hover]) choose(filtered[hover])
      else if (showCreate) triggerCreate()
      else if (allowFree) { onChange(query); setOpen(false) }
    }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      {label && <label className="text-xs text-ink-muted block mb-1">{label}</label>}
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHover(0); if (allowFree) onChange(e.target.value) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg border border-line bg-surface-raised text-ink text-sm placeholder:text-ink-muted/70 transition-colors duration-fast focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:bg-surface-muted disabled:opacity-60"
      />
      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-line bg-surface-raised shadow-lg">
          {filtered.map((o, i) => (
            <button
              type="button"
              key={o}
              onMouseEnter={() => setHover(i)}
              onClick={() => choose(o)}
              className={`flex w-full items-center justify-between gap-2 text-left px-3 py-1.5 text-sm text-ink ${i === hover ? 'bg-surface-muted' : ''}`}
            >
              <span className="truncate">{o}</span>
              {o === value && <span className="text-accent-ink text-xs font-semibold" aria-hidden="true">✓</span>}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={triggerCreate}
              className={`block w-full text-left px-3 py-1.5 text-sm border-t border-line ${filtered.length === 0 ? 'bg-surface-muted' : 'hover:bg-surface-muted'} text-accent-ink font-medium`}
            >
              + {createLabel} “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
