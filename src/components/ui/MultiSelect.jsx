import { useState } from 'react'

/**
 * Multi-select dropdown com tags.
 * value: JSON string array (ex: '["ERA","Remax"]')
 * options: aceita dois formatos:
 *   - array de strings (lista plana): ['A','B','C']
 *   - objecto {grupo: [opções]} para optgroups: { Porto: [...], 'Vila Nova de Gaia': [...] }
 * onChange: callback com JSON string
 */
export function MultiSelect({ value, options, onChange, placeholder = 'Selecionar...' }) {
  const [open, setOpen] = useState(false)
  const selected = (() => { try { return JSON.parse(value || '[]') } catch { return [] } })()

  function toggle(opt) {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]
    onChange(JSON.stringify(next))
  }

  // Detecta formato agrupado (objecto) vs lista plana (array)
  const isGrouped = options && !Array.isArray(options) && typeof options === 'object'
  const groups = isGrouped ? Object.entries(options) : null

  const renderOption = (opt) => (
    <button key={opt} type="button" onClick={() => toggle(opt)}
      aria-pressed={selected.includes(opt)}
      className={`w-full text-left px-3 py-2 text-sm text-ink flex items-center gap-2 transition-colors duration-fast focus:outline-none focus-visible:bg-surface-muted ${
        selected.includes(opt) ? 'bg-surface-muted' : 'hover:bg-surface-muted'
      }`}>
      <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-semibold text-accent-ink ${
        selected.includes(opt) ? 'border-accent' : 'border-line'
      }`}>{selected.includes(opt) ? '✓' : ''}</span>
      {opt}
    </button>
  )

  return (
    <div className="relative">
      <div
        onClick={() => setOpen(!open)}
        className={`w-full px-3 py-2 rounded-lg border bg-surface-raised text-ink text-sm cursor-pointer min-h-[38px] flex flex-wrap gap-1 items-center transition-colors duration-fast ${open ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}
      >
        {selected.length > 0 ? selected.map(s => (
          <span key={s} className="bg-surface-muted text-ink px-2 py-0.5 rounded-full text-caption font-medium flex items-center gap-1">
            {s}
            <button type="button" aria-label={`Remover ${s}`} onClick={e => { e.stopPropagation(); toggle(s) }} className="text-ink-muted hover:text-danger transition-colors duration-fast">&times;</button>
          </span>
        )) : <span className="text-ink-muted">{placeholder}</span>}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-raised border border-line rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
            {isGrouped ? groups.map(([label, opts]) => (
              <div key={label}>
                <div className="px-3 py-1.5 text-overline font-semibold uppercase text-ink-muted bg-surface border-b border-line sticky top-0">{label}</div>
                {(opts || []).map(renderOption)}
              </div>
            )) : (options || []).map(renderOption)}
          </div>
        </>
      )}
    </div>
  )
}
