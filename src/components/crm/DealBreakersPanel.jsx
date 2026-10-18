/**
 * Requisitos da fase: mostra o que a próxima fase do imóvel precisa e o que
 * falta, calculado a partir dos dados reais. São os mesmos requisitos que
 * travam a mudança de fase no servidor (src/db/dealBreakers.js). Cada linha
 * em falta abre o sítio onde se regista.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { TransicaoFaseModal } from './TransicaoFaseModal.jsx'
import { AnimatePresence } from 'framer-motion'

const ESTADO = {
  ok:        { label: 'OK',       cls: 'bg-success/10 text-success' },
  por_fazer: { label: 'Em falta', cls: 'bg-surface-muted text-ink-muted' },
  problema:  { label: 'Problema', cls: 'bg-orange-50 text-orange-700' },
}
// Requisitos que se registam numa aba do imóvel, e não na janela.
const TAB_DA_ACAO = { vvr: 'analise' }
const ROTULO_ACAO = {
  visita: 'Registar visita', preco: 'Indicar preço', proposta: 'Registar proposta', aceite: 'Registar aceitação', vvr: 'Abrir Análise',
  follow_up: 'Indicar motivo e data', chamada_registada: 'Registar chamada', visita_agendada: 'Marcar visita', chamada_agendada: 'Agendar chamada',
}

export function DealBreakersPanel({ imovelId, imovel, onAbrirTab, onUpdate }) {
  const [aberto, setAberto] = useState(null)
  const [registo, setRegisto] = useState(null) // requisitos a resolver na janela
  const query = useQuery({
    queryKey: ['imovel-deal-breakers', imovelId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/deal-breakers`)
      return r.ok ? r.json() : null
    },
  })
  useRefreshOnMutation(query.refetch)
  const d = query.data
  if (!d || (!d.destino && !d.avisos?.length)) return null

  const linhas = [...(d.avisos || []), ...(d.itens || [])]
  const pendentes = d.pendentes
  const expandido = aberto ?? pendentes > 0
  const resumo = pendentes === 0 ? 'Tudo em ordem' : `${pendentes} em falta`

  function abrir(i) {
    if (TAB_DA_ACAO[i.acao]) return onAbrirTab?.(TAB_DA_ACAO[i.acao])
    // Os requisitos da visita resolvem-se todos na mesma janela.
    setRegisto(linhas.filter(x => x.estado !== 'ok' && x.acao === i.acao))
  }

  return (
    <div className="border-b border-line ">
      <button type="button" onClick={() => setAberto(!expandido)}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 text-left hover:bg-surface "
        aria-expanded={expandido}>
        <span className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${pendentes === 0 ? 'bg-success' : 'bg-orange-500'}`} />
          <span className="font-semibold text-ink ">Requisitos da fase</span>
          {d.titulo && <><span className="text-ink-muted">·</span><span className="text-ink-muted ">{d.titulo}</span></>}
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className={pendentes === 0 ? 'text-success' : 'text-orange-700 font-semibold'}>{resumo}</span>
          {expandido ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
        </span>
      </button>
      {expandido && (
        <ul className="px-4 sm:px-6 pb-3 grid gap-1.5">
          {linhas.map((i, idx) => (
            <li key={`${i.id}-${idx}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${ESTADO[i.estado].cls}`}>{ESTADO[i.estado].label}</span>
              <span className="text-ink ">{i.titulo}</span>
              {i.detalhe && <span className="text-xs text-ink-muted ">— {i.detalhe}</span>}
              {i.estado !== 'ok' && (
                <button type="button" onClick={() => abrir(i)}
                  className="ml-auto text-xs font-medium px-2 py-0.5 rounded-lg bg-warning/10 text-warning hover:bg-warning/15 border border-warning/30">
                  {ROTULO_ACAO[i.acao] || 'Abrir'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <AnimatePresence>
        {registo && (
          <TransicaoFaseModal
            imovel={imovel || { id: imovelId }}
            destino={d.destino}
            requisitos={registo}
            mover={false}
            onCancel={() => setRegisto(null)}
            onResolvido={() => { setRegisto(null); query.refetch(); onUpdate?.() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
