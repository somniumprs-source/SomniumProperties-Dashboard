/**
 * Card de métrica/KPI.
 *
 * Props:
 *  - icon:  componente Lucide
 *  - label: string (descritor pequeno em cima)
 *  - value: string | number (número grande)
 *  - sub:   string opcional (caption)
 *  - tone:  'gold' | 'indigo' | 'green' | 'red' | 'amber' | 'gray' (default gray)
 *  - size:  'sm' | 'md' | 'lg' (default md)
 *  - onClick: torna o card clicável com hover
 */

const TONE = {
  gold:   { iconBg: 'bg-[#C9A84C]/15', iconText: 'text-[#a0832d]', accent: 'text-[#0d0d0d]' },
  indigo: { iconBg: 'bg-indigo-50',    iconText: 'text-indigo-600', accent: 'text-indigo-700' },
  green:  { iconBg: 'bg-emerald-50',   iconText: 'text-emerald-600', accent: 'text-emerald-700' },
  red:    { iconBg: 'bg-red-50',       iconText: 'text-red-600', accent: 'text-red-700' },
  amber:  { iconBg: 'bg-amber-50',     iconText: 'text-amber-600', accent: 'text-amber-700' },
  blue:   { iconBg: 'bg-blue-50',      iconText: 'text-blue-600', accent: 'text-blue-700' },
  gray:   { iconBg: 'bg-gray-100',     iconText: 'text-gray-600', accent: 'text-gray-900' },
}

const SIZE_CONF = {
  sm: { card: 'p-3',     value: 'text-lg', label: 'text-[10px]', icon: 'w-7 h-7',  iconSize: 'w-3.5 h-3.5' },
  md: { card: 'p-4',     value: 'text-2xl', label: 'text-[10px]', icon: 'w-9 h-9', iconSize: 'w-4 h-4' },
  lg: { card: 'p-5',     value: 'text-3xl', label: 'text-xs',     icon: 'w-11 h-11', iconSize: 'w-5 h-5' },
}

export function KpiCard({ icon: Icon, label, value, sub, tone = 'gray', size = 'md', onClick, active = false, className = '' }) {
  const t = TONE[tone] || TONE.gray
  const s = SIZE_CONF[size] || SIZE_CONF.md
  const interactive = !!onClick
  const activeClass = active
    ? 'bg-[#0d0d0d] border-[#0d0d0d] shadow-md'
    : 'bg-white border-gray-200'
  const hoverClass = interactive && !active
    ? 'cursor-pointer hover:border-gray-300 hover:shadow-sm transition'
    : interactive ? 'cursor-pointer transition' : ''
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border ${s.card} flex items-center gap-3 ${activeClass} ${hoverClass} ${className}`}>
      {Icon && (
        <div className={`${s.icon} rounded-xl ${active ? 'bg-[#C9A84C]/15 text-[#C9A84C]' : `${t.iconBg} ${t.iconText}`} flex items-center justify-center shrink-0`}>
          <Icon className={s.iconSize} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {label && <p className={`${s.label} uppercase tracking-wide font-semibold truncate ${active ? 'text-[#C9A84C]' : 'text-gray-400'}`}>{label}</p>}
        <p className={`${s.value} font-bold leading-tight truncate ${active ? 'text-white' : t.accent}`}>{value ?? '—'}</p>
        {sub && <p className={`text-[11px] truncate mt-0.5 ${active ? 'text-gray-400' : 'text-gray-400'}`}>{sub}</p>}
      </div>
    </div>
  )
}
