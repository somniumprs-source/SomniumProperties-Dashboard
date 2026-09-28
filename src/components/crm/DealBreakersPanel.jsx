/**
 * Travão do imóvel no Comercial: mostra os deal breakers da porta em que o
 * imóvel está (ou da próxima) e o que falta resolver. Os mesmos deal breakers
 * bloqueiam a mudança de estado no servidor (src/db/dealBreakers.js).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'

const ESTADO = {
  ok:        { label: 'OK',        cls: 'bg-green-50 text-green-700' },
  por_fazer: { label: 'Por fazer', cls: 'bg-gray-100 text-gray-600' },
  problema:  { label: 'Problema',  cls: 'bg-orange-50 text-orange-700' },
}

export function DealBreakersPanel({ imovelId }) {
  const [aberto, setAberto] = useState(null)
  const query = useQuery({
    queryKey: ['imovel-deal-breakers', imovelId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/deal-breakers`)
      return r.ok ? r.json() : null
    },
  })
  useRefreshOnMutation(query.refetch)
  const d = query.data
  if (!d) return null

  const pendentes = d.pendentes
  const expandido = aberto ?? pendentes > 0
  const resumo = pendentes === 0
    ? 'Tudo em ordem'
    : `${pendentes} por resolver${d.jaExigida ? '' : ' antes de avançar'}`

  return (
    <div className="border-b border-gray-200 dark:border-neutral-800">
      <button type="button" onClick={() => setAberto(!expandido)}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-neutral-800/50"
        aria-expanded={expandido}>
        <span className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${pendentes === 0 ? 'bg-green-500' : 'bg-orange-500'}`} />
          <span className="font-semibold text-gray-800 dark:text-neutral-100">Deal breakers</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600 dark:text-neutral-300">Porta {d.porta} — {d.titulo}</span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className={pendentes === 0 ? 'text-green-700' : 'text-orange-700 font-semibold'}>{resumo}</span>
          {expandido ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </span>
      </button>
      {expandido && (
        <ul className="px-4 sm:px-6 pb-3 grid gap-1.5">
          {d.itens.map(i => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${ESTADO[i.estado].cls}`}>{ESTADO[i.estado].label}</span>
              <span className="text-gray-800 dark:text-neutral-100">{i.titulo}</span>
              {i.detalhe && <span className="text-xs text-gray-500 dark:text-neutral-400">— {i.detalhe}</span>}
              {i.estado !== 'ok' && <span className="ml-auto text-[11px] text-gray-400">{i.onde}</span>}
            </li>
          ))}
          {pendentes > 0 && (
            <li className="text-xs text-gray-500 dark:text-neutral-400 pt-1">
              O imóvel não avança de estado enquanto houver deal breakers por resolver. Para desistir do negócio, passa-o para "Não interessa".
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
