/**
 * Cartao de uma gravacao/registo de chamada: cabecalho com tipo (SOP 2) +
 * estado + accoes, e corpo expandivel com o registo manual (fonte de verdade),
 * a sugestao da IA (se houver) e a transcricao. Usado no historico de
 * follow-ups do consultor e nas conversas ligadas a um imovel.
 */
import { useState } from 'react'
import {
  Trash2, Loader2, FileText, Sparkles, RefreshCw, Pencil, Check,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import {
  TIPO_CHAMADA_LABEL, TIPO_CHAMADA_COLOR, REGISTO_FIELD_LABEL, fmtRegistoValor, CAMPOS_POR_TIPO,
  estagiosCobertos, temDiscovery,
} from '../../constants.js'
import { ScorecardBars } from './ScorecardBars.jsx'
import { RegistoManualFieldset } from './RegistoManualFieldset.jsx'
import { dotClass } from '../../lib/statusTone.js'

const ESTADO_META = {
  pendente:      { label: 'Em fila',        cls: 'bg-warning/10 text-warning border-warning/30', spin: false },
  a_transcrever: { label: 'A transcrever…', cls: 'bg-surface-muted text-ink border-line',    spin: true },
  transcrito:    { label: 'Transcrito',     cls: 'bg-surface-muted text-ink border-line', spin: false },
  a_analisar:    { label: 'A analisar…',    cls: 'bg-surface-muted text-ink border-line',    spin: true },
  analisado:     { label: 'Analisado',      cls: 'bg-success/10 text-success border-success/30',  spin: false },
  erro:          { label: 'Erro',           cls: 'bg-danger/10 text-danger border-danger/30',        spin: false },
  sem_audio:     { label: 'Sem áudio · registo manual', cls: 'bg-surface-muted text-ink-muted border-line', spin: false },
}


const SENTIMENTO_META = {
  positivo: { label: 'Positivo', cls: 'bg-success/15 text-success' },
  neutro:   { label: 'Neutro',   cls: 'bg-surface-muted text-ink-muted' },
  negativo: { label: 'Negativo', cls: 'bg-danger/15 text-danger' },
}

const METRICAS_LABELS = {
  tempo_mercado: 'Tempo no mercado',
  estado_imovel: 'Estado do imovel',
  situacao_legal: 'Situacao legal',
  custos_mensais: 'Custos mensais',
  dependencia_venda: 'Dependencia da venda',
}

function fmtDuracao(seg) {
  if (!seg && seg !== 0) return null
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return m > 0 ? `${m}min ${s}s` : `${s}s`
}

function fmtData(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return `${dt.toLocaleDateString('pt-PT')} ${dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
}

function Estrelas({ n }) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)))
  return <span className="text-sm text-accent-ink">{'★'.repeat(v)}<span className="text-ink-muted/70">{'★'.repeat(5 - v)}</span></span>
}

function ListaBloco({ titulo, itens, icon }) {
  if (!Array.isArray(itens) || itens.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted mb-1.5">{titulo}</p>
      <ul className="space-y-1">
        {itens.map((it, i) => (
          <li key={i} className="text-xs text-ink-muted flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">{icon}</span> <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function GravacaoCard({ g, busy, onAnalisar, onRetomar, onApagar, onRegistoSalvar, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const em = ESTADO_META[g.estado] || ESTADO_META.pendente
  const analise = g.analise && typeof g.analise === 'object' ? g.analise : null
  const dur = fmtDuracao(g.duracao_seg)
  const metricas = analise?.metricas_recolhidas && typeof analise.metricas_recolhidas === 'object'
    ? Object.entries(analise.metricas_recolhidas).filter(([, v]) => v != null && v !== '' && String(v).toLowerCase() !== 'null')
    : []

  const sugestoes = analise
    ? Object.entries(analise).filter(([k, v]) => k.startsWith('sugestao_') && k !== 'sugestao_justificacao' && v !== null && v !== undefined)
    : []

  function iniciarEdicao() {
    setRascunho(Object.fromEntries(Object.keys(REGISTO_FIELD_LABEL).map(k => [k, g[k]])))
    setEditando(true)
  }

  async function guardarEdicao() {
    setSalvando(true)
    try { await onRegistoSalvar?.(g.id, rascunho, 'manual'); setEditando(false) }
    finally { setSalvando(false) }
  }

  async function aceitarSugestao() {
    const payload = {}
    for (const [k, v] of sugestoes) payload[k.replace(/^sugestao_/, '')] = v
    setSalvando(true)
    try { await onRegistoSalvar?.(g.id, payload, 'ia_sugestao_confirmada') }
    finally { setSalvando(false) }
  }

  const estagios = estagiosCobertos(g)

  return (
    <div className="rounded-xl border border-line overflow-hidden bg-surface-raised">
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <button onClick={() => setIsOpen(o => !o)}
          className="text-ink-muted hover:text-ink-muted shrink-0" title={isOpen ? 'Fechar' : 'Abrir'}>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-ink truncate">{g.titulo || g.ficheiro_nome || 'Gravacao'}</p>
            {estagios.map(e => (
              <span key={e} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium shrink-0 bg-surface-muted text-ink">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(TIPO_CHAMADA_COLOR[e])}`} aria-hidden="true" />{TIPO_CHAMADA_LABEL[e]}
              </span>
            ))}
          </div>
          <p className="text-xs text-ink-muted">{fmtData(g.data_chamada)}{dur ? ` · ${dur}` : ''}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${em.cls} shrink-0`}>
          {em.spin && <Loader2 className="w-3 h-3 animate-spin" />}
          {em.label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {g.estado === 'erro' && (
            <button onClick={() => onRetomar(g.id)} disabled={busy} title="Tentar de novo"
              className="p-1.5 rounded-lg text-warning hover:bg-warning/10 disabled:opacity-50">
              {busy === 'retomar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          )}
          {(g.estado === 'transcrito' || g.estado === 'analisado') && (
            <button onClick={() => onAnalisar(g.id)} disabled={busy} title={g.estado === 'analisado' ? 'Re-analisar' : 'Analisar'}
              className="p-1.5 rounded-lg text-ink hover:bg-surface-muted disabled:opacity-50">
              {busy === 'analisar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            </button>
          )}
          <button onClick={() => onApagar(g.id)} disabled={busy} title="Apagar"
            className="p-1.5 rounded-lg text-danger hover:bg-danger/10 disabled:opacity-50">
            {busy === 'apagar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Corpo expandido */}
      {isOpen && (
        <div className="border-t border-line p-4 space-y-4 bg-surface">
          {g.erro && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{g.erro}</span>
            </div>
          )}

          {/* Registo manual (SOP 2) — sempre a fonte de verdade, nunca escrito pela IA */}
          {(estagios.length > 0 || editando) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  Registo manual
                  {g.registo_fonte === 'ia_sugestao_confirmada' && (
                    <span className="text-[10px] font-normal text-ink-muted">
                      (sugestão da IA confirmada{g.registo_confirmado_em ? ` em ${fmtData(g.registo_confirmado_em)}` : ''})
                    </span>
                  )}
                </p>
                {!editando && (
                  <button onClick={iniciarEdicao} className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-muted" title="Editar registo">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {editando ? (
                <div className="space-y-2">
                  <RegistoManualFieldset registo={rascunho} onChange={(k, v) => setRascunho(p => ({ ...p, [k]: v }))} />
                  <div className="flex gap-2">
                    <button onClick={guardarEdicao} disabled={salvando}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] flex items-center gap-1.5 disabled:opacity-50">
                      {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
                    </button>
                    <button onClick={() => setEditando(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-muted text-ink-muted hover:bg-line">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {temDiscovery(g) && <ScorecardBars g={g} />}
                  {estagios.filter(e => e !== 'discovery_call').map(e => (
                    <div key={e}>
                      <p className="text-xs font-semibold text-ink-muted mb-1">{TIPO_CHAMADA_LABEL[e]}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(CAMPOS_POR_TIPO[e] || []).filter(k => g[k] != null).map(k => (
                          <div key={k} className="text-xs text-ink-muted">
                            <span className="text-ink-muted">{REGISTO_FIELD_LABEL[k]}:</span> {fmtRegistoValor(k, g[k])}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sugestão da IA — nunca escreve directamente no registo manual */}
          {sugestoes.length > 0 && !editando && (
            <div className="rounded-lg border border-line bg-surface-muted p-2.5 space-y-2">
              <p className="text-xs font-semibold text-ink flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Sugestão da IA
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {sugestoes.map(([k, v]) => {
                  const campo = k.replace(/^sugestao_/, '')
                  return (
                    <div key={k} className="text-xs text-ink">
                      <span className="text-ink-muted">{REGISTO_FIELD_LABEL[campo] || campo}:</span> {fmtRegistoValor(campo, v)}
                    </div>
                  )
                })}
              </div>
              {analise.sugestao_justificacao && <p className="text-xs text-ink italic">{analise.sugestao_justificacao}</p>}
              <button onClick={aceitarSugestao} disabled={salvando}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50 flex items-center gap-1.5">
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aceitar sugestão
              </button>
            </div>
          )}

          {analise ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-accent-ink" /> Análise comercial {!g.tipo_chamada && '(SOP 1)'}
                </span>
                {analise.classificacao != null && <Estrelas n={analise.classificacao} />}
                {analise.sentimento && SENTIMENTO_META[analise.sentimento] && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${SENTIMENTO_META[analise.sentimento].cls}`}>
                    {SENTIMENTO_META[analise.sentimento].label}
                  </span>
                )}
              </div>

              {/* Veredicto de descarte */}
              {analise.descartar?.deve_descartar && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span><span className="font-semibold">Lead a descartar.</span> {analise.descartar.motivo}</span>
                </div>
              )}

              {analise.resumo && <p className="text-sm text-ink">{analise.resumo}</p>}

              {/* Fases do SOP 1 (histórico pré-SOP2) */}
              {!g.tipo_chamada && Array.isArray(analise.fases_sop1) && analise.fases_sop1.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted mb-1.5">Fases do script (SOP 1)</p>
                  <div className="space-y-1">
                    {analise.fases_sop1.map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        {f.cumprida
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                          : <XCircle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />}
                        <span className="text-ink"><span className="font-medium">{f.fase}</span>{f.observacao ? ` — ${f.observacao}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metricas recolhidas (histórico pré-SOP2) */}
              {!g.tipo_chamada && metricas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted mb-1.5">Metricas recolhidas</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {metricas.map(([k, v]) => (
                      <div key={k} className="text-xs text-ink-muted">
                        <span className="text-ink-muted">{METRICAS_LABELS[k] || k}:</span> {String(v)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!g.tipo_chamada && (
                <ListaBloco titulo="Perguntas de discovery falhadas" itens={analise.perguntas_discovery_falhadas}
                  icon={<AlertTriangle className="w-3.5 h-3.5 text-warning" />} />
              )}

              {Array.isArray(analise.objeccoes) && analise.objeccoes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted mb-1.5">Objeccoes e respostas</p>
                  <div className="space-y-2">
                    {analise.objeccoes.map((o, i) => (
                      <div key={i} className="rounded-lg border border-line bg-surface-raised p-2.5 text-xs space-y-1">
                        <p className="font-medium text-ink flex items-start gap-1.5">
                          {o.eficaz ? <ThumbsUp className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" /> : <ThumbsDown className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />}
                          {o.objeccao}
                        </p>
                        {o.resposta_dada && <p className="text-ink-muted"><span className="text-ink-muted">Resposta nossa:</span> {o.resposta_dada}</p>}
                        {o.sugestao && <p className="text-ink"><span className="text-ink-muted">Melhor:</span> {o.sugestao}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ListaBloco titulo="Pontos fortes" itens={analise.pontos_fortes} icon={<CheckCircle2 className="w-3.5 h-3.5 text-success" />} />
                <ListaBloco titulo="Pontos fracos" itens={analise.pontos_fracos} icon={<AlertTriangle className="w-3.5 h-3.5 text-warning" />} />
              </div>

              {Array.isArray(analise.frases_eficazes) && analise.frases_eficazes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted mb-1.5">Frases a reutilizar no script</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analise.frases_eficazes.map((f, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-lg bg-accent/10 text-accent-ink border border-accent/30">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(analise.melhorias_script) && analise.melhorias_script.length > 0 && (
                <ListaBloco titulo="Melhorias ao script" itens={analise.melhorias_script} icon={<Sparkles className="w-3.5 h-3.5 text-accent-ink" />} />
              )}

              {analise.proximo_passo && (
                <div className="rounded-lg border border-line bg-surface-muted p-2.5">
                  <p className="text-xs font-semibold text-ink mb-0.5">Proximo passo</p>
                  <p className="text-xs text-ink">{analise.proximo_passo}</p>
                </div>
              )}
            </div>
          ) : g.estado === 'transcrito' ? (
            <p className="text-xs text-ink-muted">Transcricao pronta. Carrega no icone ✨ para gerar a analise comercial.</p>
          ) : ['pendente', 'a_transcrever', 'a_analisar'].includes(g.estado) ? (
            <p className="text-xs text-ink-muted flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> A processar… isto pode demorar alguns minutos.</p>
          ) : null}

          {/* Transcricao */}
          {g.transcricao && (
            <details className="group">
              <summary className="text-xs font-semibold text-ink-muted cursor-pointer flex items-center gap-1.5 select-none">
                <FileText className="w-3.5 h-3.5" /> Ver transcricao completa
              </summary>
              <pre className="mt-2 text-xs text-ink-muted whitespace-pre-wrap font-sans bg-surface-raised border border-line rounded-lg p-3 max-h-72 overflow-auto">{g.transcricao}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
