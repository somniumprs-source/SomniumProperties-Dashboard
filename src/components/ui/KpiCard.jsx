import { CountUp } from './CountUp.jsx'

/**
 * Card de métrica/KPI.
 *
 * Props:
 *  - icon:  componente Lucide
 *  - label: string (descritor pequeno em cima)
 *  - value: string | number (número grande)
 *  - sub:   string opcional (caption)
 *  - tone:  'gold' | 'green' | 'red' | 'amber' | 'orange' | 'blue' | 'gray' (default gray)
 *           ('indigo' aceite por compatibilidade, desenha como gray)
 *  - size:  'sm' | 'md' | 'lg' (default md)
 *  - onClick: torna o card clicável com hover
 */

// Valor sempre em tinta; a cor do tom fica só no ícone (semântica discreta).
const TONE = {
  gold:   { iconBg: 'bg-accent/15',      iconText: 'text-accent-ink' },
  green:  { iconBg: 'bg-success/10',     iconText: 'text-success' },
  red:    { iconBg: 'bg-danger/10',      iconText: 'text-danger' },
  amber:  { iconBg: 'bg-warning/10',     iconText: 'text-warning' },
  orange: { iconBg: 'bg-warning/10',     iconText: 'text-warning' },
  blue:   { iconBg: 'bg-surface-muted',  iconText: 'text-ink-muted' },
  gray:   { iconBg: 'bg-surface-muted',  iconText: 'text-ink-muted' },
}
TONE.indigo = TONE.gray

const SIZE_CONF = {
  sm: { card: 'p-3', value: 'text-xl font-semibold',             icon: 'w-7 h-7',   iconSize: 'w-3.5 h-3.5' },
  md: { card: 'p-4', value: 'font-display text-2xl font-medium', icon: 'w-9 h-9',   iconSize: 'w-4 h-4' },
  lg: { card: 'p-5', value: 'font-display text-display font-medium', icon: 'w-11 h-11', iconSize: 'w-5 h-5' },
}

export function KpiCard({ icon: Icon, label, value, sub, tone = 'gray', size = 'md', onClick, active = false, className = '' }) {
  const t = TONE[tone] || TONE.gray
  const s = SIZE_CONF[size] || SIZE_CONF.md
  const interactive = !!onClick
  const activeClass = active
    ? 'bg-surface-raised border-accent ring-1 ring-accent shadow-sm'
    : 'bg-surface-raised border-line'
  const hoverClass = interactive && !active
    ? 'cursor-pointer hover:border-ink/20 hover:shadow-sm transition-[box-shadow,border-color] duration-base ease-entry'
    : interactive ? 'cursor-pointer' : ''
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? active : undefined}
      onKeyDown={interactive ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } }) : undefined}
      className={`rounded-xl border ${s.card} flex items-center gap-3 ${activeClass} ${hoverClass} ${className}`}>
      {Icon && (
        <div className={`${s.icon} rounded-lg ${t.iconBg} ${t.iconText} flex items-center justify-center shrink-0`}>
          <Icon className={s.iconSize} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {label && <p className="text-overline uppercase font-medium truncate text-ink-muted">{label}</p>}
        <p className={`${s.value} num leading-tight truncate text-ink`}>{value == null ? '—' : <CountUp value={value} />}</p>
        {sub && <p className="text-caption truncate mt-0.5 text-ink-muted">{sub}</p>}
      </div>
    </div>
  )
}
