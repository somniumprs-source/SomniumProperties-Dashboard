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

const ESTADO_META = {
  pendente:      { label: 'Em fila',        cls: 'bg-amber-50 text-amber-700 border-amber-200', spin: false },
  a_transcrever: { label: 'A transcrever…', cls: 'bg-blue-50 text-blue-700 border-blue-200',    spin: true },
  transcrito:    { label: 'Transcrito',     cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', spin: false },
  a_analisar:    { label: 'A analisar…',    cls: 'bg-blue-50 text-blue-700 border-blue-200',    spin: true },
  analisado:     { label: 'Analisado',      cls: 'bg-green-50 text-green-700 border-green-200',  spin: false },
  erro:          { label: 'Erro',           cls: 'bg-red-50 text-red-700 border-red-200',        spin: false },
  sem_audio:     { label: 'Sem áudio · registo manual', cls: 'bg-gray-100 text-gray-600 border-gray-200', spin: false },
}


const SENTIMENTO_META = {
  positivo: { label: 'Positivo', cls: 'bg-green-100 text-green-700' },
  neutro:   { label: 'Neutro',   cls: 'bg-gray-100 text-gray-600' },
  negativo: { label: 'Negativo', cls: 'bg-red-100 text-red-700' },
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
  return <span className="text-sm" style={{ color: '#C9A84C' }}>{'★'.repeat(v)}<span className="text-gray-300">{'★'.repeat(5 - v)}</span></span>
}

function ListaBloco({ titulo, itens, icon }) {
  if (!Array.isArray(itens) || itens.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1.5">{titulo}</p>
      <ul className="space-y-1">
        {itens.map((it, i) => (
          <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
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
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <button onClick={() => setIsOpen(o => !o)}
          className="text-gray-400 hover:text-gray-600 shrink-0" title={isOpen ? 'Fechar' : 'Abrir'}>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-gray-800 truncate">{g.titulo || g.ficheiro_nome || 'Gravacao'}</p>
            {estagios.map(e => (
              <span key={e} className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${TIPO_CHAMADA_COLOR[e] || 'bg-gray-100 text-gray-600'}`}>
                {TIPO_CHAMADA_LABEL[e]}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400">{fmtData(g.data_chamada)}{dur ? ` · ${dur}` : ''}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${em.cls} shrink-0`}>
          {em.spin && <Loader2 className="w-3 h-3 animate-spin" />}
          {em.label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {g.estado === 'erro' && (
            <button onClick={() => onRetomar(g.id)} disabled={busy} title="Tentar de novo"
              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50">
              {busy === 'retomar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          )}
          {(g.estado === 'transcrito' || g.estado === 'analisado') && (
            <button onClick={() => onAnalisar(g.id)} disabled={busy} title={g.estado === 'analisado' ? 'Re-analisar' : 'Analisar'}
              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
              {busy === 'analisar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            </button>
          )}
          <button onClick={() => onApagar(g.id)} disabled={busy} title="Apagar"
            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50">
            {busy === 'apagar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Corpo expandido */}
      {isOpen && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
          {g.erro && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{g.erro}</span>
            </div>
          )}

          {/* Registo manual (SOP 2) — sempre a fonte de verdade, nunca escrito pela IA */}
          {(estagios.length > 0 || editando) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  Registo manual
                  {g.registo_fonte === 'ia_sugestao_confirmada' && (
                    <span className="text-[10px] font-normal text-gray-400">
                      (sugestão da IA confirmada{g.registo_confirmado_em ? ` em ${fmtData(g.registo_confirmado_em)}` : ''})
                    </span>
                  )}
                </p>
                {!editando && (
                  <button onClick={iniciarEdicao} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Editar registo">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {editando ? (
                <div className="space-y-2">
                  <RegistoManualFieldset registo={rascunho} onChange={(k, v) => setRascunho(p => ({ ...p, [k]: v }))} />
                  <div className="flex gap-2">
                    <button onClick={guardarEdicao} disabled={salvando}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
                      {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
                    </button>
                    <button onClick={() => setEditando(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {temDiscovery(g) && <ScorecardBars g={g} />}
                  {estagios.filter(e => e !== 'discovery_call').map(e => (
                    <div key={e}>
                      <p className="text-xs font-semibold text-gray-600 mb-1">{TIPO_CHAMADA_LABEL[e]}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(CAMPOS_POR_TIPO[e] || []).filter(k => g[k] != null).map(k => (
                          <div key={k} className="text-xs text-gray-600">
                            <span className="text-gray-400">{REGISTO_FIELD_LABEL[k]}:</span> {fmtRegistoValor(k, g[k])}
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
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 space-y-2">
              <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Sugestão da IA
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {sugestoes.map(([k, v]) => {
                  const campo = k.replace(/^sugestao_/, '')
                  return (
                    <div key={k} className="text-xs text-indigo-700">
                      <span className="text-indigo-400">{REGISTO_FIELD_LABEL[campo] || campo}:</span> {fmtRegistoValor(campo, v)}
                    </div>
                  )
                })}
              </div>
              {analise.sugestao_justificacao && <p className="text-xs text-indigo-600 italic">{analise.sugestao_justificacao}</p>}
              <button onClick={aceitarSugestao} disabled={salvando}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aceitar sugestão
              </button>
            </div>
          )}

          {analise ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} /> Análise comercial {!g.tipo_chamada && '(SOP 1)'}
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
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span><span className="font-semibold">Lead a descartar.</span> {analise.descartar.motivo}</span>
                </div>
              )}

              {analise.resumo && <p className="text-sm text-gray-700">{analise.resumo}</p>}

              {/* Fases do SOP 1 (histórico pré-SOP2) */}
              {!g.tipo_chamada && Array.isArray(analise.fases_sop1) && analise.fases_sop1.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Fases do script (SOP 1)</p>
                  <div className="space-y-1">
                    {analise.fases_sop1.map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        {f.cumprida
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                          : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                        <span className="text-gray-700"><span className="font-medium">{f.fase}</span>{f.observacao ? ` — ${f.observacao}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metricas recolhidas (histórico pré-SOP2) */}
              {!g.tipo_chamada && metricas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Metricas recolhidas</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {metricas.map(([k, v]) => (
                      <div key={k} className="text-xs text-gray-600">
                        <span className="text-gray-400">{METRICAS_LABELS[k] || k}:</span> {String(v)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!g.tipo_chamada && (
                <ListaBloco titulo="Perguntas de discovery falhadas" itens={analise.perguntas_discovery_falhadas}
                  icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />} />
              )}

              {Array.isArray(analise.objeccoes) && analise.objeccoes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Objeccoes e respostas</p>
                  <div className="space-y-2">
                    {analise.objeccoes.map((o, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs space-y-1">
                        <p className="font-medium text-gray-800 flex items-start gap-1.5">
                          {o.eficaz ? <ThumbsUp className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" /> : <ThumbsDown className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />}
                          {o.objeccao}
                        </p>
                        {o.resposta_dada && <p className="text-gray-500"><span className="text-gray-400">Resposta nossa:</span> {o.resposta_dada}</p>}
                        {o.sugestao && <p className="text-indigo-600"><span className="text-indigo-400">Melhor:</span> {o.sugestao}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ListaBloco titulo="Pontos fortes" itens={analise.pontos_fortes} icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-600" />} />
                <ListaBloco titulo="Pontos fracos" itens={analise.pontos_fracos} icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />} />
              </div>

              {Array.isArray(analise.frases_eficazes) && analise.frases_eficazes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Frases a reutilizar no script</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analise.frases_eficazes.map((f, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: '#FBF7EA', color: '#8A6D1F', border: '1px solid #EAD9A8' }}>{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(analise.melhorias_script) && analise.melhorias_script.length > 0 && (
                <ListaBloco titulo="Melhorias ao script" itens={analise.melhorias_script} icon={<Sparkles className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} />} />
              )}

              {analise.proximo_passo && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2.5">
                  <p className="text-xs font-semibold text-indigo-700 mb-0.5">Proximo passo</p>
                  <p className="text-xs text-indigo-600">{analise.proximo_passo}</p>
                </div>
              )}
            </div>
          ) : g.estado === 'transcrito' ? (
            <p className="text-xs text-gray-400">Transcricao pronta. Carrega no icone ✨ para gerar a analise comercial.</p>
          ) : ['pendente', 'a_transcrever', 'a_analisar'].includes(g.estado) ? (
            <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> A processar… isto pode demorar alguns minutos.</p>
          ) : null}

          {/* Transcricao */}
          {g.transcricao && (
            <details className="group">
              <summary className="text-xs font-semibold text-gray-600 cursor-pointer flex items-center gap-1.5 select-none">
                <FileText className="w-3.5 h-3.5" /> Ver transcricao completa
              </summary>
              <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap font-sans bg-white border border-gray-200 rounded-lg p-3 max-h-72 overflow-auto">{g.transcricao}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
