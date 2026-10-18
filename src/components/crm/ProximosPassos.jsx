/**
 * Próximos passos do imóvel: o que está agendado (chamada, visita, follow-up),
 * lido das tarefas em aberto ligadas ao imóvel. É a mesma tarefa que aparece
 * na agenda e no Google Calendar.
 *
 * O follow-up trata-se todo aqui (não há aba própria): agenda-se, dá-se como
 * feito ou regista-se "sem sucesso" com nova data e motivo — o que fica no
 * histórico como feito hoje sem sucesso e cria logo a tarefa da nova data.
 *
 * Só há follow-up em fase de follow-up ou em Pendentes. Nas outras fases o
 * botão é "Passar a Follow UP": pede o motivo e muda o imóvel de fase no mesmo
 * passo (faseAoAgendarFollowUp); negócio fechado não tem follow-up.
 *
 * Imóvel com consultor: o follow-up não é uma chamada própria, é um assunto do
 * contacto com o consultor (um só próximo contacto por pessoa). O bloco mostra
 * esse contacto e, se o consultor já tiver um marcado, pergunta sempre se o
 * imóvel se junta a ele ou se o contacto é antecipado.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, MapPin, RefreshCw, CalendarClock, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { AgendarPassoModal } from './AgendarPassoModal.jsx'
import { faseAoAgendarFollowUp } from '../../constants/pipelineImoveis.js'
import { inputClass, fmtQuando, fmtDia, emDias, comHora } from './passosUtil.js'
import { AnimatePresence } from 'framer-motion'

function tipoDoPasso(t) {
  const c = t.origem_campo || ''
  if (c === 'proxima_chamada') return { rotulo: 'Chamada', Icon: Phone, concluir: 'Chamada feita' }
  if (c.startsWith('visita:')) return { rotulo: 'Visita', Icon: MapPin, concluir: null }
  if (c === 'data_follow_up') return { rotulo: 'Follow-up', Icon: RefreshCw, concluir: 'Feito' }
  return { rotulo: t.categoria || 'Tarefa', Icon: CalendarClock, concluir: 'Feito' }
}

// Formulário do follow-up, aberto dentro do bloco. semSucesso: o follow-up de
// hoje foi tentado e falhou — o motivo é obrigatório e fica no histórico.
// mover: fase para onde o imóvel passa ao guardar — o motivo é a justificação
// e por isso também é obrigatório.
// consultor: { nome, quando } quando o imóvel tem consultor; com quando, ele já
// tem contacto marcado e é preciso escolher entre juntar e antecipar.
// soContacto: marca só o contacto com o consultor sobre este imóvel — não é
// follow-up, por isso não muda a fase nem pede motivo.
function FollowUpForm({ imovelId, semSucesso, mover = null, consultor = null, soContacto = false, motivoInicial = '', onCancel, onDone }) {
  const escolhe = !semSucesso && !!consultor?.quando
  const [juntar, setJuntar] = useState(null) // null = por escolher
  const [data, setData] = useState(emDias(1))
  const [hora, setHora] = useState('')
  const [motivo, setMotivo] = useState(semSucesso || mover ? '' : motivoInicial)
  const pedeMotivo = semSucesso || !!mover
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function guardar(e) {
    e.preventDefault()
    if (escolhe && juntar === null) return setErro(`Escolhe se o imóvel se junta ao contacto com ${consultor.nome} ou se o contacto muda de data.`)
    if (!(escolhe && juntar) && !data) return setErro('Indica a nova data.')
    if (pedeMotivo && !motivo.trim()) return setErro('Indica o motivo.')
    setErro(''); setSaving(true)
    try {
      const r = soContacto
        ? await apiFetch(`/api/crm/imoveis/${imovelId}/proximos-passos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(escolhe && juntar
              ? { tipo: 'chamada', juntar: true }
              : { tipo: 'chamada', data, quando: comHora(data, hora), mover_contacto: escolhe }),
          })
        : await apiFetch(`/api/crm/imoveis/${imovelId}/follow-up`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(escolhe && juntar
              ? { motivo, juntar: true }
              : { data, motivo, sem_sucesso: semSucesso, quando: comHora(data, hora), mover_contacto: escolhe }),
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
    <form onSubmit={guardar} className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
      <p className="text-xs text-ink-muted mb-2">
        {semSucesso
          ? `Fica registado como feito hoje (${fmtDia(emDias(0))}) sem sucesso e é criada a tarefa para a nova data.`
          : mover
            ? `O imóvel passa para «${mover}» com este motivo${consultor ? ` e entra como assunto no contacto com ${consultor.nome}` : ' e fica com a tarefa de follow-up na agenda'}. A hora é opcional.`
            : soContacto
              ? `O imóvel entra como assunto no contacto com ${consultor?.nome}. O imóvel fica na fase onde está. A hora é opcional.`
            : consultor
              ? `O follow-up entra como assunto no contacto com ${consultor.nome}. A hora é opcional.`
              : 'Cria a tarefa de follow-up na agenda para esse dia. A hora é opcional.'}
      </p>
      {escolhe && (
        <div className="mb-2 rounded-lg border border-warning/30 bg-surface-raised p-2">
          <p className="text-xs font-semibold text-ink">{consultor.nome} já tem contacto marcado para {fmtQuando(consultor.quando)}.</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <label className="inline-flex items-center gap-1.5 text-xs text-ink">
              <input type="radio" name="juntar-contacto" checked={juntar === true} onChange={() => setJuntar(true)} /> Juntar a esse contacto
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-ink">
              <input type="radio" name="juntar-contacto" checked={juntar === false} onChange={() => setJuntar(false)} /> Mudar o contacto para outra data
            </label>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 sm:items-start">
        <div className={escolhe && juntar !== false ? 'opacity-40 pointer-events-none' : ''}>
          <div className="flex gap-1.5">
            <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputClass} aria-label="Nova data do follow-up" />
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={`${inputClass} sm:w-28`} aria-label="Hora do follow-up (opcional)" title="Hora (opcional)" />
          </div>
          <div className="flex gap-1 mt-1">
            {[[1, 'Amanhã'], [3, '3 dias'], [7, '1 semana']].map(([n, rotulo]) => (
              <button key={n} type="button" onClick={() => setData(emDias(n))}
                className={`px-2 py-0.5 text-[11px] rounded-full border ${data === emDias(n) ? 'border-yellow-400 bg-warning/15 text-warning' : 'border-line bg-surface-raised text-ink-muted hover:bg-surface'}`}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        {soContacto ? <span /> : <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
          placeholder={semSucesso ? 'Motivo (ex.: não atendeu)' : mover ? 'Motivo (o que tem de mudar)' : 'Motivo (opcional)'} className={inputClass} aria-label="Motivo" />}
        <div className="flex gap-1.5">
          <button type="submit" disabled={saving}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50 bg-ink text-surface hover:opacity-90">
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line bg-surface-raised text-ink-muted hover:bg-surface disabled:opacity-50">
            Cancelar
          </button>
        </div>
      </div>
      {erro && <p className="text-xs text-danger mt-1.5">{erro}</p>}
    </form>
  )
}

export function ProximosPassos({ imovelId, imovel, onAbrirTab, onUpdate, onNavigate }) {
  const [agendar, setAgendar] = useState(null) // 'chamada' | 'visita'
  const [followUp, setFollowUp] = useState(null) // 'agendar' | 'sem_sucesso' | 'contacto'
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
  // Contacto com o consultor em que este imóvel é (ou pode ser) assunto, e os
  // contactos em que já foi tratado.
  const cont = useQuery({
    queryKey: ['imovel-contactos', imovelId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/contactos`)
      return r.ok ? r.json() : {}
    },
  })
  useRefreshOnMutation(() => { query.refetch(); fup.refetch(); cont.refetch() })
  const passos = Array.isArray(query.data) ? query.data : []
  const historico = Array.isArray(cont.data?.historico) ? cont.data.historico : []
  const consultor = cont.data?.consultor || null
  const noContacto = cont.data?.contacto?.incluido ? cont.data.contacto : null
  const motivoFollowUp = fup.data?.motivo_follow_up || ''
  const temFollowUp = passos.some(t => t.origem_campo === 'data_follow_up')
  const faseFollowUp = faseAoAgendarFollowUp(imovel?.estado)
  const emFollowUp = faseFollowUp.aplica && !faseFollowUp.mover // fase de follow-up ou Pendentes

  async function concluir(t) {
    await apiFetch(`/api/crm/imoveis/${imovelId}/proximos-passos/${t.id}`, { method: 'PUT' })
    query.refetch(); fup.refetch(); cont.refetch()
  }
  function followUpGuardado() {
    setFollowUp(null)
    query.refetch(); fup.refetch(); cont.refetch()
    onUpdate?.()
  }

  const agora = Date.now()
  return (
    <div className="border-b border-line  px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink ">Próximos passos</span>
        <span className="flex flex-wrap gap-1.5">
          {/* Com consultor, a chamada é o contacto com ele (um só por pessoa), com o imóvel como assunto. */}
          {!cont.isFetched ? null : consultor
            ? !noContacto && (
              <button type="button" onClick={() => setFollowUp('contacto')}
                className="text-xs font-medium px-2 py-1 rounded-lg border border-line text-ink-muted hover:bg-surface">Agendar contacto</button>
            )
            : (
              <button type="button" onClick={() => setAgendar('chamada')}
                className="text-xs font-medium px-2 py-1 rounded-lg border border-line text-ink-muted hover:bg-surface">Agendar chamada</button>
            )}
          <button type="button" onClick={() => setAgendar('visita')}
            className="text-xs font-medium px-2 py-1 rounded-lg border border-line text-ink-muted hover:bg-surface">Marcar visita</button>
          {faseFollowUp.aplica && (faseFollowUp.mover || !(temFollowUp || noContacto)) && (
            <button type="button" onClick={() => setFollowUp('agendar')}
              className="text-xs font-medium px-2 py-1 rounded-lg border border-line text-ink-muted hover:bg-surface">
              {faseFollowUp.mover ? `Passar a ${faseFollowUp.mover}` : 'Agendar follow-up'}
            </button>
          )}
        </span>
      </div>
      {noContacto && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm mt-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-warning/10 text-warning">
            <RefreshCw className="w-3 h-3" /> {emFollowUp ? 'Follow-up' : 'Próximo contacto'}
          </span>
          <span className="font-medium tabular-nums text-ink ">{fmtQuando(noContacto.quando)}</span>
          <span className="text-xs text-ink-muted">no contacto com {consultor?.nome}</span>
          {motivoFollowUp && <span className="text-xs text-ink-muted truncate max-w-[16rem]" title={motivoFollowUp}>{motivoFollowUp}</span>}
          {onNavigate && consultor && (
            <button type="button" onClick={() => onNavigate('Consultores', consultor.id)}
              className="ml-auto text-xs font-medium px-2 py-0.5 rounded-lg border border-line text-ink-muted hover:bg-surface">
              Abrir contacto
            </button>
          )}
        </div>
      )}
      {emFollowUp && motivoFollowUp && !noContacto && !temFollowUp && (
        <p className="text-xs text-ink-muted mt-1.5">Motivo do follow-up: {motivoFollowUp}</p>
      )}
      {passos.length === 0 ? (
        !noContacto && <p className="text-xs text-ink-muted mt-1.5">Sem próximo passo agendado.</p>
      ) : (
        <ul className="grid gap-1.5 mt-2">
          {passos.map(t => {
            const { rotulo, Icon, concluir: rotuloConcluir } = tipoDoPasso(t)
            const quando = t.inicio || t.data_limite
            const atrasado = quando && new Date(quando).getTime() < agora - 86400000
            const eFollowUp = t.origem_campo === 'data_follow_up'
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-warning/10 text-warning">
                  <Icon className="w-3 h-3" /> {rotulo}
                </span>
                <span className={`font-medium tabular-nums ${atrasado ? 'text-orange-700' : 'text-ink '}`}>{fmtQuando(quando)}</span>
                {atrasado && <span className="text-xs text-orange-700">em atraso</span>}
                {t.funcionario && <span className="text-xs text-ink-muted">{t.funcionario}</span>}
                {eFollowUp && motivoFollowUp && <span className="text-xs text-ink-muted truncate max-w-[16rem]" title={motivoFollowUp}>{motivoFollowUp}</span>}
                {rotuloConcluir ? (
                  <span className="ml-auto inline-flex gap-1.5">
                    <button type="button" onClick={() => concluir(t)}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-success/10 text-success hover:bg-success/15 border border-success/30">
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
                    className="ml-auto text-xs font-medium px-2 py-0.5 rounded-lg border border-line text-ink-muted hover:bg-surface">
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
          mover={followUp === 'agendar' ? faseFollowUp.mover : null}
          soContacto={followUp === 'contacto'}
          consultor={followUp !== 'sem_sucesso' && consultor ? { nome: consultor.nome, quando: cont.data?.contacto?.quando || null } : null}
          onCancel={() => setFollowUp(null)} onDone={followUpGuardado} />
      )}
      {historico.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerHistorico(v => !v)}
            className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
            {verHistorico ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Contactos sobre este imóvel ({historico.length})
          </button>
          {verHistorico && (
            <ul className="mt-1.5 grid gap-1">
              {historico.map(h => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-medium tabular-nums text-ink">{fmtDia(h.quando)}</span>
                  {h.resultado
                    ? <span className={h.resultado === 'Feito' ? 'text-success' : 'text-orange-700'}>{h.resultado}</span>
                    : <span className="text-ink-muted">{h.canal || 'Registo'}</span>}
                  {h.pessoa_nome && <span className="text-ink">{h.pessoa_nome}</span>}
                  {h.notas && <span className="text-ink-muted min-w-0 break-words">{String(h.notas).replace(/^\[[^\]]+\]\s*/, '')}</span>}
                  {h.proxima_data && <span className="text-ink-muted">reagendado para {fmtDia(h.proxima_data)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <AnimatePresence>
        {agendar && (
          <AgendarPassoModal imovel={imovel || { id: imovelId }} tipo={agendar}
            onCancel={() => setAgendar(null)}
            onDone={() => { setAgendar(null); query.refetch() }} />
        )}
      </AnimatePresence>
    </div>
  )
}
