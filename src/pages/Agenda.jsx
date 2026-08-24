/**
 * Sistema de Agenda — Fase 1: disponibilidade manual semana-a-semana por
 * pessoa + catálogo de tarefas recorrentes ("tarefas vencedoras"). O motor
 * de agendamento (proposta semanal automática) é Fase 2 — esta página só
 * regista os inputs de que esse motor vai precisar.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  // Adicionadas em 24/08/2026 — lacunas reais identificadas no CRM:
  { titulo: 'Prospecção de Imóveis (novos leads)', categoria: 'Pesquisa de Imóveis', duracao_estimada_horas: 1, frequencia: 'diaria', dias_semana: '1,2,3,4,5', prioridade: 'alta' },
  { titulo: 'Acompanhamento de Assinaturas CAEP Pendentes', categoria: 'Gestão Financeira', duracao_estimada_horas: 0.33, frequencia: 'semanal', prioridade: 'alta' },
  { titulo: 'Triagem de Alertas Críticos', categoria: 'Planeamento', duracao_estimada_horas: 0.25, frequencia: 'diaria', dias_semana: '1,2,3,4,5', prioridade: 'alta' },
  { titulo: 'Relacionamento com Investidores Activos', categoria: 'Follow Up Investidores', duracao_estimada_horas: 0.75, frequencia: 'quinzenal', prioridade: 'media' },
  // Adicionadas em 24/08/2026 — foco em métricas de sucesso do negócio,
  // não só higiene de processo (funil, propostas paradas, cashflow):
  { titulo: 'Follow-up de Propostas Enviadas', categoria: 'Proposta', duracao_estimada_horas: 0.5, frequencia: 'semanal', prioridade: 'alta' },
  { titulo: 'Revisão Semanal do Funil (Taxa de Conversão)', categoria: 'Planeamento', duracao_estimada_horas: 1, frequencia: 'semanal', prioridade: 'alta' },
  { titulo: 'Revisão de Negócios Descartados', categoria: 'Análise de Negócio', duracao_estimada_horas: 1, frequencia: 'mensal', prioridade: 'media' },
  { titulo: 'Revisão Semanal de Cashflow da Empresa', categoria: 'Gestão Financeira', duracao_estimada_horas: 0.75, frequencia: 'semanal', prioridade: 'alta' },
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
  const [tab, setTab] = useState('calendario')
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
            { key: 'calendario', label: 'Calendário', icon: CalendarClock },
            { key: 'catalogo', label: 'Catálogo de Tarefas Recorrentes', icon: BookOpen },
          ]}
          value={tab}
          onChange={setTab}
        />
        {loadingUsers ? <PageSkeleton /> : tab === 'calendario'
          ? <CalendarioTab users={users} />
          : <CatalogoTab users={users} />}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// Calendário — grelha de horas (arrasta para marcar disponibilidade;
// clica num bloco para escolher da fila o que fazer ali). Substitui os
// separadores Disponibilidade + Fila da Semana (revisão 24/08/2026: o
// utilizador pediu uma grelha visual real, não cartões de lista).
// ════════════════════════════════════════════════════════════════
const HORA_INICIO_GRELHA = 7
const HORA_FIM_GRELHA = 21
const SLOT_MIN = 30
const SLOTS_POR_DIA = ((HORA_FIM_GRELHA - HORA_INICIO_GRELHA) * 60) / SLOT_MIN
const SLOT_PX = 22
const PX_POR_MIN = SLOT_PX / SLOT_MIN

function minutosDoDia(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function hhmmDeMinutos(min) {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function topPx(hhmm) { return (minutosDoDia(hhmm) - HORA_INICIO_GRELHA * 60) * PX_POR_MIN }
function alturaPx(hi, hf) { return Math.max(2, (minutosDoDia(hf) - minutosDoDia(hi)) * PX_POR_MIN) }

function CalendarioTab({ users }) {
  const toast = useToast()
  const [userId, setUserId] = useState(() => {
    try { return window.localStorage.getItem(ACTIVE_USER_KEY) || '' } catch { return '' }
  })
  const [refDate, setRefDate] = useState(() => new Date())
  const [blocos, setBlocos] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [fila, setFila] = useState([])
  const [loading, setLoading] = useState(false)
  const [copiando, setCopiando] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const [picker, setPicker] = useState(null) // { blocoId, capacidadeMin, top, left }
  const [, forceTick] = useState(0)
  const dragRef = useRef(null) // { dayIdx, startSlot, curSlot }
  const dayColRefs = useRef([])
  const pickerRef = useRef(null)

  useEffect(() => { if (!userId && users.length) setUserId(users[0].id) }, [users, userId])

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
      const [rB, rA, rF] = await Promise.all([
        apiFetch(`/api/agenda/disponibilidade?user_id=${userId}&de=${semanaInicio}&ate=${semanaFim}`),
        apiFetch(`/api/agenda/proposta?semana_inicio=${semanaInicio}&user_id=${userId}`),
        apiFetch('/api/agenda/fila'),
      ])
      setBlocos((await rB.json()).blocos || [])
      setAgendamentos((await rA.json()).agendamentos || [])
      setFila((await rF.json()).fila || [])
    } catch (e) { toast?.(e.message, 'error') }
    setLoading(false)
  }, [userId, semanaInicio, semanaFim])

  useEffect(() => { load() }, [load])

  // Fecha o picker ao clicar fora dele.
  useEffect(() => {
    if (!picker) return
    function onDocMouseDown(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPicker(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [picker])

  async function criarBloco(dia, minInicio, minFim) {
    try {
      const r = await apiFetch('/api/agenda/disponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, data: dia, hora_inicio: hhmmDeMinutos(minInicio), hora_fim: hhmmDeMinutos(minFim) }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao criar bloco')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
  }

  async function apagarBloco(id) {
    try {
      const r = await apiFetch(`/api/agenda/disponibilidade/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json()).error || 'Falha ao remover')
      await load()
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

  async function actualizarFila() {
    setActualizando(true)
    try {
      const r = await apiFetch('/api/agenda/actualizar-fila', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semana_inicio: semanaInicio }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao actualizar')
      toast?.(`Fila actualizada — ${j.fila?.length || 0} itens prontos.`, 'success')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
    setActualizando(false)
  }

  async function desfazer(tarefaId) {
    try {
      const r = await apiFetch('/api/agenda/desfazer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarefaId }),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Falha ao desfazer')
      await load()
    } catch (e) { toast?.(e.message, 'error') }
  }

  async function escolher(itemFila) {
    if (!picker) return
    try {
      const item = itemFila.tipo === 'cadeia'
        ? { tipo: 'cadeia', pesquisaId: itemFila.pesquisa_id, coldCallId: itemFila.cold_call_id }
        : { tipo: 'simples', tarefaId: itemFila.tarefa_id }
      const r = await apiFetch('/api/agenda/atribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocoId: picker.blocoId, userId, item }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao atribuir')
      setPicker(null)
      await load()
    } catch (e) { toast?.(e.message, 'error') }
  }

  const blocosPorDia = useMemo(() => {
    const m = {}
    for (const b of blocos) (m[b.data] ||= []).push(b)
    return m
  }, [blocos])
  const agsPorBloco = useMemo(() => {
    const m = {}
    for (const a of agendamentos) (m[a.disponibilidade_bloco_id] ||= []).push(a)
    for (const k in m) m[k].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    return m
  }, [agendamentos])

  const totalHoras = useMemo(() => blocos.reduce((acc, b) => acc + (minutosDoDia(b.hora_fim) - minutosDoDia(b.hora_inicio)) / 60, 0), [blocos])

  // ── Arrastar para criar disponibilidade ──
  function slotDoEvento(clientY, colEl) {
    const rect = colEl.getBoundingClientRect()
    const y = clientY - rect.top
    return Math.max(0, Math.min(SLOTS_POR_DIA - 1, Math.floor(y / SLOT_PX)))
  }
  function onColMouseDown(e, dayIdx) {
    if (e.target !== e.currentTarget) return // clicou num bloco existente, não no fundo
    const slot = slotDoEvento(e.clientY, e.currentTarget)
    dragRef.current = { dayIdx, startSlot: slot, curSlot: slot }
    forceTick(t => t + 1)
    const onMove = (ev) => {
      const col = dayColRefs.current[dayIdx]
      if (!col || !dragRef.current) return
      dragRef.current.curSlot = slotDoEvento(ev.clientY, col)
      forceTick(t => t + 1)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const d = dragRef.current
      dragRef.current = null
      forceTick(t => t + 1)
      if (!d) return
      const lo = Math.min(d.startSlot, d.curSlot)
      const hi = Math.max(d.startSlot, d.curSlot)
      criarBloco(fmtISO(dias[d.dayIdx]), HORA_INICIO_GRELHA * 60 + lo * SLOT_MIN, HORA_INICIO_GRELHA * 60 + (hi + 1) * SLOT_MIN)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const horas = useMemo(() => Array.from({ length: HORA_FIM_GRELHA - HORA_INICIO_GRELHA }, (_, i) => HORA_INICIO_GRELHA + i), [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select size="sm" value={userId} onChange={e => setUserId(e.target.value)} className="w-44" wrapperClassName="!m-0">
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">{totalHoras.toFixed(1)}h livres · {fila.length} na fila</span>
          <Button variant="secondary" size="sm" icon={copiando ? Loader2 : Copy} onClick={copiarSemanaAnterior} disabled={copiando || !userId}>
            Copiar semana
          </Button>
          <Button variant="secondary" size="sm" icon={actualizando ? Loader2 : Wand2} onClick={actualizarFila} disabled={actualizando}>
            Actualizar fila
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">Arrasta na grelha para marcares um bloco livre. Clica num bloco para escolheres uma tarefa da fila.</p>

      {!userId ? (
        <EmptyState icon={Calendar} title="Sem utilizadores" description="Não há utilizadores activos para atribuir disponibilidade." />
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[720px] select-none" style={{ userSelect: dragRef.current ? 'none' : undefined }}>
            <div className="shrink-0 pr-1" style={{ width: 40 }}>
              <div style={{ height: 20 }} />
              {horas.map(h => (
                <div key={h} style={{ height: SLOT_PX * 2 }} className="text-right pr-1 text-[10px] text-gray-400 -translate-y-1.5">{h}:00</div>
              ))}
            </div>
            {dias.map((d, dayIdx) => {
              const diaISO = fmtISO(d)
              const blocosDia = blocosPorDia[diaISO] || []
              const isToday = diaISO === fmtISO(new Date())
              const drag = dragRef.current && dragRef.current.dayIdx === dayIdx ? dragRef.current : null
              return (
                <div key={dayIdx} className="flex-1 min-w-[90px] px-0.5">
                  <p className={`text-center text-[10px] uppercase tracking-widest font-semibold mb-1 ${isToday ? 'text-brand-gold' : 'text-gray-400'}`}>
                    {DIAS_SEMANA[dayIdx]} <span className="font-normal">{fmtDiaLabel(d)}</span>
                  </p>
                  <div
                    ref={el => { dayColRefs.current[dayIdx] = el }}
                    onMouseDown={e => onColMouseDown(e, dayIdx)}
                    className={`relative rounded-lg border ${isToday ? 'border-brand-gold/30' : 'border-gray-100 dark:border-neutral-800'} bg-gray-50/50 dark:bg-neutral-900/30 cursor-crosshair`}
                    style={{ height: SLOTS_POR_DIA * SLOT_PX }}
                  >
                    {horas.map((h, i) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-gray-100 dark:border-neutral-800/60 pointer-events-none" style={{ top: i * SLOT_PX * 2 }} />
                    ))}
                    {drag && (
                      <div className="absolute left-0.5 right-0.5 rounded bg-brand-gold/30 border border-brand-gold/50 pointer-events-none z-10"
                        style={{
                          top: Math.min(drag.startSlot, drag.curSlot) * SLOT_PX,
                          height: (Math.abs(drag.curSlot - drag.startSlot) + 1) * SLOT_PX,
                        }} />
                    )}
                    {blocosDia.map(b => {
                      const itens = agsPorBloco[b.id] || []
                      const usadoMin = itens.reduce((s, a) => s + (minutosDoDia(a.hora_fim) - minutosDoDia(a.hora_inicio)), 0)
                      const totalMin = minutosDoDia(b.hora_fim) - minutosDoDia(b.hora_inicio)
                      const livreMin = totalMin - usadoMin
                      return (
                        <div key={b.id}
                          className="absolute left-0.5 right-0.5 rounded-md bg-brand-gold/10 border border-brand-gold/30 overflow-hidden flex flex-col group z-20"
                          style={{ top: topPx(b.hora_inicio), height: alturaPx(b.hora_inicio, b.hora_fim) }}>
                          <div className="flex items-center justify-between px-1 py-0.5 shrink-0">
                            <span className="text-[9px] font-semibold text-brand-dark dark:text-brand-gold">{b.hora_inicio}–{b.hora_fim}</span>
                            <button onClick={() => apagarBloco(b.id)} title="Apagar bloco"
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity">
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <div className="flex-1 flex flex-col gap-0.5 px-1 pb-1 min-h-0">
                            {itens.map(a => (
                              <div key={a.id} className="flex items-center justify-between gap-0.5 px-1 py-0.5 rounded bg-green-100 border border-green-300 dark:bg-green-900/40 dark:border-green-700 text-[9px] leading-tight shrink-0"
                                title={a.tarefa}>
                                <span className="truncate text-green-800 dark:text-green-200">{a.tarefa}</span>
                                <button onClick={() => desfazer(a.tarefa_id)} className="shrink-0 text-green-700 hover:text-red-600 dark:text-green-300">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                            {livreMin >= 15 && (
                              <button
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setPicker({ blocoId: b.id, capacidadeMin: livreMin, top: rect.bottom + 4, left: rect.left })
                                }}
                                className="flex-1 min-h-[16px] flex items-center justify-center gap-0.5 rounded border border-dashed border-brand-gold/40 text-brand-gold hover:bg-brand-gold/10 transition-colors text-[9px] font-semibold">
                                <Plus className="w-2.5 h-2.5" /> Escolher
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {picker && (
        <div ref={pickerRef} className="fixed z-50 w-72 max-h-80 overflow-y-auto rounded-xl shadow-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          style={{ top: picker.top, left: Math.min(picker.left, window.innerWidth - 300) }}>
          <div className="px-3 py-2 border-b border-gray-100 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900">
            <p className="text-[11px] font-semibold text-gray-600 dark:text-neutral-300">Capacidade livre: {fmtHoras(picker.capacidadeMin / 60)}</p>
          </div>
          {fila.filter(it => it.duracao_horas * 60 <= picker.capacidadeMin + 0.001).length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-4 text-center">Nada da fila cabe neste espaço.</p>
          ) : (
            fila.filter(it => it.duracao_horas * 60 <= picker.capacidadeMin + 0.001).map(it => (
              <button key={it.id} onClick={() => escolher(it)}
                className="w-full text-left px-3 py-2 hover:bg-brand-gold/5 border-b border-gray-50 dark:border-neutral-800/60 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-800 dark:text-neutral-200 truncate">{it.titulo}</p>
                  <Badge tone={PRIORIDADE_TONE[it.prioridade] || 'gray'} size="xs">{PRIORIDADE_LABEL[it.prioridade] || it.prioridade}</Badge>
                </div>
                <p className="text-[10px] text-gray-400">{it.categoria} · {fmtHoras(it.duracao_horas)}{it.data_limite ? ` · prazo ${it.data_limite}` : ''}{it.simultaneo ? ' · precisa dos dois' : ''}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
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

function fmtHoras(h) {
  const n = Number(h)
  return `${n.toFixed(2).replace(/\.?0+$/, '')}h`
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
