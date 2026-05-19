import { MapPin, Building2, ChevronDown } from 'lucide-react'
import { REGIAO_LABEL, REGIAO_LABEL_CURTA, REGIAO_COR } from '../constants.js'

const ICONS = { Coimbra: MapPin, AMP: Building2 }

/**
 * Pequeno chip que mostra a região activa + permite reabrir o modal.
 * Recebe a região e o callback abrirModal via props (vindo de useRegiaoGate).
 *
 *   <RegiaoBadge regiao={gate.regiao} onTrocar={gate.abrirModal} />
 */
export function RegiaoBadge({ regiao, onTrocar, compact = false }) {
  if (!regiao) return null
  const Icon = ICONS[regiao] || MapPin
  const cor = REGIAO_COR[regiao]
  const label = compact ? REGIAO_LABEL_CURTA[regiao] : REGIAO_LABEL[regiao]

  return (
    <button
      onClick={onTrocar}
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

/**
 * Toggle Coimbra | AMP | Geral — para uso no Financeiro onde não há modal,
 * só seletor inline com 3 opções (geral = sem filtro). Recebe valor + setter.
 *
 *   <RegiaoToggle value={regiao} onChange={setRegiao} />
 */
export function RegiaoToggle({ value, onChange, options = ['Coimbra', 'AMP', 'Geral'] }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-0.5 text-xs">
      {options.map(o => {
        const active = (value || 'Geral') === o
        const cor = REGIAO_COR[o]
        return (
          <button
            key={o}
            onClick={() => onChange(o === 'Geral' ? null : o)}
            className={`px-3 py-1.5 rounded-md transition-all font-medium ${
              active
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
            style={active && cor ? { color: cor } : undefined}
          >
            {o === 'AMP' ? 'AMP' : o}
          </button>
        )
      })}
    </div>
  )
}
