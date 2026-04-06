export function StatusBadge({ status }) {
  const map = {
    green:  { color: '#22c55e', label: 'OK' },
    yellow: { color: '#C9A84C', label: 'Atenção' },
    red:    { color: '#ef4444', label: 'Crítico' },
  }
  const s = map[status] ?? map.yellow
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: s.color, boxShadow: `0 0 5px ${s.color}88` }} />
      <span className="text-[11px] font-semibold" style={{ color: s.color }}>{s.label}</span>
    </span>
  )
}
