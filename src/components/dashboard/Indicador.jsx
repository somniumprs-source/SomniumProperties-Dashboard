import { createContext, useContext, useState } from 'react'
import { Info } from 'lucide-react'
import { KpiCard } from '../ui/KpiCard.jsx'
import { Modal } from '../ui/Modal.jsx'
import { Badge } from '../ui/Badge.jsx'
import { metrica, ESTADOS, DEPARTAMENTOS } from '../../lib/catalogoMetricas.js'

// Cada número do Dashboard passa por aqui: o catálogo decide o nome, o estado
// de medição e a ficha explicativa, para o ecrã nunca divergir do Glossário.
const FichaContext = createContext(() => {})
export const TOM_ESTADO = { medido: 'green', parcial: 'amber', sem_registo: 'red', inativo: 'gray' }

export function FichaProvider({ children }) {
  const [id, setId] = useState(null)
  const m = id ? metrica(id) : null
  return (
    <FichaContext.Provider value={setId}>
      {children}
      <Modal open={!!m} onClose={() => setId(null)} title={m?.nome} subtitle={m?.nomeEn} size="md">
        {m && <FichaMetrica m={m} />}
      </Modal>
    </FichaContext.Provider>
  )
}

export const useFicha = () => useContext(FichaContext)

function Linha({ titulo, children }) {
  return (
    <div>
      <p className="text-overline uppercase text-ink-muted mb-0.5">{titulo}</p>
      <p className="text-sm text-ink">{children}</p>
    </div>
  )
}

export function FichaMetrica({ m }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink num">{m.sigla}</span>
        {m.interna && <span className="text-caption text-ink-muted">sigla interna</span>}
        <Badge tone={TOM_ESTADO[m.estado]}>{ESTADOS[m.estado].label}</Badge>
        <span className="text-caption text-ink-muted">{DEPARTAMENTOS[m.departamento]}</span>
      </div>
      <Linha titulo="O que é">{m.explicacao}</Linha>
      <Linha titulo="Como se calcula">{m.formula}</Linha>
      <Linha titulo="Como interpretar">{m.interpretar}</Linha>
      {m.falta && <Linha titulo="O que falta para medir">{m.falta}</Linha>}
    </div>
  )
}

// `value` já formatado; null = sem dados neste período (nunca é mostrado como 0).
export function Indicador({ id, value, sub, delta, melhor, tone = 'gold' }) {
  const m = metrica(id)
  const abrir = useFicha()
  return (
    <div className="relative">
      <KpiCard label={m.nome} value={value ?? 'Sem dados'} sub={sub} delta={delta} melhor={melhor} tone={tone} size="md" rotuloCompleto className="h-full pr-8" />
      {m.estado === 'parcial' && (
        <span title={`Parcial: ${m.falta}`} className="absolute top-3.5 right-8 w-1.5 h-1.5 rounded-full bg-warning">
          <span className="sr-only">Medição parcial: {m.falta}</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => abrir(id)}
        aria-label={`Explicação de ${m.nome}`}
        title="Ver explicação"
        className="absolute top-2 right-2 p-1 rounded text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

// Fechado por defeito: indica o que falta registar sem encher o ecrã.
export function PorMedir({ ids }) {
  const abrir = useFicha()
  if (!ids?.length) return null
  return (
    <details className="rounded-xl border border-line bg-surface-raised">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink">
        {ids.length} {ids.length === 1 ? 'indicador' : 'indicadores'} por medir
      </summary>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2 px-4 pb-3">
        {ids.map(metrica).map(x => (
          <li key={x.id}>
            <button type="button" onClick={() => abrir(x.id)} className="text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="text-sm font-medium text-ink">{x.nome}</span>
              <span className="block text-caption text-ink-muted">{x.falta}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
