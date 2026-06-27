/**
 * Tab de gravacoes de chamadas para a ficha do consultor.
 * Upload de audio -> transcricao (Whisper local via worker launchd) -> analise
 * comercial por Claude para optimizar os scripts comerciais.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Upload, Mic, Trash2, Loader2, FileText, Sparkles, RefreshCw,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

const ESTADO_META = {
  pendente:      { label: 'Em fila',        cls: 'bg-amber-50 text-amber-700 border-amber-200', spin: false },
  a_transcrever: { label: 'A transcrever…', cls: 'bg-blue-50 text-blue-700 border-blue-200',    spin: true },
  transcrito:    { label: 'Transcrito',     cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', spin: false },
  a_analisar:    { label: 'A analisar…',    cls: 'bg-blue-50 text-blue-700 border-blue-200',    spin: true },
  analisado:     { label: 'Analisado',      cls: 'bg-green-50 text-green-700 border-green-200',  spin: false },
  erro:          { label: 'Erro',           cls: 'bg-red-50 text-red-700 border-red-200',        spin: false },
}

const SENTIMENTO_META = {
  positivo: { label: 'Positivo', cls: 'bg-green-100 text-green-700' },
  neutro:   { label: 'Neutro',   cls: 'bg-gray-100 text-gray-600' },
  negativo: { label: 'Negativo', cls: 'bg-red-100 text-red-700' },
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

export function GravacoesTab({ consultorId, consultorNome }) {
  const [gravacoes, setGravacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [expanded, setExpanded] = useState({})
  const [busy, setBusy] = useState({})       // { [id]: 'analisar' | 'apagar' | 'retomar' }
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`)
      const data = await r.json()
      setGravacoes(Array.isArray(data) ? data : [])
    } catch { setGravacoes([]) }
    setLoading(false)
  }, [consultorId])

  useEffect(() => { if (consultorId) { setLoading(true); load() } }, [consultorId, load])

  // Polling enquanto houver gravacoes em processamento.
  const temPendentes = gravacoes.some(g => ['pendente', 'a_transcrever', 'a_analisar'].includes(g.estado))
  useEffect(() => {
    if (!temPendentes) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [temPendentes, load])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('audio', file)
      if (titulo.trim()) fd.append('titulo', titulo.trim())
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`, { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha no upload')
      setTitulo('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err) {
      alert(err.message || 'Falha no upload')
    }
    setUploading(false)
  }

  async function analisar(id) {
    setBusy(p => ({ ...p, [id]: 'analisar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/analisar`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha na analise')
      setGravacoes(p => p.map(g => g.id === id ? data : g))
    } catch (err) { alert(err.message || 'Falha na analise') }
    setBusy(p => ({ ...p, [id]: null }))
  }

  async function retomar(id) {
    setBusy(p => ({ ...p, [id]: 'retomar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/retomar`, { method: 'POST' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha') }
      await load()
    } catch (err) { alert(err.message || 'Falha') }
    setBusy(p => ({ ...p, [id]: null }))
  }

  async function apagar(id) {
    if (!confirm('Apagar esta gravacao e a respectiva analise?')) return
    setBusy(p => ({ ...p, [id]: 'apagar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}`, { method: 'DELETE' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha ao apagar') }
      setGravacoes(p => p.filter(g => g.id !== id))
    } catch (err) { alert(err.message || 'Falha ao apagar'); setBusy(p => ({ ...p, [id]: null })) }
  }

  return (
    <div className="space-y-4">
      {/* Banner de contexto */}
      <div className="flex items-start gap-3 p-3 rounded-xl border" style={{ backgroundColor: '#FAFAF8', borderColor: '#E7E3D8' }}>
        <Mic className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#C9A84C' }} />
        <p className="text-xs text-gray-600 leading-relaxed">
          Carrega a gravacao da chamada (mp3, m4a, wav…). O sistema transcreve automaticamente e gera uma
          analise comercial para optimizar os nossos scripts. A transcricao corre no computador (Whisper local).
        </p>
      </div>

      {/* Upload */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder="Titulo (opcional, ex: 1.ª chamada · objeccao preco)"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac,.mp4,.webm" onChange={handleUpload} className="hidden" id="grav-upload" />
        <label htmlFor="grav-upload"
          className={`flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
          style={{ backgroundColor: '#C9A84C', color: '#1A1A1A' }}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'A carregar…' : 'Importar gravacao'}
        </label>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">A carregar…</div>
      ) : gravacoes.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <Mic className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Sem gravacoes. Importa a primeira chamada acima.
        </div>
      ) : (
        <div className="space-y-3">
          {gravacoes.map(g => {
            const em = ESTADO_META[g.estado] || ESTADO_META.pendente
            const isOpen = !!expanded[g.id]
            const analise = g.analise && typeof g.analise === 'object' ? g.analise : null
            const dur = fmtDuracao(g.duracao_seg)
            return (
              <div key={g.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                {/* Header da gravacao */}
                <div className="flex items-center gap-3 p-3">
                  <button onClick={() => setExpanded(p => ({ ...p, [g.id]: !isOpen }))}
                    className="text-gray-400 hover:text-gray-600 shrink-0" title={isOpen ? 'Fechar' : 'Abrir'}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{g.titulo || g.ficheiro_nome || 'Gravacao'}</p>
                    <p className="text-xs text-gray-400">{fmtData(g.data_chamada)}{dur ? ` · ${dur}` : ''}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${em.cls} shrink-0`}>
                    {em.spin && <Loader2 className="w-3 h-3 animate-spin" />}
                    {em.label}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {g.estado === 'erro' && (
                      <button onClick={() => retomar(g.id)} disabled={busy[g.id]} title="Tentar de novo"
                        className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50">
                        {busy[g.id] === 'retomar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </button>
                    )}
                    {(g.estado === 'transcrito' || g.estado === 'analisado') && (
                      <button onClick={() => analisar(g.id)} disabled={busy[g.id]} title={g.estado === 'analisado' ? 'Re-analisar' : 'Analisar'}
                        className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
                        {busy[g.id] === 'analisar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      </button>
                    )}
                    <button onClick={() => apagar(g.id)} disabled={busy[g.id]} title="Apagar"
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50">
                      {busy[g.id] === 'apagar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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

                    {/* Analise comercial */}
                    {analise ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} /> Analise comercial
                          </span>
                          {analise.classificacao != null && <Estrelas n={analise.classificacao} />}
                          {analise.sentimento && SENTIMENTO_META[analise.sentimento] && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${SENTIMENTO_META[analise.sentimento].cls}`}>
                              {SENTIMENTO_META[analise.sentimento].label}
                            </span>
                          )}
                        </div>

                        {analise.resumo && <p className="text-sm text-gray-700">{analise.resumo}</p>}

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
          })}
        </div>
      )}
    </div>
  )
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
