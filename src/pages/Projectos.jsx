import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Filter, LayoutGrid, List as ListIcon, ChevronRight, AlertTriangle, TrendingUp, Briefcase, Calendar as CalendarIcon, Search, Sparkles } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { apiFetch } from '../lib/api.js'
import { Button } from '../components/ui/Button.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)

const CAT_COLORS = {
  'Wholesalling':         '#6366f1',
  'Mediação Imobiliária': '#10b981',
  'CAEP':                 '#f59e0b',
  'Fix and Flip':         '#ef4444',
}
const CATEGORIAS = ['Wholesalling', 'CAEP', 'Mediação Imobiliária', 'Fix and Flip']

// Fases do Kanban (alinhadas com fasesFixFlip.js no backend)
const FASES_KANBAN = [
  { key: 'aquisicao',                nome: 'Aquisição',                  icon: '🔑', cor: '#6366f1' },
  { key: 'projeto_licenca',          nome: 'Projeto & Licença',          icon: '📐', cor: '#0ea5e9' },
  { key: 'demolicoes',               nome: 'Demolições',                 icon: '🔨', cor: '#ef4444' },
  { key: 'estrutura_especialidades', nome: 'Estrutura & Especialidades', icon: '⚡', cor: '#f59e0b' },
  { key: 'acabamentos',              nome: 'Acabamentos',                icon: '🎨', cor: '#10b981' },
  { key: 'exterior_fecho',           nome: 'Exterior & Fecho',           icon: '🏠', cor: '#8b5cf6' },
  { key: 'comercializacao',          nome: 'Comercialização',            icon: '📣', cor: '#ec4899' },
  { key: 'vendido',                  nome: 'Vendido',                    icon: '✅', cor: '#22c55e' },
]

// Mapa fase-macro do CRM legacy → coluna Kanban (para projetos não-Fix&Flip)
function faseLegacyParaKanban(faseLegacy) {
  if (faseLegacy === 'Vendido') return 'vendido'
  if (faseLegacy === 'Fase de venda') return 'comercializacao'
  if (faseLegacy === 'Fase de obras') return 'acabamentos'
  return 'aquisicao'
}

export function Projectos() {
  const navigate = useNavigate()
  const { role, isInvestidor, isReadOnly } = useAuth()
  const [kpis, setKpis] = useState(null)
  const [projectos, setProjectos] = useState([])
  const [fasesPorNegocio, setFasesPorNegocio] = useState({})  // negocioId → { faseAtualKey, percGlobal }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [view, setView] = useState('kanban')  // 'kanban' | 'lista'
  const [filterCat, setFilterCat] = useState(isInvestidor ? '' : 'Fix and Flip')
  const [search, setSearch] = useState('')
  const [filterAtraso, setFilterAtraso] = useState(false)
  const [portfolio, setPortfolio] = useState(null)
  const [predicoes, setPredicoes] = useState(null)
  const [predicoesLoading, setPredicoesLoading] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const safe = (p) => p.then(r => r.ok ? r.json() : null).catch(() => null)
      // Investidores/parceiros usam endpoint filtrado por acessos
      const negociosUrl = isReadOnly ? '/api/crm/projetos/meus' : '/api/crm/negocios?limit=200'
      const [k, n] = await Promise.all([
        isInvestidor ? Promise.resolve(null) : safe(apiFetch('/api/kpis/financeiro')),
        safe(apiFetch(negociosUrl)),
      ])
      if (!isInvestidor && !k) throw new Error('Erro ao carregar projectos')
      setKpis(k)
      // Normalizar para forma esperada pelo Kanban (com imovelNome, lucroEstimado, etc.)
      const rawData = n?.data ?? []
      const negocios = rawData.map(r => ({
        ...r,
        imovelNome: r.imovel_nome ?? r.imovelNome,
        lucroEstimado: r.lucro_estimado ?? r.lucroEstimado,
        lucroReal: r.lucro_real ?? r.lucroReal,
      }))
      setProjectos(negocios)
      if (isReadOnly && !kpis) {
        // Construir KPIs minimais a partir da lista (para investidor)
        const catCount = {}
        for (const x of negocios) {
          const c = x.categoria || 'Outros'
          if (!catCount[c]) catCount[c] = { categoria: c, count: 0, lucroEst: 0, lucroReal: 0 }
          catCount[c].count++
          catCount[c].lucroEst += Number(x.lucroEstimado) || 0
          catCount[c].lucroReal += Number(x.lucroReal) || 0
        }
        setKpis({ categorias: Object.values(catCount), negociosLista: negocios })
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function loadFases(negocios) {
    const ffNegocios = negocios.filter(n => n.categoria === 'Fix and Flip')
    const result = {}
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    await Promise.all(ffNegocios.map(async (n) => {
      try {
        const r = await apiFetch(`/api/crm/projetos/${n.id}/fases`)
        if (!r.ok) return
        const { fases } = await r.json()
        if (!fases || fases.length === 0) return
        const faseAtual = fases.find(f => f.estado === 'em_curso') || fases.find(f => f.estado !== 'concluida') || fases[fases.length - 1]
        const percGlobal = Math.round(fases.reduce((s, f) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
        // Calcular atraso máximo (em dias)
        let diasAtrasoMax = 0
        for (const f of fases) {
          if (f.estado === 'concluida' || !f.data_fim_prevista) continue
          const fim = new Date(f.data_fim_prevista)
          const diff = Math.floor((hoje - fim) / 86400000)
          if (diff > diasAtrasoMax) diasAtrasoMax = diff
        }
        result[n.id] = {
          faseAtualKey: faseAtual?.fase_key,
          percGlobal,
          totalFases: fases.length,
          concluidas: fases.filter(f => f.estado === 'concluida').length,
          diasAtrasoMax,
        }
      } catch {}
    }))
    setFasesPorNegocio(result)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (projectos.length > 0) loadFases(projectos) }, [projectos])
  useEffect(() => {
    apiFetch('/api/crm/projetos/portfolio/kpis')
      .then(r => r.ok ? r.json() : null)
      .then(setPortfolio)
      .catch(() => {})
  }, [])

  async function save(form) {
    try {
      const isNew = !form.id
      const url = isNew ? '/api/crm/negocios' : `/api/crm/negocios/${form.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.error || `Erro ${r.status}`) }
      setEditing(null); setError(null); load()
    } catch (e) { console.error('[saveProjecto]', e); setError(e.message) }
  }

  // Para admin: usar negociosLista (com KPIs financeiros). Para investidor: usar projectos directo.
  const lista = useMemo(() => isReadOnly ? projectos : (kpis?.negociosLista ?? []), [kpis, projectos, isReadOnly])
  const filtered = useMemo(
    () => {
      const term = search.trim().toLowerCase()
      return lista
        .filter(n => !filterCat || n.categoria === filterCat)
        .filter(n => !filterAtraso || (fasesPorNegocio[n.id]?.diasAtrasoMax || 0) > 0)
        .filter(n => !term || (n.movimento || '').toLowerCase().includes(term) || (n.imovelNome || '').toLowerCase().includes(term))
    },
    [lista, filterCat, search, filterAtraso, fasesPorNegocio]
  )

  // Agrupa por coluna Kanban
  const cardsPorColuna = useMemo(() => {
    const map = Object.fromEntries(FASES_KANBAN.map(f => [f.key, []]))
    for (const n of filtered) {
      let colKey
      if (n.categoria === 'Fix and Flip' && fasesPorNegocio[n.id]?.faseAtualKey) {
        colKey = fasesPorNegocio[n.id].faseAtualKey
      } else {
        colKey = faseLegacyParaKanban(n.fase)
      }
      if (map[colKey]) map[colKey].push(n)
    }
    return map
  }, [filtered, fasesPorNegocio])

  return (
    <>
      <Header title="Projectos" subtitle="Gestão de projectos activos por fase de obra" onRefresh={load} loading={loading} />

      <div className="p-4 sm:p-6 flex flex-col gap-4">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            {!isReadOnly && <Button icon={Plus} onClick={() => setEditing({})}>Novo Projecto</Button>}
            <Link to="/projectos/calendario"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50">
              <CalendarIcon className="w-3.5 h-3.5" /> Calendário
            </Link>
            <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
              <button onClick={() => setView('kanban')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${view === 'kanban' ? 'bg-[#0d0d0d] text-[#C9A84C]' : 'text-gray-500 hover:bg-gray-50'}`}>
                <LayoutGrid className="w-3.5 h-3.5" /> Kanban
              </button>
              <button onClick={() => setView('lista')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${view === 'lista' ? 'bg-[#0d0d0d] text-[#C9A84C]' : 'text-gray-500 hover:bg-gray-50'}`}>
                <ListIcon className="w-3.5 h-3.5" /> Lista
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar..." className="pl-8 pr-2.5 py-1.5 text-xs border rounded-lg bg-white w-44" />
            </div>
            <button onClick={() => setFilterAtraso(!filterAtraso)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1 ${filterAtraso ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <AlertTriangle className="w-3 h-3" /> Só atrasados
            </button>
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 bg-white">
              <option value="">Todas categorias</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {editing !== null && <ProjectoForm item={editing} onSave={save} onCancel={() => setEditing(null)} />}

        {/* Portfolio overview — KPIs Fix and Flip agregados */}
        {portfolio?.totais && (
          <div className="bg-gradient-to-br from-[#0d0d0d] to-[#1f1f1f] rounded-2xl p-5 text-white shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" style={{ color: '#C9A84C' }} />
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#C9A84C' }}>Portfolio Fix and Flip</h2>
              </div>
              {!isReadOnly && (
                <button onClick={async () => {
                  setPredicoesLoading(true)
                  try {
                    const r = await apiFetch('/api/crm/projetos/portfolio/ia-predicoes')
                    if (r.ok) setPredicoes(await r.json())
                  } finally { setPredicoesLoading(false) }
                }}
                  className="text-[10px] uppercase tracking-wider text-[#C9A84C] hover:text-white inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-[#C9A84C]/30">
                  <Sparkles className="w-3 h-3" /> {predicoesLoading ? 'A analisar...' : 'Análise IA'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <PortfolioKpi label="Projectos activos" value={portfolio.totais.ativos_ff} sub={`de ${portfolio.totais.total_ff} total`} />
              <PortfolioKpi label="Capital agregado" value={EUR(portfolio.totais.capital_total)} />
              <PortfolioKpi label="Lucro esperado" value={EUR(portfolio.totais.lucro_estimado_total)} accent />
              <PortfolioKpi label="Lucro realizado" value={EUR(portfolio.totais.lucro_real_total)} green />
              <PortfolioKpi label="Em curso" value={portfolio.fases?.em_curso || 0} sub="fases activas" />
            </div>
            {predicoes?.predicoes?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-[#C9A84C] mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Riscos identificados pela IA ({predicoes.predicoes.length})
                </p>
                <div className="space-y-1.5">
                  {predicoes.predicoes.map((p, i) => {
                    const corRisco = p.risco === 'alto' ? 'bg-red-500/20 border-red-400/40' : p.risco === 'medio' ? 'bg-yellow-500/20 border-yellow-400/40' : 'bg-gray-500/20 border-gray-400/40'
                    return (
                      <Link key={i} to={`/projectos/${p.projeto_id}`} className={`block rounded-lg p-2.5 border ${corRisco} hover:opacity-80`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-white">{p.projeto_nome} <span className="text-[10px] uppercase ml-1 opacity-80">{p.risco}</span></p>
                            <p className="text-[10px] text-gray-300 mt-0.5">{p.razao}</p>
                            <p className="text-[10px] text-[#C9A84C] mt-1">→ {p.acao_recomendada}</p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
            {(portfolio.topAtrasos?.length > 0 || portfolio.distribuicaoFases?.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-5 border-t border-white/10">
                {portfolio.topAtrasos?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-red-300 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Top atrasos</p>
                    <div className="space-y-1.5">
                      {portfolio.topAtrasos.slice(0, 3).map(a => (
                        <Link key={a.id} to={`/projectos/${a.negocio_id}`} className="block bg-red-500/10 hover:bg-red-500/20 rounded-lg px-2.5 py-1.5 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white">{a.movimento} · {a.nome}</span>
                            <span className="text-xs font-bold text-red-300">{a.dias_atraso}d</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {portfolio.distribuicaoFases?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Distribuição por fase actual</p>
                    <div className="space-y-1.5">
                      {portfolio.distribuicaoFases.slice(0, 4).map(d => (
                        <div key={d.fase_key} className="flex items-center justify-between bg-white/5 rounded-lg px-2.5 py-1.5">
                          <span className="text-xs text-gray-200">{d.nome}</span>
                          <span className="text-xs font-bold" style={{ color: '#C9A84C' }}>{d.projetos}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* KPIs por categoria (lista clássica) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(kpis?.categorias ?? []).map(c => (
            <div key={c.categoria} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ background: CAT_COLORS[c.categoria] ?? '#6366f1' }} />
                <span className="text-[11px] text-gray-500 font-medium truncate">{c.categoria}</span>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {c.count} <span className="text-xs font-normal text-gray-400">projecto{c.count !== 1 ? 's' : ''}</span>
              </p>
              <p className="text-xs text-indigo-600 font-mono">{EUR(c.lucroEst)} expectável</p>
              {c.lucroReal > 0 && <p className="text-[10px] text-green-600 font-mono">{EUR(c.lucroReal)} recebido</p>}
            </div>
          ))}
        </div>

        {view === 'kanban' ? (
          <KanbanBoard
            colunas={FASES_KANBAN}
            cardsPorColuna={cardsPorColuna}
            fasesInfo={fasesPorNegocio}
            readOnly={isReadOnly}
            onCardClick={(id) => navigate(`/projectos/${id}`)}
            onMoveCard={async (negocioId, faseKey) => {
              try {
                const r = await apiFetch(`/api/crm/projetos/${negocioId}/mover-fase`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ faseKey }),
                })
                if (!r.ok) {
                  const err = await r.json().catch(() => ({}))
                  alert(err.error || 'Não foi possível mover. Inicializa as fases primeiro.')
                  return
                }
                load()
              } catch (e) { alert(e.message) }
            }}
          />
        ) : (
          <ListaProjetos
            projectos={filtered}
            fasesInfo={fasesPorNegocio}
            onCardClick={(id) => navigate(`/projectos/${id}`)}
          />
        )}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// KANBAN
// ════════════════════════════════════════════════════════════════
function PortfolioKpi({ label, value, sub, accent, green }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-xl font-mono font-bold mt-0.5 ${accent ? 'text-[#C9A84C]' : green ? 'text-green-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function KanbanBoard({ colunas, cardsPorColuna, fasesInfo, onCardClick, onMoveCard, readOnly }) {
  const [dragging, setDragging] = useState(null)         // { negocioId, isFF }
  const [overCol, setOverCol] = useState(null)           // fase_key da coluna sob hover

  function onDragStart(negocio) {
    return (e) => {
      if (readOnly) { e.preventDefault(); return }
      const isFF = negocio.categoria === 'Fix and Flip'
      const hasFases = !!fasesInfo[negocio.id]
      if (!isFF || !hasFases) {
        e.preventDefault()
        return
      }
      setDragging({ negocioId: negocio.id, isFF })
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', negocio.id)
    }
  }
  function onDragEnd() { setDragging(null); setOverCol(null) }
  function onDragOver(faseKey) {
    return (e) => {
      if (!dragging) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overCol !== faseKey) setOverCol(faseKey)
    }
  }
  function onDrop(faseKey) {
    return (e) => {
      e.preventDefault()
      if (dragging) onMoveCard(dragging.negocioId, faseKey)
      setDragging(null); setOverCol(null)
    }
  }

  return (
    <div className="overflow-x-auto pb-4 -mx-4 sm:-mx-6 px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:min-w-max">
        {colunas.map(col => {
          const cards = cardsPorColuna[col.key] || []
          const isOver = overCol === col.key
          return (
            <div key={col.key} className="w-full sm:w-72 sm:flex-shrink-0"
              onDragOver={onDragOver(col.key)}
              onDragLeave={() => overCol === col.key && setOverCol(null)}
              onDrop={onDrop(col.key)}>
              <div className="rounded-t-xl px-3 py-2.5 flex items-center justify-between"
                style={{ background: `${col.cor}15`, borderTop: `3px solid ${col.cor}` }}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{col.icon}</span>
                  <span className="text-xs font-semibold text-gray-700">{col.nome}</span>
                </div>
                <span className="text-[10px] font-mono bg-white text-gray-500 px-1.5 py-0.5 rounded-full border border-gray-200">{cards.length}</span>
              </div>
              <div className={`rounded-b-xl p-2 min-h-[400px] space-y-2 border-x border-b transition-colors ${
                isOver ? 'bg-[#C9A84C]/10 border-[#C9A84C]' : 'bg-gray-50 border-gray-200'
              }`}>
                {cards.length === 0 && (
                  <p className="text-center text-[10px] text-gray-300 py-6">{isOver ? 'Solta aqui' : 'Sem projectos'}</p>
                )}
                {cards.map(n => (
                  <KanbanCard
                    key={n.id}
                    negocio={n}
                    info={fasesInfo[n.id]}
                    onClick={() => onCardClick(n.id)}
                    onDragStart={onDragStart(n)}
                    onDragEnd={onDragEnd}
                    isDragging={dragging?.negocioId === n.id}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanCard({ negocio: n, info, onClick, onDragStart, onDragEnd, isDragging, readOnly }) {
  const isFF = n.categoria === 'Fix and Flip'
  const podeArrastar = !readOnly && isFF && !!info
  return (
    <div
      draggable={podeArrastar}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 p-2.5 cursor-pointer hover:shadow-md hover:border-[#C9A84C] transition-all group ${
        isDragging ? 'opacity-40 scale-95' : ''
      } ${podeArrastar ? 'cursor-grab active:cursor-grabbing' : ''}`}
      title={podeArrastar ? 'Arrasta para mover entre fases' : undefined}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <h3 className="text-xs font-semibold text-gray-800 line-clamp-2 flex-1">{n.movimento}</h3>
        <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: CAT_COLORS[n.categoria] ?? '#6366f1' }} title={n.categoria} />
      </div>
      {n.imovelNome && <p className="text-[10px] text-gray-500 truncate mb-1.5">📍 {n.imovelNome}</p>}

      {info?.diasAtrasoMax > 0 && (
        <div className="mb-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold">
          <AlertTriangle className="w-2.5 h-2.5" /> {info.diasAtrasoMax}d atraso
        </div>
      )}

      {isFF && info && (
        <div className="mb-1.5">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
            <span>{info.concluidas}/{info.totalFases} fases</span>
            <span className="font-mono font-semibold text-gray-700">{info.percGlobal}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-full rounded-full bg-gradient-to-r from-[#C9A84C] to-[#0d0d0d]" style={{ width: `${info.percGlobal}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100">
        <span className="text-[10px] font-mono text-indigo-600 font-semibold">{EUR(n.lucroEstimado)}</span>
        <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-[#C9A84C] transition-colors" />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// LISTA (fallback)
// ════════════════════════════════════════════════════════════════
function ListaProjetos({ projectos, fasesInfo, onCardClick }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
            <th className="text-left py-2.5 px-3">Projecto</th>
            <th className="text-left py-2.5 px-3">Categoria</th>
            <th className="text-left py-2.5 px-3">Imóvel</th>
            <th className="text-left py-2.5 px-3">Fase actual</th>
            <th className="text-right py-2.5 px-3">% Execução</th>
            <th className="text-right py-2.5 px-3">Faturação Esperada</th>
            <th className="text-right py-2.5 px-3">Faturação Real</th>
          </tr>
        </thead>
        <tbody>
          {projectos.map(n => {
            const info = fasesInfo[n.id]
            const faseNome = info?.faseAtualKey
              ? FASES_KANBAN.find(f => f.key === info.faseAtualKey)?.nome
              : n.fase || '—'
            return (
              <tr key={n.id} onClick={() => onCardClick(n.id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 px-3 font-medium text-gray-800">{n.movimento}</td>
                <td className="py-2 px-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: (CAT_COLORS[n.categoria] ?? '#6366f1') + '22', color: CAT_COLORS[n.categoria] ?? '#6366f1' }}>{n.categoria}</span>
                </td>
                <td className="py-2 px-3 text-xs text-gray-500">{n.imovelNome || '—'}</td>
                <td className="py-2 px-3 text-xs text-gray-700">{faseNome}</td>
                <td className="py-2 px-3 text-right text-xs font-mono">{info ? `${info.percGlobal}%` : '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-indigo-600">{EUR(n.lucroEstimado)}</td>
                <td className="py-2 px-3 text-right font-mono text-green-600">{n.lucroReal > 0 ? EUR(n.lucroReal) : <span className="text-gray-300">—</span>}</td>
              </tr>
            )
          })}
          {!projectos.length && (
            <tr><td colSpan={7} className="py-8 text-center text-gray-400 text-xs">Sem projectos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// FORM (criar/editar projeto)
// ════════════════════════════════════════════════════════════════
function ProjectoForm({ item, onSave, onCancel }) {
  const isNew = !item.id
  const [f, setF] = useState({
    movimento: '', categoria: 'Fix and Flip', fase: 'Fase de obras',
    lucro_estimado: '', data_compra: '', data_estimada_venda: '', notas: '',
    tipo_projeto: 'fracao_unica',
    ...item,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"

  return (
    <div className="bg-white rounded-xl border-2 border-[#C9A84C] p-4 sm:p-6 shadow-md">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{isNew ? 'Novo Projecto' : 'Editar Projecto'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <div className="sm:col-span-2 xl:col-span-1">
          <label className="text-xs text-gray-500 block mb-1">Nome do Projecto *</label>
          <input value={f.movimento} onChange={e => set('movimento', e.target.value)} className={inputClass} placeholder="Ex: M3 Eiras" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Categoria</label>
          <select value={f.categoria} onChange={e => set('categoria', e.target.value)} className={inputClass}>
            {CATEGORIAS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Faturação Expectável (€)</label>
          <input type="number" value={f.lucro_estimado} onChange={e => set('lucro_estimado', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Compra</label>
          <input type="date" value={f.data_compra || ''} onChange={e => set('data_compra', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Estimada Venda</label>
          <input type="date" value={f.data_estimada_venda || ''} onChange={e => set('data_estimada_venda', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2 xl:col-span-3">
          <label className="text-xs text-gray-500 block mb-1">Notas</label>
          <textarea value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} rows={2} className={inputClass} />
        </div>

        {f.categoria === 'Fix and Flip' && (
          <div className="sm:col-span-2 xl:col-span-3">
            <label className="text-xs text-gray-500 block mb-1">Formato</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className={`flex items-start gap-2.5 p-3 rounded-lg cursor-pointer border-2 transition-colors ${f.tipo_projeto === 'fracao_unica' ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="tipo_projeto" value="fracao_unica"
                  checked={f.tipo_projeto === 'fracao_unica'}
                  onChange={() => set('tipo_projeto', 'fracao_unica')}
                  className="mt-0.5 accent-[#C9A84C]" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">Fração única</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">1 apartamento/moradia. Cronograma simples sem subdivisões.</p>
                </div>
              </label>
              <label className={`flex items-start gap-2.5 p-3 rounded-lg cursor-pointer border-2 transition-colors ${f.tipo_projeto === 'predio' ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="tipo_projeto" value="predio"
                  checked={f.tipo_projeto === 'predio'}
                  onChange={() => set('tipo_projeto', 'predio')}
                  className="mt-0.5 accent-[#C9A84C]" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">Prédio com várias frações</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">2-10 frações autónomas + áreas comuns (fachada, telhado, escadas…) com cronogramas independentes.</p>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>
      {f.categoria === 'Fix and Flip' && isNew && (
        <p className="text-[11px] text-[#C9A84C] mt-3 bg-[#0d0d0d] px-3 py-2 rounded-lg">
          {f.tipo_projeto === 'predio'
            ? '✨ Ao criar este prédio, serão geradas as 8 fases-base. Depois adicionas as frações e áreas comuns (cada uma com o seu próprio cronograma).'
            : '✨ Ao criar este projecto, serão geradas as 8 fases de obra com tarefas-template.'}
        </p>
      )}
      <div className="flex gap-3 mt-4">
        <Button size="lg" onClick={() => onSave(f)} disabled={!f.movimento?.trim()}>
          {isNew ? 'Criar' : 'Guardar'}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
