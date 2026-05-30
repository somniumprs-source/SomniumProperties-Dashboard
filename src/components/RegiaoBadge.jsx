import { MapPin, Building2, ChevronDown, Globe2 } from 'lucide-react'
import { REGIAO_LABEL, REGIAO_LABEL_CURTA, REGIAO_COR } from '../constants.js'

const ICONS = { Coimbra: MapPin, AMP: Building2, Geral: Globe2 }
const LABEL_TOGGLE = { Coimbra: 'Coimbra', AMP: 'Porto', Geral: 'Geral' }

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
 * Toggle Coimbra | Porto | Geral — segmented control alinhado com o estilo
 * Somnium (mesmo look-and-feel dos Tabs segmentados: fundo cinza claro,
 * opção activa em preto com texto dourado). Geral = null = sem filtro.
 *
 *   <RegiaoToggle value={regiao} onChange={setRegiao} />
 */
export function RegiaoToggle({ value, onChange, options = ['Coimbra', 'AMP', 'Geral'] }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-gray-100 dark:bg-neutral-800 p-1">
      {options.map(o => {
        const active = (value || 'Geral') === o
        const Icon = ICONS[o] || MapPin
        return (
          <button
            key={o}
            onClick={() => onChange(o === 'Geral' ? null : o)}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
              active
                ? 'bg-brand-dark text-brand-gold shadow-sm'
                : 'bg-transparent text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100 hover:bg-white/60 dark:hover:bg-neutral-700/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{LABEL_TOGGLE[o] || o}</span>
          </button>
        )
      })}
    </div>
  )
}
