import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Circle, Plus, Trash2, Upload, X,
  Building2, Wallet, ImageIcon, FileText, Users, BarChart3, ChevronRight,
  FileDown, AlertTriangle, Sparkles, RefreshCw, Home, Layers,
  History, MessageSquare, TrendingUp, FileSpreadsheet, Pencil, Eye,
} from 'lucide-react'
import { ProjectoForm } from './Projectos.jsx'
import { apiFetch, getToken, openDocument } from '../lib/api.js'
import { Header } from '../components/layout/Header.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Input, Select, Textarea } from '../components/ui/Input.jsx'
import { Avatar } from '../components/ui/Avatar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { PartilharAcesso } from '../components/PartilharAcesso.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { AiResumoCard, GanttFases, TabHistorico } from '../components/projeto/cards.jsx'
import { useRefreshOnMutation } from '../hooks/useRefreshOnMutation.js'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const GOLD = '#C9A84C'
const BLACK = '#0d0d0d'

const FASE_COR = {
  aquisicao: '#475569',                  // slate (cálculo)
  projeto_licenca: '#1F4E5F',            // teal escuro (técnico)
  demolicoes: '#7C2D40',                 // vinho (transformação)
  estrutura_especialidades: '#5F4D20',   // gold-800 (base)
  acabamentos: '#C9A84C',                // brand gold (brilho)
  exterior_fecho: '#D5B65A',             // gold-400 (final)
  comercializacao: '#866B2D',            // gold-700 (venda)
  vendido: '#0d0d0d',                    // brand dark (sucesso)
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

const TABS_BASE = [
  { key: 'resumo',       label: 'Resumo',           icon: BarChart3 },
  { key: 'fracoes',      label: 'Frações e Áreas',  icon: Layers, predioOnly: true },
  { key: 'fases',        label: 'Fases & Tarefas',  icon: CheckCircle2 },
  { key: 'orcamento',    label: 'Orçamento',        icon: Wallet },
  { key: 'faturacao',    label: 'Faturação',        icon: Wallet },
  { key: 'forecast',     label: 'Forecast',         icon: TrendingUp },
  { key: 'fotos',        label: 'Fotos',            icon: ImageIcon },
  { key: 'documentos',   label: 'Documentos',       icon: FileText },
  { key: 'investidores', label: 'Investidores',     icon: Users },
  { key: 'historico',    label: 'Histórico',        icon: History },
]

const FRACAO_ESTADO_COR = {
  em_obra:  { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Em obra' },
  pronto:   { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pronto' },
  em_venda: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Em venda' },
  vendido:  { bg: 'bg-green-100', text: 'text-green-700', label: 'Vendido' },
}

const CATEGORIAS_COMUM = [
  { key: 'fachada',     label: 'Fachada',                icon: '🧱' },
  { key: 'telhado',     label: 'Telhado / Cobertura',    icon: '🏠' },
  { key: 'jardim',      label: 'Jardim / Pátio',         icon: '🌿' },
  { key: 'escadas',     label: 'Escadas / Caixa',        icon: '🪜' },
  { key: 'elevador',    label: 'Elevador',               icon: '🛗' },
  { key: 'instalacoes', label: 'Instalações verticais',  icon: '⚡' },
  { key: 'garagem',     label: 'Garagem / Parqueamento', icon: '🚗' },
  { key: 'outro',       label: 'Outro',                  icon: '📐' },
]

export function ProjectoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isReadOnly, isInvestidor } = useAuth()
  const [resumo, setResumo] = useState(null)
  const [fases, setFases] = useState([])
  const [fotos, setFotos] = useState([])
  const [fracoes, setFracoes] = useState([])
  const [fracaoSel, setFracaoSel] = useState(null)  // null = "Prédio inteiro"
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('resumo')
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [rResumo, rFases, rFotos, rFracoes] = await Promise.all([
        apiFetch(`/api/crm/projetos/${id}/resumo`),
        apiFetch(`/api/crm/projetos/${id}/fases`),
        apiFetch(`/api/crm/projetos/${id}/fotos`),
        apiFetch(`/api/crm/projetos/${id}/fracoes`),
      ])
      if (!rResumo.ok) throw new Error('Projecto não encontrado')
      setResumo(await rResumo.json())
      if (rFases.ok) setFases((await rFases.json()).fases || [])
      if (rFotos.ok) setFotos((await rFotos.json()).fotos || [])
      if (rFracoes.ok) setFracoes((await rFracoes.json()).fracoes || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Filtros aplicados pela fração selecionada
  const fasesFiltradas = fracaoSel === null
    ? fases
    : fases.filter(f => f.fracao_id === fracaoSel || (fracaoSel === '__comum__' && !f.fracao_id))
  const fotosFiltradas = fracaoSel === null
    ? fotos
    : fotos.filter(f => f.fracao_id === fracaoSel || (fracaoSel === '__comum__' && !f.fracao_id))

  async function inicializarFases() {
    if (!confirm('Criar as 8 fases de obra para este projecto?')) return
    const r = await apiFetch(`/api/crm/projetos/${id}/fases/inicializar`, { method: 'POST' })
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      alert('Erro ao inicializar fases: ' + (e.error || `HTTP ${r.status}`))
      return
    }
    load()
  }

  useEffect(() => { load() }, [id])
  useRefreshOnMutation(load)

  if (loading) return <><Header title="Projecto" subtitle="A carregar..." /><div className="p-8 text-center text-gray-400">A carregar…</div></>
  if (error || !resumo) return <><Header title="Projecto" subtitle="Erro" /><div className="p-8 text-center text-red-500">{error || 'Sem dados'}</div></>

  const { negocio, imovel, percGlobal, custoReal, orcAlocado, faseAtual } = resumo
  const semFases = fases.length === 0
  const isPredio = negocio.tipo_projeto === 'predio'
  // Wholesalling é cedência de posição (sem obra): esconder as abas de obra.
  const isWholesalling = negocio.categoria === 'Wholesalling'
  const TABS_OBRA_OCULTAS = new Set(['orcamento', 'forecast', 'fotos'])
  const TABS = TABS_BASE.filter(t =>
    (!t.predioOnly || isPredio) &&
    !(isWholesalling && TABS_OBRA_OCULTAS.has(t.key))
  )

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
          <Link to="/projectos" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-gold">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar a Projectos
          </Link>
          <div className="flex items-center gap-2">
            {!isReadOnly && semFases && (
              <Button size="sm" icon={Plus} onClick={inicializarFases}>{isWholesalling ? 'Inicializar fases' : 'Inicializar fases de obra'}</Button>
            )}
            <button type="button" onClick={() => openDocument(`/api/crm/projetos/${id}/export-excel`, { download: true }).catch(e => console.error('[export-excel]', e.message))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
            {!isReadOnly && <PartilharAcesso entidade="negocio" entidadeId={id} nome={negocio.movimento} />}
            {!isReadOnly && (
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>
            )}
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

        {/* Form de edição inline */}
        {editing && (
          <ProjectoForm
            item={negocio}
            onSave={async (form) => {
              setSavingEdit(true)
              try {
                const r = await apiFetch(`/api/crm/negocios/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(form),
                })
                if (!r.ok) {
                  const err = await r.json().catch(() => ({}))
                  alert(err.error || `Erro ${r.status}`)
                  return
                }
                setEditing(false)
                load()
              } finally { setSavingEdit(false) }
            }}
            onCancel={() => setEditing(false)}
          />
        )}

        {/* Chips de frações (só para projectos tipo 'predio') */}
        {isPredio && fracoes.length > 0 && (
          <FracaoChips fracoes={fracoes} fracaoSel={fracaoSel} setFracaoSel={setFracaoSel} />
        )}

        {/* Banner do projeto — refinado */}
        <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-lg bg-gradient-to-br from-brand-dark via-brand-dark-light to-brand-dark-700">
          {/* Glow dourado decorativo */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-brand-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-start sm:justify-between gap-4 mb-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="gold" variant="solid" size="sm">{negocio.categoria}</Badge>
                {negocio.tipo_projeto === 'predio' && <Badge tone="dark" variant="soft" size="sm">Prédio</Badge>}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mt-2 text-brand-gold truncate">{negocio.movimento}</h1>
              {imovel?.nome && (
                <p className="text-sm text-white/70 mt-1 flex items-center gap-1.5">
                  <span className="opacity-60">📍</span> {imovel.nome}{imovel.zona && ` · ${imovel.zona}`}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 sm:flex sm:items-start gap-4 sm:gap-7 w-full sm:w-auto">
              <BannerKpi label="Execução" value={`${percGlobal}%`} />
              <BannerKpi label="Faturação" value={EUR(negocio.lucro_estimado)} />
              {!isWholesalling && <BannerKpi label="Custo obra" value={EUR(custoReal || negocio.custo_real_obra)} />}
              {faseAtual && (
                <div className="sm:text-right col-span-2 sm:col-span-1">
                  <p className="text-overline uppercase tracking-widest text-white/50 font-semibold">Fase actual</p>
                  <p className="text-sm font-semibold mt-1 text-brand-gold truncate">
                    <span className="mr-1">{FASE_ICON[faseAtual.fase_key]}</span> {faseAtual.nome}
                  </p>
                </div>
              )}
            </div>
          </div>
          {/* Barra de progresso global */}
          <div className="relative w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-gold-400 to-brand-gold transition-all duration-500" style={{ width: `${percGlobal}%` }} />
          </div>
        </div>

        {/* Tabs */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="flex overflow-x-auto border-b border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-900/50">
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`relative px-4 py-3 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all
                    ${active
                      ? 'text-brand-dark dark:text-brand-gold'
                      : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'}`}>
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                  {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-gold rounded-t-full" />}
                </button>
              )
            })}
          </div>

          <div className="p-4 sm:p-6">
            {tab === 'resumo' && <TabResumo resumo={resumo} fases={fasesFiltradas} fracaoSel={fracaoSel} fracoes={fracoes} />}
            {tab === 'fracoes' && <TabFracoes negocioId={id} fracoes={fracoes} onChange={load} readOnly={isReadOnly} fasesComuns={fases.filter(f => !f.fracao_id)} />}
            {tab === 'fases' && <TabFases fases={fasesFiltradas} onChange={load} readOnly={isReadOnly} negocioId={id} />}
            {tab === 'orcamento' && <TabOrcamento imovel={imovel} />}
            {tab === 'faturacao' && <TabFaturacao negocio={negocio} onChange={load} readOnly={isReadOnly} />}
            {tab === 'forecast' && <TabForecast negocioId={id} />}
            {tab === 'fotos' && <TabFotos negocioId={id} fases={fasesFiltradas} fotos={fotosFiltradas} onChange={load} readOnly={isReadOnly} fracaoSel={fracaoSel} />}
            {tab === 'documentos' && <TabDocumentos negocio={negocio} imovel={imovel} fases={fases} readOnly={isReadOnly} />}
            {tab === 'investidores' && <TabInvestidores negocio={negocio} readOnly={isReadOnly} />}
            {tab === 'historico' && <TabHistorico negocioId={id} />}
          </div>
        </Card>
      </div>
    </>
  )
}

function BannerKpi({ label, value }) {
  return (
    <div className="text-left sm:text-right min-w-0">
      <p className="text-overline uppercase tracking-widest text-white/50 font-semibold">{label}</p>
      <p className="text-xl font-mono font-bold mt-1 truncate">{value}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: RESUMO
// ════════════════════════════════════════════════════════════════
function TabResumo({ resumo, fases }) {
  const { negocio } = resumo
  const isWS = negocio.categoria === 'Wholesalling'
  const totalTarefas = fases.reduce((s, f) => s + (f.tarefas_total || 0), 0)
  const tarefasConcluidas = fases.reduce((s, f) => s + (f.tarefas_concluidas || 0), 0)

  return (
    <div className="space-y-6">
      <AiResumoCard negocioId={negocio.id} />

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
          {!isWS && <Field label="Custo real obra" value={EUR(negocio.custo_real_obra)} />}
          <Field label="Capital total" value={EUR(negocio.capital_total)} />
          <Field label="Nº investidores" value={negocio.n_investidores} />
        </div>
        {!isWS && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Obra</h3>
            <Field label="Fases criadas" value={`${fases.length}`} />
            <Field label="Fases concluídas" value={`${fases.filter(f => f.estado === 'concluida').length} / ${fases.length}`} />
            <Field label="Tarefas concluídas" value={`${tarefasConcluidas} / ${totalTarefas}`} />
          </div>
        )}
      </div>

      {negocio.notas && (
        <div>
          <p className="text-[10px] text-gray-400 uppercase">Notas</p>
          <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2.5 mt-1">{negocio.notas}</p>
        </div>
      )}

      {fases.length > 0 && <GanttFases fases={fases} negocio={negocio} />}
    </div>
  )
}


function Field({ label, value, accent }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-gray-100 dark:border-neutral-800 last:border-0">
      <span className="text-caption text-gray-500 dark:text-neutral-400">{label}</span>
      <span className={`text-sm font-medium ${accent ? 'text-gray-900 dark:text-neutral-100 font-mono' : 'text-gray-700 dark:text-neutral-300'}`}>{value || '—'}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: FASES & TAREFAS
// ════════════════════════════════════════════════════════════════
function TabFases({ fases, onChange, readOnly, negocioId }) {
  if (fases.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-8">Sem fases de obra criadas. Inicializa-as no topo da página.</p>
  }
  return (
    <div className="space-y-3">
      {fases.map(f => <FaseAccordion key={f.id} fase={f} onChange={onChange} readOnly={readOnly} negocioId={negocioId} />)}
    </div>
  )
}

function FaseAccordion({ fase, onChange, readOnly, negocioId }) {
  const toast = useToast()
  const [open, setOpen] = useState(fase.estado === 'em_curso')
  const [novaTarefa, setNovaTarefa] = useState('')
  const [despesas, setDespesas] = useState([])
  const [novaDespesa, setNovaDespesa] = useState({ movimento: '', valor: '', data: '', categoria: 'Material' })
  const cor = FASE_COR[fase.fase_key] || '#6366f1'
  const icon = FASE_ICON[fase.fase_key] || '🛠️'
  const diasAtraso = calcularAtraso(fase)

  async function loadDespesas() {
    if (!negocioId) return
    const r = await apiFetch(`/api/crm/projetos/${negocioId}/despesas`)
    if (r.ok) {
      const { despesas } = await r.json()
      setDespesas(despesas.filter(d => d.fase_id === fase.id))
    }
  }
  useEffect(() => { if (open) loadDespesas() }, [open, fase.id])

  async function adicionarDespesa(e) {
    e?.preventDefault()
    if (!novaDespesa.movimento.trim() || !novaDespesa.valor) return
    const r = await apiFetch(`/api/crm/projetos/${negocioId}/despesas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fase_id: fase.id,
        movimento: novaDespesa.movimento.trim(),
        valor: parseFloat(novaDespesa.valor) || 0,
        data: novaDespesa.data || new Date().toISOString().slice(0, 10),
        categoria: novaDespesa.categoria,
      }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao adicionar despesa: ${err.error || r.status}`, 'error', 3500)
      return
    }
    setNovaDespesa({ movimento: '', valor: '', data: '', categoria: 'Material' })
    loadDespesas()
    onChange() // refresh fases (custo_real atualizado no backend)
  }

  async function apagarDespesa(id) {
    if (!confirm('Apagar esta despesa?')) return
    const r = await apiFetch(`/api/crm/projetos/despesas/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao apagar despesa: ${err.error || r.status}`, 'error', 3500)
      return
    }
    loadDespesas()
    onChange()
  }

  const custoTotalDespesas = despesas.reduce((s, d) => s + (Number(d.custo_mensal) || 0), 0)

  async function setEstado(estado) {
    const r = await apiFetch(`/api/crm/projetos/fases/${fase.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, ...(estado === 'em_curso' && !fase.data_inicio_real ? { data_inicio_real: new Date().toISOString().slice(0, 10) } : {}), ...(estado === 'concluida' ? { data_fim_real: new Date().toISOString().slice(0, 10), perc_execucao: 100 } : {}) }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao mudar estado: ${err.error || r.status}`, 'error', 3500)
      return
    }
    onChange()
  }
  async function setCampo(campo, valor) {
    const r = await apiFetch(`/api/crm/projetos/fases/${fase.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
    if (r.ok) toast?.('Guardado', 'success', 1500)
    else toast?.('Erro ao guardar', 'error')
    onChange()
  }
  async function toggleTarefa(t) {
    const r = await apiFetch(`/api/crm/projetos/tarefas/${t.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluida: t.concluida ? 0 : 1 }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao actualizar tarefa: ${err.error || r.status}`, 'error', 3500)
      return
    }
    onChange()
  }
  async function adicionarTarefa() {
    if (!novaTarefa.trim()) return
    const r = await apiFetch(`/api/crm/projetos/fases/${fase.id}/tarefas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao: novaTarefa.trim() }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao adicionar tarefa: ${err.error || r.status}`, 'error', 3500)
      return
    }
    setNovaTarefa('')
    onChange()
  }
  async function apagarTarefa(t) {
    if (!confirm(`Apagar tarefa "${t.descricao}"?`)) return
    const r = await apiFetch(`/api/crm/projetos/tarefas/${t.id}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao apagar tarefa: ${err.error || r.status}`, 'error', 3500)
      return
    }
    onChange()
  }

  return (
    <div className={`bg-white dark:bg-neutral-900 border rounded-xl overflow-hidden transition-all ${open ? 'shadow-md border-gray-300 dark:border-neutral-700' : 'border-gray-200 dark:border-neutral-800 shadow-xs'}`}>
      <button onClick={() => setOpen(!open)}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
        <div className="flex items-center gap-3 flex-1 text-left min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 transition-transform group-hover:scale-105"
            style={{ background: `${cor}18`, border: `1px solid ${cor}30` }}>{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{fase.nome}</span>
              <Badge
                tone={fase.estado === 'concluida' ? 'green' : fase.estado === 'em_curso' ? 'blue' : fase.estado === 'bloqueada' ? 'red' : 'gray'}
                size="xs">{ESTADO_LABEL[fase.estado] || fase.estado}</Badge>
              {diasAtraso != null && (
                <Badge tone="red" size="xs" icon={AlertTriangle}>{diasAtraso}d atraso</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex-1 max-w-[220px] bg-gray-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${fase.perc_execucao || 0}%`, background: cor }} />
              </div>
              <span className="text-xs text-gray-700 dark:text-neutral-300 font-mono font-semibold">{fase.perc_execucao || 0}%</span>
              <span className="text-caption text-gray-400 dark:text-neutral-500">{fase.tarefas_concluidas}/{fase.tarefas_total} tarefas</span>
              {fase.fotos_count > 0 && <span className="text-caption text-gray-400 dark:text-neutral-500">📷 {fase.fotos_count}</span>}
            </div>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 dark:text-neutral-500 transition-transform ${open ? 'rotate-90 text-brand-gold' : ''}`} />
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
              <input type="number" min={0} max={100}
                key={`perc-${fase.id}-${fase.perc_execucao ?? 0}`}
                defaultValue={fase.perc_execucao || 0}
                onBlur={e => {
                  const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                  if (v !== (fase.perc_execucao || 0)) setCampo('perc_execucao', v)
                }}
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

          {/* Despesas detalhadas (F2.6) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Despesas reais ({despesas.length}) · <span className="font-mono text-gray-700">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(custoTotalDespesas)}</span></p>
            </div>
            {despesas.length > 0 && (
              <div className="space-y-1 mb-2">
                {despesas.map(d => (
                  <div key={d.id} className="flex items-center gap-2 group bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                    <span className="text-xs text-gray-700 flex-1">{d.movimento}</span>
                    <span className="text-[10px] text-gray-400">{d.data || '—'}</span>
                    <span className="text-xs font-mono font-semibold text-red-600">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(d.custo_mensal || 0)}</span>
                    <button onClick={() => apagarDespesa(d.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={adicionarDespesa} className="grid grid-cols-12 gap-1.5">
              <input value={novaDespesa.movimento} onChange={e => setNovaDespesa({ ...novaDespesa, movimento: e.target.value })}
                placeholder="Ex: Material elétrico" className="col-span-5 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white" />
              <input type="number" step="0.01" value={novaDespesa.valor} onChange={e => setNovaDespesa({ ...novaDespesa, valor: e.target.value })}
                placeholder="€" className="col-span-2 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white font-mono" />
              <input type="date" value={novaDespesa.data} onChange={e => setNovaDespesa({ ...novaDespesa, data: e.target.value })}
                className="col-span-3 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white" />
              <button type="submit" disabled={!novaDespesa.movimento.trim() || !novaDespesa.valor}
                className="col-span-2 px-2 py-1 rounded-lg bg-brand-dark text-brand-gold text-xs disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </form>
          </div>

          {/* Notas */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Notas da fase</label>
            <textarea defaultValue={fase.notas || ''} onBlur={e => e.target.value !== (fase.notas || '') && setCampo('notas', e.target.value)}
              rows={2} placeholder="Anotações, riscos, decisões..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white" />
          </div>

          {/* P4.3 — Thread de comentários */}
          <ComentariosFase faseId={fase.id} readOnly={readOnly} />
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
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-dark text-brand-gold text-sm font-medium hover:bg-brand-dark-light">
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
  const toast = useToast()
  let pags = []
  try { pags = typeof negocio.pagamentos_faseados === 'string' ? JSON.parse(negocio.pagamentos_faseados || '[]') : (negocio.pagamentos_faseados || []) } catch {}
  const total = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const recebido = pags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const pct = total > 0 ? Math.round((recebido / total) * 100) : 0

  const [novaT, setNovaT] = useState({ descricao: '', valor: '', data: '' })
  const [saving, setSaving] = useState(false)

  async function confirmar(idx) {
    if (!confirm(`Confirmar recebimento desta tranche?`)) return
    const r = await apiFetch(`/api/crm/negocios/${negocio.id}/confirmar-pagamento`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trancheIndex: idx }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao confirmar pagamento: ${err.error || r.status}`, 'error', 3500)
      return
    }
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
    const r = await apiFetch(`/api/crm/negocios/${negocio.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagamentos_faseados: JSON.stringify(novasPags), pagamento_em_falta: 1 }),
    })
    setSaving(false)
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao adicionar tranche: ${err.error || r.status}`, 'error', 3500)
      return
    }
    setNovaT({ descricao: '', valor: '', data: '' })
    onChange()
  }

  async function apagarTranche(idx) {
    if (!confirm(`Apagar a tranche "${pags[idx].descricao || `Tranche ${idx + 1}`}"?`)) return
    const novasPags = pags.filter((_, i) => i !== idx)
    const novoRecebido = novasPags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
    const r = await apiFetch(`/api/crm/negocios/${negocio.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagamentos_faseados: JSON.stringify(novasPags),
        lucro_real: Math.round(novoRecebido * 100) / 100,
        pagamento_em_falta: novasPags.some(p => !p.recebido) ? 1 : 0,
      }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao apagar tranche: ${err.error || r.status}`, 'error', 3500)
      return
    }
    onChange()
  }

  return (
    <div className="space-y-3">
      {pags.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-2.5">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-gold to-green-500" style={{ width: `${pct}%` }} />
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
            className="sm:col-span-1 px-3 py-1.5 rounded-lg bg-brand-dark text-brand-gold text-sm hover:bg-brand-dark-light disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center">
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
    const r = await apiFetch(`/api/crm/projetos/fotos/${fotoId}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      alert('Erro ao apagar foto: ' + (err.error || `HTTP ${r.status}`))
      return
    }
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
            <label htmlFor="upload-fotos" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-dark text-brand-gold text-sm font-medium hover:bg-brand-dark-light cursor-pointer">
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
                <img src={foto.url} alt={foto.legenda || ''} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
function TabDocumentos({ negocio, imovel, fases, readOnly }) {
  const isWS = negocio.categoria === 'Wholesalling'
  const [faseFichaSel, setFaseFichaSel] = useState(fases[0]?.id || '')
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [faseDoc, setFaseDoc] = useState('')
  const [tipoDoc, setTipoDoc] = useState('outro')
  const fileRef = useRef(null)

  const TIPOS_DOC = [
    { key: 'escritura',    label: 'Escritura',     cor: '#0d0d0d' },
    { key: 'fatura',       label: 'Fatura',        cor: '#ef4444' },
    { key: 'certificado',  label: 'Certificado',   cor: '#22c55e' },
    { key: 'licenca',      label: 'Licença',       cor: '#0ea5e9' },
    { key: 'relatorio',    label: 'Relatório',     cor: '#C9A84C' },
    { key: 'contrato',     label: 'Contrato',      cor: '#8b5cf6' },
    { key: 'outro',        label: 'Outro',         cor: '#6b7280' },
  ]

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/projetos/${negocio.id}/documentos`)
      if (r.ok) setDocs((await r.json()).documentos || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [negocio.id])

  async function abrirPDF(url, { download = false } = {}) {
    // openDocument trata o seu próprio feedback de erro (toast global).
    try { await openDocument(url, { download }) } catch { /* já notificado */ }
  }

  async function uploadDocs(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      if (faseDoc) fd.append('faseId', faseDoc)
      fd.append('tipo', tipoDoc)
      const token = await getToken().catch(() => null)
      const r = await fetch(`/api/crm/projetos/${negocio.id}/documentos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      if (!r.ok) throw new Error('Erro upload')
      load()
    } catch (err) { alert(err.message) }
    finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  async function apagarDoc(id) {
    if (!confirm('Apagar este documento?')) return
    const r = await apiFetch(`/api/crm/projetos/documentos/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      alert('Erro ao apagar documento: ' + (err.error || `HTTP ${r.status}`))
      return
    }
    load()
  }

  // Auto-gerados (PDFs Somnium) — projetos de obra (Fix&Flip/CAEP)
  const autoGerados = [
    { key: 'relatorio', nome: 'Relatório de Acompanhamento', desc: 'Executivo mensal: cronograma, orçamento, fotos recentes.', url: `/api/crm/projetos/${negocio.id}/pdf/relatorio` },
    { key: 'memoria', nome: 'Memória Descritiva', desc: 'Acabamentos, garantias, ensaios — pré-venda.', url: `/api/crm/projetos/${negocio.id}/pdf/memoria` },
    { key: 'saida', nome: 'Relatório de Saída / CAEP', desc: 'Capital, distribuição, ROI/TIR.', url: `/api/crm/projetos/${negocio.id}/pdf/saida` },
  ]

  // Wholesalling (cedência de posição): documentos do imóvel, não de obra.
  const docsImovelWS = imovel ? [
    { key: 'ficha_imovel',              nome: 'Ficha do Imóvel',                desc: 'Dados-base do imóvel.',                                 url: `/api/crm/imoveis/${imovel.id}/documento/ficha_imovel` },
    { key: 'analise_rentabilidade',     nome: 'Análise de Rentabilidade',       desc: 'Análise financeira completa (tese do investidor).',      url: `/api/crm/imoveis/${imovel.id}/documento/analise_rentabilidade` },
    { key: 'estudo_comparaveis',        nome: 'Estudo de Comparáveis',          desc: 'Comparáveis de mercado que suportam o VVR.',             url: `/api/crm/imoveis/${imovel.id}/documento/estudo_comparaveis` },
    { key: 'proposta_cedencia_posicao', nome: 'Proposta de Cedência de Posição', desc: 'Documento central da cedência ao investidor ativo.',     url: `/api/crm/imoveis/${imovel.id}/documento/proposta_cedencia_posicao` },
  ] : []

  return (
    <div className="space-y-6">
      {/* SECÇÃO 1: PDFs auto-gerados */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">PDFs Somnium (auto-gerados)</h3>
        <div className="space-y-2">
          {isWS ? (
            !imovel ? (
              <p className="text-xs text-gray-400 py-2">Liga um imóvel ao negócio para gerar os documentos.</p>
            ) : (
              docsImovelWS.map(t => (
                <div key={t.key} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{t.nome}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{t.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => abrirPDF(t.url)} title="Abrir numa nova aba"
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button onClick={() => abrirPDF(t.url, { download: true })} title="Descarregar PDF para enviar"
                      className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light inline-flex items-center gap-1.5">
                      <FileDown className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                </div>
              ))
            )
          ) : (
            <>
              {/* Ficha por fase */}
              <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">Ficha de Acompanhamento de Obra</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">1 página A4 por fase. KPIs, % execução, fotos, tarefas.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <select value={faseFichaSel} onChange={e => setFaseFichaSel(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white">
                    <option value="">Escolhe uma fase…</option>
                    {fases.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                  <button onClick={() => faseFichaSel && abrirPDF(`/api/crm/projetos/${negocio.id}/pdf/ficha/${faseFichaSel}`)}
                    disabled={!faseFichaSel} title="Abrir numa nova aba"
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </button>
                  <button onClick={() => faseFichaSel && abrirPDF(`/api/crm/projetos/${negocio.id}/pdf/ficha/${faseFichaSel}`, { download: true })}
                    disabled={!faseFichaSel} title="Descarregar PDF para enviar"
                    className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                    <FileDown className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>
              {autoGerados.map(t => (
                <div key={t.key} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{t.nome}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{t.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => abrirPDF(t.url)} title="Abrir numa nova aba"
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button onClick={() => abrirPDF(t.url, { download: true })} title="Descarregar PDF para enviar"
                      className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light inline-flex items-center gap-1.5">
                      <FileDown className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* SECÇÃO 2: Documentos uploaded */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Documentos do projecto ({docs.length})</h3>

        {!readOnly && (
          <div className="bg-gray-50 rounded-xl p-3 flex flex-col sm:flex-row gap-2 mb-3">
            <select value={faseDoc} onChange={e => setFaseDoc(e.target.value)}
              className="sm:flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
              <option value="">Sem fase específica</option>
              {fases.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
              {TIPOS_DOC.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={uploadDocs} disabled={uploading} className="hidden" id="upload-doc" />
            <label htmlFor="upload-doc"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-dark text-brand-gold text-sm font-medium hover:bg-brand-dark-light cursor-pointer whitespace-nowrap">
              <Upload className="w-4 h-4" /> {uploading ? 'A enviar...' : 'Carregar'}
            </label>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-gray-400 py-4 text-center">A carregar…</p>
        ) : docs.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">Sem documentos. {!readOnly && 'Faz upload acima.'}</p>
        ) : (
          <div className="space-y-1.5">
            {docs.map(doc => {
              const tipoConfig = TIPOS_DOC.find(t => t.key === doc.tipo) || TIPOS_DOC[TIPOS_DOC.length - 1]
              return (
                <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 bg-white group">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-gray-800 hover:text-brand-gold truncate block">{doc.nome}</a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-white"
                        style={{ background: tipoConfig.cor }}>{tipoConfig.label}</span>
                      {doc.fase_nome && <span className="text-[10px] text-gray-400">{doc.fase_nome}</span>}
                      {doc.tamanho && <span className="text-[10px] text-gray-400">{(doc.tamanho / 1024).toFixed(0)} KB</span>}
                      <span className="text-[10px] text-gray-400">{new Date(doc.created_at).toLocaleDateString('pt-PT')}</span>
                    </div>
                  </div>
                  {!readOnly && (
                    <button onClick={() => apagarDoc(doc.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: INVESTIDORES
// ════════════════════════════════════════════════════════════════
function TabInvestidores({ negocio, readOnly }) {
  const toast = useToast()
  const [lista, setLista] = useState([])
  const [todosInvestidores, setTodosInvestidores] = useState([])
  const [investidorSel, setInvestidorSel] = useState('')
  const [novoCapital, setNovoCapital] = useState('')
  const [novaPerc, setNovaPerc] = useState('')
  const [novoInvNome, setNovoInvNome] = useState('')
  const [novoInvContacto, setNovoInvContacto] = useState('')

  async function load() {
    const [r1, r2] = await Promise.all([
      apiFetch(`/api/crm/projetos/${negocio.id}/investidores`),
      apiFetch('/api/crm/investidores?limit=500'),
    ])
    if (r1.ok) setLista((await r1.json()).investidores || [])
    if (r2.ok) setTodosInvestidores(((await r2.json()).data || []).filter(i => i.status !== 'Inactivo'))
  }
  useEffect(() => { load() }, [negocio.id])

  const capitalTotal = lista.reduce((s, l) => s + (Number(l.capital) || 0), 0)
  const percTotal = lista.reduce((s, l) => s + (Number(l.percentagem) || 0), 0)
  const lucroEstimado = Number(negocio.lucro_estimado) || 0
  // Distribuição expectável = capital + parte proporcional do lucro
  function distribuicao(l) {
    const pctCapital = capitalTotal > 0 ? (Number(l.capital) || 0) / capitalTotal : 0
    return (Number(l.capital) || 0) + (lucroEstimado * pctCapital)
  }

  async function ligarInvestidor(investidorId) {
    const r = await apiFetch(`/api/crm/projetos/${negocio.id}/investidores`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investidor_id: investidorId,
        capital: parseFloat(novoCapital) || 0,
        percentagem: parseFloat(novaPerc) || 0,
      }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao adicionar investidor: ${err.error || r.status}`, 'error', 3500)
      return false
    }
    return true
  }

  async function adicionar(e) {
    e?.preventDefault()
    if (!novoCapital) return

    // "+ Criar novo investidor": nunca ligar um nome solto sem ficha —
    // cria a ficha primeiro e só depois liga ao projecto.
    if (investidorSel === '__novo__') {
      if (!novoInvNome.trim()) return
      const rInv = await apiFetch('/api/crm/investidores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: novoInvNome.trim(),
          telemovel: novoInvContacto.includes('@') ? null : novoInvContacto.trim() || null,
          email: novoInvContacto.includes('@') ? novoInvContacto.trim() : null,
          status: 'Lead',
        }),
      })
      if (!rInv.ok) {
        const err = await rInv.json().catch(() => ({}))
        toast?.(`Erro ao criar investidor: ${err.error || rInv.status}`, 'error', 3500)
        return
      }
      const novoInv = await rInv.json()
      const ok = await ligarInvestidor(novoInv.id)
      if (!ok) return
      setInvestidorSel(''); setNovoCapital(''); setNovaPerc(''); setNovoInvNome(''); setNovoInvContacto('')
      toast?.(`Investidor "${novoInv.nome}" criado e ligado ao projecto`, 'success', 3000)
      load()
      return
    }

    if (!investidorSel) return
    const ok = await ligarInvestidor(investidorSel)
    if (!ok) return
    setInvestidorSel(''); setNovoCapital(''); setNovaPerc('')
    load()
  }
  async function apagar(linkId) {
    if (!confirm('Remover este investidor do projeto?')) return
    const r = await apiFetch(`/api/crm/projetos/investidores/${linkId}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao remover investidor: ${err.error || r.status}`, 'error', 3500)
      return
    }
    load()
  }
  async function editar(linkId, campo, valor) {
    const r = await apiFetch(`/api/crm/projetos/investidores/${linkId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao actualizar investidor: ${err.error || r.status}`, 'error', 3500)
      return
    }
    load()
  }

  const disponiveis = todosInvestidores.filter(i => !lista.find(l => l.investidor_id === i.id))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Investidores" value={lista.length} />
        <Field label="Capital agregado" value={EUR(capitalTotal)} accent />
        <Field label="% atribuída" value={`${percTotal.toFixed(1)}%`} />
        <Field label="Lucro a distribuir" value={EUR(lucroEstimado)} accent />
      </div>

      {lista.length > 0 ? (
        <div className="space-y-2">
          {lista.map(l => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white group">
              <div className="w-8 h-8 rounded-full bg-brand-gold text-brand-dark flex items-center justify-center font-bold text-xs flex-shrink-0">
                {(l.investidor_nome || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{l.investidor_nome}</p>
                {l.investidor_email && <p className="text-[10px] text-gray-400 truncate">{l.investidor_email}</p>}
              </div>
              <div className="flex gap-3 items-center text-right">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">Capital</p>
                  {readOnly ? (
                    <p className="text-sm font-mono font-semibold text-gray-700">{EUR(l.capital)}</p>
                  ) : (
                    <input type="number" defaultValue={l.capital || 0} onBlur={e => editar(l.id, 'capital', parseFloat(e.target.value) || 0)}
                      className="w-24 text-right text-sm font-mono px-2 py-0.5 rounded border border-gray-200" />
                  )}
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">%</p>
                  {readOnly ? (
                    <p className="text-sm font-mono text-gray-600">{Number(l.percentagem).toFixed(1)}%</p>
                  ) : (
                    <input type="number" step="0.1" defaultValue={l.percentagem || 0} onBlur={e => editar(l.id, 'percentagem', parseFloat(e.target.value) || 0)}
                      className="w-14 text-right text-sm px-2 py-0.5 rounded border border-gray-200" />
                  )}
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">Distrib. estim.</p>
                  <p className="text-sm font-mono font-semibold text-green-600">{EUR(distribuicao(l))}</p>
                </div>
              </div>
              {!readOnly && (
                <button onClick={() => apagar(l.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 py-4 text-center">Sem investidores ligados ao projeto.</p>
      )}

      {!readOnly && (
        <form onSubmit={adicionar} className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Adicionar investidor</p>
          <div className="grid grid-cols-12 gap-2">
            <select value={investidorSel} onChange={e => setInvestidorSel(e.target.value)}
              className="col-span-5 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
              <option value="">Escolhe um investidor…</option>
              {disponiveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              <option value="__novo__">+ Criar novo investidor…</option>
            </select>
            <input type="number" step="0.01" value={novoCapital} onChange={e => setNovoCapital(e.target.value)}
              placeholder="Capital €" className="col-span-3 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white font-mono" />
            <input type="number" step="0.1" value={novaPerc} onChange={e => setNovaPerc(e.target.value)}
              placeholder="%" className="col-span-2 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            <button type="submit"
              disabled={!novoCapital || (investidorSel === '__novo__' ? !novoInvNome.trim() : !investidorSel)}
              className="col-span-2 px-3 py-1.5 rounded-lg bg-brand-dark text-brand-gold text-sm disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          {investidorSel === '__novo__' && (
            <div className="grid grid-cols-12 gap-2 mt-2">
              <input type="text" value={novoInvNome} onChange={e => setNovoInvNome(e.target.value)}
                placeholder="Nome do novo investidor" autoFocus
                className="col-span-6 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
              <input type="text" value={novoInvContacto} onChange={e => setNovoInvContacto(e.target.value)}
                placeholder="Email ou telemóvel (opcional)"
                className="col-span-6 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            </div>
          )}
        </form>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// CHIPS DE FRAÇÃO (faixa no topo) + TAB FRAÇÕES
// ════════════════════════════════════════════════════════════════
function FracaoChips({ fracoes, fracaoSel, setFracaoSel }) {
  const fracs = fracoes.filter(f => f.tipo !== 'area_comum')
  const areas = fracoes.filter(f => f.tipo === 'area_comum')

  function chip(fr) {
    const sel = fracaoSel === fr.id
    const cor = FRACAO_ESTADO_COR[fr.estado] || FRACAO_ESTADO_COR.em_obra
    const isArea = fr.tipo === 'area_comum'
    const cat = isArea ? CATEGORIAS_COMUM.find(c => c.key === fr.categoria_comum) : null
    return (
      <button key={fr.id} onClick={() => setFracaoSel(fr.id)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 border ${
          sel ? 'bg-brand-dark text-brand-gold border-brand-dark' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
        }`}>
        {cat && <span>{cat.icon}</span>}
        <span className="font-semibold">{fr.nome}</span>
        {fr.tipologia && <span className="text-gray-400">·</span>}
        {fr.tipologia && <span className="text-gray-500">{fr.tipologia}</span>}
        {fr.andar && <span className="text-gray-400">·</span>}
        {fr.andar && <span className="text-gray-500">{fr.andar}</span>}
        <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${sel ? 'bg-white/10 text-brand-gold' : `${cor.bg} ${cor.text}`}`}>
          {Math.round(Number(fr.perc_global) || 0)}%
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <button onClick={() => setFracaoSel(null)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 border ${
          fracaoSel === null ? 'bg-brand-dark text-brand-gold border-brand-dark' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
        }`}>
        <Home className="w-3 h-3" /> Prédio inteiro
      </button>
      {fracs.length > 0 && (
        <>
          <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold px-1">Frações</span>
          {fracs.map(chip)}
        </>
      )}
      {areas.length > 0 && (
        <>
          <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold px-1 ml-2">Áreas comuns</span>
          {areas.map(chip)}
        </>
      )}
    </div>
  )
}

function TabFracoes({ negocioId, fracoes, onChange, readOnly, fasesComuns }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)

  async function save(form) {
    const isNew = !form.id
    const url = isNew ? `/api/crm/projetos/${negocioId}/fracoes` : `/api/crm/projetos/fracoes/${form.id}`
    const body = { ...form }
    if (isNew && fasesComuns.length > 0) body.duplicarFases = true
    const r = await apiFetch(url, {
      method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Erro'); return }
    setEditing(null); setShowForm(false); onChange()
  }
  async function apagar(id, nome) {
    if (!confirm(`Apagar fração "${nome}"? Fases/fotos/despesas dessa fração ficarão como "comuns ao prédio".`)) return
    const r = await apiFetch(`/api/crm/projetos/fracoes/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao apagar fração: ${err.error || r.status}`, 'error', 3500)
      return
    }
    onChange()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Frações do prédio ({fracoes.length}). Cada fração pode ter o seu próprio cronograma de fases, fotos e despesas.
        </p>
        {!readOnly && (
          <Button size="sm" icon={Plus} onClick={() => { setEditing({}); setShowForm(true) }}>
            Nova fração
          </Button>
        )}
      </div>

      {showForm && <FracaoForm fracao={editing} onSave={save} onCancel={() => { setShowForm(false); setEditing(null) }} fasesComunsCount={fasesComuns.length} />}

      {fracoes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <Layers className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Sem frações ou áreas criadas.</p>
          <p className="text-xs text-gray-400 mt-1">Adiciona uma fração (apartamento vendável) ou área comum (fachada, telhado, jardim…) para começar.</p>
        </div>
      ) : (
        <>
          {/* Grupo: Frações */}
          {(() => {
            const fracs = fracoes.filter(f => f.tipo !== 'area_comum')
            if (fracs.length === 0) return null
            return (
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-1.5">
                  <Layers className="w-3 h-3" /> Frações ({fracs.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {fracs.map(fr => (
                    <FracaoCard key={fr.id} fracao={fr} readOnly={readOnly}
                      onEdit={() => { setEditing(fr); setShowForm(true) }}
                      onDelete={() => apagar(fr.id, fr.nome)} />
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Grupo: Áreas comuns */}
          {(() => {
            const areas = fracoes.filter(f => f.tipo === 'area_comum')
            if (areas.length === 0) return null
            return (
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-1.5">
                  🏛️ Áreas comuns ({areas.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {areas.map(fr => (
                    <FracaoCard key={fr.id} fracao={fr} readOnly={readOnly}
                      onEdit={() => { setEditing(fr); setShowForm(true) }}
                      onDelete={() => apagar(fr.id, fr.nome)} />
                  ))}
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

function FracaoCard({ fracao: fr, readOnly, onEdit, onDelete }) {
  const cor = FRACAO_ESTADO_COR[fr.estado] || FRACAO_ESTADO_COR.em_obra
  const perc = Math.round(Number(fr.perc_global) || 0)
  const vendaEsp = Number(fr.valor_venda_estimado) || 0
  const vendaReal = Number(fr.valor_venda_real) || 0
  const isArea = fr.tipo === 'area_comum'
  const cat = isArea ? CATEGORIAS_COMUM.find(c => c.key === fr.categoria_comum) : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2">
          {cat && <span className="text-xl mt-0.5">{cat.icon}</span>}
          <div>
            <h3 className="text-base font-bold text-gray-800">{fr.nome}</h3>
            <p className="text-xs text-gray-500">
              {[fr.tipologia, fr.andar, fr.area_m2 ? `${fr.area_m2} m²` : null].filter(Boolean).join(' · ') || (isArea ? cat?.label : '—')}
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cor.bg} ${cor.text}`}>{cor.label}</span>
      </div>

      <div className="my-3">
        <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
          <span>Execução</span>
          <span className="font-mono font-bold text-gray-700">{perc}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-dark" style={{ width: `${perc}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">{fr.num_fases} fase{fr.num_fases !== 1 ? 's' : ''}</p>
      </div>

      {!isArea && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Venda esperada</p>
            <p className="font-mono font-semibold text-indigo-600">{EUR(vendaEsp)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">{vendaReal > 0 ? 'Vendido por' : 'Custo até agora'}</p>
            <p className={`font-mono font-semibold ${vendaReal > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {EUR(vendaReal > 0 ? vendaReal : Number(fr.custo_total) || 0)}
            </p>
          </div>
        </div>
      )}
      {isArea && (
        <div className="text-xs">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Custo até agora</p>
          <p className="font-mono font-semibold text-red-600">{EUR(Number(fr.custo_total) || 0)}</p>
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}
            className="text-[11px] px-2 py-1 text-gray-600 hover:text-brand-gold">Editar</button>
          <button onClick={onDelete}
            className="text-[11px] px-2 py-1 text-gray-600 hover:text-red-500">Apagar</button>
        </div>
      )}
    </div>
  )
}

function FracaoForm({ fracao, onSave, onCancel, fasesComunsCount }) {
  const isNew = !fracao?.id
  const [f, setF] = useState({
    nome: '', tipo: 'fracao', categoria_comum: '',
    tipologia: '', andar: '', area_m2: '', estado: 'em_obra',
    valor_venda_estimado: '', data_venda_estimada: '', notas: '',
    ...fracao,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inputClass = "w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white"
  const isAreaComum = f.tipo === 'area_comum'

  // Auto-preencher nome quando muda categoria comum (se ainda vazio ou for sugestão anterior)
  function selectCategoria(catKey) {
    const cat = CATEGORIAS_COMUM.find(c => c.key === catKey)
    setF(p => ({
      ...p,
      categoria_comum: catKey,
      nome: !p.nome || CATEGORIAS_COMUM.some(c => c.label === p.nome) ? (cat?.label || p.nome) : p.nome,
    }))
  }

  return (
    <div className="bg-white rounded-xl border-2 border-brand-gold p-4 shadow-md">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{isNew ? 'Nova entidade' : 'Editar entidade'}</h3>

      {/* Selector de tipo */}
      <div className="mb-4">
        <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1.5">Tipo</label>
        <div className="grid grid-cols-2 gap-2">
          <label className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border-2 ${f.tipo === 'fracao' ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-200'}`}>
            <input type="radio" name="tipo" value="fracao" checked={f.tipo === 'fracao'} onChange={() => set('tipo', 'fracao')} className="mt-0.5 accent-brand-gold" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Fração</p>
              <p className="text-[10px] text-gray-500">Apartamento vendável</p>
            </div>
          </label>
          <label className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border-2 ${f.tipo === 'area_comum' ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-200'}`}>
            <input type="radio" name="tipo" value="area_comum" checked={f.tipo === 'area_comum'} onChange={() => set('tipo', 'area_comum')} className="mt-0.5 accent-brand-gold" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Área comum</p>
              <p className="text-[10px] text-gray-500">Fachada, telhado, jardim, escadas…</p>
            </div>
          </label>
        </div>
      </div>

      {/* Categoria comum (só quando tipo=area_comum) */}
      {isAreaComum && (
        <div className="mb-4">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1.5">Categoria</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {CATEGORIAS_COMUM.map(c => (
              <button key={c.key} type="button" onClick={() => selectCategoria(c.key)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border ${f.categoria_comum === c.key ? 'border-brand-gold bg-brand-gold/10 text-brand-dark' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                <span>{c.icon}</span> {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 uppercase block mb-1">Nome *</label>
          <input value={f.nome} onChange={e => set('nome', e.target.value)}
            placeholder={isAreaComum ? 'Ex: Fachada principal' : 'Ex: Fração A'} className={inputClass} />
        </div>
        {!isAreaComum && (
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">Tipologia</label>
            <select value={f.tipologia || ''} onChange={e => set('tipologia', e.target.value)} className={inputClass}>
              <option value="">—</option>
              {['T0', 'T0+1', 'T1', 'T1+1', 'T2', 'T2+1', 'T3', 'T3+1', 'T4', 'T5+'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-[10px] text-gray-500 uppercase block mb-1">{isAreaComum ? 'Localização' : 'Andar'}</label>
          <select value={f.andar || ''} onChange={e => set('andar', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {['Cave', 'R/C', '1º Andar', '2º Andar', '3º Andar', '4º Andar', '5º Andar', 'Sótão', 'Cobertura', 'Exterior'].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase block mb-1">Área (m²)</label>
          <input type="number" step="0.1" value={f.area_m2 || ''} onChange={e => set('area_m2', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase block mb-1">Estado</label>
          <select value={f.estado} onChange={e => set('estado', e.target.value)} className={inputClass}>
            {Object.entries(FRACAO_ESTADO_COR).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {!isAreaComum && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Valor venda esperado (€)</label>
              <input type="number" step="100" value={f.valor_venda_estimado || ''} onChange={e => set('valor_venda_estimado', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Data venda estimada</label>
              <input type="date" value={f.data_venda_estimada || ''} onChange={e => set('data_venda_estimada', e.target.value)} className={inputClass} />
            </div>
          </>
        )}
        {!isNew && !isAreaComum && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Valor venda real (€)</label>
              <input type="number" step="100" value={f.valor_venda_real || ''} onChange={e => set('valor_venda_real', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Data venda real</label>
              <input type="date" value={f.data_venda_real || ''} onChange={e => set('data_venda_real', e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Comprador</label>
              <input value={f.comprador || ''} onChange={e => set('comprador', e.target.value)} className={inputClass} />
            </div>
          </>
        )}
        <div className="col-span-2 sm:col-span-3">
          <label className="text-[10px] text-gray-500 uppercase block mb-1">Notas</label>
          <textarea value={f.notas || ''} onChange={e => set('notas', e.target.value)} rows={2} className={inputClass} />
        </div>
      </div>

      {isNew && fasesComunsCount > 0 && (
        <p className="text-[11px] text-brand-gold mt-3 bg-brand-dark px-3 py-2 rounded-lg">
          ✨ Ao criar esta fração, serão duplicadas as {fasesComunsCount} fases existentes do prédio (com tarefas-template) para esta fração.
        </p>
      )}

      <div className="flex gap-3 mt-4">
        <Button size="lg" onClick={() => onSave(f)} disabled={!f.nome?.trim()}>
          {isNew ? 'Criar fração' : 'Guardar'}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// P4.7 — TAB FORECAST DE TESOURARIA
// ════════════════════════════════════════════════════════════════
function TabForecast({ negocioId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    apiFetch(`/api/crm/projetos/${negocioId}/forecast`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [negocioId])

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">A calcular forecast…</p>
  if (!data) return <p className="text-sm text-gray-500 py-8 text-center">Sem dados.</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiBox label="Outflow previsto" value={EUR(data.totais.outflow)} cor="#ef4444" />
        <KpiBox label="Inflow previsto" value={EUR(data.totais.inflow)} cor="#22c55e" />
        <KpiBox label="Saldo previsto" value={EUR(data.totais.saldo_previsto)} cor={data.totais.saldo_previsto >= 0 ? "#22c55e" : "#ef4444"} accent />
      </div>
      {data.eventos.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Sem eventos previstos (define datas previstas nas fases e tranches).</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Descrição</th>
                <th className="text-right px-3 py-2">Valor</th>
                <th className="text-right px-3 py-2">Saldo acum.</th>
              </tr>
            </thead>
            <tbody>
              {data.eventos.map((e, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-xs text-gray-600">{e.data}</td>
                  <td className="px-3 py-2 text-xs text-gray-800">{e.descricao}</td>
                  <td className={`px-3 py-2 text-right text-xs font-mono ${e.valor >= 0 ? "text-green-600" : "text-red-600"}`}>{EUR(e.valor)}</td>
                  <td className={`px-3 py-2 text-right text-xs font-mono font-semibold ${e.saldo_acumulado >= 0 ? "text-gray-700" : "text-red-700"}`}>{EUR(e.saldo_acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KpiBox({ label, value, cor, accent }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-lg font-mono font-bold mt-0.5`} style={{ color: cor }}>{value}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// P4.1 — TAB HISTÓRICO (AUDIT LOG)
// ════════════════════════════════════════════════════════════════
function ComentariosFase({ faseId, readOnly }) {
  const toast = useToast()
  const [comentarios, setComentarios] = useState([])
  const [texto, setTexto] = useState("")
  async function load() {
    const r = await apiFetch(`/api/crm/projetos/fases/${faseId}/comentarios`)
    if (r.ok) setComentarios((await r.json()).comentarios || [])
  }
  useEffect(() => { load() }, [faseId])
  async function enviar(e) {
    e?.preventDefault()
    if (!texto.trim()) return
    const r = await apiFetch(`/api/crm/projetos/fases/${faseId}/comentarios`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: texto.trim() }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao enviar comentário: ${err.error || r.status}`, 'error', 3500)
      return
    }
    setTexto("")
    load()
  }
  async function apagar(id) {
    if (!confirm("Apagar comentário?")) return
    const r = await apiFetch(`/api/crm/projetos/comentarios/${id}`, { method: "DELETE" })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao apagar comentário: ${err.error || r.status}`, 'error', 3500)
      return
    }
    load()
  }
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Comentários ({comentarios.length})</p>
      <div className="space-y-1.5 mb-2">
        {comentarios.length === 0 && <p className="text-[11px] text-gray-400 italic">Sem comentários.</p>}
        {comentarios.map(c => (
          <div key={c.id} className="group flex items-start gap-2 bg-white rounded-lg p-2 border border-gray-100">
            <div className="w-6 h-6 rounded-full bg-brand-gold text-brand-dark flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {(c.autor_nome || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-gray-700">{c.autor_nome}</span>
                <span className="text-[9px] text-gray-400">{new Date(c.created_at).toLocaleString("pt-PT")}</span>
              </div>
              <p className="text-xs text-gray-700 whitespace-pre-wrap mt-0.5">{c.texto}</p>
            </div>
            {!readOnly && (
              <button onClick={() => apagar(c.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <form onSubmit={enviar} className="flex gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Escreve um comentário..." className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white" />
          <button type="submit" disabled={!texto.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light disabled:bg-gray-200 disabled:text-gray-400">
            Enviar
          </button>
        </form>
      )}
    </div>
  )
}

