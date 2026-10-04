/**
 * Próximos passos do imóvel: o que está agendado (chamada, visita, follow-up),
 * lido das tarefas em aberto ligadas ao imóvel. É a mesma tarefa que aparece
 * na agenda e no Google Calendar; aqui não se guarda mais nada.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, MapPin, RefreshCw, CalendarClock, Check } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { AgendarPassoModal } from './AgendarPassoModal.jsx'

function tipoDoPasso(t) {
  const c = t.origem_campo || ''
  if (c === 'proxima_chamada') return { rotulo: 'Chamada', Icon: Phone, concluir: 'Chamada feita' }
  if (c.startsWith('visita:')) return { rotulo: 'Visita', Icon: MapPin, concluir: null }
  if (c === 'data_follow_up') return { rotulo: 'Follow-up', Icon: RefreshCw, concluir: 'Feito' }
  return { rotulo: t.categoria || 'Tarefa', Icon: CalendarClock, concluir: 'Feito' }
}

function fmtQuando(v) {
  if (!v) return 'Sem data'
  const d = new Date(v)
  if (isNaN(d)) return v
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(String(v))
  return d.toLocaleString('pt-PT', soData
    ? { weekday: 'short', day: '2-digit', month: '2-digit' }
    : { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ProximosPassos({ imovelId, imovel, onAbrirTab }) {
  const [agendar, setAgendar] = useState(null) // 'chamada' | 'visita'
  const query = useQuery({
    queryKey: ['imovel-proximos-passos', imovelId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/proximos-passos`)
      return r.ok ? r.json() : []
    },
  })
  useRefreshOnMutation(query.refetch)
  const passos = Array.isArray(query.data) ? query.data : []

  async function concluir(t) {
    await apiFetch(`/api/crm/imoveis/${imovelId}/proximos-passos/${t.id}`, { method: 'PUT' })
    query.refetch()
  }

  const agora = Date.now()
  return (
    <div className="border-b border-gray-200 dark:border-neutral-800 px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-neutral-100">Próximos passos</span>
        <span className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setAgendar('chamada')}
            className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Agendar chamada</button>
          <button type="button" onClick={() => setAgendar('visita')}
            className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Marcar visita</button>
        </span>
      </div>
      {passos.length === 0 ? (
        <p className="text-xs text-gray-400 mt-1.5">Sem próximo passo agendado.</p>
      ) : (
        <ul className="grid gap-1.5 mt-2">
          {passos.map(t => {
            const { rotulo, Icon, concluir: rotuloConcluir } = tipoDoPasso(t)
            const quando = t.inicio || t.data_limite
            const atrasado = quando && new Date(quando).getTime() < agora - 86400000
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-yellow-50 text-yellow-700">
                  <Icon className="w-3 h-3" /> {rotulo}
                </span>
                <span className={`font-medium tabular-nums ${atrasado ? 'text-orange-700' : 'text-gray-800 dark:text-neutral-100'}`}>{fmtQuando(quando)}</span>
                {atrasado && <span className="text-xs text-orange-700">em atraso</span>}
                {t.funcionario && <span className="text-xs text-gray-400">{t.funcionario}</span>}
                {rotuloConcluir ? (
                  <button type="button" onClick={() => concluir(t)}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200">
                    <Check className="w-3 h-3" /> {rotuloConcluir}
                  </button>
                ) : (
                  <button type="button" onClick={() => onAbrirTab?.('visitas')}
                    className="ml-auto text-xs font-medium px-2 py-0.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                    Abrir Visitas
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {agendar && (
        <AgendarPassoModal imovel={imovel || { id: imovelId }} tipo={agendar}
          onCancel={() => setAgendar(null)}
          onDone={() => { setAgendar(null); query.refetch() }} />
      )}
    </div>
  )
}
