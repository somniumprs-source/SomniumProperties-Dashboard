/**
 * Próximos passos do imóvel: o que está agendado (chamada, visita, follow-up),
 * lido das tarefas em aberto ligadas ao imóvel. É a mesma tarefa que aparece
 * na agenda e no Google Calendar.
 *
 * O follow-up trata-se todo aqui (não há aba própria): agenda-se, dá-se como
 * feito ou regista-se "sem sucesso" com nova data e motivo — o que fica no
 * histórico como feito hoje sem sucesso e cria logo a tarefa da nova data.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, MapPin, RefreshCw, CalendarClock, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
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

const fmtDia = v => {
  const [y, m, d] = String(v || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : '—'
}
function emDias(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const inputClass = 'w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

// Formulário do follow-up, aberto dentro do bloco. semSucesso: o follow-up de
// hoje foi tentado e falhou — o motivo é obrigatório e fica no histórico.
function FollowUpForm({ imovelId, semSucesso, motivoInicial = '', onCancel, onDone }) {
  const [data, setData] = useState(emDias(1))
  const [motivo, setMotivo] = useState(semSucesso ? '' : motivoInicial)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function guardar(e) {
    e.preventDefault()
    if (!data) return setErro('Indica a nova data.')
    if (semSucesso && !motivo.trim()) return setErro('Indica o motivo.')
    setErro(''); setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/follow-up`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, motivo, sem_sucesso: semSucesso }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao guardar')
      onDone?.()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={guardar} className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50/50 p-2.5">
      <p className="text-xs text-gray-600 mb-2">
        {semSucesso
          ? `Fica registado como feito hoje (${fmtDia(emDias(0))}) sem sucesso e é criada a tarefa para a nova data.`
          : 'Cria a tarefa de follow-up na agenda para esse dia.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 sm:items-start">
        <div>
          <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputClass} aria-label="Nova data do follow-up" />
          <div className="flex gap-1 mt-1">
            {[[1, 'Amanhã'], [3, '3 dias'], [7, '1 semana']].map(([n, rotulo]) => (
              <button key={n} type="button" onClick={() => setData(emDias(n))}
                className={`px-2 py-0.5 text-[11px] rounded-full border ${data === emDias(n) ? 'border-yellow-400 bg-yellow-100 text-yellow-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
          placeholder={semSucesso ? 'Motivo (ex.: não atendeu)' : 'Motivo (opcional)'} className={inputClass} aria-label="Motivo" />
        <div className="flex gap-1.5">
          <button type="submit" disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50" style={{ backgroundColor: '#1A1A1A', color: '#C9A84C' }}>
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancelar
          </button>
        </div>
      </div>
      {erro && <p className="text-xs text-red-600 mt-1.5">{erro}</p>}
    </form>
  )
}

export function ProximosPassos({ imovelId, imovel, onAbrirTab, onUpdate }) {
  const [agendar, setAgendar] = useState(null) // 'chamada' | 'visita'
  const [followUp, setFollowUp] = useState(null) // 'agendar' | 'sem_sucesso'
  const [verHistorico, setVerHistorico] = useState(false)
  const query = useQuery({
    queryKey: ['imovel-proximos-passos', imovelId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/proximos-passos`)
      return r.ok ? r.json() : []
    },
  })
  const fup = useQuery({
    queryKey: ['imovel-follow-up', imovelId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/follow-up`)
      return r.ok ? r.json() : {}
    },
  })
  useRefreshOnMutation(() => { query.refetch(); fup.refetch() })
  const passos = Array.isArray(query.data) ? query.data : []
  const historico = Array.isArray(fup.data?.historico) ? fup.data.historico : []
  const motivoFollowUp = fup.data?.motivo_follow_up || ''
  const temFollowUp = passos.some(t => t.origem_campo === 'data_follow_up')

  async function concluir(t) {
    await apiFetch(`/api/crm/imoveis/${imovelId}/proximos-passos/${t.id}`, { method: 'PUT' })
    query.refetch(); fup.refetch()
  }
  function followUpGuardado() {
    setFollowUp(null)
    query.refetch(); fup.refetch()
    onUpdate?.()
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
          {!temFollowUp && (
            <button type="button" onClick={() => setFollowUp('agendar')}
              className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Agendar follow-up</button>
          )}
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
            const eFollowUp = t.origem_campo === 'data_follow_up'
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-yellow-50 text-yellow-700">
                  <Icon className="w-3 h-3" /> {rotulo}
                </span>
                <span className={`font-medium tabular-nums ${atrasado ? 'text-orange-700' : 'text-gray-800 dark:text-neutral-100'}`}>{fmtQuando(quando)}</span>
                {atrasado && <span className="text-xs text-orange-700">em atraso</span>}
                {t.funcionario && <span className="text-xs text-gray-400">{t.funcionario}</span>}
                {eFollowUp && motivoFollowUp && <span className="text-xs text-gray-500 truncate max-w-[16rem]" title={motivoFollowUp}>{motivoFollowUp}</span>}
                {rotuloConcluir ? (
                  <span className="ml-auto inline-flex gap-1.5">
                    <button type="button" onClick={() => concluir(t)}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200">
                      <Check className="w-3 h-3" /> {rotuloConcluir}
                    </button>
                    {eFollowUp && (
                      <button type="button" onClick={() => setFollowUp('sem_sucesso')}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200">
                        <X className="w-3 h-3" /> Sem sucesso
                      </button>
                    )}
                  </span>
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
      {followUp && (
        <FollowUpForm key={followUp} imovelId={imovelId} semSucesso={followUp === 'sem_sucesso'} motivoInicial={motivoFollowUp}
          onCancel={() => setFollowUp(null)} onDone={followUpGuardado} />
      )}
      {historico.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerHistorico(v => !v)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            {verHistorico ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Histórico de follow-ups ({historico.length})
          </button>
          {verHistorico && (
            <ul className="mt-1.5 grid gap-1">
              {historico.map(h => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-medium tabular-nums text-gray-700">{fmtDia(h.data)}</span>
                  <span className={h.resultado === 'Feito' ? 'text-green-700' : 'text-orange-700'}>{h.resultado}</span>
                  {h.motivo && <span className="text-gray-600">{h.motivo}</span>}
                  {h.proxima_data && <span className="text-gray-400">reagendado para {fmtDia(h.proxima_data)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {agendar && (
        <AgendarPassoModal imovel={imovel || { id: imovelId }} tipo={agendar}
          onCancel={() => setAgendar(null)}
          onDone={() => { setAgendar(null); query.refetch() }} />
      )}
    </div>
  )
}
