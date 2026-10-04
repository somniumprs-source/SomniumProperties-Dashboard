/**
 * Checklist do imóvel como espelho dos dados: cada item está feito porque o
 * dado existe no CRM (src/db/checklistImovel.js). Não há vistos nem notas
 * soltas. Só o que acontece fora do CRM é declarado à mão, e fica marcado com
 * quem e quando. Itens em falta abrem o sítio onde se registam.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, ChevronDown, ChevronRight, UserCheck } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { TransicaoFaseModal } from './TransicaoFaseModal.jsx'
import { AgendarPassoModal } from './AgendarPassoModal.jsx'

const fmtData = v => {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d) ? '' : d.toLocaleDateString('pt-PT')
}

export function ChecklistTab({ imovel, onUpdate, onAbrirTab }) {
  const [expanded, setExpanded] = useState({})
  const [janela, setJanela] = useState(null) // { tipo: 'visita' } | { agendar: 'chamada' | 'visita' }
  const [erro, setErro] = useState('')
  const query = useQuery({
    queryKey: ['imovel-checklist', imovel?.id],
    enabled: !!imovel?.id,
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/checklist`)
      return r.ok ? r.json() : null
    },
  })
  useRefreshOnMutation(query.refetch)

  async function declarar(item, body) {
    setErro('')
    const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/checklist/${item.key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) setErro((await r.json().catch(() => ({}))).error || 'Não foi possível guardar')
    query.refetch()
  }

  function abrir(item) {
    const a = item.abrir || {}
    if (a.tab) return onAbrirTab?.(a.tab)
    if (a.janela === 'visita') return setJanela({ tipo: 'visita' })
    if (a.agendar) return setJanela({ agendar: a.agendar })
  }

  if (query.isLoading) return <div className="p-6 text-center text-gray-400">A carregar checklist...</div>
  const grupos = query.data?.grupos || []
  if (!grupos.length) return <div className="p-6 text-center text-gray-400">Sem itens para as fases deste imóvel.</div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-500" /> Verificado pelo sistema</span>
        <span className="inline-flex items-center gap-1.5"><UserCheck size={14} style={{ color: '#C9A84C' }} /> Declarado por uma pessoa</span>
        <span className="inline-flex items-center gap-1.5"><Circle size={14} className="text-amber-400" /> Em falta</span>
      </div>
      <p className="text-xs text-gray-400">
        Cada item marca-se sozinho quando o registo existe no imóvel. Só aparecem as fases por onde o imóvel passou. Nada aqui impede a mudança de fase.
      </p>
      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {grupos.map(g => {
        const aberto = expanded[g.fase] ?? (g.atual || g.feitos < g.total)
        return (
          <div key={g.fase} className={`rounded-lg border ${g.atual ? 'border-amber-300 shadow-sm' : 'border-gray-200'}`}>
            <button onClick={() => setExpanded(p => ({ ...p, [g.fase]: !aberto }))}
              className={`w-full flex items-center justify-between px-4 py-3 text-left ${g.atual ? 'bg-gray-900 text-white rounded-t-lg' : 'bg-gray-50 text-gray-800 rounded-lg'}`}>
              <span className="flex items-center gap-2 min-w-0">
                {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-sm font-semibold truncate">{g.fase}{g.atual ? ' (fase atual)' : ''}</span>
              </span>
              <span className={`text-xs tabular-nums ${g.atual ? 'text-gray-300' : 'text-gray-500'}`}>{g.feitos}/{g.total}</span>
            </button>
            {aberto && (
              <ul className="divide-y divide-gray-100">
                {g.itens.map(item => {
                  const ok = item.estado === 'ok'
                  const manual = item.origem === 'manual'
                  return (
                    <li key={item.key} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="shrink-0">
                        {ok
                          ? (manual ? <UserCheck size={18} style={{ color: '#C9A84C' }} /> : <CheckCircle2 size={18} className="text-green-500" />)
                          : <Circle size={18} className="text-amber-400" />}
                      </span>
                      <span className="flex-1 min-w-[160px]">
                        <span className="text-sm text-gray-800">{item.titulo}</span>
                        {item.detalhe && <span className="text-sm text-gray-500"> · {item.detalhe}</span>}
                        <span className="block text-[11px] text-gray-400">
                          {ok && manual && `Declarado${item.por ? ` por ${item.por}` : ''}${item.em ? ` em ${fmtData(item.em)}` : ''}`}
                          {ok && !manual && `Automático · ${item.onde}`}
                          {!ok && manual && 'Acontece fora do CRM: regista aqui'}
                          {!ok && !manual && `Em falta · regista-se em ${item.onde}`}
                        </span>
                      </span>
                      {!ok && !manual && item.abrir && (
                        <button type="button" onClick={() => abrir(item)}
                          className="text-xs font-medium px-2 py-1 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200">
                          {item.abrir.janela ? 'Registar visita' : item.abrir.agendar ? 'Agendar' : `Abrir ${item.onde}`}
                        </button>
                      )}
                      {!ok && manual && item.manual === 'confirmar' && (
                        <button type="button" onClick={() => declarar(item, {})}
                          className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                          Confirmar
                        </button>
                      )}
                      {!ok && manual && item.manual === 'resposta' && (
                        <select value="" onChange={e => e.target.value && declarar(item, { valor: e.target.value })}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-700">
                          <option value="">Responder…</option>
                          {(item.opcoes || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                      {ok && manual && (
                        <button type="button" onClick={() => declarar(item, { desfazer: true })}
                          className="text-[11px] text-gray-400 hover:text-gray-600 underline">
                          Desfazer
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {janela?.tipo === 'visita' && (
        <TransicaoFaseModal imovel={imovel} requisitos={[{ id: 'visita', acao: 'visita' }]} mover={false}
          onCancel={() => setJanela(null)}
          onResolvido={() => { setJanela(null); query.refetch(); onUpdate?.() }} />
      )}
      {janela?.agendar && (
        <AgendarPassoModal imovel={imovel} tipo={janela.agendar}
          onCancel={() => setJanela(null)}
          onDone={() => { setJanela(null); query.refetch(); onUpdate?.() }} />
      )}
    </div>
  )
}
