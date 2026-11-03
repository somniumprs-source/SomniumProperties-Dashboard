/**
 * Chamadas gravadas com o consultor (aba Reuniões), espelho das chamadas dos
 * investidores: carregar o áudio de uma cold call, discovery ou
 * acompanhamento, com o consentimento registado; o worker Whisper transcreve
 * e a IA propõe a avaliação, que o associado revê (RevisaoAvaliacao) antes de
 * a classe passar para a ficha. Sem consentimento, a gravação não é processada.
 */
import { useState, useEffect, useCallback } from 'react'
import { Mic, Upload, Loader2, Trash2, RefreshCw, Sparkles, ChevronDown, ChevronRight, FileText, ShieldCheck, ClipboardCheck } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'
import { confirmar } from '../ui/ConfirmDialog.jsx'
import { inputClass } from './RegistoManualFieldset.jsx'
import { ETAPAS, CONSENTIMENTO_MODOS } from '../../db/classificacaoConsultorCalc.js'
import { GuiaoConsultor } from './GuiaoConsultor.jsx'
import { RevisaoAvaliacao, ClasseBadge } from './RevisaoAvaliacao.jsx'

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.aac'
const EM_PROCESSAMENTO = ['pendente', 'a_transcrever', 'a_analisar']
const hojeISO = () => new Date().toISOString().slice(0, 10)
const TRIAGEM = { avancar_discovery: 'Avançar para discovery', follow_up: 'Follow-up com data', descartar: 'Descartar' }

const ESTADO_META = {
  aguarda_consentimento: { label: 'Falta o consentimento', cls: 'bg-danger/10 text-danger border-danger/30', spin: false },
  pendente:      { label: 'Em fila para transcrever', cls: 'bg-warning/10 text-warning border-warning/30', spin: false },
  a_transcrever: { label: 'A transcrever…', cls: 'bg-surface-muted text-ink border-line', spin: true },
  transcrito:    { label: 'Transcrito', cls: 'bg-surface-muted text-ink border-line', spin: false },
  a_analisar:    { label: 'A analisar…', cls: 'bg-surface-muted text-ink border-line', spin: true },
  analisado:     { label: 'Transcrito', cls: 'bg-surface-muted text-ink border-line', spin: false },
  erro:          { label: 'Erro', cls: 'bg-danger/10 text-danger border-danger/30', spin: false },
}

function fmtDia(d) {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function Consentimento({ valor, onChange }) {
  return (
    <fieldset className="rounded-lg border border-line p-2.5 space-y-1.5">
      <legend className="px-1 text-xs font-semibold text-ink">Consentimento para gravar</legend>
      <label className="flex items-start gap-2 text-xs text-ink">
        <input type="checkbox" checked={valor.consentimento} onChange={e => onChange({ ...valor, consentimento: e.target.checked })} className="mt-0.5" />
        O consultor autorizou a gravação. Sem isto, a gravação fica guardada mas não é transcrita nem analisada.
      </label>
      <label className="block text-xs text-ink-muted">Como foi dado
        <select value={valor.consentimento_modo} onChange={e => onChange({ ...valor, consentimento_modo: e.target.value })} className={`mt-1 ${inputClass}`}>
          {Object.entries(CONSENTIMENTO_MODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
    </fieldset>
  )
}

function ChamadaCard({ g, avaliacaoPendente, busy, onAnalisar, onRetomar, onApagar, onConsentir, onRever }) {
  const [aberto, setAberto] = useState(false)
  const [verTranscricao, setVerTranscricao] = useState(false)
  const [consent, setConsent] = useState({ consentimento: false, consentimento_modo: 'verbal_gravado' })
  const estado = g.estado_consultor === 'a_analisar' ? 'a_analisar' : g.estado
  const em = ESTADO_META[estado] || ESTADO_META.pendente
  const ac = g.analise_consultor || {}
  const ext = ac.extracao || {}
  const calc = ac.calculo
  return (
    <div className="bg-surface-raised rounded-xl border border-line">
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setAberto(v => !v)}>
        <span className="text-ink-muted">{aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink truncate">{ETAPAS[g.etapa_consultor] || 'Chamada'} · {fmtDia(g.data_chamada)}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${em.cls}`}>
              {em.spin && <Loader2 className="w-3 h-3 animate-spin" />}{em.label}
            </span>
            {g.realizada_por && <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted text-ink">{g.realizada_por}</span>}
            {ext.sugestao_triagem && <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-ink">Sugestão: {TRIAGEM[ext.sugestao_triagem]}</span>}
            {avaliacaoPendente && <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/15 text-warning">Por rever</span>}
          </div>
        </div>
        {calc?.classe && <span title="Classe proposta (ainda não validada)" className="shrink-0"><ClasseBadge classe={calc.classe} /></span>}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {avaliacaoPendente && (
            <button type="button" onClick={() => onRever(avaliacaoPendente)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-ink text-surface hover:opacity-90">
              <ClipboardCheck className="w-3.5 h-3.5" /> Rever avaliação
            </button>
          )}
          {g.estado === 'erro' && (
            <button type="button" onClick={() => onRetomar(g.id)} disabled={!!busy} title="Tentar transcrever de novo"
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-muted disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${busy === 'retomar' ? 'animate-spin' : ''}`} />
            </button>
          )}
          {g.transcricao && g.consentimento_em && !EM_PROCESSAMENTO.includes(estado) && (
            <button type="button" onClick={() => onAnalisar(g.id)} disabled={!!busy} title={g.analise_consultor ? 'Analisar de novo (tem custo)' : 'Analisar'}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-muted disabled:opacity-50">
              {busy === 'analisar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
          )}
          <button type="button" onClick={() => onApagar(g.id)} disabled={!!busy} title="Apagar"
            className="p-1.5 rounded text-red-400 hover:text-danger hover:bg-danger/10 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {aberto && (
        <div className="border-t border-line p-3 space-y-3">
          {(g.erro || g.erro_consultor) && <p className="text-xs text-danger">{g.erro_consultor || g.erro}</p>}
          {g.estado === 'aguarda_consentimento' && (
            <div className="space-y-2">
              <Consentimento valor={consent} onChange={setConsent} />
              <button type="button" disabled={!consent.consentimento || !!busy} onClick={() => onConsentir(g.id, consent)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-surface hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Registar consentimento e processar
              </button>
            </div>
          )}
          {EM_PROCESSAMENTO.includes(estado) && !g.analise_consultor && (
            <p className="text-xs text-ink-muted">A transcrição corre no Mac (worker Whisper, de 3 em 3 minutos). A proposta de avaliação aparece aqui automaticamente.</p>
          )}
          {g.consentimento_em && (
            <p className="text-[11px] text-ink-muted flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />
              Consentimento {CONSENTIMENTO_MODOS[g.consentimento_modo]?.toLowerCase() || ''}, registado a {fmtDia(g.consentimento_em)}</p>
          )}
          {ext.resumo && <p className="text-xs text-ink">{ext.resumo}</p>}
          {ext.triagem_justificacao && <p className="text-xs text-ink-muted italic">{ext.triagem_justificacao}</p>}
          {Array.isArray(ac.perguntas_pendentes) && ac.perguntas_pendentes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-muted mb-1">Perguntas para o próximo contacto</p>
              <ul className="list-disc pl-4 text-xs text-ink-muted space-y-0.5">{ac.perguntas_pendentes.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          {g.etapa_consultor && <GuiaoConsultor etapa={g.etapa_consultor} cobertas={ext.perguntas_cobertas || []} />}
          {g.transcricao && (
            <div>
              <button type="button" onClick={() => setVerTranscricao(v => !v)} className="text-xs text-ink-muted hover:text-ink flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> {verTranscricao ? 'Esconder transcrição' : 'Ver transcrição'}
              </button>
              {verTranscricao && <p className="mt-2 text-xs text-ink-muted whitespace-pre-wrap max-h-80 overflow-y-auto rounded-lg bg-surface p-2.5 border border-line">{g.transcricao}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ChamadasConsultor({ consultorId, onUpdate }) {
  const toast = useToast()
  const [chamadas, setChamadas] = useState([])
  const [pendentes, setPendentes] = useState({}) // gravacao_id -> avaliacao_id por rever
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const novaVazia = () => ({ etapa_consultor: 'cold_call', data_chamada: hojeISO(), realizada_por: '', file: null, consentimento: false, consentimento_modo: 'verbal_gravado' })
  const [nova, setNova] = useState(novaVazia)
  const [enviando, setEnviando] = useState(false)
  const [busy, setBusy] = useState({})
  const [rever, setRever] = useState(null)

  const load = useCallback(async () => {
    try {
      const [r, ra] = await Promise.all([
        apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`),
        apiFetch(`/api/crm/consultores/${consultorId}/avaliacao`),
      ])
      const d = await r.json()
      setChamadas(Array.isArray(d) ? d.filter(g => g.etapa_consultor) : [])
      const av = ra.ok ? await ra.json() : null
      const mapa = {}
      for (const p of (av?.propostas || [])) mapa[p.gravacao_id || p.id] = p.id
      setPendentes(mapa)
    } catch { setChamadas([]) }
    setLoading(false)
  }, [consultorId])
  useEffect(() => { load() }, [load])

  const temPendentes = chamadas.some(g => EM_PROCESSAMENTO.includes(g.estado) || g.estado_consultor === 'a_analisar')
  useEffect(() => {
    if (!temPendentes) return
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [temPendentes, load])

  async function enviar(e) {
    e.preventDefault()
    if (!nova.file) return
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('audio', nova.file)
      for (const k of ['etapa_consultor', 'data_chamada', 'realizada_por', 'consentimento_modo']) if (nova[k]) fd.append(k, nova[k])
      fd.append('consentimento', nova.consentimento ? 'true' : 'false')
      fd.append('titulo', `${ETAPAS[nova.etapa_consultor]} — ${nova.data_chamada}`)
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao carregar a chamada')
      setChamadas(p => [d, ...p])
      setAdding(false)
      setNova(novaVazia())
      toast(nova.consentimento ? 'Chamada carregada. Fica em fila para transcrever e analisar.' : 'Chamada guardada. Só é processada depois de registares o consentimento.', 'success')
    } catch (err) { toast(friendlyError(err.message || 'Falha ao carregar a chamada'), 'error') }
    setEnviando(false)
  }

  async function accao(id, tipo, fn) {
    setBusy(p => ({ ...p, [id]: tipo }))
    try { await fn() } catch (err) { toast(friendlyError(err.message || 'Falhou'), 'error') }
    setBusy(p => ({ ...p, [id]: null }))
  }

  const analisar = (id) => accao(id, 'analisar', async () => {
    if (!(await confirmar('Analisar esta gravação de novo? Cada análise tem custo de IA e substitui a proposta por rever.'))) return
    const r = await apiFetch(`/api/crm/gravacoes/${id}/analisar-consultor`, { method: 'POST' })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Falha na análise')
    setChamadas(p => p.map(g => g.id === id ? d : g))
  })

  const retomar = (id) => accao(id, 'retomar', async () => {
    const r = await apiFetch(`/api/crm/gravacoes/${id}/retomar`, { method: 'POST' })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível retomar')
    await load()
  })

  const consentir = (id, consent) => accao(id, 'consentir', async () => {
    const g = chamadas.find(x => x.id === id)
    const r = await apiFetch(`/api/crm/gravacoes/${id}/consultor`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa_consultor: g?.etapa_consultor, ...consent }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Falha ao registar o consentimento')
    setChamadas(p => p.map(x => x.id === id ? d : x))
  })

  async function apagar(id) {
    if (!(await confirmar('Apagar esta chamada, o áudio e a análise?'))) return
    accao(id, 'apagar', async () => {
      const r = await apiFetch(`/api/crm/gravacoes/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Falha ao apagar')
      setChamadas(p => p.filter(g => g.id !== id))
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-ink-muted" />
          <div>
            <h3 className="text-sm font-semibold text-ink">Chamadas gravadas</h3>
            <p className="text-xs text-ink-muted">Cold call, discovery e acompanhamento: a IA propõe, o associado valida</p>
          </div>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-surface hover:opacity-90">
            <Upload className="w-3.5 h-3.5" /> Carregar chamada
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={enviar} className="bg-surface-raised rounded-xl border border-line p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block text-xs text-ink-muted">Etapa
              <select value={nova.etapa_consultor} onChange={e => setNova(n => ({ ...n, etapa_consultor: e.target.value }))} className={`mt-1 ${inputClass}`}>
                {Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block text-xs text-ink-muted">Data da chamada
              <input type="date" required value={nova.data_chamada} onChange={e => setNova(n => ({ ...n, data_chamada: e.target.value }))} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block text-xs text-ink-muted">Associado
              <input value={nova.realizada_por} placeholder="Quem fez a chamada" onChange={e => setNova(n => ({ ...n, realizada_por: e.target.value }))} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block text-xs text-ink-muted">Áudio ou vídeo
              <input type="file" required accept={AUDIO_ACCEPT} onChange={e => setNova(n => ({ ...n, file: e.target.files?.[0] || null }))}
                className="mt-1 block w-full text-sm text-ink-muted" />
            </label>
          </div>
          <Consentimento valor={nova} onChange={v => setNova(n => ({ ...n, ...v }))} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-muted text-ink-muted hover:bg-line">
              Cancelar
            </button>
            <button type="submit" disabled={enviando || !nova.file}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-surface hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
              {enviando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{enviando ? 'A carregar...' : 'Carregar'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <GuiaoConsultor etapa="cold_call" />
        <GuiaoConsultor etapa="discovery" />
      </div>

      {loading ? (
        <p className="text-xs text-ink-muted text-center py-3">A carregar...</p>
      ) : chamadas.length === 0 ? (
        !adding && <p className="text-xs text-ink-muted text-center py-3 rounded-xl border border-dashed border-line">Sem chamadas gravadas</p>
      ) : (
        <div className="space-y-2">
          {chamadas.map(g => (
            <ChamadaCard key={g.id} g={g} avaliacaoPendente={pendentes[g.id]} busy={busy[g.id]} onAnalisar={analisar} onRetomar={retomar}
              onApagar={apagar} onConsentir={consentir} onRever={setRever} />
          ))}
        </div>
      )}
      {rever && <RevisaoAvaliacao avaliacaoId={rever} onClose={() => setRever(null)} onDone={() => { load(); onUpdate?.() }} />}
    </div>
  )
}
