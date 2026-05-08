/**
 * Wrapper legacy do KPICard original. Internamente usa o <KpiCard>
 * unificado em components/ui para visual consistente em toda a app.
 * Mantém a API antiga (status, meta, unit) para compatibilidade.
 */
import { KpiCard } from '../ui/KpiCard.jsx'

const STATUS_TO_TONE = {
  green:  'green',
  yellow: 'gold',
  red:    'red',
}

export function KPICard({ label, value, meta, unit = '', status = 'yellow' }) {
  const tone = STATUS_TO_TONE[status] || 'gold'
  const formatted = value !== null && value !== undefined ? `${value}${unit}` : '—'
  const sub = meta !== undefined && meta !== '—' ? `Meta: ${meta}${unit}` : null
  return <KpiCard label={label} value={formatted} sub={sub} tone={tone} size="md" />
}
