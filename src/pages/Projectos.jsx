import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Filter, LayoutGrid, List as ListIcon, ChevronRight, AlertTriangle, TrendingUp, Briefcase, Calendar as CalendarIcon, Search, Sparkles } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { apiFetch } from '../lib/api.js'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Input, Select } from '../components/ui/Input.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)

const CAT_COLORS = {
  'Wholesalling':         '#6366f1',
  'Mediação Imobiliária': '#10b981',
  'CAEP':                 '#f59e0b',
  'Fix and Flip':         '#ef4444',
}
const CATEGORIAS = ['Wholesalling', 'CAEP', 'Mediação Imobiliária', 'Fix and Flip']

// Modelos de negócio com ícone + descrição (para tabs visuais)
const MODELOS_NEGOCIO = [
  { key: '',                       nome: 'Todos',                icon: '📋', desc: 'Todos os modelos de negócio' },
  { key: 'Fix and Flip',           nome: 'Fix and Flip',         icon: '🔨', desc: 'Reabilitação completa' },
  { key: 'CAEP',                   nome: 'CAEP',                 icon: '🤝', desc: 'Contrato de Associação em Participação' },
  { key: 'Mediação Imobiliária',   nome: 'Mediação',             icon: '🏘️', desc: 'Intermediação' },
  { key: 'Wholesalling',           nome: 'Wholesalling',         icon: '⚡', desc: 'Finder fee' },
]

// Fases do Kanban — paleta sofisticada Somnium (gold + dark + acentos elegantes)
const FASES_KANBAN = [
  { key: 'aquisicao',                nome: 'Aquisição',                  icon: '🔑', cor: '#475569' },  // slate (cálculo)
  { key: 'projeto_licenca',          nome: 'Projeto & Licença',          icon: '📐', cor: '#1F4E5F' },  // teal escuro (técnico)
  { key: 'demolicoes',               nome: 'Demolições',                 icon: '🔨', cor: '#7C2D40' },  // vinho (transformação)
  { key: 'estrutura_especialidades', nome: 'Estrutura & Especialidades', icon: '⚡', cor: '#5F4D20' },  // gold-800 (base)
  { key: 'acabamentos',              nome: 'Acabamentos',                icon: '🎨', cor: '#C9A84C' },  // brand gold (brilho)
  { key: 'exterior_fecho',           nome: 'Exterior & Fecho',           icon: '🏠', cor: '#D5B65A' },  // gold-400 (final)
  { key: 'comercializacao',          nome: 'Comercialização',            icon: '📣', cor: '#866B2D' },  // gold-700 (venda)
  { key: 'vendido',                  nome: 'Vendido',                    icon: '✅', cor: '#0d0d0d' },  // brand dark (sucesso)
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

  // UX13: Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
      if (e.key === 'n' && !isReadOnly) { e.preventDefault(); setEditing({}) }
      else if (e.key === '/') {
        e.preventDefault()
        document.querySelector('input[placeholder^="Pesquisar"]')?.focus()
      }
      else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        document.querySelector('input[placeholder^="Pesquisar"]')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isReadOnly])

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

        {/* Tabs de modelo de negócio — em série no topo */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-thin">
          {MODELOS_NEGOCIO.map(m => {
            const contagem = m.key === ''
              ? lista.length
              : lista.filter(n => n.categoria === m.key).length
            const ativo = filterCat === m.key
            const corCat = CAT_COLORS[m.key]
            return (
              <button key={m.key || 'todos'} onClick={() => setFilterCat(m.key)}
                title={m.desc}
                className={`group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all border-2 shadow-xs
                  ${ativo
                    ? 'bg-brand-dark border-brand-dark text-brand-gold shadow-md'
                    : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-neutral-300 hover:border-gray-300 dark:hover:border-neutral-600 hover:-translate-y-0.5'}`}>
                <span className="text-lg leading-none">{m.icon}</span>
                <div className="text-left">
                  <p className={`text-sm font-semibold leading-tight ${ativo ? 'text-brand-gold' : 'text-gray-900 dark:text-neutral-100'}`}>{m.nome}</p>
                  <p className={`text-[10px] leading-tight uppercase tracking-widest font-semibold mt-0.5 ${ativo ? 'text-brand-gold/60' : 'text-gray-400 dark:text-neutral-500'}`}>
                    {contagem} projecto{contagem !== 1 ? 's' : ''}
                  </p>
                </div>
                {corCat && (
                  <span className="ml-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: ativo ? '#C9A84C' : corCat }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {!isReadOnly && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Novo Projecto</Button>}
            <Link to="/projectos/calendario">
              <Button variant="secondary" size="md" icon={CalendarIcon}>Calendário</Button>
            </Link>
            <div className="inline-flex bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg p-0.5 shadow-xs">
              <button onClick={() => setView('kanban')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${view === 'kanban' ? 'bg-brand-dark text-brand-gold shadow-xs' : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'}`}>
                <LayoutGrid className="w-3.5 h-3.5" /> Kanban
              </button>
              <button onClick={() => setView('lista')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${view === 'lista' ? 'bg-brand-dark text-brand-gold shadow-xs' : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'}`}>
                <ListIcon className="w-3.5 h-3.5" /> Lista
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              size="sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar... ( / )"
              prefix={<Search className="w-3.5 h-3.5" />}
              className="w-48"
            />
            <Button
              variant={filterAtraso ? 'destructive' : 'secondary'}
              size="sm"
              icon={AlertTriangle}
              onClick={() => setFilterAtraso(!filterAtraso)}
            >Só atrasados</Button>
          </div>
        </div>

        {editing !== null && <ProjectoForm item={editing} onSave={save} onCancel={() => setEditing(null)} />}

        {/* Portfolio overview — KPIs Fix and Flip agregados */}
        {portfolio?.totais && (
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-dark via-brand-dark-light to-brand-dark-700 rounded-2xl p-5 sm:p-6 text-white shadow-lg">
            {/* Acento dourado decorativo */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="relative flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-gold/15 border border-brand-gold/30 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-brand-gold" />
                </div>
                <div>
                  <h2 className="text-overline uppercase tracking-widest font-semibold text-brand-gold">Portfolio</h2>
                  <p className="text-sm font-semibold text-white">Fix and Flip · Vista agregada</p>
                </div>
              </div>
              {!isReadOnly && (
                <button onClick={async () => {
                  setPredicoesLoading(true)
                  try {
                    const r = await apiFetch('/api/crm/projetos/portfolio/ia-predicoes')
                    if (r.ok) setPredicoes(await r.json())
                  } finally { setPredicoesLoading(false) }
                }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-gold border border-brand-gold/40 bg-brand-gold/5 hover:bg-brand-gold/15 hover:border-brand-gold transition-all shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" /> {predicoesLoading ? 'A analisar...' : 'Análise IA'}
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

        {/* KPIs por categoria — design refinado */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(kpis?.categorias ?? []).map(c => (
            <Card key={c.categoria} variant="default" padding="md" hover>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: CAT_COLORS[c.categoria] ?? '#6366f1' }} />
                <span className="text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold truncate">{c.categoria}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-neutral-100">
                {c.count} <span className="text-sm font-normal text-gray-400 dark:text-neutral-500">projecto{c.count !== 1 ? 's' : ''}</span>
              </p>
              <div className="mt-2 space-y-0.5">
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">{EUR(c.lucroEst)} esperado</p>
                {c.lucroReal > 0 && <p className="text-[10px] text-green-600 dark:text-green-400 font-mono">{EUR(c.lucroReal)} recebido</p>}
              </div>
            </Card>
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
    <div className="min-w-0">
      <p className="text-overline uppercase tracking-widest text-gray-400 font-semibold">{label}</p>
      <p className={`text-2xl font-mono font-bold mt-1 truncate ${accent ? 'text-brand-gold' : green ? 'text-green-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-caption text-gray-500 mt-0.5 truncate">{sub}</p>}
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
              <div className="rounded-t-xl px-3 py-2.5 flex items-center justify-between bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 border-b-0"
                style={{ borderTop: `3px solid ${col.cor}` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{col.icon}</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-neutral-200 truncate">{col.nome}</span>
                </div>
                <Badge tone="gray" size="xs" className="font-mono">{cards.length}</Badge>
              </div>
              <div className={`rounded-b-xl p-2 min-h-[400px] space-y-2 border-x border-b transition-colors ${
                isOver
                  ? 'bg-brand-gold/10 border-brand-gold dark:bg-brand-gold/10'
                  : 'bg-gray-50/50 dark:bg-neutral-900/50 border-gray-200 dark:border-neutral-800'
              }`}>
                {cards.length === 0 && (
                  <p className="text-center text-overline text-gray-300 dark:text-neutral-600 py-6 uppercase tracking-widest">{isOver ? 'Soltar aqui' : 'Vazio'}</p>
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
      className={`group relative bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-3 cursor-pointer
        hover:shadow-md hover:border-brand-gold/50 hover:-translate-y-0.5
        transition-all duration-200
        ${isDragging ? 'opacity-40 scale-95 rotate-1' : ''}
        ${podeArrastar ? 'cursor-grab active:cursor-grabbing' : ''}`}
      title={podeArrastar ? 'Arrastar para mover entre fases' : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100 line-clamp-2 flex-1 leading-snug">{n.movimento}</h3>
        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: CAT_COLORS[n.categoria] ?? '#6366f1' }} title={n.categoria} />
      </div>
      {n.imovelNome && (
        <p className="text-caption text-gray-500 dark:text-neutral-400 truncate mb-2 flex items-center gap-1">
          <span className="opacity-60">📍</span> {n.imovelNome}
        </p>
      )}

      {info?.diasAtrasoMax > 0 && (
        <div className="mb-2">
          <Badge tone="red" size="xs" icon={AlertTriangle}>{info.diasAtrasoMax}d atraso</Badge>
        </div>
      )}

      {isFF && info && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 mb-1">
            <span>{info.concluidas}/{info.totalFases} fases</span>
            <span className="font-mono font-bold text-gray-700 dark:text-neutral-200 normal-case tracking-normal text-xs">{info.percGlobal}%</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-dark transition-all duration-300" style={{ width: `${info.percGlobal}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-neutral-800">
        <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">{EUR(n.lucroEstimado)}</span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-neutral-600 group-hover:text-brand-gold group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// LISTA (fallback)
// ════════════════════════════════════════════════════════════════
function ListaProjetos({ projectos, fasesInfo, onCardClick }) {
  return (
    <Card padding="none" className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-neutral-900/50">
          <tr className="border-b border-gray-200 dark:border-neutral-800">
            <th className="text-left py-3 px-4 text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">Projecto</th>
            <th className="text-left py-3 px-4 text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">Categoria</th>
            <th className="text-left py-3 px-4 text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">Imóvel</th>
            <th className="text-left py-3 px-4 text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">Fase actual</th>
            <th className="text-right py-3 px-4 text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">% Exec.</th>
            <th className="text-right py-3 px-4 text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">Fat. esperada</th>
            <th className="text-right py-3 px-4 text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">Fat. real</th>
          </tr>
        </thead>
        <tbody>
          {projectos.map(n => {
            const info = fasesInfo[n.id]
            const faseNome = info?.faseAtualKey
              ? FASES_KANBAN.find(f => f.key === info.faseAtualKey)?.nome
              : n.fase || '—'
            const cat = n.categoria
            const corCat = CAT_COLORS[cat] ?? '#6366f1'
            return (
              <tr key={n.id} onClick={() => onCardClick(n.id)}
                className="border-b border-gray-100 dark:border-neutral-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors group">
                <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-neutral-100">
                  <span className="flex items-center gap-2">
                    {n.movimento}
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-neutral-600 group-hover:text-brand-gold transition-colors opacity-0 group-hover:opacity-100" />
                  </span>
                </td>
                <td className="py-2.5 px-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: corCat + '20', color: corCat }}>{cat}</span>
                </td>
                <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-neutral-400">{n.imovelNome || '—'}</td>
                <td className="py-2.5 px-4 text-xs text-gray-700 dark:text-neutral-300">{faseNome}</td>
                <td className="py-2.5 px-4 text-right text-xs font-mono text-gray-700 dark:text-neutral-300">{info ? `${info.percGlobal}%` : '—'}</td>
                <td className="py-2.5 px-4 text-right font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{EUR(n.lucroEstimado)}</td>
                <td className="py-2.5 px-4 text-right font-mono text-green-600 dark:text-green-400 font-semibold">{n.lucroReal > 0 ? EUR(n.lucroReal) : <span className="text-gray-300 dark:text-neutral-700">—</span>}</td>
              </tr>
            )
          })}
          {!projectos.length && (
            <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400 dark:text-neutral-500">Sem projectos a mostrar.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
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

  return (
    <Card variant="default" padding="lg" className="border-2 border-brand-gold shadow-gold animate-slide-down">
      <h3 className="text-base font-semibold text-gray-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-brand-gold rounded-full" />
        {isNew ? 'Novo Projecto' : 'Editar Projecto'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Input
          label="Nome do Projecto *"
          value={f.movimento}
          onChange={e => set('movimento', e.target.value)}
          placeholder="Ex: M3 Eiras"
          wrapperClassName="sm:col-span-2 xl:col-span-1"
        />
        <Select label="Categoria" value={f.categoria} onChange={e => set('categoria', e.target.value)}>
          {CATEGORIAS.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Input
          type="number" label="Faturação Esperada (€)"
          value={f.lucro_estimado}
          onChange={e => set('lucro_estimado', +e.target.value)}
        />
        <Input type="date" label="Data Compra" value={f.data_compra || ''} onChange={e => set('data_compra', e.target.value)} />
        <Input type="date" label="Data Estimada Venda" value={f.data_estimada_venda || ''} onChange={e => set('data_estimada_venda', e.target.value)} />
        <div className="sm:col-span-2 xl:col-span-3">
          <label className="block text-overline uppercase tracking-widest font-semibold text-gray-500 dark:text-neutral-400 mb-1.5">Notas</label>
          <textarea
            value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 transition-colors focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 focus:outline-none resize-y" />
        </div>

        {f.categoria === 'Fix and Flip' && (
          <div className="sm:col-span-2 xl:col-span-3">
            <label className="block text-overline uppercase tracking-widest font-semibold text-gray-500 dark:text-neutral-400 mb-2">Formato</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer border-2 transition-all ${f.tipo_projeto === 'fracao_unica' ? 'border-brand-gold bg-brand-gold/5 shadow-xs' : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'}`}>
                <input type="radio" name="tipo_projeto" value="fracao_unica"
                  checked={f.tipo_projeto === 'fracao_unica'}
                  onChange={() => set('tipo_projeto', 'fracao_unica')}
                  className="mt-1 accent-brand-gold w-4 h-4" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Fração única</p>
                  <p className="text-caption text-gray-500 dark:text-neutral-400 mt-1 leading-relaxed">1 apartamento ou moradia. Cronograma simples sem subdivisões.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer border-2 transition-all ${f.tipo_projeto === 'predio' ? 'border-brand-gold bg-brand-gold/5 shadow-xs' : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'}`}>
                <input type="radio" name="tipo_projeto" value="predio"
                  checked={f.tipo_projeto === 'predio'}
                  onChange={() => set('tipo_projeto', 'predio')}
                  className="mt-1 accent-brand-gold w-4 h-4" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Prédio com várias frações</p>
                  <p className="text-caption text-gray-500 dark:text-neutral-400 mt-1 leading-relaxed">2-10 frações autónomas + áreas comuns (fachada, telhado, escadas) com cronogramas independentes.</p>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>
      {f.categoria === 'Fix and Flip' && isNew && (
        <div className="mt-4 px-4 py-3 rounded-xl bg-brand-dark text-brand-gold text-caption flex items-start gap-2">
          <span className="text-base">✨</span>
          <p>{f.tipo_projeto === 'predio'
            ? 'Ao criar este prédio, serão geradas as 8 fases-base. Depois adicionas as frações e áreas comuns — cada uma com o seu próprio cronograma.'
            : 'Ao criar este projecto, serão geradas automaticamente as 8 fases de obra com tarefas-template profissionais.'}</p>
        </div>
      )}
      <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-neutral-800">
        <Button size="lg" onClick={() => onSave(f)} disabled={!f.movimento?.trim()}>
          {isNew ? 'Criar projecto' : 'Guardar alterações'}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}
