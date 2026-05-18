/**
 * Componentes auto-contidos do detalhe do projecto.
 * Extraídos do ProjectoDetalhe.jsx para reduzir o tamanho do mega-componente.
 */
import { useState, useEffect } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

// ════════════════════════════════════════════════════════════════
// AI Assistant — Resumo IA do projecto
// ════════════════════════════════════════════════════════════════
export function AiResumoCard({ negocioId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function carregar(fresh = false) {
    setLoading(true); setError(null)
    try {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/ai-resumo${fresh ? '?fresh=1' : ''}`)
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.error || `Erro ${r.status}`)
      }
      setData(await r.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const sinalCor = {
    verde:    { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
    amarelo:  { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' },
    vermelho: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
  }[data?.sinal] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400' }

  if (!data && !loading && !error) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-brand-gold/50 p-4 text-center bg-gradient-to-br from-brand-dark/5 to-brand-gold/5">
        <Sparkles className="w-5 h-5 mx-auto text-brand-gold mb-1.5" />
        <p className="text-xs text-gray-600 mb-2">Pede uma análise rápida deste projeto à IA Somnium</p>
        <button onClick={() => carregar(false)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-dark text-brand-gold text-xs font-medium hover:bg-brand-dark-light">
          <Sparkles className="w-3.5 h-3.5" /> Gerar resumo IA
        </button>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> A pensar...
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 p-4 bg-red-50 text-center">
        <p className="text-xs text-red-700">Erro: {error}</p>
        <button onClick={() => carregar(false)} className="text-xs text-red-700 underline mt-1">Tentar de novo</button>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border-2 ${sinalCor.border} ${sinalCor.bg} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-gold" />
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Resumo IA</p>
          <span className={`w-2 h-2 rounded-full ${sinalCor.dot}`} />
          <span className={`text-[10px] font-bold uppercase ${sinalCor.text}`}>{data.sinal}</span>
        </div>
        <button onClick={() => carregar(true)} title="Regenerar"
          className="text-[10px] text-gray-400 hover:text-gray-700 inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed mb-3">{data.resumo}</p>

      {data.destaques?.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Destaques</p>
          <div className="flex flex-wrap gap-1.5">
            {data.destaques.map((d, i) => (
              <span key={i} className="px-2 py-1 rounded-md bg-white text-xs text-gray-700 border border-gray-200">{d}</span>
            ))}
          </div>
        </div>
      )}

      {data.proximos_passos?.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Próximos passos sugeridos</p>
          <ul className="space-y-1">
            {data.proximos_passos.map((p, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className="text-brand-gold font-bold">→</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[9px] text-gray-400 mt-3 text-right">
        {data.cached ? 'Cache · ' : ''}{data.modelo} · {data.ms}ms
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Gantt visual das fases
// ════════════════════════════════════════════════════════════════
export function GanttFases({ fases, negocio }) {
  const datas = []
  for (const f of fases) {
    if (f.data_inicio_prevista) datas.push(new Date(f.data_inicio_prevista))
    if (f.data_fim_prevista) datas.push(new Date(f.data_fim_prevista))
    if (f.data_inicio_real) datas.push(new Date(f.data_inicio_real))
    if (f.data_fim_real) datas.push(new Date(f.data_fim_real))
  }
  if (negocio.data_compra) datas.push(new Date(negocio.data_compra))
  if (negocio.data_estimada_venda) datas.push(new Date(negocio.data_estimada_venda))

  if (datas.length < 2) {
    return (
      <div className="bg-gray-50 dark:bg-neutral-900/50 rounded-xl p-4 border border-gray-200 dark:border-neutral-800">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cronograma</h3>
        <p className="text-xs text-gray-400">Define datas de início/fim previstos em cada fase para ver o cronograma.</p>
      </div>
    )
  }

  const minT = Math.min(...datas.map(d => d.getTime()))
  const maxT = Math.max(...datas.map(d => d.getTime()))
  const range = maxT - minT || 1
  const today = new Date().getTime()
  const todayPct = ((today - minT) / range) * 100

  const fmtMes = (t) => new Date(t).toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })
  const marcas = []
  const start = new Date(minT)
  start.setDate(1)
  for (let t = start.getTime(); t <= maxT; ) {
    marcas.push(t)
    const d = new Date(t); d.setMonth(d.getMonth() + 1); t = d.getTime()
  }

  // Paleta sofisticada Somnium (alinhada com FASE_COR)
  const CORES = ['#475569', '#1F4E5F', '#7C2D40', '#5F4D20', '#C9A84C', '#D5B65A', '#866B2D', '#0d0d0d']

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-widest mb-4">Cronograma Gantt</h3>

      <div className="hidden sm:block relative h-6 mb-2 ml-44">
        {marcas.map((t, i) => (
          <div key={i} className="absolute top-0 text-[9px] text-gray-400" style={{ left: `${((t - minT) / range) * 100}%` }}>
            {fmtMes(t)}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {fases.map(f => {
          const cor = CORES[f.ordem] || '#6b7280'
          const iniP = f.data_inicio_prevista ? new Date(f.data_inicio_prevista).getTime() : null
          const fimP = f.data_fim_prevista ? new Date(f.data_fim_prevista).getTime() : null
          const iniR = f.data_inicio_real ? new Date(f.data_inicio_real).getTime() : null
          const fimR = f.data_fim_real ? new Date(f.data_fim_real).getTime() : null
          const hasPrev = iniP && fimP && fimP > iniP
          const hasReal = iniR && (fimR || f.estado === 'em_curso')

          const prevLeft = hasPrev ? ((iniP - minT) / range) * 100 : 0
          const prevWidth = hasPrev ? Math.max(2, ((fimP - iniP) / range) * 100) : 0
          const realLeft = hasReal ? ((iniR - minT) / range) * 100 : 0
          const realEnd = fimR ? fimR : today
          const realWidth = hasReal ? Math.max(2, ((realEnd - iniR) / range) * 100) : 0

          return (
            <div key={f.id} className="flex items-center gap-2 group">
              <div className="w-40 flex-shrink-0">
                <p className="text-xs font-medium text-gray-700 dark:text-neutral-300 truncate">{f.nome}</p>
                <p className="text-[10px] text-gray-400">{f.perc_execucao || 0}%</p>
              </div>
              <div className="relative flex-1 h-6 bg-gray-50 dark:bg-neutral-800 rounded overflow-hidden">
                {marcas.map((t, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-gray-100 dark:border-neutral-700" style={{ left: `${((t - minT) / range) * 100}%` }} />
                ))}
                {hasPrev && (
                  <div className="absolute top-1 h-2 rounded opacity-40" style={{ left: `${prevLeft}%`, width: `${prevWidth}%`, background: cor }} />
                )}
                {hasReal && (
                  <div className="absolute top-3 h-2 rounded" style={{ left: `${realLeft}%`, width: `${realWidth}%`, background: cor }} />
                )}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-red-500" style={{ left: `${todayPct}%` }} title="Hoje" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-gray-400 opacity-40" /> Previsto</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-gray-700" /> Real</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-red-500" /> Hoje</span>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Tab Histórico (audit log)
// ════════════════════════════════════════════════════════════════
const AUDIT_ICONS = {
  fase: '🎯', tarefa: '✓', foto: '📷', documento: '📄', despesa: '💰',
  investidor: '👤', fracao: '🏠', negocio: '📋',
}
const AUDIT_ACAO_LABEL = {
  create: 'Criou', update: 'Atualizou', delete: 'Apagou', status_change: 'Mudou estado',
}

export function TabHistorico({ negocioId }) {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    apiFetch(`/api/crm/projetos/${negocioId}/audit?limit=200`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setEventos(d?.eventos || []))
      .finally(() => setLoading(false))
  }, [negocioId])

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">A carregar…</p>
  if (eventos.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">Sem actividade registada.</p>

  return (
    <div className="space-y-2">
      {eventos.map(e => (
        <div key={e.id} className="flex items-start gap-3 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-100 dark:border-neutral-800">
          <span className="text-base flex-shrink-0">{AUDIT_ICONS[e.entidade] || '•'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 dark:text-neutral-200">
              <span className="font-semibold">{AUDIT_ACAO_LABEL[e.acao] || e.acao}</span>
              <span className="text-gray-500 dark:text-neutral-400"> · {e.descricao || `${e.entidade} ${e.entidade_id}`}</span>
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {e.user_nome && <span className="text-[10px] text-gray-400">por {e.user_nome}</span>}
              <span className="text-[10px] text-gray-400">{new Date(e.created_at).toLocaleString('pt-PT')}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
