/**
 * Chamadas gravadas com o investidor (aba Reuniões): upload do áudio de uma
 * Cold Call ou Follow-up, transcrição pelo worker Whisper local e avaliação
 * pelo Claude contra o SOP 4. O registo manual (resultado, próximo passo,
 * temperatura, data de follow-up) é a fonte de verdade; a IA só sugere.
 * A leitura agregada fica em Administração > Chamadas > Investidores.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Mic, Upload, Loader2, Trash2, RefreshCw, Sparkles, ChevronDown, ChevronRight,
  AlertTriangle, ThumbsUp, ThumbsDown, CheckCircle2, XCircle, FileText, Check,
} from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'
import { confirmar } from '../ui/ConfirmDialog.jsx'
import { inputClass } from './RegistoManualFieldset.jsx'
import {
  TIPO_CHAMADA_INV_LABEL, RESULTADO_INV_LABEL, PROXIMO_PASSO_INV_LABEL, TEMPERATURA_INV_LABEL,
  PASSOS_INV_LABEL, CRITERIOS_CLASSIFICACAO_LABEL, classeSop4, corNota, corBarra,
} from '../../lib/chamadasInvestidor.js'

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.aac'
const EM_PROCESSAMENTO = ['pendente', 'a_transcrever', 'a_analisar']
const hojeISO = () => new Date().toISOString().slice(0, 10)

const ESTADO_META = {
  pendente:      { label: 'Em fila para transcrever', cls: 'bg-warning/10 text-warning border-warning/30', spin: false },
  a_transcrever: { label: 'A transcrever…', cls: 'bg-surface-muted text-ink border-line', spin: true },
  transcrito:    { label: 'Transcrito', cls: 'bg-surface-muted text-ink border-line', spin: false },
  a_analisar:    { label: 'A analisar…', cls: 'bg-surface-muted text-ink border-line', spin: true },
  analisado:     { label: 'Analisado', cls: 'bg-success/10 text-success border-success/30', spin: false },
  erro:          { label: 'Erro', cls: 'bg-danger/10 text-danger border-danger/30', spin: false },
}

const REGISTO_KEYS = ['resultado', 'proximo_passo', 'temperatura', 'data_follow_up', 'notas']

function fmtDia(d) {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function fmtDuracao(seg) {
  if (!seg && seg !== 0) return null
  const m = Math.floor(seg / 60)
  return m > 0 ? `${m}min ${seg % 60}s` : `${seg}s`
}

function Lista({ titulo, itens, icon }) {
  if (!Array.isArray(itens) || itens.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted mb-1.5">{titulo}</p>
      <ul className="space-y-1">
        {itens.map((it, i) => (
          <li key={i} className="text-xs text-ink-muted flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">{icon}</span><span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block text-xs text-ink-muted">{label}
      <select value={value || ''} onChange={e => onChange(e.target.value || null)} className={`mt-1 ${inputClass}`}>
        <option value="">—</option>
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  )
}

function RegistoManual({ g, onGuardar }) {
  const [form, setForm] = useState(() => Object.fromEntries(REGISTO_KEYS.map(k => [k, g[k] ?? null])))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setForm(Object.fromEntries(REGISTO_KEYS.map(k => [k, g[k] ?? null]))) }, [g])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const a = g.analise || {}
  const sugestoes = {
    resultado: a.sugestao_resultado, proximo_passo: a.sugestao_proximo_passo,
    temperatura: a.sugestao_temperatura, data_follow_up: a.sugestao_data_follow_up,
  }
  const temSugestao = Object.values(sugestoes).some(v => v)

  async function guardar(payload, fonte) {
    setSaving(true)
    try { await onGuardar(g.id, payload, fonte) } finally { setSaving(false) }
  }

  return (
    <div className="rounded-lg border border-line p-3 space-y-3 bg-surface">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-ink">Registo da chamada</p>
        {g.registo_fonte && (
          <span className="text-[11px] text-ink-muted">
            {g.registo_fonte === 'ia_sugestao_confirmada' ? 'Sugestão da IA confirmada' : 'Preenchido manualmente'}
          </span>
        )}
      </div>
      {temSugestao && (
        <div className="rounded-lg bg-accent/10 border border-accent/30 p-2.5 text-xs text-ink space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Sugestão da IA</p>
          <p className="text-ink-muted">
            {[RESULTADO_INV_LABEL[sugestoes.resultado], PROXIMO_PASSO_INV_LABEL[sugestoes.proximo_passo],
              TEMPERATURA_INV_LABEL[sugestoes.temperatura], sugestoes.data_follow_up && `Follow-up a ${fmtDia(sugestoes.data_follow_up)}`]
              .filter(Boolean).join(' · ')}
          </p>
          {a.sugestao_justificacao && <p className="text-ink-muted italic">{a.sugestao_justificacao}</p>}
          <button type="button" disabled={saving}
            onClick={() => guardar(Object.fromEntries(Object.entries(sugestoes).filter(([, v]) => v)), 'ia_sugestao_confirmada')}
            className="px-2.5 py-1 rounded-lg bg-accent text-accent-foreground text-xs font-medium disabled:opacity-50">
            Aceitar sugestão
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Resultado" value={form.resultado} options={RESULTADO_INV_LABEL} onChange={v => set('resultado', v)} />
        <Select label="Próximo passo" value={form.proximo_passo} options={PROXIMO_PASSO_INV_LABEL} onChange={v => set('proximo_passo', v)} />
        <Select label="Temperatura do lead" value={form.temperatura} options={TEMPERATURA_INV_LABEL} onChange={v => set('temperatura', v)} />
        <label className="block text-xs text-ink-muted">Data do próximo contacto
          <input type="date" value={form.data_follow_up || ''} onChange={e => set('data_follow_up', e.target.value || null)} className={`mt-1 ${inputClass}`} />
        </label>
      </div>
      <label className="block text-xs text-ink-muted">Notas
        <textarea rows={2} value={form.notas || ''} onChange={e => set('notas', e.target.value)} className={`mt-1 ${inputClass}`} />
      </label>
      <button type="button" disabled={saving} onClick={() => guardar(form, 'manual')}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-surface hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar registo
      </button>
    </div>
  )
}

function Analise({ g }) {
  const a = g.analise
  if (!a) return null
  const passos = Object.entries(a.passos || {})
  const conf = a.conformidade || {}
  const dados = a.dados_recolhidos || {}
  const pc = a.pre_classificacao || {}
  const pcNotas = Object.keys(CRITERIOS_CLASSIFICACAO_LABEL).map(k => pc[k]).filter(v => Number.isFinite(Number(v)) && v !== null)
  const pcTotal = pcNotas.length === 5 ? pcNotas.reduce((s, n) => s + Number(n), 0) : null
  const dadosLinhas = [
    ['Tipo', dados.tipo_investidor], ['Capital mín.', dados.capital_min && `${Number(dados.capital_min).toLocaleString('pt-PT')} €`],
    ['Capital máx.', dados.capital_max && `${Number(dados.capital_max).toLocaleString('pt-PT')} €`],
    ['Capital disponível', dados.capital_disponivel_quando], ['ROI pretendido', dados.roi_pretendido],
    ['Estratégia', dados.estrategia], ['Tipo de imóvel', dados.tipo_imovel], ['Experiência', dados.experiencia], ['Equipa de obras', dados.equipa_obras],
  ].filter(([, v]) => v)

  return (
    <div className="space-y-4">
      {a.resumo && <p className="text-sm text-ink">{a.resumo}</p>}

      {(conf.promessa_rentabilidade_garantida || conf.informacao_financeira_detalhada_cedo) && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div>
            <p className="font-semibold">Alerta de conformidade (SOP 4)</p>
            {conf.promessa_rentabilidade_garantida && <p>Houve promessa de rentabilidade garantida.</p>}
            {conf.informacao_financeira_detalhada_cedo && <p>Foi dada informação financeira detalhada cedo demais.</p>}
            {conf.comentario && <p className="text-ink-muted mt-1">{conf.comentario}</p>}
          </div>
        </div>
      )}

      {passos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-2">Avaliação por passo do SOP 4</p>
          <div className="space-y-2.5">
            {passos.map(([k, p]) => {
              const nota = Number(p?.nota)
              const pct = Number.isFinite(nota) ? nota / 2 * 100 : null
              return (
                <div key={k}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink w-44 shrink-0">{PASSOS_INV_LABEL[k] || k}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className={`h-full rounded-full ${corBarra(pct)}`} style={{ width: `${pct ?? 0}%` }} />
                    </div>
                    <span className="text-xs text-ink-muted w-8 text-right num shrink-0">{Number.isFinite(nota) ? `${nota}/2` : '—'}</span>
                  </div>
                  {p?.comentario && <p className="text-[11px] text-ink-muted mt-0.5 sm:pl-[11.5rem]">{p.comentario}</p>}
                  {p?.evidencia && <p className="text-[11px] text-ink-muted italic sm:pl-[11.5rem]">«{p.evidencia}»</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Lista titulo="Pontos fortes" itens={a.pontos_fortes} icon={<ThumbsUp className="w-3 h-3 text-success" />} />
        <Lista titulo="Pontos a melhorar" itens={a.pontos_fracos} icon={<ThumbsDown className="w-3 h-3 text-danger" />} />
      </div>

      {Array.isArray(a.objeccoes) && a.objeccoes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-1.5">Objecções</p>
          <div className="space-y-2">
            {a.objeccoes.map((o, i) => (
              <div key={i} className="text-xs rounded-lg border border-line p-2 space-y-0.5">
                <p className="text-ink flex items-center gap-1.5">
                  {o.eficaz ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />}
                  {o.objeccao}
                </p>
                {o.resposta_dada && <p className="text-ink-muted">Respondemos: {o.resposta_dada}</p>}
                {o.sugestao && <p className="text-ink">Melhor resposta: {o.sugestao}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(a.melhorias_script) && a.melhorias_script.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-1.5">Melhorias ao script</p>
          <div className="space-y-2">
            {a.melhorias_script.map((m, i) => (
              <div key={i} className="text-xs rounded-lg bg-surface p-2 border border-line">
                {m.momento && <p className="text-[10px] uppercase tracking-wide text-ink-muted mb-0.5">{m.momento}</p>}
                {m.em_vez_de && <p className="text-ink-muted line-through">{m.em_vez_de}</p>}
                {m.dizer && <p className="text-ink">{m.dizer}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(dadosLinhas.length > 0 || dados.dados_em_falta?.length > 0) && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-1.5">Dados recolhidos na chamada</p>
          {dadosLinhas.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {dadosLinhas.map(([k, v]) => <p key={k} className="text-xs text-ink"><span className="text-ink-muted">{k}:</span> {v}</p>)}
            </div>
          )}
          {dados.dados_em_falta?.length > 0 && (
            <p className="text-xs text-warning mt-1.5">Ficou por recolher: {dados.dados_em_falta.join(', ')}</p>
          )}
        </div>
      )}

      {pcNotas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-1.5">
            Pré-classificação indicativa {pcTotal != null && <span className="text-ink">· {pcTotal}/25 · Classe {classeSop4(pcTotal)}</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CRITERIOS_CLASSIFICACAO_LABEL).map(([k, l]) => pc[k] != null && (
              <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted text-ink">{l}: {pc[k]}/5</span>
            ))}
          </div>
          {pc.justificacao && <p className="text-[11px] text-ink-muted mt-1">{pc.justificacao}</p>}
          <p className="text-[11px] text-ink-muted mt-1">Não altera a classificação da ficha: a oficial é feita na Entrevista Estratégica.</p>
        </div>
      )}

      {a.proximo_passo && (
        <div className="rounded-lg bg-surface border border-line p-2.5 text-xs">
          <span className="font-semibold text-ink">Próximo passo recomendado: </span><span className="text-ink-muted">{a.proximo_passo}</span>
        </div>
      )}
    </div>
  )
}

function ChamadaCard({ g, busy, onAnalisar, onRetomar, onApagar, onGuardarRegisto }) {
  const [aberto, setAberto] = useState(false)
  const [verTranscricao, setVerTranscricao] = useState(false)
  const em = ESTADO_META[g.estado] || ESTADO_META.pendente
  const dur = fmtDuracao(g.duracao_seg)

  return (
    <div className="rounded-xl border border-line overflow-hidden bg-surface-raised">
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setAberto(o => !o)}>
        {aberto ? <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">{TIPO_CHAMADA_INV_LABEL[g.tipo_chamada] || 'Chamada'}</span>
            <span className="text-xs text-ink-muted">{fmtDia(g.data_chamada)}</span>
            {dur && <span className="text-xs text-ink-muted">· {dur}</span>}
            {g.realizada_por && <span className="text-xs text-ink-muted">· {g.realizada_por}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${em.cls}`}>
              {em.spin && <Loader2 className="w-3 h-3 animate-spin" />}{em.label}
            </span>
            {g.resultado && <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted text-ink">{RESULTADO_INV_LABEL[g.resultado]}</span>}
            {g.proximo_passo && <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted text-ink">{PROXIMO_PASSO_INV_LABEL[g.proximo_passo]}</span>}
          </div>
        </div>
        {g.nota_sop != null && (
          <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg num shrink-0 ${corNota(g.nota_sop)}`} title="Nota SOP 4 (0-100)">{g.nota_sop}</span>
        )}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {g.estado === 'erro' && (
            <button type="button" onClick={() => onRetomar(g.id)} disabled={!!busy} title="Tentar transcrever de novo"
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-muted disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${busy === 'retomar' ? 'animate-spin' : ''}`} />
            </button>
          )}
          {g.transcricao && !EM_PROCESSAMENTO.includes(g.estado) && (
            <button type="button" onClick={() => onAnalisar(g.id)} disabled={!!busy} title={g.analise ? 'Analisar de novo' : 'Analisar'}
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
        <div className="border-t border-line p-3 space-y-4">
          {g.erro && <p className="text-xs text-danger">{g.erro}</p>}
          {EM_PROCESSAMENTO.includes(g.estado) && !g.analise && (
            <p className="text-xs text-ink-muted">A transcrição corre no Mac (worker Whisper, de 3 em 3 minutos). A análise aparece aqui automaticamente.</p>
          )}
          <Analise g={g} />
          <RegistoManual g={g} onGuardar={onGuardarRegisto} />
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

export function ChamadasInvestidor({ investidorId }) {
  const toast = useToast()
  const [chamadas, setChamadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [nova, setNova] = useState({ tipo_chamada: 'cold_call', data_chamada: hojeISO(), file: null })
  const [enviando, setEnviando] = useState(false)
  const [busy, setBusy] = useState({})

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/chamadas`)
      const d = await r.json()
      setChamadas(Array.isArray(d) ? d : [])
    } catch { setChamadas([]) }
    setLoading(false)
  }, [investidorId])
  useEffect(() => { load() }, [load])

  const temPendentes = chamadas.some(g => EM_PROCESSAMENTO.includes(g.estado))
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
      fd.append('tipo_chamada', nova.tipo_chamada)
      fd.append('data_chamada', nova.data_chamada)
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/chamadas`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao carregar a chamada')
      setChamadas(p => [d, ...p])
      setAdding(false)
      setNova({ tipo_chamada: 'cold_call', data_chamada: hojeISO(), file: null })
      toast('Chamada carregada. Fica em fila para transcrever e analisar.', 'success')
    } catch (err) { toast(friendlyError(err.message || 'Falha ao carregar a chamada'), 'error') }
    setEnviando(false)
  }

  async function accao(id, tipo, fn) {
    setBusy(p => ({ ...p, [id]: tipo }))
    try { await fn() } catch (err) { toast(friendlyError(err.message || 'Falhou'), 'error') }
    setBusy(p => ({ ...p, [id]: null }))
  }

  const analisar = (id) => accao(id, 'analisar', async () => {
    const r = await apiFetch(`/api/crm/chamadas-investidores/${id}/analisar`, { method: 'POST' })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Falha na análise')
    setChamadas(p => p.map(g => g.id === id ? d : g))
  })

  const retomar = (id) => accao(id, 'retomar', async () => {
    const r = await apiFetch(`/api/crm/gravacoes/${id}/retomar`, { method: 'POST' })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível retomar')
    await load()
  })

  async function apagar(id) {
    if (!(await confirmar('Apagar esta chamada, o áudio e a análise?'))) return
    accao(id, 'apagar', async () => {
      const r = await apiFetch(`/api/crm/chamadas-investidores/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Falha ao apagar')
      setChamadas(p => p.filter(g => g.id !== id))
    })
  }

  async function guardarRegisto(id, payload, fonte) {
    try {
      const r = await apiFetch(`/api/crm/chamadas-investidores/${id}/registo`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, registo_fonte: fonte }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao guardar registo')
      setChamadas(p => p.map(g => g.id === id ? d : g))
      toast('Registo guardado', 'success')
    } catch (err) { toast(friendlyError(err.message || 'Falha ao guardar registo'), 'error') }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-ink-muted" />
          <div>
            <h3 className="text-sm font-semibold text-ink">Chamadas gravadas</h3>
            <p className="text-xs text-ink-muted">Cold Call e Follow-up avaliados pelo SOP 4</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Tipo de chamada" value={nova.tipo_chamada} options={TIPO_CHAMADA_INV_LABEL}
              onChange={v => setNova(n => ({ ...n, tipo_chamada: v || 'cold_call' }))} />
            <label className="block text-xs text-ink-muted">Data da chamada
              <input type="date" required value={nova.data_chamada} onChange={e => setNova(n => ({ ...n, data_chamada: e.target.value }))} className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block text-xs text-ink-muted">Áudio (mp3, m4a, wav, ogg, aac)
              <input type="file" required accept={AUDIO_ACCEPT} onChange={e => setNova(n => ({ ...n, file: e.target.files?.[0] || null }))}
                className="mt-1 block w-full text-sm text-ink-muted" />
            </label>
          </div>
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

      {loading ? (
        <p className="text-xs text-ink-muted text-center py-3">A carregar...</p>
      ) : chamadas.length === 0 ? (
        !adding && <p className="text-xs text-ink-muted text-center py-3 rounded-xl border border-dashed border-line">Sem chamadas gravadas</p>
      ) : (
        <div className="space-y-2">
          {chamadas.map(g => (
            <ChamadaCard key={g.id} g={g} busy={busy[g.id]} onAnalisar={analisar} onRetomar={retomar}
              onApagar={apagar} onGuardarRegisto={guardarRegisto} />
          ))}
        </div>
      )}
    </div>
  )
}
