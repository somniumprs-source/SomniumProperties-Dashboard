// Combobox pesquisável com filtro client-side, accent-insensitive e teclado
import { useEffect, useMemo, useRef, useState } from 'react'

const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Combobox({ value, onChange, options = [], placeholder = 'Pesquisar…', label, className = '', allowFree = true, disabled = false }) {
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

  const choose = v => { onChange(v); setQuery(v); setOpen(false) }

  const onKeyDown = e => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHover(h => Math.min(filtered.length - 1, h + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHover(h => Math.max(0, h - 1)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[hover]) choose(filtered[hover])
      else if (allowFree) { onChange(query); setOpen(false) }
    }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      {label && <label className="text-xs text-gray-400 block mb-1">{label}</label>}
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHover(0); if (allowFree) onChange(e.target.value) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:bg-gray-50"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map((o, i) => (
            <button
              type="button"
              key={o}
              onMouseEnter={() => setHover(i)}
              onClick={() => choose(o)}
              className={`block w-full text-left px-3 py-1.5 text-sm ${i === hover ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
            >{o}</button>
          ))}
        </div>
      )}
    </div>
  )
}
