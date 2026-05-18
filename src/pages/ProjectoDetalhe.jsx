import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Calendar, CheckCircle2, Circle, Plus, Trash2, Upload, X,
  Building2, Wallet, ImageIcon, FileText, Users, BarChart3, ChevronRight,
  FileDown, AlertTriangle,
} from 'lucide-react'
import { apiFetch, getToken } from '../lib/api.js'
import { Header } from '../components/layout/Header.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { PartilharAcesso } from '../components/PartilharAcesso.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const GOLD = '#C9A84C'
const BLACK = '#0d0d0d'

const FASE_COR = {
  aquisicao: '#6366f1', projeto_licenca: '#0ea5e9', demolicoes: '#ef4444',
  estrutura_especialidades: '#f59e0b', acabamentos: '#10b981', exterior_fecho: '#8b5cf6',
  comercializacao: '#ec4899', vendido: '#22c55e',
}
const FASE_ICON = {
  aquisicao: '🔑', projeto_licenca: '📐', demolicoes: '🔨', estrutura_especialidades: '⚡',
  acabamentos: '🎨', exterior_fecho: '🏠', comercializacao: '📣', vendido: '✅',
}
const ESTADO_LABEL = { pendente: 'Pendente', em_curso: 'Em curso', concluida: 'Concluída', bloqueada: 'Bloqueada' }

// Calcula se uma fase está em atraso: data_fim_prevista passou e ainda não está concluída.
function calcularAtraso(fase) {
  if (!fase || fase.estado === 'concluida') return null
  if (!fase.data_fim_prevista) return null
  const fim = new Date(fase.data_fim_prevista)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const diff = Math.floor((hoje - fim) / 86400000)
  return diff > 0 ? diff : null
}
const ESTADO_COR = {
  pendente: 'bg-gray-100 text-gray-600', em_curso: 'bg-blue-100 text-blue-700',
  concluida: 'bg-green-100 text-green-700', bloqueada: 'bg-red-100 text-red-700',
}

const TABS = [
  { key: 'resumo',       label: 'Resumo',        icon: BarChart3 },
  { key: 'fases',        label: 'Fases & Tarefas', icon: CheckCircle2 },
  { key: 'orcamento',    label: 'Orçamento',     icon: Wallet },
  { key: 'faturacao',    label: 'Faturação',     icon: Wallet },
  { key: 'fotos',        label: 'Fotos',         icon: ImageIcon },
  { key: 'documentos',   label: 'Documentos',    icon: FileText },
  { key: 'investidores', label: 'Investidores',  icon: Users },
]

export function ProjectoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isReadOnly, isInvestidor } = useAuth()
  const [resumo, setResumo] = useState(null)
  const [fases, setFases] = useState([])
  const [fotos, setFotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('resumo')

  async function load() {
    setLoading(true); setError(null)
    try {
      const [rResumo, rFases, rFotos] = await Promise.all([
        apiFetch(`/api/crm/projetos/${id}/resumo`),
        apiFetch(`/api/crm/projetos/${id}/fases`),
        apiFetch(`/api/crm/projetos/${id}/fotos`),
      ])
      if (!rResumo.ok) throw new Error('Projecto não encontrado')
      setResumo(await rResumo.json())
      if (rFases.ok) setFases((await rFases.json()).fases || [])
      if (rFotos.ok) setFotos((await rFotos.json()).fotos || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function inicializarFases() {
    if (!confirm('Criar as 8 fases de obra Fix and Flip para este projecto?')) return
    await apiFetch(`/api/crm/projetos/${id}/fases/inicializar`, { method: 'POST' })
    load()
  }

  useEffect(() => { load() }, [id])

  if (loading) return <><Header title="Projecto" subtitle="A carregar..." /><div className="p-8 text-center text-gray-400">A carregar…</div></>
  if (error || !resumo) return <><Header title="Projecto" subtitle="Erro" /><div className="p-8 text-center text-red-500">{error || 'Sem dados'}</div></>

  const { negocio, imovel, percGlobal, custoReal, orcAlocado, faseAtual } = resumo
  const semFases = fases.length === 0

  return (
    <>
      <Header
        title={negocio.movimento}
        subtitle={`${negocio.categoria || 'Projecto'}${imovel?.nome ? ' · ' + imovel.nome : ''}`}
        onRefresh={load}
        loading={loading}
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Alerta de atrasos */}
        {(() => {
          const atrasadas = fases.filter(f => calcularAtraso(f) != null)
          if (atrasadas.length === 0) return null
          const dias = atrasadas.map(f => calcularAtraso(f))
          const max = Math.max(...dias)
          return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">
                  {atrasadas.length} fase{atrasadas.length > 1 ? 's' : ''} em atraso · até {max} dia{max > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  {atrasadas.map(f => f.nome).join(' · ')}
                </p>
              </div>
            </div>
          )
        })()}

        {/* Voltar + ações topo */}
        <div className="flex items-center justify-between gap-2">
          <Link to="/projectos" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#C9A84C]">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar a Projectos
          </Link>
          <div className="flex items-center gap-2">
            {!isReadOnly && semFases && negocio.categoria === 'Fix and Flip' && (
              <Button size="sm" icon={Plus} onClick={inicializarFases}>Inicializar fases de obra</Button>
            )}
            {!isReadOnly && <PartilharAcesso entidade="negocio" entidadeId={id} nome={negocio.movimento} />}
            {!isReadOnly && (
              <Button size="sm" variant="destructive" icon={Trash2}
                onClick={async () => {
                  if (!confirm(`Apagar o projecto "${negocio.movimento}"? Esta acção apaga também fases, tarefas e fotos. Não pode ser revertida.`)) return
                  const r = await apiFetch(`/api/crm/negocios/${id}`, { method: 'DELETE' })
                  if (r.ok) navigate('/projectos')
                  else alert('Erro ao apagar')
                }}
              >Apagar</Button>
            )}
            {isInvestidor && (
              <span className="text-[10px] uppercase tracking-wider text-gray-400 ml-2">Vista de investidor</span>
            )}
          </div>
        </div>

        {/* Banner do projeto */}
        <div className="rounded-2xl p-5 sm:p-6 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${BLACK} 0%, #1a1a1a 100%)` }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-wider opacity-60">{negocio.categoria}</p>
              <h1 className="text-2xl font-bold mt-1" style={{ color: GOLD }}>{negocio.movimento}</h1>
              {imovel?.nome && <p className="text-sm opacity-70 mt-0.5">📍 {imovel.nome} {imovel.zona && `· ${imovel.zona}`}</p>}
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <BannerKpi label="Execução" value={`${percGlobal}%`} />
              <BannerKpi label="Faturação esperada" value={EUR(negocio.lucro_estimado)} />
              <BannerKpi label="Custo real obra" value={EUR(custoReal || negocio.custo_real_obra)} />
              {faseAtual && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider opacity-60">Fase actual</p>
                  <p className="text-sm font-semibold mt-1" style={{ color: GOLD }}>
                    {FASE_ICON[faseAtual.fase_key]} {faseAtual.nome}
                  </p>
                </div>
              )}
            </div>
          </div>
          {/* Barra de progresso global */}
          <div className="mt-4 w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${percGlobal}%`, background: GOLD }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto border-b border-gray-100">
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-3 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap border-b-2 transition-colors ${
                    tab === t.key ? 'border-[#C9A84C] text-[#0d0d0d]' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              )
            })}
          </div>

          <div className="p-4 sm:p-6">
            {tab === 'resumo' && <TabResumo resumo={resumo} fases={fases} />}
            {tab === 'fases' && <TabFases fases={fases} onChange={load} readOnly={isReadOnly} />}
            {tab === 'orcamento' && <TabOrcamento imovel={imovel} />}
            {tab === 'faturacao' && <TabFaturacao negocio={negocio} onChange={load} readOnly={isReadOnly} />}
            {tab === 'fotos' && <TabFotos negocioId={id} fases={fases} fotos={fotos} onChange={load} readOnly={isReadOnly} />}
            {tab === 'documentos' && <TabDocumentos negocio={negocio} fases={fases} />}
            {tab === 'investidores' && <TabInvestidores negocio={negocio} />}
          </div>
        </div>
      </div>
    </>
  )
}

function BannerKpi({ label, value }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider opacity-60">{label}</p>
      <p className="text-lg font-mono font-bold mt-0.5">{value}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: RESUMO
// ════════════════════════════════════════════════════════════════
function TabResumo({ resumo, fases }) {
  const { negocio } = resumo
  const totalTarefas = fases.reduce((s, f) => s + (f.tarefas_total || 0), 0)
  const tarefasConcluidas = fases.reduce((s, f) => s + (f.tarefas_concluidas || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dados do projecto</h3>
          <Field label="Categoria" value={negocio.categoria} />
          <Field label="Fase legacy" value={negocio.fase} />
          <Field label="Data compra" value={negocio.data_compra} />
          <Field label="Venda estimada" value={negocio.data_estimada_venda} />
          <Field label="Data venda" value={negocio.data_venda} />
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Financeiro</h3>
          <Field label="Faturação esperada" value={EUR(negocio.lucro_estimado)} accent />
          <Field label="Faturação real" value={EUR(negocio.lucro_real)} accent />
          <Field label="Custo real obra" value={EUR(negocio.custo_real_obra)} />
          <Field label="Capital total" value={EUR(negocio.capital_total)} />
          <Field label="Nº investidores" value={negocio.n_investidores} />
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Obra</h3>
          <Field label="Fases criadas" value={`${fases.length}`} />
          <Field label="Fases concluídas" value={`${fases.filter(f => f.estado === 'concluida').length} / ${fases.length}`} />
          <Field label="Tarefas concluídas" value={`${tarefasConcluidas} / ${totalTarefas}`} />
          {negocio.notas && (
            <div className="mt-2">
              <p className="text-[10px] text-gray-400 uppercase">Notas</p>
              <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2.5 mt-1">{negocio.notas}</p>
            </div>
          )}
        </div>
      </div>

      {fases.length > 0 && <GanttFases fases={fases} negocio={negocio} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// GANTT visual das fases
// ════════════════════════════════════════════════════════════════
function GanttFases({ fases, negocio }) {
  // Calcular range temporal (do mais cedo previsto ao mais tarde previsto/real)
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
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
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

  // Marcas de meses no eixo
  const marcas = []
  const start = new Date(minT)
  start.setDate(1)
  for (let t = start.getTime(); t <= maxT; ) {
    marcas.push(t)
    const d = new Date(t); d.setMonth(d.getMonth() + 1); t = d.getTime()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Cronograma Gantt</h3>

      {/* Header com meses */}
      <div className="hidden sm:block relative h-6 mb-2 ml-44">
        {marcas.map((t, i) => (
          <div key={i} className="absolute top-0 text-[9px] text-gray-400" style={{ left: `${((t - minT) / range) * 100}%` }}>
            {fmtMes(t)}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {fases.map(f => {
          const cor = ['#6366f1','#0ea5e9','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#22c55e'][f.ordem] || '#6b7280'
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
                <p className="text-xs font-medium text-gray-700 truncate">{f.nome}</p>
                <p className="text-[10px] text-gray-400">{f.perc_execucao || 0}%</p>
              </div>
              <div className="relative flex-1 h-6 bg-gray-50 rounded overflow-hidden">
                {/* Marcas de mês */}
                {marcas.map((t, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${((t - minT) / range) * 100}%` }} />
                ))}
                {/* Barra previsto */}
                {hasPrev && (
                  <div className="absolute top-1 h-2 rounded opacity-40" style={{ left: `${prevLeft}%`, width: `${prevWidth}%`, background: cor }} />
                )}
                {/* Barra real */}
                {hasReal && (
                  <div className="absolute top-3 h-2 rounded" style={{ left: `${realLeft}%`, width: `${realWidth}%`, background: cor }} />
                )}
                {/* Linha "hoje" */}
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

function Field({ label, value, accent }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${accent ? 'text-[#0d0d0d] font-mono' : 'text-gray-700'}`}>{value || '—'}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: FASES & TAREFAS
// ════════════════════════════════════════════════════════════════
function TabFases({ fases, onChange, readOnly }) {
  if (fases.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-8">Sem fases de obra criadas. Inicializa-as no topo da página.</p>
  }
  return (
    <div className="space-y-3">
      {fases.map(f => <FaseAccordion key={f.id} fase={f} onChange={onChange} readOnly={readOnly} />)}
    </div>
  )
}

function FaseAccordion({ fase, onChange, readOnly }) {
  const [open, setOpen] = useState(fase.estado === 'em_curso')
  const [novaTarefa, setNovaTarefa] = useState('')
  const cor = FASE_COR[fase.fase_key] || '#6366f1'
  const icon = FASE_ICON[fase.fase_key] || '🛠️'
  const diasAtraso = calcularAtraso(fase)

  async function setEstado(estado) {
    await apiFetch(`/api/crm/projetos/fases/${fase.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, ...(estado === 'em_curso' && !fase.data_inicio_real ? { data_inicio_real: new Date().toISOString().slice(0, 10) } : {}), ...(estado === 'concluida' ? { data_fim_real: new Date().toISOString().slice(0, 10), perc_execucao: 100 } : {}) }),
    })
    onChange()
  }
  async function setCampo(campo, valor) {
    await apiFetch(`/api/crm/projetos/fases/${fase.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
    onChange()
  }
  async function toggleTarefa(t) {
    await apiFetch(`/api/crm/projetos/tarefas/${t.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluida: t.concluida ? 0 : 1 }),
    })
    onChange()
  }
  async function adicionarTarefa() {
    if (!novaTarefa.trim()) return
    await apiFetch(`/api/crm/projetos/fases/${fase.id}/tarefas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao: novaTarefa.trim() }),
    })
    setNovaTarefa('')
    onChange()
  }
  async function apagarTarefa(t) {
    if (!confirm(`Apagar tarefa "${t.descricao}"?`)) return
    await apiFetch(`/api/crm/projetos/tarefas/${t.id}`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3 flex-1 text-left">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: `${cor}15` }}>{icon}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">{fase.nome}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_COR[fase.estado] || 'bg-gray-100 text-gray-600'}`}>
                {ESTADO_LABEL[fase.estado] || fase.estado}
              </span>
              {diasAtraso != null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 inline-flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" /> {diasAtraso}d atraso
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 max-w-[200px] bg-gray-100 rounded-full h-1.5">
                <div className="h-full rounded-full" style={{ width: `${fase.perc_execucao || 0}%`, background: cor }} />
              </div>
              <span className="text-[10px] text-gray-500 font-mono">{fase.perc_execucao || 0}%</span>
              <span className="text-[10px] text-gray-400">{fase.tarefas_concluidas}/{fase.tarefas_total} tarefas</span>
              {fase.fotos_count > 0 && <span className="text-[10px] text-gray-400">📷 {fase.fotos_count}</span>}
            </div>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && readOnly && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-[10px] text-gray-500 uppercase block">Início previsto</span><span className="text-gray-700">{fase.data_inicio_prevista || '—'}</span></div>
            <div><span className="text-[10px] text-gray-500 uppercase block">Fim previsto</span><span className="text-gray-700">{fase.data_fim_prevista || '—'}</span></div>
            <div><span className="text-[10px] text-gray-500 uppercase block">Início real</span><span className="text-gray-700">{fase.data_inicio_real || '—'}</span></div>
            <div><span className="text-[10px] text-gray-500 uppercase block">Fim real</span><span className="text-gray-700">{fase.data_fim_real || '—'}</span></div>
          </div>
          {fase.tarefas?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Tarefas ({fase.tarefas_concluidas}/{fase.tarefas_total})</p>
              <div className="space-y-1.5">
                {fase.tarefas.map(t => (
                  <div key={t.id} className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-2 border border-gray-100">
                    {t.concluida ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4 text-gray-300" />}
                    <span className={`flex-1 text-xs ${t.concluida ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.descricao}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {fase.notas && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Notas</p>
              <p className="text-xs text-gray-700 bg-white rounded-lg p-2.5 border border-gray-100">{fase.notas}</p>
            </div>
          )}
        </div>
      )}
      {open && !readOnly && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
          {/* Estado + datas + orçamento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Estado</label>
              <select value={fase.estado} onChange={e => setEstado(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
                {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">% Execução</label>
              <input type="number" min={0} max={100} value={fase.perc_execucao || 0}
                onBlur={e => setCampo('perc_execucao', parseInt(e.target.value) || 0)}
                onChange={e => setCampo('perc_execucao', parseInt(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Responsável</label>
              <input type="text" defaultValue={fase.responsavel || ''}
                onBlur={e => e.target.value !== (fase.responsavel || '') && setCampo('responsavel', e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" placeholder="Ex: João Abreu" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Início previsto</label>
              <input type="date" defaultValue={fase.data_inicio_prevista || ''} onBlur={e => setCampo('data_inicio_prevista', e.target.value || null)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Fim previsto</label>
              <input type="date" defaultValue={fase.data_fim_prevista || ''} onBlur={e => setCampo('data_fim_prevista', e.target.value || null)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Orçamento alocado (€)</label>
              <input type="number" defaultValue={fase.orcamento_alocado || 0} onBlur={e => setCampo('orcamento_alocado', parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            </div>
          </div>

          {/* Tarefas */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Tarefas</p>
            <div className="space-y-1.5 mb-2">
              {(fase.tarefas || []).map(t => (
                <div key={t.id} className="flex items-center gap-2 group bg-white rounded-lg px-2.5 py-2 border border-gray-100">
                  <button onClick={() => toggleTarefa(t)} className="flex-shrink-0">
                    {t.concluida
                      ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                      : <Circle className="w-4 h-4 text-gray-300 hover:text-gray-500" />
                    }
                  </button>
                  <span className={`flex-1 text-xs ${t.concluida ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.descricao}</span>
                  {t.deadline && <span className="text-[10px] text-gray-400">{t.deadline}</span>}
                  <button onClick={() => apagarTarefa(t)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {(fase.tarefas || []).length === 0 && <p className="text-[11px] text-gray-400 italic">Sem tarefas.</p>}
            </div>
            <div className="flex gap-2">
              <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionarTarefa()}
                placeholder="Nova tarefa..."
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white" />
              <Button size="sm" icon={Plus} onClick={adicionarTarefa} disabled={!novaTarefa.trim()}>Adicionar</Button>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Notas da fase</label>
            <textarea defaultValue={fase.notas || ''} onBlur={e => e.target.value !== (fase.notas || '') && setCampo('notas', e.target.value)}
              rows={2} placeholder="Anotações, riscos, decisões..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: ORÇAMENTO
// ════════════════════════════════════════════════════════════════
function TabOrcamento({ imovel }) {
  if (!imovel) return <p className="text-sm text-gray-500">Este projecto não tem imóvel associado. Liga um imóvel ao negócio para usar o orçamento detalhado de obra.</p>
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">O orçamento detalhado de obra (25 secções, IVA reduzido ARU, MO por dia, retenções IRS) está ligado ao imóvel <strong>{imovel.nome}</strong>.</p>
      <div className="flex gap-2">
        <Link to={`/crm?imovelId=${imovel.id}&tab=obra`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d0d0d] text-[#C9A84C] text-sm font-medium hover:bg-[#1a1a1a]">
          <Building2 className="w-4 h-4" /> Abrir orçamento no CRM
        </Link>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: FATURAÇÃO (tranches do negócio)
// ════════════════════════════════════════════════════════════════
function TabFaturacao({ negocio, onChange, readOnly }) {
  let pags = []
  try { pags = typeof negocio.pagamentos_faseados === 'string' ? JSON.parse(negocio.pagamentos_faseados || '[]') : (negocio.pagamentos_faseados || []) } catch {}
  const total = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const recebido = pags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const pct = total > 0 ? Math.round((recebido / total) * 100) : 0

  const [novaT, setNovaT] = useState({ descricao: '', valor: '', data: '' })
  const [saving, setSaving] = useState(false)

  async function confirmar(idx) {
    if (!confirm(`Confirmar recebimento desta tranche?`)) return
    await apiFetch(`/api/crm/negocios/${negocio.id}/confirmar-pagamento`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trancheIndex: idx }),
    })
    onChange()
  }

  async function adicionarTranche(e) {
    e?.preventDefault()
    if (!novaT.descricao.trim() || !novaT.valor) return
    setSaving(true)
    const novasPags = [...pags, {
      descricao: novaT.descricao.trim(),
      valor: parseFloat(novaT.valor) || 0,
      data: novaT.data || '',
      recebido: false,
    }]
    await apiFetch(`/api/crm/negocios/${negocio.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagamentos_faseados: JSON.stringify(novasPags), pagamento_em_falta: 1 }),
    })
    setNovaT({ descricao: '', valor: '', data: '' })
    setSaving(false)
    onChange()
  }

  async function apagarTranche(idx) {
    if (!confirm(`Apagar a tranche "${pags[idx].descricao || `Tranche ${idx + 1}`}"?`)) return
    const novasPags = pags.filter((_, i) => i !== idx)
    const novoTotal = novasPags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
    const novoRecebido = novasPags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
    await apiFetch(`/api/crm/negocios/${negocio.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagamentos_faseados: JSON.stringify(novasPags),
        lucro_real: Math.round(novoRecebido * 100) / 100,
        pagamento_em_falta: novasPags.some(p => !p.recebido) ? 1 : 0,
      }),
    })
    onChange()
  }

  return (
    <div className="space-y-3">
      {pags.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-2.5">
              <div className="h-full rounded-full bg-gradient-to-r from-[#C9A84C] to-green-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-mono font-semibold text-gray-700">{EUR(recebido)} / {EUR(total)}</span>
          </div>
          {pags.map((p, idx) => (
            <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border group ${p.recebido ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'}`}>
              {p.recebido ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4 text-gray-300" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{p.descricao || `Tranche ${idx + 1}`}</p>
                <p className="text-[10px] text-gray-400">{p.data || 'Sem data'}</p>
              </div>
              <span className="text-sm font-mono font-semibold text-gray-700">{EUR(p.valor)}</span>
              {!readOnly && !p.recebido && <Button size="sm" variant="success" onClick={() => confirmar(idx)}>Confirmar</Button>}
              {!readOnly && (
                <button onClick={() => apagarTranche(idx)} title="Apagar tranche"
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </>
      ) : (
        <p className="text-sm text-gray-500 mb-3">{readOnly ? 'Sem tranches definidas.' : 'Sem tranches definidas. Adiciona a primeira abaixo.'}</p>
      )}

      {/* Form inline: adicionar tranche */}
      {!readOnly && <form onSubmit={adicionarTranche} className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Nova tranche</p>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input type="text" value={novaT.descricao} onChange={e => setNovaT({ ...novaT, descricao: e.target.value })}
            placeholder="Ex: Sinal, 2ª prestação, Final..." className="sm:col-span-5 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
          <input type="number" step="0.01" value={novaT.valor} onChange={e => setNovaT({ ...novaT, valor: e.target.value })}
            placeholder="€" className="sm:col-span-3 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white font-mono" />
          <input type="date" value={novaT.data} onChange={e => setNovaT({ ...novaT, data: e.target.value })}
            className="sm:col-span-3 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
          <button type="submit" disabled={!novaT.descricao.trim() || !novaT.valor || saving}
            className="sm:col-span-1 px-3 py-1.5 rounded-lg bg-[#0d0d0d] text-[#C9A84C] text-sm hover:bg-[#1a1a1a] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </form>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: FOTOS
// ════════════════════════════════════════════════════════════════
function TabFotos({ negocioId, fases, fotos, onChange, readOnly }) {
  const [faseSel, setFaseSel] = useState(fases[0]?.id || null)
  const [tipoSel, setTipoSel] = useState('durante')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  async function upload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !faseSel) return
    setUploading(true)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('fotos', f))
      fd.append('tipo', tipoSel)
      const token = await getToken().catch(() => null)
      const r = await fetch(`/api/crm/projetos/fases/${faseSel}/fotos`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: fd,
      })
      if (!r.ok) throw new Error('Erro upload')
      onChange()
    } catch (err) { alert(err.message) }
    finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  async function apagarFoto(fotoId) {
    if (!confirm('Apagar esta foto?')) return
    await apiFetch(`/api/crm/projetos/fotos/${fotoId}`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="bg-gray-50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Fase</label>
            <select value={faseSel || ''} onChange={e => setFaseSel(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
              {fases.map(f => <option key={f.id} value={f.id}>{FASE_ICON[f.fase_key]} {f.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Tipo</label>
            <select value={tipoSel} onChange={e => setTipoSel(e.target.value)} className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
              <option value="antes">Antes</option>
              <option value="durante">Durante</option>
              <option value="depois">Depois</option>
            </select>
          </div>
          <div className="self-end">
            <input ref={fileRef} type="file" multiple accept="image/*" onChange={upload} disabled={uploading || !faseSel} className="hidden" id="upload-fotos" />
            <label htmlFor="upload-fotos" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d0d0d] text-[#C9A84C] text-sm font-medium hover:bg-[#1a1a1a] cursor-pointer">
              <Upload className="w-4 h-4" /> {uploading ? 'A enviar...' : 'Carregar fotos'}
            </label>
          </div>
        </div>
      )}

      {fotos.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-12">{readOnly ? 'Sem fotos disponíveis.' : 'Sem fotos. Faz upload acima.'}</p>
      ) : (
        <FotosGaleriaPorFase fotos={fotos} onDelete={readOnly ? null : apagarFoto} />
      )}
    </div>
  )
}

function FotosGaleriaPorFase({ fotos, onDelete }) {
  const grupos = {}
  for (const f of fotos) {
    const k = `${f.fase_ordem}__${f.fase_nome}`
    if (!grupos[k]) grupos[k] = { nome: f.fase_nome, faseKey: f.fase_key, fotos: [] }
    grupos[k].fotos.push(f)
  }
  return (
    <div className="space-y-6">
      {Object.entries(grupos).map(([k, g]) => (
        <div key={k}>
          <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
            {FASE_ICON[g.faseKey]} {g.nome} <span className="text-gray-300">({g.fotos.length})</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {g.fotos.map(foto => (
              <div key={foto.id} className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                <img src={foto.url} alt={foto.legenda || ''} className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
                  style={{ background: foto.tipo === 'antes' ? '#ef444499' : foto.tipo === 'depois' ? '#22c55e99' : '#0d0d0d99', color: 'white' }}>
                  {foto.tipo}
                </div>
                {onDelete && (
                  <button onClick={() => onDelete(foto.id)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded bg-black/60 text-white hover:bg-red-600 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                {foto.legenda && <p className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] p-1 truncate">{foto.legenda}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: DOCUMENTOS (placeholder V1 — geração V2)
// ════════════════════════════════════════════════════════════════
function TabDocumentos({ negocio, fases }) {
  const [faseFichaSel, setFaseFichaSel] = useState(fases[0]?.id || '')

  const tipos = [
    { key: 'relatorio', nome: 'Relatório de Acompanhamento de Obra', desc: 'Executivo mensal para investidores: cronograma, orçamento vs real, fotos recentes, próximos passos.', url: `/api/crm/projetos/${negocio.id}/pdf/relatorio` },
    { key: 'memoria', nome: 'Memória Descritiva de Acabamentos', desc: 'Auto-gerada a partir do orçamento de obra do imóvel (acabamentos, garantias, ensaios) — pré-venda.', url: `/api/crm/projetos/${negocio.id}/pdf/memoria` },
    { key: 'saida', nome: 'Relatório de Saída / Distribuição CAEP', desc: 'Capital investido vs distribuído por investidor, ROI, TIR anualizada.', url: `/api/crm/projetos/${negocio.id}/pdf/saida` },
  ]

  async function abrirPDF(url) {
    try {
      const token = await getToken().catch(() => null)
      window.open(`${url}${token ? `?token=${token}` : ''}`, '_blank')
    } catch (e) { alert('Erro: ' + e.message) }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 mb-3">Documentos gerados em PDF com layout institucional Somnium Properties.</p>

      {/* Ficha por fase */}
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">Ficha de Acompanhamento de Obra</p>
            <p className="text-[11px] text-gray-500 mt-0.5">1 página A4 por fase. KPIs, % execução, fotos antes/depois, tarefas concluídas.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <select value={faseFichaSel} onChange={e => setFaseFichaSel(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white">
            <option value="">Escolhe uma fase…</option>
            {fases.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <button onClick={() => faseFichaSel && abrirPDF(`/api/crm/projetos/${negocio.id}/pdf/ficha/${faseFichaSel}`)}
            disabled={!faseFichaSel}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#0d0d0d] text-[#C9A84C] hover:bg-[#1a1a1a] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Gerar PDF
          </button>
        </div>
      </div>

      {tipos.map(t => (
        <div key={t.key} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">{t.nome}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{t.desc}</p>
          </div>
          <button onClick={() => abrirPDF(t.url)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#0d0d0d] text-[#C9A84C] hover:bg-[#1a1a1a] inline-flex items-center gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Gerar PDF
          </button>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: INVESTIDORES
// ════════════════════════════════════════════════════════════════
function TabInvestidores({ negocio }) {
  let ids = []
  try { ids = typeof negocio.investidor_ids === 'string' ? JSON.parse(negocio.investidor_ids || '[]') : (negocio.investidor_ids || []) } catch {}
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Nº investidores" value={negocio.n_investidores || ids.length || 0} />
        <Field label="Capital total" value={EUR(negocio.capital_total)} accent />
        <Field label="Quota Somnium" value={`${(negocio.quota_somnium || 0)}%`} />
        <Field label="Categoria" value={negocio.categoria} />
      </div>
      {negocio.categoria === 'CAEP' || ids.length > 0 ? (
        <p className="text-xs text-gray-500 mt-3">Vista detalhada por investidor + distribuições previstas chegam na V2 (ligação a /investidores).</p>
      ) : (
        <p className="text-xs text-gray-500 mt-3">Este projecto não está marcado como CAEP. Para apresentar a investidores passivos, muda a categoria para CAEP.</p>
      )}
    </div>
  )
}
