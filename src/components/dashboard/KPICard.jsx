import { StatusBadge } from './StatusBadge.jsx'

const ACCENT = {
  green:  '#22c55e',
  yellow: '#C9A84C',
  red:    '#ef4444',
}

export function KPICard({ label, value, meta, unit = '', status = 'yellow' }) {
  const accent = ACCENT[status] ?? ACCENT.yellow

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden shadow-sm dark:shadow-neutral-800/20"
      style={{ borderTop: `2px solid ${accent}` }}>

      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider leading-tight text-neutral-400">{label}</span>
        <StatusBadge status={status} />
      </div>

      <span className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
        {value !== null && value !== undefined ? `${value}${unit}` : '—'}
      </span>

      {meta !== undefined && (
        <p className="text-[11px] text-neutral-400">
          Meta: <span className="font-semibold text-neutral-500">{meta}{unit}</span>
        </p>
      )}
    </div>
  )
}
