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
  md: 'text-sm px-3.5 py-2 gap-2',
}

const ICON_SIZES = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4' }

export function Tabs({ items, value, onChange, size = 'md', variant = 'segmented', fluid = false, className = '' }) {
  if (variant === 'underline') {
    return (
      <div className={`flex border-b border-gray-200 overflow-x-auto ${className}`}>
        {items.map(it => {
          const active = value === it.key
          const Icon = it.icon
          return (
            <button
              key={it.key}
              onClick={() => !it.disabled && onChange(it.key)}
              disabled={it.disabled}
              className={`relative inline-flex items-center font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${SIZES_SEG[size] || SIZES_SEG.md} ${
                active ? 'text-[#0d0d0d]' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {Icon && <Icon className={`${ICON_SIZES[size]} shrink-0`} />}
              <span>{it.label}</span>
              {it.count != null && (
                <span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full font-semibold ${active ? 'bg-[#0d0d0d] text-[#C9A84C]' : 'bg-gray-100 text-gray-600'}`}>{it.count}</span>
              )}
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ backgroundColor: '#C9A84C' }} />}
            </button>
          )
        })}
      </div>
    )
  }

  // Segmented (default): pill bar com fundo cinza
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-xl bg-gray-100 p-1 ${fluid ? 'w-full' : ''} ${className}`}>
      {items.map(it => {
        const active = value === it.key
        const Icon = it.icon
        return (
          <button
            key={it.key}
            onClick={() => !it.disabled && onChange(it.key)}
            disabled={it.disabled}
            className={`inline-flex items-center justify-center font-semibold rounded-lg transition-all whitespace-nowrap disabled:opacity-40 ${fluid ? 'flex-1' : ''} ${SIZES_SEG[size] || SIZES_SEG.md} ${
              active
                ? 'bg-[#0d0d0d] text-[#C9A84C] shadow-sm'
                : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}>
            {Icon && <Icon className={`${ICON_SIZES[size]} shrink-0`} />}
            <span>{it.label}</span>
            {it.count != null && (
              <span className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full font-semibold ${active ? 'bg-[#C9A84C]/20 text-[#C9A84C]' : 'bg-gray-200 text-gray-600'}`}>{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
