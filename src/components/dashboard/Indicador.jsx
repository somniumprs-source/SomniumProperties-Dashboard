import { createContext, useContext, useState } from 'react'
import { Info } from 'lucide-react'
import { KpiCard } from '../ui/KpiCard.jsx'
import { Modal } from '../ui/Modal.jsx'
import { Badge } from '../ui/Badge.jsx'
import { metrica, ESTADOS, DEPARTAMENTOS, NUCLEO, CATALOGO } from '../../lib/catalogoMetricas.js'

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
  const detalhe = m.estado === 'parcial' ? [sub, 'Parcial'].filter(Boolean).join(' · ') : (sub ?? m.sigla)
  return (
    <div className="relative">
      <KpiCard label={m.nome} value={value ?? 'Sem dados'} sub={detalhe} delta={delta} melhor={melhor} tone={tone} size="md" rotuloCompleto className="h-full pr-8" />
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

// Indicadores do departamento que ainda não têm dados: mostra o que falta
// registar em vez de um número enganador.
export function PorMedir({ departamento }) {
  const abrir = useFicha()
  const lista = CATALOGO.filter(x => x.departamento === departamento && x.estado === 'sem_registo')
    .sort((a, b) => NUCLEO.includes(b.id) - NUCLEO.includes(a.id))
  if (!lista.length) return null
  return (
    <div className="bg-surface-raised rounded-xl border border-line shadow-xs p-4">
      <h3 className="text-ui font-semibold text-ink">Ainda por medir ({lista.length})</h3>
      <p className="text-caption text-ink-muted mb-3">Não mostram número porque ainda não existe registo.</p>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2">
        {lista.map(x => (
          <li key={x.id}>
            <button type="button" onClick={() => abrir(x.id)} className="text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="text-sm font-medium text-ink">{x.nome}</span>
              <span className="block text-caption text-ink-muted">{x.falta}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
