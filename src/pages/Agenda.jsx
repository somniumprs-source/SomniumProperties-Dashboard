/**
 * Sistema de Agenda — Fase 1: disponibilidade manual semana-a-semana por
 * pessoa + catálogo de tarefas recorrentes ("tarefas vencedoras"). O motor
 * de agendamento (proposta semanal automática) é Fase 2 — esta página só
 * regista os inputs de que esse motor vai precisar.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Calendar, Plus, Trash2, ChevronLeft, ChevronRight, Copy, BookOpen,
  Pencil, Loader2, Sparkles, ListChecks, Wand2, Check, X, CalendarClock,
  Inbox,
} from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { PageSkeleton } from '../components/ui/Skeleton.jsx'
import { apiFetch } from '../lib/api.js'
import { Tabs } from '../components/ui/Tabs.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select } from '../components/ui/Input.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { REGIOES } from '../constants.js'

// Duplicado de propósito de Operacoes.jsx (CATEGORIAS local) — categoria é
// texto livre na BD, sem FK; manter as duas páginas independentes evita
// acoplar esta feature nova ao ficheiro do Kanban existente.
const CATEGORIAS = [
  'Cold Call', 'Pesquisa de Imóveis', 'Estudo de Mercado',
  'Follow Up Consultores', 'Follow Up Investidores',
  'Reunião Investidores', 'Reunião de Equipa Somnium',
  'Reunião com Parceiros', 'Visita', 'Visita a Obra', 'Proposta',
  'Apresentação de Negócios', 'Negociações',
  'SOP / Formação', 'Planeamento', 'Implementação com IA',
  'Análise de Negócio', 'Contacto Consultores',
  'Networking / Eventos', 'Gestão Financeira', 'Outros',
]

const FREQUENCIA_LABEL = { diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', custom: 'Personalizada' }
const PRIORIDADE_TONE = { alta: 'red', media: 'yellow', baixa: 'gray' }
const PRIORIDADE_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// Catálogo de tarefas recorrentes — revisto em 21/08/2026 após a
// auditoria comercial. Saíram daqui para virar sequência automática por
// imóvel (cada uma só nasce quando a anterior está mesmo concluída):
// Pesquisa de Imóveis -> Cold Call (mesmo dia, gap <=1h) -> Estudo de
// Mercado (estado "Estudo de VVR", prazo 48h) -> Análise de Negócio (só
// com Estudo de Mercado concluído) -> Elaboração de Proposta (só com
// Análise de Negócio concluída, estado "Criar Proposta ao Proprietário").
// Follow-ups de consultor/investidor saíram também — só pelas datas que
// preenches directamente nas fichas. O que resta aqui é só recorrência de
// calendário pura, sem gatilho de negócio nem sequência associada.
const SUGESTOES_CATALOGO = [
  { titulo: 'Reunião Investidores', categoria: 'Reunião Investidores', duracao_estimada_horas: 1, frequencia: 'custom', prioridade: 'alta', sop_ref: 'SOP 9/11', activo: false },
  { titulo: 'Revisão de Disciplina de Dados', categoria: 'Gestão Financeira', duracao_estimada_horas: 1, frequencia: 'semanal', prioridade: 'media' },
  { titulo: 'Reunião de Equipa Somnium', categoria: 'Reunião de Equipa Somnium', duracao_estimada_horas: 1, frequencia: 'semanal', prioridade: 'alta' },
  { titulo: 'Planeamento da Semana', categoria: 'Planeamento', duracao_estimada_horas: 0.75, frequencia: 'semanal', prioridade: 'media' },
  { titulo: 'SOP / Formação', categoria: 'SOP / Formação', duracao_estimada_horas: 1, frequencia: 'quinzenal', prioridade: 'baixa' },
  { titulo: 'Revisão de Obras em Curso', categoria: 'Gestão Financeira', duracao_estimada_horas: 1, frequencia: 'semanal', prioridade: 'alta', simultaneo: true },
  { titulo: 'Reconciliação Mensal de Despesas', categoria: 'Gestão Financeira', duracao_estimada_horas: 1, frequencia: 'mensal', prioridade: 'media' },
  { titulo: 'Prospecção Activa de Investidores', categoria: 'Follow Up Investidores', duracao_estimada_horas: 1, frequencia: 'semanal', prioridade: 'alta' },
  { titulo: 'Revisão Mensal de OKRs / Scorecard', categoria: 'Planeamento', duracao_estimada_horas: 0.5, frequencia: 'mensal', prioridade: 'alta' },
]

function getMonday(d) {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}
function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDiaLabel(d) {
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
}

const ACTIVE_USER_KEY = 'somnium:active_user_id'
// Só equipa interna participa na Agenda — mesmo filtro do motor
// (ver ROLES_EQUIPA em src/db/agendaEngine.js). 'parceiro'/'investidor'
// ficam de fora (são consultores/investidores externos, não a equipa).
const ROLES_EQUIPA = ['admin', 'comercial', 'financeiro', 'operacoes']

export function Agenda() {
  const [tab, setTab] = useState('disponibilidade')
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => {
    apiFetch('/api/users').then(r => r.ok ? r.json() : { data: [] }).then(j => {
      setUsers((j.data || []).filter(u => u.ativo && ROLES_EQUIPA.includes(u.role)))
    }).catch(() => {}).finally(() => setLoadingUsers(false))
  }, [])

  return (
    <>
      <Header title="Agenda" subtitle="Disponibilidade da equipa e catálogo de tarefas recorrentes" />
      <div className="p-4 sm:p-6 space-y-4">
        <Tabs
          variant="segmented"
          items={[
            { key: 'disponibilidade', label: 'Disponibilidade', icon: Calendar },
            { key: 'catalogo', label: 'Catálogo de Tarefas Recorrentes', icon: BookOpen },
            { key: 'proposta', label: 'Proposta da Semana', icon: CalendarClock },
          ]}
          value={tab}
          onChange={setTab}
        />
        {loadingUsers ? <PageSkeleton /> : tab === 'disponibilidade'
          ? <DisponibilidadeTab users={users} />
          : tab === 'catalogo'
          ? <CatalogoTab users={users} />
          : <PropostaTab users={users} />}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// Disponibilidade — grid semanal manual por pessoa
// ════════════════════════════════════════════════════════════════
function DisponibilidadeTab({ users }) {
  const toast = useToast()
  const [userId, setUserId] = useState(() => {
    try { return window.localStorage.getItem(ACTIVE_USER_KEY) || '' } catch { return '' }
  })
  const [refDate, setRefDate] = useState(() => new Date())
  const [blocos, setBlocos] = useState([])
  const [loading, setLoading] = useState(false)
  const [copiando, setCopiando] = useState(false)

  useEffect(() => {
    if (!userId && users.length) setUserId(users[0].id)
  }, [users, userId])

  const monday = useMemo(() => getMonday(refDate), [refDate])
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i); return d
  }), [monday])
  const semanaInicio = fmtISO(monday)
  const semanaFim = fmtISO(dias[6])

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const r = await apiFetch(`/api/agenda/disponibilidade?user_id=${userId}&de=${semanaInicio}&ate=${semanaFim}`)
      const j = await r.json()
      setBlocos(Array.isArray(j.blocos) ? j.blocos : [])
    } catch (e) { toast?.(e.message, 'error') }
    setLoading(false)
  }, [userId, semanaInicio, semanaFim])

  useEffect(() => { load() }, [load])

  async function addBloco(data, horaInicio, horaFim) {
    if (!horaInicio || !horaFim) return
    try {
      const r = await apiFetch('/api/agenda/disponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, data, hora_inicio: horaInicio, hora_fim: horaFim }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao criar bloco')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
  }

  async function delBloco(id) {
    try {
      const r = await apiFetch(`/api/agenda/disponibilidade/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json()).error || 'Falha ao remover')
      setBlocos(prev => prev.filter(b => b.id !== id))
    } catch (e) { toast?.(e.message, 'error') }
  }

  async function copiarSemanaAnterior() {
    setCopiando(true)
    try {
      const origemMonday = new Date(monday); origemMonday.setDate(origemMonday.getDate() - 7)
      const r = await apiFetch('/api/agenda/disponibilidade/copiar-semana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, semana_origem: fmtISO(origemMonday), semana_destino: semanaInicio }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao copiar semana')
      toast?.(`${j.copiados} bloco(s) copiado(s) da semana anterior.`, 'success')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
    setCopiando(false)
  }

  const blocosPorDia = useMemo(() => {
    const map = {}
    for (const b of blocos) { (map[b.data] ||= []).push(b) }
    for (const k in map) map[k].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    return map
  }, [blocos])

  const totalHoras = useMemo(() => blocos.reduce((acc, b) => {
    const [h1, m1] = b.hora_inicio.split(':').map(Number)
    const [h2, m2] = b.hora_fim.split(':').map(Number)
    return acc + ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60
  }, 0), [blocos])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select size="sm" value={userId} onChange={e => setUserId(e.target.value)} className="w-48" wrapperClassName="!m-0">
            {users.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </Select>
          <button onClick={() => setRefDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            className="p-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-neutral-200 min-w-[140px] text-center">
            {fmtDiaLabel(monday)} – {fmtDiaLabel(dias[6])}
          </span>
          <button onClick={() => setRefDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            className="p-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800">
            <ChevronRight className="w-4 h-4" />
          </button>
          <Button variant="secondary" size="sm" onClick={() => setRefDate(new Date())}>Semana actual</Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Total disponível: <span className="font-semibold text-gray-700 dark:text-neutral-200">{totalHoras.toFixed(1)}h</span></span>
          <Button variant="secondary" size="sm" icon={copiando ? Loader2 : Copy} onClick={copiarSemanaAnterior} disabled={copiando || !userId}>
            Copiar semana anterior
          </Button>
        </div>
      </div>

      {!userId ? (
        <EmptyState icon={Calendar} title="Sem utilizadores" description="Não há utilizadores activos para atribuir disponibilidade." />
      ) : (
        <div className="grid grid-cols-2 gap-3 max-w-xl">
          {dias.map((d, i) => (
            <DiaColuna
              key={i}
              data={fmtISO(d)}
              label={DIAS_SEMANA[i]}
              diaLabel={fmtDiaLabel(d)}
              blocos={blocosPorDia[fmtISO(d)] || []}
              loading={loading}
              onAdd={(hi, hf) => addBloco(fmtISO(d), hi, hf)}
              onDelete={delBloco}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DiaColuna({ data, label, diaLabel, blocos, loading, onAdd, onDelete }) {
  const [hi, setHi] = useState('09:00')
  const [hf, setHf] = useState('13:00')
  const isToday = data === fmtISO(new Date())

  return (
    <Card variant="default" padding="sm" className={isToday ? 'ring-2 ring-brand-gold/40' : ''}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-700 dark:text-neutral-200">{label} <span className="font-normal text-gray-400">{diaLabel}</span></p>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-gray-300" />}
      </div>
      <div className="space-y-1.5 mb-2 min-h-[24px]">
        {blocos.length === 0 && <p className="text-[11px] text-gray-300 dark:text-neutral-600">Sem blocos</p>}
        {blocos.map(b => (
          <div key={b.id} className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-brand-gold/10 border border-brand-gold/20 text-[11px]">
            <span className="font-medium text-brand-dark dark:text-brand-gold">{b.hora_inicio}–{b.hora_fim}</span>
            <button onClick={() => onDelete(b.id)} className="text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input type="time" value={hi} onChange={e => setHi(e.target.value)}
          className="w-full text-[11px] px-1.5 py-1 rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
        <input type="time" value={hf} onChange={e => setHf(e.target.value)}
          className="w-full text-[11px] px-1.5 py-1 rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900" />
        <button onClick={() => onAdd(hi, hf)} title="Adicionar bloco"
          className="shrink-0 p-1.5 rounded-md bg-brand-dark text-brand-gold hover:bg-brand-dark-light transition-colors">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════
// Catálogo de Tarefas Recorrentes
// ════════════════════════════════════════════════════════════════
function CatalogoTab({ users }) {
  const toast = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/agenda/templates')
      const j = await r.json()
      setTemplates(Array.isArray(j.templates) ? j.templates : [])
    } catch (e) { toast?.(e.message, 'error') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActivo(t) {
    try {
      const r = await apiFetch(`/api/agenda/templates/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !t.activo }),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Falha ao actualizar')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
  }

  async function remove(t) {
    if (!window.confirm(`Eliminar o template "${t.titulo}"?`)) return
    try {
      const r = await apiFetch(`/api/agenda/templates/${t.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json()).error || 'Falha ao eliminar')
      setTemplates(prev => prev.filter(x => x.id !== t.id))
    } catch (e) { toast?.(e.message, 'error') }
  }

  async function seed() {
    setSeeding(true)
    try {
      const existentes = new Set(templates.map(t => t.titulo))
      const novos = SUGESTOES_CATALOGO.filter(s => !existentes.has(s.titulo))
      if (!novos.length) { toast?.('As sugestões já estão todas no catálogo.', 'info'); setSeeding(false); return }
      for (const s of novos) {
        await apiFetch('/api/agenda/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(s),
        })
      }
      toast?.(`${novos.length} tarefa(s) sugerida(s) adicionada(s) ao catálogo — reveja frequência e duração antes de as usar.`, 'success')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
    setSeeding(false)
  }

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(t) { setEditing(t); setModalOpen(true) }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" icon={Plus} onClick={openNew}>Novo template</Button>
          <Button variant="secondary" size="sm" icon={seeding ? Loader2 : Sparkles} onClick={seed} disabled={seeding}>
            Carregar sugestões iniciais
          </Button>
        </div>
        <span className="text-xs text-gray-400">{templates.filter(t => t.activo).length} activo(s) · {templates.length} no total</span>
      </div>

      {loading ? (
        <PageSkeleton />
      ) : templates.length === 0 ? (
        <EmptyState icon={ListChecks} title="Catálogo vazio"
          description={'Sem tarefas recorrentes definidas. Usa "Carregar sugestões iniciais" para começar com uma lista pensada para os OKRs actuais.'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {templates.map(t => (
            <Card key={t.id} variant="default" padding="sm" className={!t.activo ? 'opacity-50' : ''}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100 leading-snug">{t.titulo}</p>
                <Badge tone={PRIORIDADE_TONE[t.prioridade] || 'gray'} size="xs">{PRIORIDADE_LABEL[t.prioridade] || t.prioridade}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {t.categoria && <Badge tone="gold" size="xs">{t.categoria}</Badge>}
                <Badge tone="blue" size="xs">{FREQUENCIA_LABEL[t.frequencia] || t.frequencia}</Badge>
                <Badge tone="gray" size="xs">{Number(t.duracao_estimada_horas).toFixed(2).replace(/\.?0+$/, '')}h</Badge>
                {t.sop_ref && <Badge tone="purple" size="xs">{t.sop_ref}</Badge>}
                {t.simultaneo && <Badge tone="indigo" size="xs">Simultânea</Badge>}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-neutral-800">
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={!!t.activo} onChange={() => toggleActivo(t)} className="rounded" />
                  Activo
                </label>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-md text-gray-400 hover:text-brand-gold hover:bg-brand-gold/10 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(t)} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateModal open={modalOpen} onClose={() => setModalOpen(false)} template={editing} users={users} onSaved={load} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Proposta da Semana — motor de agendamento (Fase 2)
// ════════════════════════════════════════════════════════════════
function PropostaTab({ users }) {
  const toast = useToast()
  const [refDate, setRefDate] = useState(() => new Date())
  const [agendamentos, setAgendamentos] = useState([])
  const [naoAgendadas, setNaoAgendadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [confirmandoTudo, setConfirmandoTudo] = useState(false)

  const monday = useMemo(() => getMonday(refDate), [refDate])
  const semanaInicio = fmtISO(monday)
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i); return fmtISO(d)
  }), [monday])

  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/agenda/proposta?semana_inicio=${semanaInicio}`)
      const j = await r.json()
      setAgendamentos(Array.isArray(j.agendamentos) ? j.agendamentos : [])
      setNaoAgendadas(Array.isArray(j.nao_agendadas) ? j.nao_agendadas : [])
    } catch (e) { toast?.(e.message, 'error') }
    setLoading(false)
  }, [semanaInicio])

  useEffect(() => { load() }, [load])

  async function gerar() {
    setGerando(true)
    try {
      const r = await apiFetch('/api/agenda/gerar-semana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semana_inicio: semanaInicio }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao gerar proposta')
      toast?.(`Proposta gerada: ${j.agendados} tarefa(s) encaixada(s), ${j.nao_agendadas?.length || 0} sem espaço.`, 'success')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
    setGerando(false)
  }

  async function confirmarTudo() {
    setConfirmandoTudo(true)
    try {
      const r = await apiFetch(`/api/agenda/semana/${semanaInicio}/confirmar-tudo`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao confirmar')
      toast?.(`${j.confirmados} agendamento(s) confirmado(s).`, 'success')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
    setConfirmandoTudo(false)
  }

  async function confirmar(id) {
    try {
      const r = await apiFetch(`/api/agenda/agendamentos/${id}/confirmar`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json()).error || 'Falha ao confirmar')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
  }

  async function recusar(id) {
    try {
      const r = await apiFetch(`/api/agenda/agendamentos/${id}/recusar`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json()).error || 'Falha ao recusar')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
  }

  const porUserEDia = useMemo(() => {
    const map = {}
    for (const a of agendamentos) {
      map[a.user_id] ||= {}
      ;(map[a.user_id][a.data] ||= []).push(a)
    }
    for (const uid in map) for (const d in map[uid]) map[uid][d].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    return map
  }, [agendamentos])

  const propostosCount = agendamentos.filter(a => a.estado === 'proposto').length
  const confirmadosCount = agendamentos.filter(a => a.estado === 'confirmado').length

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setRefDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            className="p-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-800 dark:text-neutral-200 min-w-[140px] text-center">
            {fmtDiaLabel(monday)} – {fmtDiaLabel(new Date(dias[6]))}
          </span>
          <button onClick={() => setRefDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            className="p-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800">
            <ChevronRight className="w-4 h-4" />
          </button>
          <Button variant="secondary" size="sm" onClick={() => setRefDate(new Date())}>Semana actual</Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{confirmadosCount} confirmada(s) · {propostosCount} proposta(s)</span>
          <Button variant="secondary" size="sm" icon={gerando ? Loader2 : Wand2} onClick={gerar} disabled={gerando}>
            Gerar proposta desta semana
          </Button>
          {propostosCount > 0 && (
            <Button variant="primary" size="sm" icon={confirmandoTudo ? Loader2 : Check} onClick={confirmarTudo} disabled={confirmandoTudo}>
              Confirmar tudo
            </Button>
          )}
        </div>
      </div>

      {loading ? <PageSkeleton /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {users.map(u => (
              <Card key={u.id} variant="default" padding="sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: u.cor || '#C9A84C' }}>{u.iniciais}</span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{u.nome}</p>
                </div>
                <div className="space-y-3">
                  {dias.map(dia => {
                    const items = (porUserEDia[u.id] || {})[dia] || []
                    if (!items.length) return null
                    return (
                      <div key={dia}>
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1">{fmtDiaLabel(new Date(dia))}</p>
                        <div className="space-y-1.5">
                          {items.map(a => (
                            <div key={a.id} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                              a.estado === 'confirmado' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800/50' : 'bg-brand-gold/10 border-brand-gold/20'
                            }`}>
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-gray-700 dark:text-neutral-200">{a.hora_inicio}–{a.hora_fim}</span>
                                <span className="text-gray-500 dark:text-neutral-400"> · {a.tarefa}</span>
                              </div>
                              {a.estado === 'proposto' ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => confirmar(a.id)} title="Confirmar" className="p-1 rounded-md text-green-600 hover:bg-green-100">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => recusar(a.id)} title="Recusar" className="p-1 rounded-md text-red-500 hover:bg-red-100">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <Badge tone="green" size="xs">Confirmada</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {!Object.keys(porUserEDia[u.id] || {}).length && (
                    <p className="text-xs text-gray-300 dark:text-neutral-600">Sem tarefas propostas esta semana.</p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-neutral-200 mb-2">Não agendadas esta semana</p>
            {naoAgendadas.length === 0 ? (
              <EmptyState icon={Inbox} title="Tudo agendado" description="Não há tarefas por encaixar nesta semana." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {naoAgendadas.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 dark:text-neutral-200 truncate">{t.tarefa}</p>
                      <p className="text-[10px] text-gray-400">{usersById[t.user_id]?.nome || 'Sem responsável'}{t.categoria ? ` · ${t.categoria}` : ''}</p>
                    </div>
                    <Badge tone={PRIORIDADE_TONE[t.prioridade] || 'gray'} size="xs">{PRIORIDADE_LABEL[t.prioridade] || t.prioridade}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TemplateModal({ open, onClose, template, users, onSaved }) {
  const toast = useToast()
  const isEdit = !!template
  const [form, setForm] = useState(() => blankForm())
  const [saving, setSaving] = useState(false)

  function blankForm() {
    return {
      titulo: '', categoria: CATEGORIAS[0], duracao_estimada_horas: 1, frequencia: 'semanal',
      frequencia_intervalo_dias: '', dias_semana: [], prioridade: 'media', sop_ref: '',
      user_id_default: '', regiao: '', activo: true, simultaneo: false,
    }
  }

  useEffect(() => {
    if (!open) return
    if (template) {
      setForm({
        titulo: template.titulo || '',
        categoria: template.categoria || CATEGORIAS[0],
        duracao_estimada_horas: template.duracao_estimada_horas ?? 1,
        frequencia: template.frequencia || 'semanal',
        frequencia_intervalo_dias: template.frequencia_intervalo_dias || '',
        dias_semana: template.dias_semana ? template.dias_semana.split(',') : [],
        prioridade: template.prioridade || 'media',
        sop_ref: template.sop_ref || '',
        user_id_default: template.user_id_default || '',
        regiao: template.regiao || '',
        activo: template.activo !== false,
        simultaneo: !!template.simultaneo,
      })
    } else {
      setForm(blankForm())
    }
  }, [open, template])

  function toggleDia(i) {
    setForm(f => {
      const v = String(i)
      const set = f.dias_semana.includes(v) ? f.dias_semana.filter(x => x !== v) : [...f.dias_semana, v]
      return { ...f, dias_semana: set.sort() }
    })
  }

  async function save() {
    if (!form.titulo.trim()) { toast?.('Título é obrigatório.', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        titulo: form.titulo.trim(),
        categoria: form.categoria || null,
        duracao_estimada_horas: Number(form.duracao_estimada_horas) || 1,
        frequencia: form.frequencia,
        frequencia_intervalo_dias: form.frequencia === 'custom' && form.frequencia_intervalo_dias ? Number(form.frequencia_intervalo_dias) : null,
        dias_semana: form.dias_semana.length ? form.dias_semana.join(',') : null,
        prioridade: form.prioridade,
        sop_ref: form.sop_ref.trim() || null,
        user_id_default: form.user_id_default || null,
        regiao: form.regiao || null,
        activo: form.activo,
        simultaneo: form.simultaneo,
      }
      const r = await apiFetch(isEdit ? `/api/agenda/templates/${template.id}` : '/api/agenda/templates', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao guardar')
      toast?.(isEdit ? 'Template actualizado.' : 'Template criado.', 'success')
      onSaved()
      onClose()
    } catch (e) { toast?.(e.message, 'error') }
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar template' : 'Novo template'}
      subtitle="Tarefa recorrente a entrar no pool de agendamento" size="lg"
      footer={
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>Guardar</Button>
        </Modal.Footer>
      }>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Título" className="sm:col-span-2" value={form.titulo}
          onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Cold Call" />
        <Select label="Categoria" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input label="Duração estimada (horas)" type="number" step="0.25" min="0.25" value={form.duracao_estimada_horas}
          onChange={e => setForm(f => ({ ...f, duracao_estimada_horas: e.target.value }))} />
        <Select label="Frequência" value={form.frequencia} onChange={e => setForm(f => ({ ...f, frequencia: e.target.value }))}>
          {Object.entries(FREQUENCIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select label="Prioridade" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}>
          {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {form.frequencia === 'custom' && (
          <Input label="Repete a cada (dias)" type="number" min="1" className="sm:col-span-2" value={form.frequencia_intervalo_dias}
            onChange={e => setForm(f => ({ ...f, frequencia_intervalo_dias: e.target.value }))} />
        )}
        <div className="sm:col-span-2">
          <label className="block text-overline uppercase tracking-widest font-semibold text-gray-500 dark:text-neutral-400 mb-1.5">
            Dias da semana (vazio = motor escolhe)
          </label>
          <div className="flex gap-1.5">
            {DIAS_SEMANA.map((d, i) => {
              const active = form.dias_semana.includes(String(i + 1))
              return (
                <button key={d} type="button" onClick={() => toggleDia(i + 1)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${active ? 'bg-brand-dark text-brand-gold' : 'bg-gray-100 dark:bg-neutral-800 text-gray-500'}`}>
                  {d}
                </button>
              )
            })}
          </div>
        </div>
        <Input label="SOP de referência (opcional)" value={form.sop_ref}
          onChange={e => setForm(f => ({ ...f, sop_ref: e.target.value }))} placeholder="Ex: SOP 2" />
        <Select label="Responsável por defeito" value={form.user_id_default} onChange={e => setForm(f => ({ ...f, user_id_default: e.target.value }))}>
          <option value="">— Sem responsável fixo —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </Select>
        <Select label="Região (opcional)" value={form.regiao} onChange={e => setForm(f => ({ ...f, regiao: e.target.value }))}>
          <option value="">—</option>
          {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-300 sm:col-span-2">
          <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="rounded" />
          Activo (entra na geração automática semanal)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-300 sm:col-span-2">
          <input type="checkbox" checked={form.simultaneo} onChange={e => setForm(f => ({ ...f, simultaneo: e.target.checked }))} className="rounded" />
          Tarefa simultânea (exige os dois membros da equipa no mesmo bloco, ao mesmo tempo)
        </label>
      </div>
    </Modal>
  )
}
