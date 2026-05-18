import { MapPin, Building2, ChevronDown } from 'lucide-react'
import { useRegiao } from '../contexts/RegiaoContext.jsx'
import { REGIAO_LABEL, REGIAO_LABEL_CURTA, REGIAO_COR } from '../constants.js'

const ICONS = { Coimbra: MapPin, AMP: Building2 }

export function RegiaoBadge({ compact = false }) {
  const { regiaoAtiva, abrirModal } = useRegiao()
  if (!regiaoAtiva) return null
  const Icon = ICONS[regiaoAtiva] || MapPin
  const cor = REGIAO_COR[regiaoAtiva]
  const label = compact ? REGIAO_LABEL_CURTA[regiaoAtiva] : REGIAO_LABEL[regiaoAtiva]

  return (
    <button
      onClick={abrirModal}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800"
      style={{ borderColor: `${cor}55`, color: cor }}
      title="Trocar de região"
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      <span className="text-gray-400 dark:text-neutral-500">·</span>
      <span className="text-gray-500 dark:text-neutral-400">trocar</span>
      <ChevronDown className="w-3 h-3 text-gray-400 dark:text-neutral-500" />
    </button>
  )
}
