import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle, Plus, Trash2, Upload, FileText, BarChart3, ChevronRight, FileDown, AlertTriangle, RefreshCw, Home, Layers, History, FileSpreadsheet, Pencil, Eye, CalendarClock, ClipboardCheck, Calculator, Receipt, Hammer, FolderOpen, HandCoins, CalendarCheck, Building, Trees, Footprints, ArrowUpDown, Zap, Car, MoreHorizontal, Camera } from 'lucide-react'
import { motion } from 'framer-motion'
import { BrandLoader, useMinLoading } from '../components/ui/BrandLoader.jsx'
import { TabTransition, useTabDirection } from '../components/ui/PageTransition.jsx'
import { tabIndicatorTransition } from '../lib/motion.js'
import { FASE_ICONS, FASE_ICON_DEFAULT } from '../lib/faseIcons.js'
import { ProjectoForm } from './Projectos.jsx'
import { TarefasFase } from '../components/projeto/TarefasFase.jsx'
import { DESP_CATEGORIAS } from '../constants.js'
import { apiFetch, getToken, openDocument } from '../lib/api.js'
import { friendlyError } from '../lib/friendlyError.js'
import { Header } from '../components/layout/Header.jsx'
import { ErrorState } from '../components/ui/ErrorState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { StatusBadge } from '../components/dashboard/StatusBadge.jsx'
import { Input, Select, Textarea } from '../components/ui/Input.jsx'
import { Avatar } from '../components/ui/Avatar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { PartilharAcesso } from '../components/PartilharAcesso.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { AiResumoCard, GanttFases, TabHistorico } from '../components/projeto/cards.jsx'
import { useRefreshOnMutation } from '../hooks/useRefreshOnMutation.js'
import { calcOrcamentoObra } from '../db/orcamentoObraEngine.js'
import { DocumentosOrcamentosTab } from '../components/obra/DocumentosOrcamentosTab.jsx'
import { AnaliseTab } from '../components/analise/AnaliseTab.jsx'
import { QuadroEstimadoVsReal, QuadroConsultoria, RubricaSelect, RUBRICA_EXTRA, MOTIVOS_EXTRA, rubricaDe, labelRubrica } from '../components/projeto/EstimadoVsReal.jsx'
import { confirmar } from '../components/ui/ConfirmDialog.jsx'
import { useResponsaveisRegiao } from '../hooks/useResponsaveisRegiao.js'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const GOLD = '#C9A84C'
const BLACK = '#0d0d0d'

// SOP 13 §9 — semáforo de desvio orçamental (verde/amarelo/laranja/vermelho)
const SEMAFORO_STATUS = { verde: 'green', amarelo: 'yellow', laranja: 'orange', vermelho: 'red' }

const FASE_COR = {
  pre_aquisicao: '#1F4E5F',              // teal escuro (preparação CAEP)
  pre_obra: '#5F4D20',                   // gold-800 (preparação da obra)
  aquisicao: '#475569',                  // slate (cálculo)
  projeto_licenca: '#1F4E5F',            // teal escuro (técnico)
  demolicoes: '#7C2D40',                 // vinho (transformação)
  estrutura_especialidades: '#5F4D20',   // gold-800 (base)
  acabamentos: '#C9A84C',                // brand gold (brilho)
  exterior_fecho: '#D5B65A',             // gold-400 (final)
  comercializacao: '#866B2D',            // gold-700 (venda)
  vendido: '#0d0d0d',                    // brand dark (sucesso)
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
// Reporte semanal aos investidores (SOP 12, 8.7): com uma fase de obra em
// curso, o relatório semanal (vistoria) não deve passar de 7 dias.
const FASES_OBRA = new Set(['demolicoes', 'estrutura_especialidades', 'acabamentos', 'exterior_fecho'])
function relatorioSemanalEmFalta(fases, vistorias) {
  const emObra = fases.filter(f => FASES_OBRA.has(f.fase_key) && f.estado === 'em_curso')
  if (emObra.length === 0) return null
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const ultima = vistorias.map(v => v.semana_data).filter(Boolean).sort().pop()
  const inicio = emObra.map(f => f.data_inicio_real).filter(Boolean).sort()[0]
  const desde = ultima || inicio
  const dias = desde ? Math.floor((hoje - new Date(desde)) / 86400000) : null
  if (dias != null && dias <= 7) return null
  return { dias, nunca: !ultima }
}
const ESTADO_COR = {
  pendente: 'bg-surface-muted text-ink-muted', em_curso: 'bg-surface-muted text-ink',
  concluida: 'bg-success/15 text-success', bloqueada: 'bg-danger/15 text-danger',
}

const TABS_BASE = [
  { key: 'resumo',       label: 'Resumo',           icon: BarChart3 },
  { key: 'fases',        label: 'Fases e Tarefas',  icon: ClipboardCheck },
  { key: 'fracoes',      label: 'Frações e Áreas',  icon: Layers, predioOnly: true },
  { key: 'analise',      label: 'Análise Financeira', icon: Calculator },
  { key: 'obras',        label: 'Obras',            icon: Hammer },
  { key: 'faturas',      label: 'Faturas e Comprovativos', icon: Receipt },
  { key: 'documentos',   label: 'Documentos',       icon: FolderOpen },
  { key: 'investidores', label: 'Investidores',     icon: HandCoins },
  { key: 'reunioes',     label: 'Reuniões',         icon: CalendarCheck },
  { key: 'historico',    label: 'Histórico',        icon: History },
]

const FRACAO_ESTADO_COR = {
  em_obra:  { bg: 'bg-surface-muted', text: 'text-ink', label: 'Em obra' },
  pronto:   { bg: 'bg-warning/15', text: 'text-warning', label: 'Pronto' },
  em_venda: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Em venda' },
  vendido:  { bg: 'bg-success/15', text: 'text-success', label: 'Vendido' },
}

const CATEGORIAS_COMUM = [
  { key: 'fachada',     label: 'Fachada',                icon: Building },
  { key: 'telhado',     label: 'Telhado / Cobertura',    icon: Home },
  { key: 'jardim',      label: 'Jardim / Pátio',         icon: Trees },
  { key: 'escadas',     label: 'Escadas / Caixa',        icon: Footprints },
  { key: 'elevador',    label: 'Elevador',               icon: ArrowUpDown },
  { key: 'instalacoes', label: 'Instalações verticais',  icon: Zap },
  { key: 'garagem',     label: 'Garagem / Parqueamento', icon: Car },
  { key: 'outro',       label: 'Outro',                  icon: MoreHorizontal },
]

export function ProjectoDetalhe() {
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const { isReadOnly, isInvestidor, role } = useAuth()
  const [fracaoSel, setFracaoSel] = useState(null)  // null = "Prédio inteiro"
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'resumo')
  const direcaoAba = useTabDirection(tab, TABS_BASE.map(t => t.key))
  const [obrasSub, setObrasSub] = useState(null)  // sub-aba das Obras a abrir (alerta do relatório semanal)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  // Migrado para React Query (Problema 23 da auditoria) — ver Financeiro.jsx/CRM.jsx.
  const query = useQuery({
    queryKey: ['projeto-detalhe', id],
    queryFn: async () => {
      const [rResumo, rFases, rFotos, rFracoes, rVist] = await Promise.all([
        apiFetch(`/api/crm/projetos/${id}/resumo`),
        apiFetch(`/api/crm/projetos/${id}/fases`),
        apiFetch(`/api/crm/projetos/${id}/fotos`),
        apiFetch(`/api/crm/projetos/${id}/fracoes`),
        apiFetch(`/api/crm/projetos/${id}/vistorias`),
      ])
      if (!rResumo.ok) throw new Error('Projeto não encontrado')
      const resumo = await rResumo.json()
      const fases = rFases.ok ? (await rFases.json()).fases || [] : []
      const fotos = rFotos.ok ? (await rFotos.json()).fotos || [] : []
      const fracoes = rFracoes.ok ? (await rFracoes.json()).fracoes || [] : []
      const vistorias = rVist.ok ? (await rVist.json()).vistorias || [] : []
      return { resumo, fases, fotos, fracoes, vistorias }
    },
  })
  const resumo = query.data?.resumo ?? null
  const fases = useMemo(() => query.data?.fases ?? [], [query.data])
  const fotos = useMemo(() => query.data?.fotos ?? [], [query.data])
  const fracoes = useMemo(() => query.data?.fracoes ?? [], [query.data])
  const loading = query.isPending
  const mostrarCarregamento = useMinLoading(loading)
  const error = query.error?.message || null
  const load = query.refetch

  // Filtros aplicados pela fração selecionada
  const fasesFiltradas = fracaoSel === null
    ? fases
    : fases.filter(f => f.fracao_id === fracaoSel || (fracaoSel === '__comum__' && !f.fracao_id))
  const fotosFiltradas = fracaoSel === null
    ? fotos
    : fotos.filter(f => f.fracao_id === fracaoSel || (fracaoSel === '__comum__' && !f.fracao_id))

  async function inicializarFases() {
    if (!(await confirmar('Criar as fases deste projeto?'))) return
    const r = await apiFetch(`/api/crm/projetos/${id}/fases/inicializar`, { method: 'POST' })
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      toast(friendlyError(e.error || { status: r.status }), 'error')
      return
    }
    toast('Fases criadas.', 'success')
    load()
  }

  useRefreshOnMutation(load)

  if (mostrarCarregamento) return <BrandLoader label="Departamento de Obras" />
  if (error || !resumo) return (
    <>
      <Header title="Projeto" subtitle="Obras" />
      <ErrorState title="Não foi possível abrir o projeto" error={error === 'Projeto não encontrado' ? 'Este projeto não existe ou foi removido.' : query.error} onRetry={load} />
    </>
  )

  const { negocio, imovel, analise, percGlobal, custoReal, orcAlocado, faseAtual } = resumo
  const pct = Math.max(0, Math.min(100, Math.round(Number(percGlobal) || 0)))
  const semFases = fases.length === 0
  const isPredio = negocio.tipo_projeto === 'predio'
  // Wholesaling é cedência de posição (sem obra).
  const isWholesalling = negocio.categoria === 'Wholesaling'
  // Consultoria/Assessoria: a Somnium não investe — sem Análise Financeira nem Investidores.
  const isConsultoria = negocio.categoria === 'Consultoria/Assessoria'
  const TABS_OCULTAS_CONSULTORIA = new Set(['analise', 'investidores'])
  const TABS = TABS_BASE.filter(t =>
    (!t.predioOnly || isPredio) &&
    !(isConsultoria && TABS_OCULTAS_CONSULTORIA.has(t.key)) &&
    !(t.teamOnly && isReadOnly) &&
    // Wholesaling não tem obra: sem orçamento, fotos nem vistorias.
    !(t.key === 'obras' && isWholesalling)
  )

  return (
    <>
      <Header
        title={negocio.movimento}
        subtitle={`${negocio.categoria || 'Projeto'}${imovel?.nome ? ' · ' + imovel.nome : ''}`}
        onRefresh={load}
        loading={loading}
        backTo="/projectos"
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Alerta de atrasos */}
        {(() => {
          const atrasadas = fases.filter(f => calcularAtraso(f) != null)
          if (atrasadas.length === 0) return null
          const dias = atrasadas.map(f => calcularAtraso(f))
          const max = Math.max(...dias)
          return (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-danger">
                  {atrasadas.length} fase{atrasadas.length > 1 ? 's' : ''} em atraso · até {max} dia{max > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-danger mt-0.5">
                  {atrasadas.map(f => f.nome).join(' · ')}
                </p>
              </div>
            </div>
          )
        })()}

        {/* Relatório semanal de obra em falta */}
        {(() => {
          if (isWholesalling || isReadOnly) return null
          const falta = relatorioSemanalEmFalta(fases, query.data?.vistorias ?? [])
          if (!falta) return null
          return (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-warning">
                  {falta.nunca ? 'Ainda sem relatório semanal de obra' : `Relatório semanal de obra em falta · último há ${falta.dias} dias`}
                </p>
                <p className="text-xs text-warning mt-0.5">
                  Com a obra em curso, os investidores recebem um relatório por semana. Regista a vistoria da semana e envia o PDF.
                </p>
              </div>
              <button type="button" onClick={() => { setObrasSub('vistorias'); setTab('obras') }}
                className="text-xs font-medium text-warning hover:underline whitespace-nowrap">Abrir Obras</button>
            </div>
          )
        })()}

        {/* Voltar + ações topo */}
        <div className="flex items-center justify-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isReadOnly && semFases && (
              <Button size="sm" icon={Plus} onClick={inicializarFases}>Inicializar fases</Button>
            )}
            <button type="button" onClick={() => openDocument(`/api/crm/projetos/${id}/export-excel`, { download: true }).catch(e => console.error('[export-excel]', e.message))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-raised text-xs font-medium text-ink-muted hover:bg-surface">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
            {!isReadOnly && <PartilharAcesso entidade="negocio" entidadeId={id} nome={negocio.movimento} />}
            {!isReadOnly && (
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>
            )}
            {!isReadOnly && (
              <Button size="sm" variant="ghost" icon={Trash2} className="hover:!text-danger hover:!bg-danger/10"
                onClick={async () => {
                  if (!(await confirmar(`Apagar o projeto "${negocio.movimento}"? Esta ação apaga também fases, tarefas e fotos. Não pode ser revertida.`))) return
                  const r = await apiFetch(`/api/crm/negocios/${id}`, { method: 'DELETE' })
                  if (r.ok) { toast('Projeto apagado.', 'success'); navigate('/projectos') }
                  else toast(friendlyError((await r.json().catch(() => ({}))).error || { status: r.status }), 'error')
                }}
              >Apagar</Button>
            )}
            {isInvestidor && (
              <span className="text-[10px] uppercase tracking-wider text-ink-muted ml-2">Vista de investidor</span>
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
                  toast(friendlyError(err.error || { status: r.status }), 'error')
                  return
                }
                setEditing(false)
                toast('Projeto guardado.', 'success')
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

        {/* Progresso do projeto (nome, categoria e imóvel já estão no cabeçalho) */}
        <div className="rounded-xl border border-line bg-surface-raised px-4 sm:px-5 py-4 shadow-xs">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Badge tone="gray" size="sm">{negocio.categoria}</Badge>
              {negocio.tipo_projeto === 'predio' && <Badge tone="gray" variant="outline" size="sm">Prédio</Badge>}
              {imovel?.zona && <span className="text-caption text-ink-muted truncate">{imovel.zona}</span>}
            </div>
            <div className="flex items-end gap-6">
              {faseAtual && (
                <div className="min-w-0">
                  <p className="text-overline uppercase text-ink-muted">Fase atual</p>
                  <p className="text-ui font-semibold text-ink truncate mt-0.5">
                    {(() => { const I = FASE_ICONS[faseAtual.fase_key] || FASE_ICON_DEFAULT; return <I className="w-4 h-4 mr-1 inline-block align-[-3px] text-ink-muted" /> })()} {faseAtual.nome}
                  </p>
                </div>
              )}
              <div className="text-right">
                <p className="text-overline uppercase text-ink-muted">Execução</p>
                <p className="font-display text-2xl text-ink num leading-tight">{pct}%</p>
              </div>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Execução global">
            <div className="h-full rounded-full bg-accent transition-[width] duration-slow ease-entry" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Tabs */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="flex overflow-x-auto border-b border-line  bg-surface/50 ">
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`relative px-4 py-3 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity,transform]
                    ${active
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-ink'}`}>
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                  {active && <motion.span layoutId="projeto-tab-bar" transition={tabIndicatorTransition} className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-t-full" />}
                </button>
              )
            })}
          </div>

          <TabTransition tabKey={tab} direction={direcaoAba} className="p-4 sm:p-6">
            {tab === 'resumo' && <TabResumo resumo={resumo} fases={fasesFiltradas} fracaoSel={fracaoSel} fracoes={fracoes} onChange={load} readOnly={isReadOnly} />}
            {tab === 'fracoes' && <TabFracoes negocioId={id} fracoes={fracoes} onChange={load} readOnly={isReadOnly} fasesComuns={fases.filter(f => !f.fracao_id)} />}
            {tab === 'analise' && (
              imovel
                ? <>
                    <AnaliseFinalBar negocioId={id} analiseFinal={resumo.analiseFinal} podeGuardar={role === 'admin'} onChange={load} />
                    <AnaliseTab imovelId={imovel.id} imovelNome={imovel.nome} imovel={imovel} emProjeto />
                  </>
                : <p className="text-sm text-ink-muted py-8 text-center">Sem imóvel associado a este projeto.</p>
            )}
            {tab === 'fases' && <TabFases fases={fasesFiltradas} onChange={load} readOnly={isReadOnly} negocioId={id} imovelId={imovel?.id} fotosImovel={imovel?.fotos} regiao={negocio.regiao || imovel?.regiao} />}
            {tab === 'obras' && (
              <TabObras
                imovel={imovel} negocio={negocio} negocioId={id}
                fases={fasesFiltradas} fotos={fotosFiltradas} fracaoSel={fracaoSel}
                isWholesalling={isWholesalling} isReadOnly={isReadOnly} onChange={load} subInicial={obrasSub}
              />
            )}
            {tab === 'faturas' && <TabFaturas negocioId={id} analise={analise} readOnly={isReadOnly} consultoria={isConsultoria} />}
            {tab === 'documentos' && <TabDocumentos negocio={negocio} imovel={imovel} fases={fases} readOnly={isReadOnly} />}
            {tab === 'investidores' && <TabInvestidores negocio={negocio} readOnly={isReadOnly} />}
            {tab === 'reunioes' && <TabReunioes negocioId={id} readOnly={isReadOnly} />}
            {tab === 'historico' && <TabHistorico negocioId={id} />}
          </TabTransition>
        </Card>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// ANÁLISE FINAL — guarda a análise ativa como final no projeto: o Estimado
// passa a usar essa cópia e deixa de mexer com edições posteriores.
// ════════════════════════════════════════════════════════════════
function AnaliseFinalBar({ negocioId, analiseFinal, podeGuardar, onChange }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  async function guardar() {
    const msg = analiseFinal
      ? 'Substituir a análise final guardada pela análise atual? O Estimado do projeto passa a usar os novos valores.'
      : 'Guardar a análise atual como final? O Estimado do projeto fica fixo nestes valores.'
    if (!(await confirmar(msg))) return
    setSaving(true)
    const r = await apiFetch(`/api/crm/projetos/${negocioId}/analise-final`, { method: 'POST' })
    setSaving(false)
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(err.error || `Erro ao guardar (${r.status})`, 'error', 3500)
      return
    }
    toast?.('Análise guardada como final', 'success', 2500)
    onChange()
  }

  return (
    <Card padding="sm" className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        {analiseFinal
          ? <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />}
        <p className="text-sm text-ink ">
          {analiseFinal
            ? <>Análise final guardada a <b>{fmtData(analiseFinal.guardada_em)}</b>{analiseFinal.guardada_por ? <> por {analiseFinal.guardada_por}</> : null}. O Estimado do projeto usa estes valores.</>
            : <>A análise ainda não foi guardada como final. O Estimado do projeto acompanha-a em tempo real.</>}
        </p>
      </div>
      {podeGuardar && (
        <Button size="sm" variant={analiseFinal ? 'secondary' : 'primary'} onClick={guardar} disabled={saving}>
          {saving ? 'A guardar…' : analiseFinal ? 'Guardar de novo como final' : 'Guardar como final'}
        </Button>
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: RESUMO
// ════════════════════════════════════════════════════════════════
function TabResumo({ resumo, fases, onChange, readOnly }) {
  const { negocio, imovel, analise } = resumo
  const faturacao = useFaturacaoNegocio({ negocio, imovel, analise })
  const isWS = negocio.categoria === 'Wholesaling'
  const totalTarefas = fases.reduce((s, f) => s + (f.tarefas_total || 0), 0)
  const tarefasConcluidas = fases.reduce((s, f) => s + (f.tarefas_concluidas || 0), 0)

  // SOP 13 §9 — semáforo de desvio orçamental da última vistoria registada.
  const [ultimoSemaforo, setUltimoSemaforo] = useState(null)
  useEffect(() => {
    if (isWS) return
    apiFetch(`/api/crm/projetos/${negocio.id}/vistorias`)
      .then(r => r.ok ? r.json() : null)
      .then(j => setUltimoSemaforo((j?.vistorias || []).find(v => v.semaforo_cor) || null))
      .catch(() => {})
  }, [negocio.id, isWS])

  // Uma só fonte por número: o dinheiro está todo no quadro; aqui fica só o
  // calendário e o progresso (sem repetir faturação, capital ou custos).
  const fasesConcluidas = fases.filter(f => f.estado === 'concluida').length
  const calendario = [
    { label: 'Compra', value: fmtData(negocio.data_compra) },
    { label: 'Venda estimada', value: fmtData(negocio.data_estimada_venda) },
    negocio.data_venda && { label: 'Venda', value: fmtData(negocio.data_venda) },
    fases.length > 0 && { label: 'Fases', value: `${fasesConcluidas}/${fases.length}` },
    totalTarefas > 0 && { label: 'Tarefas', value: `${tarefasConcluidas}/${totalTarefas}` },
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      {negocio.categoria === 'Consultoria/Assessoria'
        ? <QuadroConsultoria negocioId={negocio.id} faturacao={faturacao} />
        : <QuadroEstimadoVsReal negocioId={negocio.id} analise={analise} faturacao={faturacao} />}

      {/* Wholesaling (fee em prestações) e Consultoria (honorário) recebem em
          tranches, que alimentam a Faturação real. CAEP e Fix and Flip não têm
          tranches: o lucro bruto é distribuído na venda, por isso só se mostra
          a divisão entre a Somnium e os investidores. */}
      {['Wholesaling', 'Consultoria/Assessoria'].includes(negocio.categoria)
        ? (
          <Card padding="md">
            <TranchesRecebimento negocio={negocio} imovel={imovel} analise={analise} onChange={onChange} readOnly={readOnly} />
          </Card>
        )
        : <ResumoFaturacaoNegocio negocio={negocio} imovel={imovel} analise={analise} />}

      <Card padding="sm" className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {calendario.map(c => (
          <div key={c.label} className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">{c.label}</span>
            <span className="text-sm font-medium text-ink ">{c.value}</span>
          </div>
        ))}
        {ultimoSemaforo && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">Última vistoria</span>
            <StatusBadge status={SEMAFORO_STATUS[ultimoSemaforo.semaforo_cor]} />
          </div>
        )}
      </Card>

      {fases.length > 0 && <GanttFases fases={fases} negocio={negocio} />}

      {negocio.notas && (
        <Card padding="sm">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">Notas</p>
          <p className="text-xs text-ink  mt-1 whitespace-pre-line">{negocio.notas}</p>
        </Card>
      )}

      <AiResumoCard negocioId={negocio.id} />
    </div>
  )
}

function fmtData(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? iso : d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}


function Field({ label, value, accent }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-line  last:border-0">
      <span className="text-caption text-ink-muted ">{label}</span>
      <span className={`text-sm font-medium ${accent ? 'text-ink  num' : 'text-ink '}`}>{value || '—'}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: OBRAS — agrupa tudo o que é acompanhamento de obra num único
// separador com sub-abas: Orçamento, Fotos, Vistoria Semanal. As fases e
// tarefas vivem no separador próprio "Fases e Tarefas" (não são só de obra).
// ════════════════════════════════════════════════════════════════
function TabObras({ imovel, negocio, negocioId, fases, fotos, fracaoSel, isWholesalling, isReadOnly, onChange, subInicial = null }) {
  const SUBTABS_OBRAS = [
    { key: 'orcamento', label: 'Orçamento',        hidden: isWholesalling },
    { key: 'fotos',     label: 'Fotos',            hidden: isWholesalling },
    { key: 'vistorias', label: 'Vistoria Semanal', hidden: isReadOnly },
  ].filter(t => !t.hidden)

  const [sub, setSub] = useState(SUBTABS_OBRAS.some(t => t.key === subInicial) ? subInicial : SUBTABS_OBRAS[0]?.key)
  useEffect(() => {
    if (SUBTABS_OBRAS.some(t => t.key === subInicial)) setSub(subInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subInicial])
  useEffect(() => {
    if (!SUBTABS_OBRAS.some(t => t.key === sub)) setSub(SUBTABS_OBRAS[0]?.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWholesalling, isReadOnly])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-line  -mt-1 overflow-x-auto">
        {SUBTABS_OBRAS.map(t => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              sub === t.key
                ? 'border-brand-gold text-brand-dark dark:text-brand-gold'
                : 'border-transparent text-ink-muted hover:text-ink-muted '
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'orcamento' && <TabOrcamento imovel={imovel} negocio={negocio} onChange={onChange} />}
      {sub === 'fotos' && <TabFotos negocioId={negocioId} fases={fases} fotos={fotos} onChange={onChange} readOnly={isReadOnly} fracaoSel={fracaoSel} />}
      {sub === 'vistorias' && <TabVistorias negocioId={negocioId} negocio={negocio} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: FASES & TAREFAS
// ════════════════════════════════════════════════════════════════
function TabFases({ fases, onChange, readOnly, negocioId, imovelId, fotosImovel, regiao }) {
  if (fases.length === 0) {
    return <p className="text-center text-sm text-ink-muted py-8">Sem fases criadas. Inicializa-as no topo da página.</p>
  }
  return (
    <div className="space-y-3">
      {fases.map(f => <FaseAccordion key={f.id} fase={f} onChange={onChange} readOnly={readOnly} negocioId={negocioId} imovelId={imovelId} fotosImovel={fotosImovel} regiao={regiao} />)}
    </div>
  )
}

function FaseAccordion({ fase, onChange, readOnly, negocioId, imovelId, fotosImovel, regiao }) {
  // Sem responsável escrito, a fase é do dono da região do projeto (D10).
  const donoRegiao = useResponsaveisRegiao()[regiao] || null
  const toast = useToast()
  const [open, setOpen] = useState(fase.estado === 'em_curso')
  const [novaDespesa, setNovaDespesa] = useState({ movimento: '', valor: '', data: '', categoria: 'Material' })
  const cor = FASE_COR[fase.fase_key] || '#6b6962'
  const FaseIcon = FASE_ICONS[fase.fase_key] || FASE_ICON_DEFAULT
  const diasAtraso = calcularAtraso(fase)

  // Migrado para React Query (Problema 23/24 da auditoria) — só busca quando
  // o acordeão está aberto, e fica em cache entre aberturas/fechos.
  const despesasQuery = useQuery({
    queryKey: ['fase-despesas', negocioId, fase.id],
    enabled: open && !!negocioId,
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/despesas`)
      if (!r.ok) throw new Error('Erro ao carregar despesas')
      const { despesas } = await r.json()
      return despesas.filter(d => d.fase_id === fase.id)
    },
  })
  const despesas = useMemo(() => despesasQuery.data ?? [], [despesasQuery.data])
  const loadDespesas = despesasQuery.refetch

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
    if (!(await confirmar('Apagar esta despesa?'))) return
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
  return (
    <div className={`bg-surface-raised  border rounded-xl overflow-hidden transition-[background-color,border-color,color,box-shadow,opacity,transform] ${open ? 'shadow-md border-line ' : 'border-line  shadow-xs'}`}>
      <button onClick={() => setOpen(!open)}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-surface  transition-colors">
        <div className="flex items-center gap-3 flex-1 text-left min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 transition-transform group-hover:scale-105"
            style={{ background: `${cor}18`, border: `1px solid ${cor}30`, color: cor }}><FaseIcon className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-ink ">{fase.nome}</span>
              <Badge
                tone={fase.estado === 'concluida' ? 'green' : fase.estado === 'em_curso' ? 'blue' : fase.estado === 'bloqueada' ? 'red' : 'gray'}
                size="xs">{ESTADO_LABEL[fase.estado] || fase.estado}</Badge>
              {diasAtraso != null && (
                <Badge tone="red" size="xs" icon={AlertTriangle}>{diasAtraso}d atraso</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex-1 max-w-[220px] bg-surface-muted  rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-300" style={{ width: `${fase.perc_execucao || 0}%`, background: cor }} />
              </div>
              <span className="text-xs text-ink  num font-semibold">{fase.perc_execucao || 0}%</span>
              <span className="text-caption text-ink-muted ">{fase.tarefas_concluidas}/{fase.tarefas_total} tarefas</span>
              {fase.fotos_count > 0 && <span className="text-caption text-ink-muted inline-flex items-center gap-1"><Camera className="w-3 h-3" />{fase.fotos_count}</span>}
            </div>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-ink-muted  transition-transform ${open ? 'rotate-90 text-brand-gold' : ''}`} />
      </button>

      {open && readOnly && (
        <div className="border-t border-line bg-surface p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-[10px] text-ink-muted uppercase block">Início previsto</span><span className="text-ink">{fase.data_inicio_prevista || '—'}</span></div>
            <div><span className="text-[10px] text-ink-muted uppercase block">Fim previsto</span><span className="text-ink">{fase.data_fim_prevista || '—'}</span></div>
            <div><span className="text-[10px] text-ink-muted uppercase block">Início real</span><span className="text-ink">{fase.data_inicio_real || '—'}</span></div>
            <div><span className="text-[10px] text-ink-muted uppercase block">Fim real</span><span className="text-ink">{fase.data_fim_real || '—'}</span></div>
          </div>
          <TarefasFase fase={fase} negocioId={negocioId} fotosImovel={fotosImovel} readOnly onChange={onChange} />
          {fase.notas && (
            <div>
              <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">Notas</p>
              <p className="text-xs text-ink bg-surface-raised rounded-lg p-2.5 border border-line">{fase.notas}</p>
            </div>
          )}
        </div>
      )}
      {open && !readOnly && (
        <div className="border-t border-line bg-surface p-4 space-y-4">
          {/* Estado + datas + orçamento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Estado</label>
              <select value={fase.estado} onChange={e => setEstado(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised">
                {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">% Execução (automática)</label>
              <p className="px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface num text-ink" title="Calculada pelas tarefas: todas valem o mesmo e as checklists contam em parte">{fase.perc_execucao || 0}%</p>
            </div>
            <div>
              <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Responsável</label>
              <input type="text" defaultValue={fase.responsavel || ''}
                onBlur={e => e.target.value !== (fase.responsavel || '') && setCampo('responsavel', e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" placeholder={donoRegiao ? `${donoRegiao} (região ${regiao})` : 'Ex: João Abreu'} />
            </div>
            <div>
              <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Início previsto</label>
              <input type="date" defaultValue={fase.data_inicio_prevista || ''} onBlur={e => setCampo('data_inicio_prevista', e.target.value || null)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" />
            </div>
            <div>
              <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Fim previsto</label>
              <input type="date" defaultValue={fase.data_fim_prevista || ''} onBlur={e => setCampo('data_fim_prevista', e.target.value || null)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" />
            </div>
            <div>
              <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Orçamento alocado (€)</label>
              <input type="number" step="any" defaultValue={fase.orcamento_alocado || 0} onBlur={e => setCampo('orcamento_alocado', parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" onWheel={e => e.target.blur()} />
            </div>
          </div>

          {/* Tarefas (com checklist e tarefas opcionais) */}
          <TarefasFase fase={fase} negocioId={negocioId} imovelId={imovelId} fotosImovel={fotosImovel} onChange={onChange} />

          {/* Despesas detalhadas (F2.6) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-ink-muted uppercase tracking-wide">Despesas reais ({despesas.length}) · <span className="num text-ink">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(custoTotalDespesas)}</span></p>
            </div>
            {despesas.length > 0 && (
              <div className="space-y-1 mb-2">
                {despesas.map(d => (
                  <div key={d.id} className="flex items-center gap-2 group bg-surface-raised rounded-lg px-2.5 py-1.5 border border-line">
                    <span className="text-xs text-ink flex-1">{d.movimento}</span>
                    <span className="text-[10px] text-ink-muted">{d.data || '—'}</span>
                    <span className="text-xs num font-semibold text-danger">{new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(d.custo_mensal || 0)}</span>
                    <button onClick={() => apagarDespesa(d.id)} className="opacity-0 group-hover:opacity-100 text-ink-muted/70 hover:text-danger">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={adicionarDespesa} className="grid grid-cols-12 gap-1.5">
              <input value={novaDespesa.movimento} onChange={e => setNovaDespesa({ ...novaDespesa, movimento: e.target.value })}
                placeholder="Ex: Material elétrico" className="col-span-5 px-2 py-1 text-xs rounded-lg border border-line bg-surface-raised" />
              <input type="number" step="0.01" value={novaDespesa.valor} onChange={e => setNovaDespesa({ ...novaDespesa, valor: e.target.value })}
                placeholder="€" className="col-span-2 px-2 py-1 text-xs rounded-lg border border-line bg-surface-raised num" />
              <input type="date" value={novaDespesa.data} onChange={e => setNovaDespesa({ ...novaDespesa, data: e.target.value })}
                className="col-span-3 px-2 py-1 text-xs rounded-lg border border-line bg-surface-raised" />
              <button type="submit" disabled={!novaDespesa.movimento.trim() || !novaDespesa.valor}
                className="col-span-2 px-2 py-1 rounded-lg bg-brand-dark text-brand-gold text-xs disabled:bg-line disabled:text-ink-muted disabled:cursor-not-allowed inline-flex items-center justify-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </form>
          </div>

          {/* Notas */}
          <div>
            <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Notas da fase</label>
            <textarea defaultValue={fase.notas || ''} onBlur={e => e.target.value !== (fase.notas || '') && setCampo('notas', e.target.value)}
              rows={2} placeholder="Anotações, riscos, decisões..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-line bg-surface-raised" />
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
function TabOrcamento({ imovel, negocio, onChange }) {
  if (!imovel) return <p className="text-sm text-ink-muted">Este projeto não tem imóvel associado. Liga um imóvel ao negócio para usar o orçamento detalhado de obra.</p>
  return <ImportarOrcamento imovel={imovel} negocio={negocio} onChange={onChange} />
}

// ════════════════════════════════════════════════════════════════
// Orçamento do projecto — duas formas de importar, sem links de saída:
// 1) Importar orçamento: orçamentos reais recebidos de fornecedores/
//    empreiteiros (fornecedor, valor, ficheiro) — DocumentosOrcamentosTab,
//    ligado ao imóvel (mesma tabela/armazenamento usados no Comercial).
// 2) Importar orçamento interno: copiar o orçamento de obra (25 secções) já
//    preenchido no Comercial (meramente ilustrativo, feito pelo sócio) para
//    este projecto — a partir daqui É este que conta como o orçamento real
//    do negócio. "Reimportar" pede confirmação por substituir esse valor.
// ════════════════════════════════════════════════════════════════
function ImportarOrcamento({ imovel, negocio, onChange }) {
  const toast = useToast()
  const [importando, setImportando] = useState(false)
  const jaTemOrcamento = !!negocio?.orcamento_obra_snapshot

  async function importarInterno() {
    if (jaTemOrcamento && !(await confirmar('Já existe um orçamento importado, usado como o orçamento real do projeto. Substituir pelos valores atuais do Comercial?'))) return
    setImportando(true)
    try {
      const r = await apiFetch(`/api/crm/projetos/${negocio.id}/orcamento-interno/importar`, { method: 'POST' })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao importar orçamento interno')
      }
      toast?.('Orçamento interno importado.', 'success', 3000)
      onChange?.()
    } catch (err) { toast?.(err.message, 'error', 4000) }
    finally { setImportando(false) }
  }

  const snap = negocio?.orcamento_obra_snapshot
  const calc = snap ? calcOrcamentoObra(snap) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Orçamento interno de obra</h3>
        <button onClick={importarInterno} disabled={importando}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-dark text-brand-gold text-xs font-medium hover:bg-brand-dark-light disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${importando ? 'animate-spin' : ''}`} />
          {snap ? 'Reimportar orçamento interno' : 'Importar orçamento interno'}
        </button>
      </div>

      {/* Orçamento interno importado — cópia estática do orçamento de obra do Comercial */}
      {calc && (
        <div className="rounded-xl border border-line  bg-surface-raised  p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-ink-muted ">Última importação</p>
            {snap._importado_em && (
              <span className="text-[10px] text-ink-muted">Importado em {new Date(snap._importado_em).toLocaleDateString('pt-PT')}</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6">
            <Field label="Total obra" value={EUR(calc.total_obra)} accent />
            <Field label="IVA" value={EUR(calc.totais.iva_geral)} />
            <Field label="Retenções IRS" value={EUR(calc.totais.retencoes_irs)} />
            <Field label="Total a pagar" value={EUR(calc.totais.a_pagar)} accent />
          </div>
        </div>
      )}

      {/* Orçamentos recebidos de fornecedores/empreiteiros — mesma tabela e
          armazenamento (Storage + espelho Drive) usados no Comercial. */}
      <DocumentosOrcamentosTab imovelId={imovel.id} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: FATURAÇÃO (tranches do negócio)
// ════════════════════════════════════════════════════════════════

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

// Resumo de faturação do negócio: Total do Negócio (bruto) e a respectiva
// divisão Somnium / Investidores, sempre em valores brutos — independente do
// regime fiscal ou da base (líquido/bruto) escolhida na Análise Financeira —
// comparando o expectável (modelo + % configurada) com o já realizado
// (negocio.lucro_real, alimentado pelas tranches confirmadas em baixo).
function useFaturacaoNegocio({ negocio, imovel, analise }) {
  // Migrado para React Query (Problema 23/24 da auditoria).
  const investidoresQuery = useQuery({
    queryKey: ['projeto-investidores', negocio.id],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocio.id}/investidores`).catch(() => null)
      return r?.ok ? (await r.json()).investidores || [] : []
    },
  })
  const investidores = useMemo(() => investidoresQuery.data ?? [], [investidoresQuery.data])
  const loadInvestidores = investidoresQuery.refetch
  // Dinâmico: qualquer gravação (tranches, investidores, análise financeira) dispara
  // 'somnium:refresh' via apiFetch — recarrega esta lista sem precisar de mudar de aba.
  useRefreshOnMutation(loadInvestidores)

  const percInvestidoresLigados = investidores.reduce((s, i) => s + (Number(i.percentagem) || 0), 0)

  const categoria = negocio.categoria
  let percSomnium, totalExpectavel, modeloLabel

  if (categoria === 'Consultoria/Assessoria') {
    // Honorário fixo = Σ tranches do Resumo (fonte única); 100% Somnium.
    modeloLabel = 'Consultoria/Assessoria — honorário fixo'
    percSomnium = 100
    let pagsCons = []
    try { pagsCons = typeof negocio.pagamentos_faseados === 'string' ? JSON.parse(negocio.pagamentos_faseados || '[]') : (negocio.pagamentos_faseados || []) } catch {}
    const somaTranches = pagsCons.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
    totalExpectavel = round2(somaTranches) || Number(negocio.lucro_estimado) || 0
  } else if (categoria === 'Wholesaling') {
    modeloLabel = 'Wholesaling — cedência de posição'
    percSomnium = Math.max(0, 100 - percInvestidoresLigados)
    totalExpectavel = Number(imovel?.fee_cedencia) || Number(negocio.lucro_estimado) || 0
  } else if (categoria === 'Mediação Imobiliária') {
    modeloLabel = 'Mediação Imobiliária'
    percSomnium = Math.max(0, 100 - percInvestidoresLigados)
    const vvr = Number(analise?.vvr) || 0
    const comissaoPerc = analise?.comissao_perc != null && analise.comissao_perc !== '' ? Number(analise.comissao_perc) : 2.5
    totalExpectavel = vvr > 0 ? round2(vvr * comissaoPerc / 100) : (Number(negocio.lucro_estimado) || 0)
  } else if (categoria === 'CAEP') {
    modeloLabel = 'CAEP — parceria de investimento'
    // % da Somnium definida no projecto (aba Investidores); os parceiros dividem o resto.
    percSomnium = negocio.comissao_pct != null && negocio.comissao_pct !== '' ? Number(negocio.comissao_pct) : 40
    totalExpectavel = Number(analise?.lucro_bruto) || 0
  } else {
    modeloLabel = categoria || 'Fix and Flip'
    percSomnium = Math.max(0, 100 - percInvestidoresLigados)
    totalExpectavel = Number(analise?.lucro_bruto) || 0
  }

  const somniumExpectavel = round2(totalExpectavel * percSomnium / 100)
  const investidoresExpectavel = round2(totalExpectavel - somniumExpectavel)

  // Real: lucro_real reflecte sempre o que a Somnium já recebeu (tranches
  // confirmadas). O total e a parte dos investidores derivam-se aplicando a
  // mesma % do modelo — não há forma de rastrear recebimentos dos investidores
  // fora do CRM, por isso é uma extrapolação assumida sobre o valor já confirmado.
  const somniumReal = Number(negocio.lucro_real) || 0
  const totalReal = percSomnium > 0 ? round2(somniumReal / (percSomnium / 100)) : somniumReal
  const investidoresReal = round2(totalReal - somniumReal)

  // Divisão por investidor — fonte única: aba Investidores do projecto.
  // CAEP: a % de cada parceiro é a sua fatia da parte dos investidores (o resto
  // após a Somnium); sem % atribuídas, divide-se pelo capital (como o calcCAEP).
  // Restantes modelos: a % de cada investidor é sobre o total do negócio.
  let investidoresDetalhe = []
  if (categoria === 'CAEP' && investidores.length) {
    const usaPerc = percInvestidoresLigados > 0
    const pesoTotal = usaPerc ? percInvestidoresLigados : investidores.reduce((s, i) => s + (Number(i.capital) || 0), 0)
    investidoresDetalhe = investidores.map(inv => {
      const peso = usaPerc ? (Number(inv.percentagem) || 0) : (Number(inv.capital) || 0)
      const fracao = pesoTotal > 0 ? peso / pesoTotal : 0
      return {
        id: inv.id,
        nome: inv.investidor_nome || 'Investidor',
        percPie: round2((100 - percSomnium) * fracao),
        exp: round2(investidoresExpectavel * fracao),
        real: round2(investidoresReal * fracao),
      }
    })
  } else if (investidores.length) {
    investidoresDetalhe = investidores.map(inv => ({
      id: inv.id,
      nome: inv.investidor_nome || 'Investidor',
      percPie: Number(inv.percentagem) || 0,
      exp: round2(totalExpectavel * (Number(inv.percentagem) || 0) / 100),
      real: round2(totalReal * (Number(inv.percentagem) || 0) / 100),
    }))
  }

  // Capital: fonte única = investidores ligados na aba Investidores do projecto.
  // Em CAEP chama-se "angariado" (parceiros); nos restantes modelos, "alocado".
  const capitalLigados = round2(investidores.reduce((s, i) => s + (Number(i.capital) || 0), 0))
  const capitalLabel = categoria === 'CAEP' ? 'Capital angariado' : 'Capital alocado'
  const capitalValor = capitalLigados || Number(negocio.capital_total) || 0

  return { modeloLabel, percSomnium, totalExpectavel, totalReal, somniumExpectavel, somniumReal, investidoresExpectavel, investidoresReal, investidoresDetalhe, capitalLabel, capitalValor }
}

function ResumoFaturacaoNegocio({ negocio, imovel, analise }) {
  const { modeloLabel, percSomnium, totalExpectavel, totalReal, somniumExpectavel, somniumReal, investidoresExpectavel, investidoresReal, investidoresDetalhe } =
    useFaturacaoNegocio({ negocio, imovel, analise })

  const Linha = ({ label, exp, real, sub }) => (
    <div className="grid grid-cols-3 items-center gap-2 py-2.5 border-b border-line last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {sub && <p className="text-[10px] text-ink-muted">{sub}</p>}
      </div>
      <p className="text-sm num text-right text-ink-muted">{EUR(exp)}</p>
      <p className="text-sm num text-right font-semibold text-ink">{EUR(real)}</p>
    </div>
  )

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Faturação do Negócio (bruto)</p>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-dark font-medium">{modeloLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-1 mt-3">
        <div />
        <p className="text-[10px] uppercase tracking-wide text-ink-muted text-right">Estimado</p>
        <p className="text-[10px] uppercase tracking-wide text-ink-muted text-right">Real</p>
      </div>
      <Linha label="Faturação Total do Negócio" exp={totalExpectavel} real={totalReal} />
      <Linha label="Somnium Properties" sub={`${percSomnium.toFixed(1)}%`} exp={somniumExpectavel} real={somniumReal} />
      <Linha label="Investidores" sub={`${Math.max(0, 100 - percSomnium).toFixed(1)}%`} exp={investidoresExpectavel} real={investidoresReal} />
      {investidoresDetalhe.length > 0 && (
        <div className="pl-4 border-l-2 border-line ml-1">
          {investidoresDetalhe.map(inv => (
            <Linha key={inv.id} label={inv.nome} sub={`${inv.percPie.toFixed(1)}%`} exp={inv.exp} real={inv.real} />
          ))}
        </div>
      )}
    </div>
  )
}

function TranchesRecebimento({ negocio, imovel, analise, onChange, readOnly }) {
  const toast = useToast()
  let pags = []
  try { pags = typeof negocio.pagamentos_faseados === 'string' ? JSON.parse(negocio.pagamentos_faseados || '[]') : (negocio.pagamentos_faseados || []) } catch {}
  const total = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const recebido = pags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const pct = total > 0 ? Math.round((recebido / total) * 100) : 0

  const [novaT, setNovaT] = useState({ descricao: '', valor: '', data: '' })
  const [saving, setSaving] = useState(false)

  async function confirmar(idx) {
    if (!(await confirmar(`Confirmar recebimento desta tranche?`))) return
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
    if (!(await confirmar(`Apagar a tranche "${pags[idx].descricao || `Tranche ${idx + 1}`}"?`))) return
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
      <ResumoFaturacaoNegocio negocio={negocio} imovel={imovel} analise={analise} />

      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Tranches / Cronograma de Pagamentos</p>

      {pags.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-surface-muted rounded-full h-2.5">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm num font-semibold text-ink">{EUR(recebido)} / {EUR(total)}</span>
          </div>
          {pags.map((p, idx) => (
            <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border group ${p.recebido ? 'bg-success/10 border-success/30' : 'bg-warning/10 border-warning/30'}`}>
              {p.recebido ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-ink-muted/70" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{p.descricao || `Tranche ${idx + 1}`}</p>
                <p className="text-[10px] text-ink-muted">{p.data || 'Sem data'}</p>
              </div>
              <span className="text-sm num font-semibold text-ink">{EUR(p.valor)}</span>
              {!readOnly && !p.recebido && <Button size="sm" variant="success" onClick={() => confirmar(idx)}>Confirmar</Button>}
              {!readOnly && (
                <button onClick={() => apagarTranche(idx)} title="Apagar tranche"
                  className="opacity-0 group-hover:opacity-100 text-ink-muted/70 hover:text-danger transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </>
      ) : (
        <p className="text-sm text-ink-muted mb-3">{readOnly ? 'Sem tranches definidas.' : 'Sem tranches definidas. Adiciona a primeira abaixo.'}</p>
      )}

      {/* Form inline: adicionar tranche */}
      {!readOnly && <form onSubmit={adicionarTranche} className="mt-4 pt-4 border-t border-line">
        <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-2">Nova tranche</p>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input type="text" value={novaT.descricao} onChange={e => setNovaT({ ...novaT, descricao: e.target.value })}
            placeholder="Ex: Sinal, 2ª prestação, Final..." className="sm:col-span-5 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" />
          <input type="number" step="0.01" value={novaT.valor} onChange={e => setNovaT({ ...novaT, valor: e.target.value })}
            placeholder="€" className="sm:col-span-3 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised num" />
          <input type="date" value={novaT.data} onChange={e => setNovaT({ ...novaT, data: e.target.value })}
            className="sm:col-span-3 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" />
          <button type="submit" disabled={!novaT.descricao.trim() || !novaT.valor || saving}
            className="sm:col-span-1 px-3 py-1.5 rounded-lg bg-brand-dark text-brand-gold text-sm hover:bg-brand-dark-light disabled:bg-line disabled:text-ink-muted disabled:cursor-not-allowed inline-flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </form>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: FATURAS E COMPROVATIVOS — faturas de fornecedores e comprovativos
// de pagamento — transferência incluída (compra do imóvel, IMT e IS não têm fatura,
// só comprovativo, e contam na mesma), valor manual + estado de pagamento. Reaproveita a tabela despesas (negocio_id) e o mecanismo
// de comprovativo já usado nas "Despesas reais" por fase (aba Obras).
// Cada fatura liga a uma rubrica da Análise Financeira (ou 'Custo extra',
// com motivo + justificação obrigatórios) — alimenta o quadro Estimado vs
// Real da aba Resumo.
// ════════════════════════════════════════════════════════════════
const FATURA_EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0)

const TIPOS_DOCUMENTO = [
  { key: 'fatura', label: 'Fatura', cls: 'bg-surface-muted text-ink-muted' },
  { key: 'comprovativo_pagamento', label: 'Comprovativo de pagamento', cls: 'bg-surface-muted text-ink' },
]
const tipoDocumentoDe = f => TIPOS_DOCUMENTO.find(t => t.key === f.tipo_documento) || TIPOS_DOCUMENTO[0]

const FATURA_FORM_VAZIO = { tipo_documento: 'fatura', fornecedor: '', movimento: '', valor: '', data: '', categoria: '', pago: false, file: null, rubrica_analise: '', motivo_extra: '', justificacao: '' }

function TabFaturas({ negocioId, analise, readOnly, consultoria = false }) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FATURA_FORM_VAZIO)
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState('todas')  // todas | extras | por_classificar
  const [editExtra, setEditExtra] = useState(null)  // { id, rubrica_analise, motivo_extra, justificacao }

  // Migrado para React Query (Problema 23/24 da auditoria).
  const faturasQuery = useQuery({
    queryKey: ['projeto-faturas', negocioId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/despesas`)
      if (!r.ok) throw new Error('Erro ao carregar faturas')
      const { despesas } = await r.json()
      return despesas
    },
  })
  const faturas = useMemo(() => faturasQuery.data ?? [], [faturasQuery.data])
  const loading = faturasQuery.isPending
  const load = faturasQuery.refetch

  async function adicionar(e) {
    e.preventDefault()
    if (!form.fornecedor.trim() || !form.valor) return
    if (!form.rubrica_analise) {
      toast?.('Escolhe a rubrica da Análise Financeira desta fatura.', 'error', 3500)
      return
    }
    if (form.rubrica_analise === RUBRICA_EXTRA && (!form.motivo_extra || !form.justificacao.trim())) {
      toast?.('Custo extra: indica o motivo e a justificação.', 'error', 3500)
      return
    }
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/despesas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor: form.fornecedor.trim(),
          movimento: form.movimento.trim() || form.fornecedor.trim(),
          valor: parseFloat(form.valor) || 0,
          data: form.data || new Date().toISOString().slice(0, 10),
          categoria: form.categoria || undefined,
          pago: form.pago || form.tipo_documento !== 'fatura',
          tipo_documento: form.tipo_documento,
          rubrica_analise: form.rubrica_analise || null,
          motivo_extra: form.rubrica_analise === RUBRICA_EXTRA ? form.motivo_extra : null,
          justificacao: form.justificacao.trim() || null,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        toast?.(`Erro ao adicionar documento: ${err.error || r.status}`, 'error', 3500)
        return
      }
      const despesa = await r.json()
      if (form.file) {
        const fd = new FormData()
        fd.append('comprovativo', form.file)
        await apiFetch(`/api/crm/projetos/despesas/${despesa.id}/comprovativo`, { method: 'POST', body: fd })
      }
      setForm(FATURA_FORM_VAZIO)
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  async function togglePago(f) {
    const r = await apiFetch(`/api/crm/projetos/despesas/${f.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pago: !f.pago }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao actualizar estado: ${err.error || r.status}`, 'error', 3500)
      return
    }
    load()
  }

  async function guardarRubrica(f, campos) {
    const r = await apiFetch(`/api/crm/projetos/despesas/${f.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campos),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao classificar documento: ${err.error || r.status}`, 'error', 3500)
      return false
    }
    load()
    return true
  }

  // Mudar para 'Custo extra' exige motivo + justificação: abre o painel inline
  // em vez de gravar logo. As restantes rubricas gravam de imediato.
  function mudarRubrica(f, rubrica) {
    if (rubrica === RUBRICA_EXTRA) {
      setEditExtra({ id: f.id, rubrica_analise: RUBRICA_EXTRA, motivo_extra: f.motivo_extra || '', justificacao: f.justificacao || '' })
      return
    }
    guardarRubrica(f, { rubrica_analise: rubrica || null, motivo_extra: null })
  }

  async function guardarExtra(f) {
    if (!editExtra.motivo_extra || !editExtra.justificacao.trim()) {
      toast?.('Indica o motivo e a justificação do custo extra.', 'error', 3500)
      return
    }
    const ok = await guardarRubrica(f, { rubrica_analise: RUBRICA_EXTRA, motivo_extra: editExtra.motivo_extra, justificacao: editExtra.justificacao.trim() })
    if (ok) setEditExtra(null)
  }

  async function apagar(id) {
    if (!(await confirmar('Apagar este documento?'))) return
    const r = await apiFetch(`/api/crm/projetos/despesas/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao apagar documento: ${err.error || r.status}`, 'error', 3500)
      return
    }
    load()
  }

  const nExtras = faturas.filter(f => rubricaDe(f) === RUBRICA_EXTRA).length
  const nPorClassificar = faturas.filter(f => !rubricaDe(f)).length
  const faturasVisiveis = filtro === 'extras' ? faturas.filter(f => rubricaDe(f) === RUBRICA_EXTRA)
    : filtro === 'por_classificar' ? faturas.filter(f => !rubricaDe(f))
    : faturas
  const totalPago = faturas.filter(f => f.pago).reduce((s, f) => s + (Number(f.custo_mensal) || 0), 0)
  const totalPendente = faturas.filter(f => !f.pago).reduce((s, f) => s + (Number(f.custo_mensal) || 0), 0)

  if (loading) return <BrandLoader variant="inline" label="Faturas e comprovativos" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[10px] text-ink-muted uppercase tracking-wide">Total</p>
          <p className="text-lg num font-bold text-ink">{FATURA_EUR(totalPago + totalPendente)}</p>
        </div>
        <div className="rounded-xl border border-success/30 bg-success/10 p-3">
          <p className="text-[10px] text-success uppercase tracking-wide">Pago</p>
          <p className="text-lg num font-bold text-success">{FATURA_EUR(totalPago)}</p>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
          <p className="text-[10px] text-warning uppercase tracking-wide">Pendente</p>
          <p className="text-lg num font-bold text-warning">{FATURA_EUR(totalPendente)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-xs">
          {[
            { k: 'todas', label: `Todas (${faturas.length})` },
            { k: 'extras', label: `Custos extra (${nExtras})` },
            { k: 'por_classificar', label: `Por classificar (${nPorClassificar})` },
          ].map(o => (
            <button key={o.k} type="button" onClick={() => setFiltro(o.k)}
              className={`px-2.5 py-1 rounded-full border ${filtro === o.k ? 'bg-brand-dark text-brand-gold border-brand-dark' : 'border-line text-ink-muted hover:bg-surface'}`}>
              {o.label}
            </button>
          ))}
        </div>
        {!readOnly && <Button size="sm" icon={Plus} onClick={() => setShowForm(!showForm)}>Novo documento</Button>}
      </div>

      {showForm && (
        <form onSubmit={adicionar} className="bg-surface rounded-xl p-4 space-y-3 border border-line">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-muted mb-1">Tipo de documento *</label>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS_DOCUMENTO.map(t => (
                  <button key={t.key} type="button" onClick={() => setForm(f => ({ ...f, tipo_documento: t.key, pago: t.key !== 'fatura' ? true : f.pago }))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${form.tipo_documento === t.key ? 'bg-brand-dark text-brand-gold border-brand-dark' : 'border-line text-ink-muted bg-surface-raised hover:bg-surface'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {form.tipo_documento !== 'fatura' && (
                <p className="mt-1 text-[11px] text-ink-muted">Para custos sem fatura (compra do imóvel, IMT, IS…). Um comprovativo prova o pagamento — fica registado como pago. Se o custo já tem fatura aqui, anexa o comprovativo a essa fatura em vez de o lançar de novo.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">{form.tipo_documento === 'fatura' ? 'Fornecedor *' : 'Beneficiário *'}</label>
              <input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                placeholder={form.tipo_documento === 'fatura' ? 'Ex: Construções Silva & Filhos' : 'Ex: Vendedor / Autoridade Tributária'} className="w-full px-3 py-2 rounded-lg border border-line text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Descrição</label>
              <input value={form.movimento} onChange={e => setForm(f => ({ ...f, movimento: e.target.value }))}
                placeholder={form.tipo_documento === 'fatura' ? 'Ex: Fatura nº 123' : 'Ex: Pagamento do IMT'} className="w-full px-3 py-2 rounded-lg border border-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Valor (€) *</label>
              <input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line text-sm num" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Data</label>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Categoria</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-line text-sm">
                <option value="">—</option>
                {DESP_CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">{consultoria ? 'Tipo de custo *' : 'Rubrica da Análise Financeira *'}</label>
              <RubricaSelect value={form.rubrica_analise} analise={analise} consultoria={consultoria} required placeholder="Escolher rubrica…"
                onChange={v => setForm(f => ({ ...f, rubrica_analise: v }))}
                className="w-full px-3 py-2 rounded-lg border border-line text-sm" />
            </div>
            {form.rubrica_analise === RUBRICA_EXTRA && (
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Motivo do custo extra *</label>
                <select value={form.motivo_extra} onChange={e => setForm(f => ({ ...f, motivo_extra: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-line text-sm" required>
                  <option value="">—</option>
                  {MOTIVOS_EXTRA.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {form.rubrica_analise === RUBRICA_EXTRA && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink-muted mb-1">Justificação da necessidade *</label>
                <textarea rows={3} value={form.justificacao} onChange={e => setForm(f => ({ ...f, justificacao: e.target.value }))}
                  placeholder="Porque foi necessário, porque não estava na Análise e o que acontecia se não fosse feito."
                  className="w-full px-3 py-2 rounded-lg border border-line text-sm" required />
              </div>
            )}
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="fatura-pago" checked={form.pago || form.tipo_documento !== 'fatura'} disabled={form.tipo_documento !== 'fatura'}
                onChange={e => setForm(f => ({ ...f, pago: e.target.checked }))}
                className="w-4 h-4 rounded border-line" />
              <label htmlFor="fatura-pago" className="text-xs font-medium text-ink-muted">Já pago</label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Ficheiro (PDF, JPG, PNG) — opcional</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
              className="w-full text-sm text-ink-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-surface-muted file:text-ink file:text-xs file:font-medium hover:file:bg-line" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line text-ink-muted hover:bg-surface-muted">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light disabled:opacity-50">
              {saving ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {faturasVisiveis.length === 0 ? (
        <div className="text-center py-8 text-ink-muted text-sm">{faturas.length === 0 ? 'Sem faturas nem comprovativos registados.' : 'Nenhum documento neste filtro.'}</div>
      ) : (
        <div className="divide-y divide-line">
          {faturasVisiveis.map(f => {
            let docs = []
            try { docs = f.documentos ? JSON.parse(f.documentos) : [] } catch {}
            const rubrica = rubricaDe(f)
            const isExtra = rubrica === RUBRICA_EXTRA
            const editando = editExtra?.id === f.id
            const tipoDoc = tipoDocumentoDe(f)
            return (
              <div key={f.id} className="py-3">
              <div className="flex items-center gap-3 group">
                <button type="button" onClick={() => !readOnly && togglePago(f)} disabled={readOnly} title={f.pago ? 'Marcar como pendente' : 'Marcar como pago'}>
                  {f.pago
                    ? <CheckCircle2 className="w-5 h-5 text-success" />
                    : <Circle className="w-5 h-5 text-amber-400" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{f.fornecedor || f.movimento}</p>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tipoDoc.cls}`}>{tipoDoc.label}</span>
                    <span>{f.movimento}</span>
                    {f.data && <span>· {f.data}</span>}
                    {f.categoria && <span>· {f.categoria}</span>}
                  </div>
                </div>
                {readOnly ? (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${isExtra ? 'bg-danger/10 text-danger' : rubrica ? 'bg-surface-muted text-ink-muted' : 'bg-warning/10 text-warning'}`}>
                    {labelRubrica(rubrica) || 'Por classificar'}
                  </span>
                ) : (
                  <RubricaSelect value={editando ? RUBRICA_EXTRA : rubrica} consultoria={consultoria} onChange={v => mudarRubrica(f, v)}
                    title="Rubrica da Análise Financeira"
                    className={`max-w-[11rem] px-2 py-1 rounded-lg border text-[11px] ${isExtra || editando ? 'border-danger/30 bg-danger/10 text-danger' : rubrica ? 'border-line bg-surface-raised text-ink-muted' : 'border-warning/30 bg-warning/10 text-warning'}`} />
                )}
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${f.pago ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                  {f.pago ? 'Pago' : 'Pendente'}
                </span>
                <span className="text-sm num font-semibold text-ink w-24 text-right">{FATURA_EUR(f.custo_mensal)}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {docs.map(doc => (
                    <a key={doc.id} href={doc.path} target="_blank" rel="noreferrer" title={doc.name}
                      className="p-1.5 rounded-lg hover:bg-surface-muted text-ink-muted hover:text-brand-gold">
                      <FileText className="w-3.5 h-3.5" />
                    </a>
                  ))}
                  {!readOnly && (
                    <button onClick={() => apagar(f.id)} className="p-1.5 rounded-lg hover:bg-danger/10 text-ink-muted/70 hover:text-danger" title="Apagar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {isExtra && !editando && (
                <div className="mt-1.5 ml-8 text-xs">
                  {f.justificacao
                    ? <p className="text-ink-muted bg-danger/10 rounded-lg px-3 py-2 whitespace-pre-line"><span className="font-medium text-danger">{f.motivo_extra || 'Custo extra'}:</span> {f.justificacao}</p>
                    : <p className="text-warning">Custo extra sem justificação.{!readOnly && <button type="button" className="ml-1 underline" onClick={() => mudarRubrica(f, RUBRICA_EXTRA)}>Completar</button>}</p>}
                  {!readOnly && f.justificacao && (
                    <button type="button" className="mt-1 text-[11px] text-ink-muted hover:text-brand-gold" onClick={() => mudarRubrica(f, RUBRICA_EXTRA)}>Editar justificação</button>
                  )}
                </div>
              )}
              {editando && (
                <div className="mt-2 ml-8 p-3 rounded-lg border border-danger/30 bg-danger/10 space-y-2">
                  <select value={editExtra.motivo_extra} onChange={e => setEditExtra(x => ({ ...x, motivo_extra: e.target.value }))}
                    className="w-full sm:w-72 px-2.5 py-1.5 rounded-lg border border-line text-sm bg-surface-raised">
                    <option value="">Motivo do custo extra *</option>
                    {MOTIVOS_EXTRA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <textarea rows={2} value={editExtra.justificacao} onChange={e => setEditExtra(x => ({ ...x, justificacao: e.target.value }))}
                    placeholder="Justificação da necessidade *" className="w-full px-2.5 py-1.5 rounded-lg border border-line text-sm bg-surface-raised" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditExtra(null)} className="px-3 py-1 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-muted">Cancelar</button>
                    <button type="button" onClick={() => guardarExtra(f)} className="px-3 py-1 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light">Guardar</button>
                  </div>
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

// ════════════════════════════════════════════════════════════════
// TAB: FOTOS
// ════════════════════════════════════════════════════════════════
function TabFotos({ negocioId, fases, fotos, onChange, readOnly }) {
  const toast = useToast()
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
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível carregar as fotos.')
      toast(files.length === 1 ? 'Foto carregada.' : `${files.length} fotos carregadas.`, 'success')
      onChange()
    } catch (err) { toast(friendlyError(err.message), 'error') }
    finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  async function apagarFoto(fotoId) {
    if (!(await confirmar('Apagar esta foto?'))) return
    const r = await apiFetch(`/api/crm/projetos/fotos/${fotoId}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast(friendlyError(err.error || { status: r.status }), 'error')
      return
    }
    onChange()
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="bg-surface rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Fase</label>
            <select value={faseSel || ''} onChange={e => setFaseSel(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised">
              {fases.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-ink-muted uppercase tracking-wide block mb-1">Tipo</label>
            <select value={tipoSel} onChange={e => setTipoSel(e.target.value)} className="px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised">
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
        <p className="text-center text-sm text-ink-muted py-12">{readOnly ? 'Sem fotos disponíveis.' : 'Sem fotos. Faz upload acima.'}</p>
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
          <h4 className="text-xs font-semibold text-ink-muted mb-2 flex items-center gap-1.5">
            {(() => { const I = FASE_ICONS[g.faseKey] || FASE_ICON_DEFAULT; return <I className="w-3.5 h-3.5 text-brand-gold shrink-0" /> })()} {g.nome} <span className="text-ink-muted/70">({g.fotos.length})</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {g.fotos.map(foto => (
              <div key={foto.id} className="group relative aspect-square rounded-lg overflow-hidden bg-surface-muted border border-line">
                <img src={foto.url} alt={foto.legenda || ''} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
                  style={{ background: foto.tipo === 'antes' ? '#ef444499' : foto.tipo === 'depois' ? '#22c55e99' : '#0d0d0d99', color: 'white' }}>
                  {foto.tipo}
                </div>
                {onDelete && (
                  <button onClick={() => onDelete(foto.id)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded bg-black/60 text-white hover:bg-danger transition-opacity">
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
  const toast = useToast()
  const isWS = negocio.categoria === 'Wholesaling'
  const [faseFichaSel, setFaseFichaSel] = useState(fases[0]?.id || '')
  const [vistoriaSel, setVistoriaSel] = useState('')
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
    { key: 'comprovativo_liquidacao', label: 'Comprovativo de Pagamento (Liquidação)', cor: '#22c55e' },
    { key: 'outro',        label: 'Outro',         cor: '#6b7280' },
  ]

  // Migrado para React Query (Problema 23/24 da auditoria).
  const query = useQuery({
    queryKey: ['projeto-documentos', negocio.id],
    queryFn: async () => {
      const [rDocs, rVist] = await Promise.all([
        apiFetch(`/api/crm/projetos/${negocio.id}/documentos`),
        apiFetch(`/api/crm/projetos/${negocio.id}/vistorias`),
      ])
      const docs = rDocs.ok ? (await rDocs.json()).documentos || [] : []
      const vistorias = rVist.ok ? (await rVist.json()).vistorias || [] : []
      return { docs, vistorias }
    },
  })
  const docs = useMemo(() => query.data?.docs ?? [], [query.data])
  const vistorias = useMemo(() => query.data?.vistorias ?? [], [query.data])
  const loading = query.isPending
  const load = query.refetch
  // Mantém o comportamento anterior: seleccionar a 1ª vistoria sempre que a
  // lista for (re)carregada.
  useEffect(() => { setVistoriaSel(vistorias[0]?.id || '') }, [vistorias])

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
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível carregar os documentos.')
      toast(files.length === 1 ? 'Documento carregado.' : `${files.length} documentos carregados.`, 'success')
      load()
    } catch (err) { toast(friendlyError(err.message), 'error') }
    finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  async function apagarDoc(id) {
    if (!(await confirmar('Apagar este documento?'))) return
    const r = await apiFetch(`/api/crm/projetos/documentos/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast(friendlyError(err.error || { status: r.status }), 'error')
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

  // Wholesaling (cedência de posição): documentos do imóvel, não de obra.
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
        <h3 className="text-[10px] uppercase tracking-wider text-ink-muted mb-2">PDFs Somnium (auto-gerados)</h3>
        <div className="space-y-2">
          {isWS ? (
            !imovel ? (
              <p className="text-xs text-ink-muted py-2">Liga um imóvel ao negócio para gerar os documentos.</p>
            ) : (
              docsImovelWS.map(t => (
                <div key={t.key} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-line bg-surface">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{t.nome}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{t.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => abrirPDF(t.url)} title="Abrir numa nova aba"
                      className="px-3 py-1.5 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-muted inline-flex items-center gap-1.5">
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
              <div className="p-3 rounded-lg border border-line bg-surface">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">Ficha de Acompanhamento de Obra</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">1 página A4 por fase. KPIs, % execução, fotos, tarefas.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <select value={faseFichaSel} onChange={e => setFaseFichaSel(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-line text-xs bg-surface-raised">
                    <option value="">Escolhe uma fase…</option>
                    {fases.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                  <button onClick={() => faseFichaSel && abrirPDF(`/api/crm/projetos/${negocio.id}/pdf/ficha/${faseFichaSel}`)}
                    disabled={!faseFichaSel} title="Abrir numa nova aba"
                    className="px-3 py-1.5 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </button>
                  <button onClick={() => faseFichaSel && abrirPDF(`/api/crm/projetos/${negocio.id}/pdf/ficha/${faseFichaSel}`, { download: true })}
                    disabled={!faseFichaSel} title="Descarregar PDF para enviar"
                    className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light disabled:bg-line disabled:text-ink-muted disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                    <FileDown className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>
              {/* Relatório Semanal de Obra (por vistoria) */}
              {vistorias.length > 0 && (
                <div className="p-3 rounded-lg border border-line bg-surface">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink">Relatório Semanal de Obra</p>
                      <p className="text-[11px] text-ink-muted mt-0.5">Progresso por rubrica, orçamento, fotos da semana e ocorrências.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select value={vistoriaSel} onChange={e => setVistoriaSel(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-line text-xs bg-surface-raised">
                      {vistorias.map(v => (
                        <option key={v.id} value={v.id}>{new Date(v.semana_data).toLocaleDateString('pt-PT', { dateStyle: 'medium' })}</option>
                      ))}
                    </select>
                    <button onClick={() => vistoriaSel && abrirPDF(`/api/crm/projetos/${negocio.id}/pdf/relatorio-semanal/${vistoriaSel}`)}
                      disabled={!vistoriaSel} title="Abrir numa nova aba"
                      className="px-3 py-1.5 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button onClick={() => vistoriaSel && abrirPDF(`/api/crm/projetos/${negocio.id}/pdf/relatorio-semanal/${vistoriaSel}`, { download: true })}
                      disabled={!vistoriaSel} title="Descarregar PDF para enviar"
                      className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light disabled:bg-line disabled:text-ink-muted disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                      <FileDown className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                </div>
              )}
              {autoGerados.map(t => (
                <div key={t.key} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-line bg-surface">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{t.nome}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{t.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => abrirPDF(t.url)} title="Abrir numa nova aba"
                      className="px-3 py-1.5 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-muted inline-flex items-center gap-1.5">
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
        <h3 className="text-[10px] uppercase tracking-wider text-ink-muted mb-2">Documentos do projeto ({docs.length})</h3>

        {!readOnly && (
          <div className="bg-surface rounded-xl p-3 flex flex-col sm:flex-row gap-2 mb-3">
            <select value={faseDoc} onChange={e => setFaseDoc(e.target.value)}
              className="sm:flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised">
              <option value="">Sem fase específica</option>
              {fases.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised">
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
          <p className="text-xs text-ink-muted py-4 text-center">A carregar…</p>
        ) : docs.length === 0 ? (
          <p className="text-xs text-ink-muted py-6 text-center">Sem documentos. {!readOnly && 'Faz upload acima.'}</p>
        ) : (
          <div className="space-y-1.5">
            {docs.map(doc => {
              const tipoConfig = TIPOS_DOC.find(t => t.key === doc.tipo) || TIPOS_DOC[TIPOS_DOC.length - 1]
              return (
                <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-line bg-surface-raised group">
                  <FileText className="w-5 h-5 text-ink-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-ink hover:text-brand-gold truncate block">{doc.nome}</a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-white"
                        style={{ background: tipoConfig.cor }}>{tipoConfig.label}</span>
                      {doc.fase_nome && <span className="text-[10px] text-ink-muted">{doc.fase_nome}</span>}
                      {doc.tamanho && <span className="text-[10px] text-ink-muted">{(doc.tamanho / 1024).toFixed(0)} KB</span>}
                      <span className="text-[10px] text-ink-muted">{new Date(doc.created_at).toLocaleDateString('pt-PT')}</span>
                    </div>
                  </div>
                  {!readOnly && (
                    <button onClick={() => apagarDoc(doc.id)} className="opacity-0 group-hover:opacity-100 text-ink-muted/70 hover:text-danger transition-opacity">
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
// ════════════════════════════════════════════════════════════════
// TAB: REUNIÕES de acompanhamento com investidores
// ════════════════════════════════════════════════════════════════
const FORMATO_REUNIAO = ['Online', 'Presencial']
const ESTADO_REUNIAO = ['Agendada', 'Realizada', 'Cancelada']
const ESTADO_REUNIAO_COR = {
  Agendada: 'bg-surface-muted text-ink',
  Realizada: 'bg-success/15 text-success',
  Cancelada: 'bg-surface-muted text-ink-muted',
}

function TabReunioes({ negocioId, readOnly }) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ data: '', hora: '', formato: 'Online', notas: '' })
  const [saving, setSaving] = useState(false)

  // Migrado para React Query (Problema 23/24 da auditoria).
  const query = useQuery({
    queryKey: ['projeto-reunioes', negocioId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/reunioes`)
      if (!r.ok) throw new Error('Erro ao carregar reuniões')
      return (await r.json()).reunioes || []
    },
  })
  const lista = useMemo(() => query.data ?? [], [query.data])
  const loading = query.isPending
  const load = query.refetch

  async function adicionar(e) {
    e.preventDefault()
    if (!form.data) return
    setSaving(true)
    try {
      const data_hora = `${form.data}T${form.hora || '18:00'}:00`
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/reunioes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_hora, formato: form.formato, notas: form.notas || null }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        toast?.(`Erro ao agendar reunião: ${err.error || r.status}`, 'error', 3500)
        return
      }
      setForm({ data: '', hora: '', formato: 'Online', notas: '' })
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  async function mudarEstado(id, estado) {
    const r = await apiFetch(`/api/crm/projetos/reunioes/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (r.ok) load()
  }

  async function apagar(id) {
    if (!(await confirmar('Apagar esta reunião?'))) return
    const r = await apiFetch(`/api/crm/projetos/reunioes/${id}`, { method: 'DELETE' })
    if (r.ok) load()
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'
  const proximas = lista.filter(r => r.estado === 'Agendada')
  const passadas = lista.filter(r => r.estado !== 'Agendada')

  if (loading) return <p className="text-sm text-ink-muted">A carregar...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Reuniões de acompanhamento ({lista.length})</h3>
        {!readOnly && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04]">
            <Plus className="w-3.5 h-3.5" /> Agendar Reunião
          </button>
        )}
      </div>

      {!readOnly && showForm && (
        <form onSubmit={adicionar} className="bg-surface rounded-xl p-4 space-y-3 border border-line">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Data</label>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className={inputClass} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Hora</label>
              <input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Formato</label>
              <select value={form.formato} onChange={e => setForm(f => ({ ...f, formato: e.target.value }))} className={inputClass}>
                {FORMATO_REUNIAO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Notas (agenda, tópicos)</label>
            <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Ex: tour à obra, cronograma, dúvidas..." className={inputClass} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line text-ink-muted hover:bg-surface-muted">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
              {saving ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {lista.length === 0 ? (
        <div className="text-center py-8 text-ink-muted text-sm">Nenhuma reunião registada.</div>
      ) : (
        <div className="space-y-4">
          {[['Próximas', proximas], ['Anteriores', passadas]].map(([label, grupo]) => grupo.length > 0 && (
            <div key={label}>
              <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-2">{label} ({grupo.length})</p>
              <div className="divide-y divide-line">
                {grupo.map(r => (
                  <div key={r.id} className="flex items-center gap-3 py-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0">
                      <CalendarClock className="w-4 h-4 text-ink-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {new Date(r.data_hora).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })}
                        <span className="ml-2 text-xs text-ink-muted">{r.formato}</span>
                      </p>
                      {r.notas && <p className="text-xs text-ink-muted mt-0.5">{r.notas}</p>}
                    </div>
                    {!readOnly ? (
                      <div className="flex items-center gap-2">
                        <select value={r.estado} onChange={e => mudarEstado(r.id, e.target.value)}
                          className={`text-xs rounded-lg px-2 py-1 border-0 ${ESTADO_REUNIAO_COR[r.estado] || 'bg-surface-muted'}`}>
                          {ESTADO_REUNIAO.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <button onClick={() => apagar(r.id)} className="p-1.5 rounded-lg hover:bg-danger/10 text-ink-muted hover:text-danger" title="Remover">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-lg ${ESTADO_REUNIAO_COR[r.estado] || 'bg-surface-muted'}`}>{r.estado}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TAB: VISTORIA SEMANAL (equipa) — Template A/B do SOP 13. Input de
// campo (transposto do PDF preenchido em obra); gera o Relatório Semanal.
// ════════════════════════════════════════════════════════════════
const ESTADO_RUBRICA = ['Não iniciado', 'Em curso', 'Concluído']

function novaListaRubricas(padrao) {
  return (padrao || []).map(rubrica => ({ rubrica, estado: 'Não iniciado', perc: 0, observacoes: '' }))
}

function TabVistorias({ negocioId, negocio }) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ semana_data: '', rubricas: [], desvio_dias: '', desvio_causa: '', desvio_accao: '', incidentes: '', proximos_passos: '' })

  // Migrado para React Query (Problema 23/24 da auditoria).
  const query = useQuery({
    queryKey: ['projeto-vistorias', negocioId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/vistorias`)
      if (!r.ok) throw new Error('Erro ao carregar vistorias')
      const j = await r.json()
      return { lista: j.vistorias || [], rubricasPadrao: j.rubricasPadrao || [] }
    },
  })
  const lista = useMemo(() => query.data?.lista ?? [], [query.data])
  const rubricasPadrao = useMemo(() => query.data?.rubricasPadrao ?? [], [query.data])
  const loading = query.isPending
  const load = query.refetch

  function abrirForm() {
    setForm({
      semana_data: new Date().toISOString().slice(0, 10),
      rubricas: novaListaRubricas(rubricasPadrao),
      desvio_dias: '', desvio_causa: '', desvio_accao: '', incidentes: '', proximos_passos: '',
    })
    setShowForm(true)
  }

  function actualizarRubrica(i, campo, valor) {
    setForm(f => {
      const rubricas = [...f.rubricas]
      rubricas[i] = { ...rubricas[i], [campo]: valor }
      return { ...f, rubricas }
    })
  }

  async function guardar(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/vistorias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          desvio_dias: form.desvio_dias === '' ? null : parseInt(form.desvio_dias, 10),
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        toast?.(`Erro ao registar vistoria: ${err.error || r.status}`, 'error', 3500)
        return
      }
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  async function gerarRelatorio(vistoriaId, { download = false } = {}) {
    try { await openDocument(`/api/crm/projetos/${negocioId}/pdf/relatorio-semanal/${vistoriaId}`, { download }) } catch { /* já notificado */ }
  }

  const inputClass = 'w-full px-2.5 py-1.5 rounded-lg border border-line text-xs focus:outline-none focus:ring-2 focus:ring-accent/40'

  if (loading) return <p className="text-sm text-ink-muted">A carregar...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Vistorias semanais ({lista.length})</h3>
        <button onClick={abrirForm} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04]">
          <Plus className="w-3.5 h-3.5" /> Registar Vistoria
        </button>
      </div>

      {showForm && (
        <form onSubmit={guardar} className="bg-surface rounded-xl p-4 space-y-3 border border-line">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Data da vistoria</label>
            <input type="date" value={form.semana_data} onChange={e => setForm(f => ({ ...f, semana_data: e.target.value }))} className={`${inputClass} max-w-xs`} required />
          </div>

          <div>
            <p className="text-xs font-medium text-ink-muted mb-1.5">Estado por rubrica (MQT)</p>
            <div className="space-y-1.5">
              {form.rubricas.map((r, i) => (
                <div key={r.rubrica} className="grid grid-cols-12 gap-1.5 items-center">
                  <span className="col-span-3 text-xs text-ink-muted truncate" title={r.rubrica}>{r.rubrica}</span>
                  <select value={r.estado} onChange={e => actualizarRubrica(i, 'estado', e.target.value)} className={`${inputClass} col-span-3`}>
                    {ESTADO_RUBRICA.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input type="number" min="0" max="100" value={r.perc} onChange={e => actualizarRubrica(i, 'perc', parseInt(e.target.value, 10) || 0)}
                    className={`${inputClass} col-span-2`} placeholder="%" />
                  <input value={r.observacoes} onChange={e => actualizarRubrica(i, 'observacoes', e.target.value)}
                    className={`${inputClass} col-span-4`} placeholder="Observações" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Desvio de cronograma (dias)</label>
              <input type="number" value={form.desvio_dias} onChange={e => setForm(f => ({ ...f, desvio_dias: e.target.value }))} className={inputClass} placeholder="Ex: -2 ou 3" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-muted mb-1">Causa do desvio</label>
              <input value={form.desvio_causa} onChange={e => setForm(f => ({ ...f, desvio_causa: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Ação corretiva</label>
            <input value={form.desvio_accao} onChange={e => setForm(f => ({ ...f, desvio_accao: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Ocorrências (segurança, qualidade, reclamações)</label>
            <textarea value={form.incidentes} onChange={e => setForm(f => ({ ...f, incidentes: e.target.value }))} rows={2} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Próximos 7 dias</label>
            <textarea value={form.proximos_passos} onChange={e => setForm(f => ({ ...f, proximos_passos: e.target.value }))} rows={2} className={inputClass} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line text-ink-muted hover:bg-surface-muted">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
              {saving ? 'A guardar...' : 'Guardar e gerar relatório'}
            </button>
          </div>
        </form>
      )}

      {lista.length === 0 ? (
        <div className="text-center py-8 text-ink-muted text-sm">Nenhuma vistoria registada.</div>
      ) : (
        <div className="divide-y divide-line">
          {lista.map(v => (
            <div key={v.id} className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-4 h-4 text-ink-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{new Date(v.semana_data).toLocaleDateString('pt-PT', { dateStyle: 'medium' })}</p>
                {v.desvio_dias ? <p className="text-xs text-ink-muted">Desvio: {v.desvio_dias > 0 ? '+' : ''}{v.desvio_dias} dias</p> : null}
              </div>
              {v.semaforo_cor && (
                <div className="shrink-0" title={v.semaforo_pct != null ? `Desvio orçamental: ${v.semaforo_pct > 0 ? '+' : ''}${Number(v.semaforo_pct).toFixed(1)}%` : undefined}>
                  <StatusBadge status={SEMAFORO_STATUS[v.semaforo_cor]} />
                </div>
              )}
              <div className="flex items-center gap-1">
                <button onClick={() => gerarRelatorio(v.id)} title="Ver relatório semanal"
                  className="px-3 py-1.5 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-muted inline-flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Ver relatório
                </button>
                <button onClick={() => gerarRelatorio(v.id, { download: true })} title="Descarregar relatório semanal"
                  className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light inline-flex items-center gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabInvestidores({ negocio, readOnly }) {
  const toast = useToast()
  const [investidorSel, setInvestidorSel] = useState('')
  const [novoCapital, setNovoCapital] = useState('')
  const [novaPerc, setNovaPerc] = useState('')
  const [novoInvNome, setNovoInvNome] = useState('')
  const [novoInvContacto, setNovoInvContacto] = useState('')

  // Migrado para React Query (Problema 23/24 da auditoria).
  const query = useQuery({
    queryKey: ['projeto-investidores-tab', negocio.id],
    queryFn: async () => {
      const [r1, r2] = await Promise.all([
        apiFetch(`/api/crm/projetos/${negocio.id}/investidores`),
        apiFetch('/api/crm/investidores?limit=1000'),
      ])
      const lista = r1.ok ? (await r1.json()).investidores || [] : []
      const todosInvestidores = r2.ok ? ((await r2.json()).data || []).filter(i => i.status !== 'Inactivo') : []
      return { lista, todosInvestidores }
    },
  })
  const lista = useMemo(() => query.data?.lista ?? [], [query.data])
  const todosInvestidores = useMemo(() => query.data?.todosInvestidores ?? [], [query.data])
  const load = query.refetch

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
    if (!(await confirmar('Remover este investidor do projeto?'))) return
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

  // SOP 13, Passo 3 — confirmação de contacto (chamada/WhatsApp, Anexo 3).
  async function confirmarContacto(linkId) {
    const r = await apiFetch(`/api/crm/projetos/investidores/${linkId}/confirmar-contacto`, { method: 'PUT' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao confirmar contacto: ${err.error || r.status}`, 'error', 3500)
      return
    }
    load()
  }

  const disponiveis = todosInvestidores.filter(i => !lista.find(l => l.investidor_id === i.id))

  // CAEP: a % da Somnium no lucro vive no projecto (negocio.comissao_pct) e os
  // parceiros dividem o restante segundo a % de cada um (Faturação lê daqui).
  const isCaep = negocio.categoria === 'CAEP'
  const percSomniumCaep = negocio.comissao_pct != null && negocio.comissao_pct !== '' ? Number(negocio.comissao_pct) : 40
  async function guardarPercSomnium(v) {
    if (v === percSomniumCaep) return
    const r = await apiFetch(`/api/crm/negocios/${negocio.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comissao_pct: v }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao guardar % da Somnium: ${err.error || r.status}`, 'error', 3500)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Investidores" value={lista.length} />
        <Field label="Capital agregado" value={EUR(capitalTotal)} accent />
        <Field label="% atribuída" value={`${percTotal.toFixed(1)}%`} />
        <Field label="Lucro a distribuir" value={EUR(lucroEstimado)} accent />
      </div>

      {isCaep && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-brand-gold/40 bg-brand-gold/5">
          <div className="w-8 h-8 rounded-full bg-brand-dark text-brand-gold flex items-center justify-center font-bold text-xs flex-shrink-0">SP</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink">Somnium Properties</p>
            <p className="text-[10px] text-ink-muted">% do lucro do CAEP · os parceiros dividem os restantes {Math.max(0, 100 - percSomniumCaep).toFixed(1)}% segundo a % de cada um</p>
          </div>
          {readOnly ? (
            <p className="text-sm num font-semibold text-ink">{percSomniumCaep.toFixed(1)}%</p>
          ) : (
            <div className="flex items-center gap-1">
              <input type="number" step="0.5" min="0" max="100" key={percSomniumCaep} defaultValue={percSomniumCaep}
                onBlur={e => guardarPercSomnium(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="w-20 px-2 py-1 text-sm num text-right rounded-lg border border-line bg-surface-raised" />
              <span className="text-sm text-ink-muted">%</span>
            </div>
          )}
        </div>
      )}

      {lista.length > 0 ? (
        <div className="space-y-2">
          {lista.map(l => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg border border-line bg-surface-raised group">
              <div className="w-8 h-8 rounded-full bg-brand-gold text-brand-dark flex items-center justify-center font-bold text-xs flex-shrink-0">
                {(l.investidor_nome || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{l.investidor_nome}</p>
                {l.investidor_email && <p className="text-[10px] text-ink-muted truncate">{l.investidor_email}</p>}
              </div>
              <div className="flex gap-3 items-center text-right">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-ink-muted">Capital</p>
                  {readOnly ? (
                    <p className="text-sm num font-semibold text-ink">{EUR(l.capital)}</p>
                  ) : (
                    <input type="number" step="any" defaultValue={l.capital || 0} onBlur={e => editar(l.id, 'capital', parseFloat(e.target.value) || 0)}
                      className="w-24 text-right text-sm num px-2 py-0.5 rounded border border-line" onWheel={e => e.target.blur()} />
                  )}
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-ink-muted">%</p>
                  {readOnly ? (
                    <p className="text-sm num text-ink-muted">{Number(l.percentagem).toFixed(1)}%</p>
                  ) : (
                    <input type="number" step="0.1" defaultValue={l.percentagem || 0} onBlur={e => editar(l.id, 'percentagem', parseFloat(e.target.value) || 0)}
                      className="w-14 text-right text-sm px-2 py-0.5 rounded border border-line" />
                  )}
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-ink-muted">Distrib. estim.</p>
                  <p className="text-sm num font-semibold text-success">{EUR(distribuicao(l))}</p>
                </div>
              </div>
              {l.onboarding_iniciado_em && (
                l.confirmacao_contacto_em ? (
                  <span className="hidden sm:inline text-[10px] text-success font-medium whitespace-nowrap"
                    title={`Contacto confirmado em ${new Date(l.confirmacao_contacto_em).toLocaleDateString('pt-PT')}`}>
                    Contacto confirmado
                  </span>
                ) : !readOnly ? (
                  <button onClick={() => confirmarContacto(l.id)}
                    className="text-[10px] font-medium px-2 py-1 rounded-lg border border-line text-ink-muted hover:bg-surface-muted whitespace-nowrap">
                    Confirmar Contacto
                  </button>
                ) : null
              )}
              {!readOnly && (
                <button onClick={() => apagar(l.id)} className="opacity-0 group-hover:opacity-100 text-ink-muted/70 hover:text-danger">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted py-4 text-center">Sem investidores ligados ao projeto.</p>
      )}

      {!readOnly && (
        <form onSubmit={adicionar} className="mt-4 pt-4 border-t border-line">
          <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-2">Adicionar investidor</p>
          <div className="grid grid-cols-12 gap-2">
            <select value={investidorSel} onChange={e => setInvestidorSel(e.target.value)}
              className="col-span-5 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised">
              <option value="">Escolhe um investidor…</option>
              {disponiveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              <option value="__novo__">+ Criar novo investidor…</option>
            </select>
            <input type="number" step="0.01" value={novoCapital} onChange={e => setNovoCapital(e.target.value)}
              placeholder="Capital €" className="col-span-3 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised num" />
            <input type="number" step="0.1" value={novaPerc} onChange={e => setNovaPerc(e.target.value)}
              placeholder="%" className="col-span-2 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" />
            <button type="submit"
              disabled={!novoCapital || (investidorSel === '__novo__' ? !novoInvNome.trim() : !investidorSel)}
              className="col-span-2 px-3 py-1.5 rounded-lg bg-brand-dark text-brand-gold text-sm disabled:bg-line disabled:text-ink-muted disabled:cursor-not-allowed inline-flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          {investidorSel === '__novo__' && (
            <div className="grid grid-cols-12 gap-2 mt-2">
              <input type="text" value={novoInvNome} onChange={e => setNovoInvNome(e.target.value)}
                placeholder="Nome do novo investidor" autoFocus
                className="col-span-6 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" />
              <input type="text" value={novoInvContacto} onChange={e => setNovoInvContacto(e.target.value)}
                placeholder="Email ou telemóvel (opcional)"
                className="col-span-6 px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised" />
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
          sel ? 'bg-brand-dark text-brand-gold border-brand-dark' : 'bg-surface-raised text-ink border-line hover:border-line'
        }`}>
        {cat && <cat.icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="font-semibold">{fr.nome}</span>
        {fr.tipologia && <span className="text-ink-muted">·</span>}
        {fr.tipologia && <span className="text-ink-muted">{fr.tipologia}</span>}
        {fr.andar && <span className="text-ink-muted">·</span>}
        {fr.andar && <span className="text-ink-muted">{fr.andar}</span>}
        <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${sel ? 'bg-surface-raised/10 text-brand-gold' : `${cor.bg} ${cor.text}`}`}>
          {Math.round(Number(fr.perc_global) || 0)}%
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <button onClick={() => setFracaoSel(null)}
        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 border ${
          fracaoSel === null ? 'bg-brand-dark text-brand-gold border-brand-dark' : 'bg-surface-raised text-ink-muted border-line hover:border-line'
        }`}>
        <Home className="w-3 h-3" /> Prédio inteiro
      </button>
      {fracs.length > 0 && (
        <>
          <span className="text-[9px] uppercase tracking-wider text-ink-muted font-semibold px-1">Frações</span>
          {fracs.map(chip)}
        </>
      )}
      {areas.length > 0 && (
        <>
          <span className="text-[9px] uppercase tracking-wider text-ink-muted font-semibold px-1 ml-2">Áreas comuns</span>
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
    if (!r.ok) { const e = await r.json().catch(() => ({})); toast(friendlyError(e.error || { status: r.status }), 'error'); return }
    setEditing(null); setShowForm(false); onChange()
  }
  async function apagar(id, nome) {
    if (!(await confirmar(`Apagar fração "${nome}"? Fases/fotos/despesas dessa fração ficarão como "comuns ao prédio".`))) return
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
        <p className="text-xs text-ink-muted">
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
        <div className="text-center py-12 bg-surface rounded-xl border border-dashed border-line">
          <Layers className="w-8 h-8 mx-auto text-ink-muted/70 mb-2" />
          <p className="text-sm text-ink-muted">Sem frações ou áreas criadas.</p>
          <p className="text-xs text-ink-muted mt-1">Adiciona uma fração (apartamento vendável) ou área comum (fachada, telhado, jardim…) para começar.</p>
        </div>
      ) : (
        <>
          {/* Grupo: Frações */}
          {(() => {
            const fracs = fracoes.filter(f => f.tipo !== 'area_comum')
            if (fracs.length === 0) return null
            return (
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold flex items-center gap-1.5">
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
                <h4 className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold flex items-center gap-1.5">
                  <Building className="w-3 h-3" />Áreas comuns ({areas.length})
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
    <div className="bg-surface-raised rounded-xl border border-line p-4 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2">
          {cat && <cat.icon className="w-5 h-5 mt-0.5 text-brand-gold shrink-0" />}
          <div>
            <h3 className="text-base font-bold text-ink">{fr.nome}</h3>
            <p className="text-xs text-ink-muted">
              {[fr.tipologia, fr.andar, fr.area_m2 ? `${fr.area_m2} m²` : null].filter(Boolean).join(' · ') || (isArea ? cat?.label : '—')}
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cor.bg} ${cor.text}`}>{cor.label}</span>
      </div>

      <div className="my-3">
        <div className="flex items-center justify-between text-[10px] text-ink-muted mb-0.5">
          <span>Execução</span>
          <span className="num font-bold text-ink">{perc}%</span>
        </div>
        <div className="w-full bg-surface-muted rounded-full h-1.5">
          <div className="h-full rounded-full bg-accent" style={{ width: `${perc}%` }} />
        </div>
        <p className="text-[10px] text-ink-muted mt-0.5">{fr.num_fases} fase{fr.num_fases !== 1 ? 's' : ''}</p>
      </div>

      {!isArea && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">Venda estimada</p>
            <p className="num font-semibold text-ink">{EUR(vendaEsp)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">{vendaReal > 0 ? 'Vendido por' : 'Custo até agora'}</p>
            <p className={`num font-semibold ${vendaReal > 0 ? 'text-success' : 'text-danger'}`}>
              {EUR(vendaReal > 0 ? vendaReal : Number(fr.custo_total) || 0)}
            </p>
          </div>
        </div>
      )}
      {isArea && (
        <div className="text-xs">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">Custo até agora</p>
          <p className="num font-semibold text-danger">{EUR(Number(fr.custo_total) || 0)}</p>
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-line opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}
            className="text-[11px] px-2 py-1 text-ink-muted hover:text-brand-gold">Editar</button>
          <button onClick={onDelete}
            className="text-[11px] px-2 py-1 text-ink-muted hover:text-danger">Apagar</button>
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
  const inputClass = "w-full px-2.5 py-1.5 text-sm rounded-lg border border-line bg-surface-raised"
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
    <div className="bg-surface-raised rounded-xl border-2 border-brand-gold p-4 shadow-md">
      <h3 className="text-sm font-semibold text-ink mb-3">{isNew ? 'Nova entidade' : 'Editar entidade'}</h3>

      {/* Selector de tipo */}
      <div className="mb-4">
        <label className="text-[10px] text-ink-muted uppercase tracking-wider block mb-1.5">Tipo</label>
        <div className="grid grid-cols-2 gap-2">
          <label className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border-2 ${f.tipo === 'fracao' ? 'border-brand-gold bg-brand-gold/5' : 'border-line'}`}>
            <input type="radio" name="tipo" value="fracao" checked={f.tipo === 'fracao'} onChange={() => set('tipo', 'fracao')} className="mt-0.5 accent-brand-gold" />
            <div>
              <p className="text-sm font-semibold text-ink">Fração</p>
              <p className="text-[10px] text-ink-muted">Apartamento vendável</p>
            </div>
          </label>
          <label className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border-2 ${f.tipo === 'area_comum' ? 'border-brand-gold bg-brand-gold/5' : 'border-line'}`}>
            <input type="radio" name="tipo" value="area_comum" checked={f.tipo === 'area_comum'} onChange={() => set('tipo', 'area_comum')} className="mt-0.5 accent-brand-gold" />
            <div>
              <p className="text-sm font-semibold text-ink">Área comum</p>
              <p className="text-[10px] text-ink-muted">Fachada, telhado, jardim, escadas…</p>
            </div>
          </label>
        </div>
      </div>

      {/* Categoria comum (só quando tipo=area_comum) */}
      {isAreaComum && (
        <div className="mb-4">
          <label className="text-[10px] text-ink-muted uppercase tracking-wider block mb-1.5">Categoria</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {CATEGORIAS_COMUM.map(c => (
              <button key={c.key} type="button" onClick={() => selectCategoria(c.key)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border ${f.categoria_comum === c.key ? 'border-brand-gold bg-brand-gold/10 text-brand-dark' : 'border-line text-ink-muted hover:border-line'}`}>
                <c.icon className="w-3.5 h-3.5 shrink-0" /> {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-ink-muted uppercase block mb-1">Nome *</label>
          <input value={f.nome} onChange={e => set('nome', e.target.value)}
            placeholder={isAreaComum ? 'Ex: Fachada principal' : 'Ex: Fração A'} className={inputClass} />
        </div>
        {!isAreaComum && (
          <div>
            <label className="text-[10px] text-ink-muted uppercase block mb-1">Tipologia</label>
            <select value={f.tipologia || ''} onChange={e => set('tipologia', e.target.value)} className={inputClass}>
              <option value="">—</option>
              {['T0', 'T0+1', 'T1', 'T1+1', 'T2', 'T2+1', 'T3', 'T3+1', 'T4', 'T5+'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-[10px] text-ink-muted uppercase block mb-1">{isAreaComum ? 'Localização' : 'Andar'}</label>
          <select value={f.andar || ''} onChange={e => set('andar', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {['Cave', 'R/C', '1º Andar', '2º Andar', '3º Andar', '4º Andar', '5º Andar', 'Sótão', 'Cobertura', 'Exterior'].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-ink-muted uppercase block mb-1">Área (m²)</label>
          <input type="number" step="0.1" value={f.area_m2 || ''} onChange={e => set('area_m2', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-[10px] text-ink-muted uppercase block mb-1">Estado</label>
          <select value={f.estado} onChange={e => set('estado', e.target.value)} className={inputClass}>
            {Object.entries(FRACAO_ESTADO_COR).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {!isAreaComum && (
          <>
            <div>
              <label className="text-[10px] text-ink-muted uppercase block mb-1">Valor de venda estimado (€)</label>
              <input type="number" step="any" value={f.valor_venda_estimado || ''} onChange={e => set('valor_venda_estimado', e.target.value)} className={inputClass} onWheel={e => e.target.blur()} />
            </div>
            <div>
              <label className="text-[10px] text-ink-muted uppercase block mb-1">Data venda estimada</label>
              <input type="date" value={f.data_venda_estimada || ''} onChange={e => set('data_venda_estimada', e.target.value)} className={inputClass} />
            </div>
          </>
        )}
        {!isNew && !isAreaComum && (
          <>
            <div>
              <label className="text-[10px] text-ink-muted uppercase block mb-1">Valor venda real (€)</label>
              <input type="number" step="any" value={f.valor_venda_real || ''} onChange={e => set('valor_venda_real', e.target.value)} className={inputClass} onWheel={e => e.target.blur()} />
            </div>
            <div>
              <label className="text-[10px] text-ink-muted uppercase block mb-1">Data venda real</label>
              <input type="date" value={f.data_venda_real || ''} onChange={e => set('data_venda_real', e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-[10px] text-ink-muted uppercase block mb-1">Comprador</label>
              <input value={f.comprador || ''} onChange={e => set('comprador', e.target.value)} className={inputClass} />
            </div>
          </>
        )}
        <div className="col-span-2 sm:col-span-3">
          <label className="text-[10px] text-ink-muted uppercase block mb-1">Notas</label>
          <textarea value={f.notas || ''} onChange={e => set('notas', e.target.value)} rows={2} className={inputClass} />
        </div>
      </div>

      {isNew && fasesComunsCount > 0 && (
        <p className="text-[11px] text-brand-gold mt-3 bg-brand-dark px-3 py-2 rounded-lg">
          Ao criar esta fração, serão duplicadas as {fasesComunsCount} fases existentes do prédio (com tarefas-template) para esta fração.
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
// P4.1 — TAB HISTÓRICO (AUDIT LOG)
// ════════════════════════════════════════════════════════════════
function ComentariosFase({ faseId, readOnly }) {
  const toast = useToast()
  const [texto, setTexto] = useState("")
  // Migrado para React Query (Problema 23/24 da auditoria).
  const query = useQuery({
    queryKey: ['fase-comentarios', faseId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/fases/${faseId}/comentarios`)
      if (!r.ok) throw new Error('Erro ao carregar comentários')
      return (await r.json()).comentarios || []
    },
  })
  const comentarios = useMemo(() => query.data ?? [], [query.data])
  const load = query.refetch
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
    if (!(await confirmar("Apagar comentário?"))) return
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
      <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-2">Comentários ({comentarios.length})</p>
      <div className="space-y-1.5 mb-2">
        {comentarios.length === 0 && <p className="text-[11px] text-ink-muted italic">Sem comentários.</p>}
        {comentarios.map(c => (
          <div key={c.id} className="group flex items-start gap-2 bg-surface-raised rounded-lg p-2 border border-line">
            <div className="w-6 h-6 rounded-full bg-brand-gold text-brand-dark flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {(c.autor_nome || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-ink">{c.autor_nome}</span>
                <span className="text-[9px] text-ink-muted">{new Date(c.created_at).toLocaleString("pt-PT")}</span>
              </div>
              <p className="text-xs text-ink whitespace-pre-wrap mt-0.5">{c.texto}</p>
            </div>
            {!readOnly && (
              <button onClick={() => apagar(c.id)} className="opacity-0 group-hover:opacity-100 text-ink-muted/70 hover:text-danger">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <form onSubmit={enviar} className="flex gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Escreve um comentário..." className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-line bg-surface-raised" />
          <button type="submit" disabled={!texto.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-brand-dark text-brand-gold hover:bg-brand-dark-light disabled:bg-line disabled:text-ink-muted">
            Enviar
          </button>
        </form>
      )}
    </div>
  )
}

