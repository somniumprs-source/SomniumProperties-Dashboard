import { Tabs } from '../ui/Tabs.jsx'

// Seletor de período transversal do Dashboard: curto/médio/largo/longo prazo.
const ITEMS = [
  { key: 'semana',    label: 'Semana' },
  { key: 'mes',       label: 'Mês' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'ano',       label: 'Ano' },
]

export function PeriodSelector({ value, onChange }) {
  return <Tabs variant="segmented" size="sm" items={ITEMS} value={value} onChange={onChange} />
}
