import { useState } from 'react'

/**
 * Multi-select dropdown com tags.
 * value: JSON string array (ex: '["ERA","Remax"]')
 * options: array de strings
 * onChange: callback com JSON string
 */
export function MultiSelect({ value, options, onChange, placeholder = 'Selecionar...' }) {
  const [open, setOpen] = useState(false)
  const selected = (() => { try { return JSON.parse(value || '[]') } catch { return [] } })()

  function toggle(opt) {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]
    onChange(JSON.stringify(next))
  }

  return (
    <div className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm cursor-pointer min-h-[38px] flex flex-wrap gap-1 items-center focus-within:ring-2 focus-within:ring-indigo-300"
      >
        {selected.length > 0 ? selected.map(s => (
          <span key={s} className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1">
            {s}
            <button onClick={e => { e.stopPropagation(); toggle(s) }} className="hover:text-red-500">&times;</button>
          </span>
        )) : <span className="text-gray-400">{placeholder}</span>}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
            {options.map(opt => (
              <button key={opt} onClick={() => toggle(opt)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                  selected.includes(opt) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                }`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                  selected.includes(opt) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'
                }`}>{selected.includes(opt) ? '✓' : ''}</span>
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
