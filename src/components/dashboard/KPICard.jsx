import { StatusBadge } from './StatusBadge.jsx'

const ACCENT = {
  green:  '#22c55e',
  yellow: '#C9A84C',
  red:    '#ef4444',
}

export function KPICard({ label, value, meta, unit = '', status = 'yellow' }) {
  const accent = ACCENT[status] ?? ACCENT.yellow

  return (
    <div className="bg-white rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden"
      style={{
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
        borderTop: `2px solid ${accent}`,
      }}>

      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider leading-tight" style={{ color: '#999' }}>{label}</span>
        <StatusBadge status={status} />
      </div>

      <span className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: '#0d0d0d' }}>
        {value !== null && value !== undefined ? `${value}${unit}` : '—'}
      </span>

      {meta !== undefined && (
        <p className="text-[11px]" style={{ color: '#bbb' }}>
          Meta: <span className="font-semibold" style={{ color: '#888' }}>{meta}{unit}</span>
        </p>
      )}
    </div>
  )
}
