import { useState, useEffect, useCallback } from 'react'
import { Header } from '../components/layout/Header.jsx'

const EUR = v => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const PCT = v => v == null ? '—' : `${Number(v).toFixed(1)}%`
const NUM = v => v == null ? '—' : String(v)
const HRS = v => v == null ? '—' : `${Number(v).toFixed(1)}h`
const GOLD = '#C9A84C'
const MES_LABEL = { '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez' }
const FUNCIONARIOS = ['João Abreu', 'Alexandre Mendes']
const STATUS_OPTIONS = ['A fazer', 'Em andamento', 'Concluída', 'Atrasada']
const STATUS_COLOR = { 'A fazer': 'bg-gray-100 text-gray-600', 'Em andamento': 'bg-blue-100 text-blue-700', 'Concluída': 'bg-green-100 text-green-700', 'Atrasada': 'bg-red-100 text-red-600' }

const TABS = [
  { id: 'resumo',     label: 'Visao Geral' },
  { id: 'tarefas',    label: 'Tarefas' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'horas',      label: 'Horas & Custo' },
  { id: 'categorias', label: 'Actividades' },
  { id: 'equipa',     label: 'Equipa' },
  { id: 'eficiencia', label: 'Eficiencia' },
]

const CAT_COLORS = ['#6366f1','#f59e0b','#ef4444','#10b981','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#a855f7','#e11d48','#0ea5e9','#65a30d']

// ── Components ──────────────────────────────────────────────────
function M({ label, value, sub, highlight = false, warn = false }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${highlight ? 'border-yellow-300 bg-yellow-50' : warn ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <span className="text-[11px] text-gray-400 uppercase tracking-wide leading-tight">{label}</span>
      <span className={`text-xl font-bold ${highlight ? 'text-yellow-700' : warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400 leading-tight">{sub}</span>}
    </div>
  )
}

function SectionTitle({ children }) {
  return (<div className="flex items-center gap-3 mb-4"><div className="h-px flex-1 bg-gray-100" /><span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{children}</span><div className="h-px flex-1 bg-gray-100" /></div>)
}

function HBar({ items, valueKey = 'horas', labelKey = 'label', colorFn }) {
  if (!items?.length) return <p className="text-xs text-gray-400 text-center py-8">Sem dados</p>
  const max = Math.max(...items.map(i => i[valueKey] || 0), 1)
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => {
        const val = item[valueKey] || 0
        const pct = Math.max(Math.round(val / max * 100), 3)
        return (
          <div key={item[labelKey] || idx} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-40 text-right shrink-0 leading-tight truncate">{item[labelKey]}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
              <div className="h-full rounded-full flex items-center px-3 transition-all" style={{ width: `${pct}%`, backgroundColor: colorFn ? colorFn(item, idx) : '#6366f1' }}>
                <span className="text-white text-xs font-bold whitespace-nowrap">{HRS(val)}</span>
              </div>
            </div>
            {item.tarefas != null && <span className="text-xs text-gray-400 w-16 shrink-0">{item.tarefas}x</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Task Form (matches Notion "Tarefas a fazer") ────────────────
function calcHoras(inicio, fim) {
  if (!inicio || !fim) return null
  const ms = new Date(fim) - new Date(inicio)
  return ms > 0 ? Math.round(ms / 3600000 * 100) / 100 : null
}

function TaskForm({ onSave, onCancel, initial }) {
  const defaults = { tarefa: '', status: 'A fazer', inicio: '', fim: '', funcionario: FUNCIONARIOS[0], tempo_horas: '', enviar_calendar: false }
  const [f, setF] = useState(() => {
    if (!initial) return defaults
    return {
      ...defaults, ...initial,
      inicio: initial.inicio?.slice(0, 16) || '',
      fim: initial.fim?.slice(0, 16) || '',
      tempo_horas: initial.tempo_horas || '',
    }
  })
  const set = (k, v) => setF(p => {
    const next = { ...p, [k]: v }
    // Auto-calc horas when both dates set
    if ((k === 'inicio' || k === 'fim') && next.inicio && next.fim) {
      const h = calcHoras(next.inicio, next.fim)
      if (h != null) next.tempo_horas = h
    }
    return next
  })
  const horasDisplay = f.tempo_horas || calcHoras(f.inicio, f.fim) || 0

  return (
    <div className="bg-white rounded-xl border-2 border-yellow-200 p-5 shadow-md">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{initial ? 'Editar Tarefa' : 'Nova Tarefa'}</h3>
      <div className="grid grid-cols-1 xl:grid-cols-6 gap-4">
        <div className="xl:col-span-4">
          <label className="text-xs text-gray-500 block mb-1">Tarefa *</label>
          <input value={f.tarefa} onChange={e => set('tarefa', e.target.value)} autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-300 focus:border-yellow-400 outline-none"
            placeholder="Ex: Cold Call, Estudo de Mercado, Reuniao Investidor..." />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Funcionario</label>
          <select value={f.funcionario} onChange={e => set('funcionario', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {FUNCIONARIOS.map(fn => <option key={fn} value={fn}>{fn}</option>)}
            <option value="João Abreu, Alexandre Mendes">Ambos</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Status</label>
          <select value={f.status} onChange={e => set('status', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="xl:col-span-2">
          <label className="text-xs text-gray-500 block mb-1">Inicio da tarefa</label>
          <input type="datetime-local" value={f.inicio} onChange={e => set('inicio', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="xl:col-span-2">
          <label className="text-xs text-gray-500 block mb-1">Fim da tarefa</label>
          <input type="datetime-local" value={f.fim} onChange={e => set('fim', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Horas (manual)</label>
          <input type="number" step="0.25" min="0" max="24" value={f.tempo_horas} onChange={e => set('tempo_horas', e.target.value ? parseFloat(e.target.value) : '')}
            placeholder={horasDisplay > 0 ? String(horasDisplay) : '0'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end pb-1">
          <div className="bg-indigo-50 rounded-lg px-4 py-2 text-center w-full">
            <span className="text-[10px] text-indigo-400 uppercase block">Tempo</span>
            <span className="text-lg font-bold text-indigo-700">{HRS(horasDisplay)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-4">
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input type="checkbox" checked={f.enviar_calendar} onChange={e => set('enviar_calendar', e.target.checked)} className="rounded border-gray-300" />
          Enviar para Google Calendar
        </label>
        <div className="flex gap-3">
          {onCancel && <button onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>}
          <button onClick={() => {
            const payload = { ...f }
            if (!payload.tempo_horas && payload.inicio && payload.fim) payload.tempo_horas = calcHoras(payload.inicio, payload.fim)
            onSave(payload)
          }} disabled={!f.tarefa.trim()}
            className="px-5 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40" style={{ backgroundColor: GOLD }}>
            {initial ? 'Guardar Alteracoes' : 'Criar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Calendar Week View ──────────────────────────────────────────
function CalendarWeek({ events, tarefas }) {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay() + 1) // Monday
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    return d
  })
  const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']

  const getEventsForDay = (date) => {
    const ds = date.toISOString().slice(0, 10)
    const calEvents = (events || []).filter(e => e.inicio?.slice(0, 10) === ds)
    const taskEvents = (tarefas || []).filter(t => t.inicio?.slice(0, 10) === ds)
    return { calEvents, taskEvents }
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, i) => {
        const { calEvents, taskEvents } = getEventsForDay(day)
        const isToday = day.toDateString() === now.toDateString()
        return (
          <div key={i} className={`rounded-xl border p-3 min-h-[160px] ${isToday ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
            <div className="text-center mb-2">
              <p className="text-[10px] text-gray-400 uppercase">{dayNames[i]}</p>
              <p className={`text-lg font-bold ${isToday ? 'text-yellow-700' : 'text-gray-700'}`}>{day.getDate()}</p>
            </div>
            <div className="flex flex-col gap-1">
              {calEvents.map((e, j) => (
                <a key={`c${j}`} href={e.link} target="_blank" rel="noreferrer"
                  className="block px-2 py-1 rounded text-[10px] bg-blue-100 text-blue-700 truncate hover:bg-blue-200">
                  {e.inicio?.slice(11, 16)} {e.titulo}
                </a>
              ))}
              {taskEvents.map((t, j) => (
                <div key={`t${j}`} className={`px-2 py-1 rounded text-[10px] truncate ${STATUS_COLOR[t.status] || 'bg-gray-100 text-gray-600'}`}>
                  {t.inicio?.slice(11, 16)} {t.tarefa}
                </div>
              ))}
              {calEvents.length === 0 && taskEvents.length === 0 && (
                <p className="text-[10px] text-gray-300 text-center mt-4">—</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────
export function Operacoes() {
  const [tab, setTab] = useState('resumo')
  const [data, setData] = useState(null)
  const [tarefas, setTarefas] = useState([])
  const [calEvents, setCalEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [taskFilter, setTaskFilter] = useState('semana')
  const [viewMode, setViewMode] = useState('board')
  const [showArchive, setShowArchive] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [syncing, setSyncing] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [tr, tf, ce] = await Promise.all([
        fetch('/api/time-tracking').then(r => r.json()),
        fetch('/api/tarefas?limit=200').then(r => r.json()),
        fetch('/api/calendar/events?days=14&past=7').then(r => r.json()).catch(() => ({ events: [] })),
      ])
      if (tr.error) throw new Error(tr.error)
      setData(tr)
      setTarefas(tf.data || [])
      setCalEvents(ce.events || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveTarefa(form) {
    try {
      const method = editingTask ? 'PUT' : 'POST'
      const url = editingTask ? `/api/tarefas/${editingTask.id}` : '/api/tarefas'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setShowForm(false); setEditingTask(null)
      await loadAll()
    } catch (e) { setError(e.message) }
  }

  async function deleteTarefa(id) {
    try {
      await fetch(`/api/tarefas/${id}`, { method: 'DELETE' })
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
      await loadAll()
    } catch (e) { setError(e.message) }
  }

  async function updateStatus(id, status) {
    try {
      await fetch(`/api/tarefas/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      await loadAll()
    } catch (e) { setError(e.message) }
  }

  async function syncNotion() {
    setSyncing(true)
    try {
      const r = await fetch('/api/crm/sync/tarefas', { method: 'POST' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      await loadAll()
    } catch (e) { setError(e.message) }
    finally { setSyncing(false) }
  }

  const r = data?.resumo
  const k = data?.kpis

  // Week boundaries (Mon-Sun)
  const now = new Date()
  const mondayThis = new Date(now)
  mondayThis.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  mondayThis.setHours(0, 0, 0, 0)
  const sundayThis = new Date(mondayThis)
  sundayThis.setDate(mondayThis.getDate() + 7)

  const isThisWeek = (t) => {
    if (!t.inicio) return true // sem data = pendente, mostra sempre
    const d = new Date(t.inicio)
    return d >= mondayThis && d < sundayThis
  }

  // Separar tarefas
  const ativas = tarefas.filter(t => t.status !== 'Concluída')
  const concluidas = tarefas.filter(t => t.status === 'Concluída')
  const semanaAtivas = ativas.filter(isThisWeek)

  const filteredTarefas = taskFilter === 'semana' ? semanaAtivas
    : taskFilter === 'pendentes' ? ativas
    : taskFilter === 'arquivo' ? concluidas
    : tarefas

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Apagar ${selectedIds.size} tarefa(s)?`)) return
    try {
      await Promise.all([...selectedIds].map(id => fetch(`/api/tarefas/${id}`, { method: 'DELETE' })))
      setSelectedIds(new Set())
      await loadAll()
    } catch (e) { setError(e.message) }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedIds.size === filteredTarefas.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredTarefas.map(t => t.id)))
  }

  return (
    <>
      <Header title="Operacoes" subtitle="Tarefas · Calendario · Horas · Eficiencia" onRefresh={loadAll} loading={loading} />

      <div className="px-6 pt-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex gap-1 overflow-x-auto pb-px flex-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors ${tab === t.id ? 'text-yellow-700 border-b-2' : 'text-gray-500 hover:text-gray-700'}`}
                style={tab === t.id ? { borderColor: GOLD, backgroundColor: '#fefce8' } : {}}>
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={syncNotion} disabled={syncing} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 shrink-0">
            {syncing ? 'Sync...' : 'Sync Notion'}
          </button>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* ══════════ VISAO GERAL ══════════ */}
        {tab === 'resumo' && r && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Total horas tracked" value={HRS(r.totalHoras)} sub={`${r.totalTarefas} tarefas`} highlight />
              <M label="Horas este mes" value={HRS(r.horasMesActual)} sub={`${r.tarefasMesActual} tarefas`} />
              <M label="Horas esta semana" value={HRS(r.horasSemana)} />
              <M label="Taxa de conclusao" value={PCT(r.taxaProdutividade)} sub={`${HRS(r.horasConcluidas)} concluidas`} />
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Revenue / hora (pipeline)" value={k?.rph != null ? EUR(k.rph) : '—'} sub={`Pipeline: ${EUR(k?.receitaTotal)}`} highlight />
              <M label="Revenue / hora (realizado)" value={k?.rphRealizado != null ? EUR(k.rphRealizado) : '—'} warn={k?.rphRealizado === null} />
              <M label="Horas / deal" value={k?.horasPorDeal != null ? HRS(k.horasPorDeal) : '—'} />
              <M label="Custo / deal (com horas)" value={k?.custoPorDeal != null ? EUR(k.custoPorDeal) : '—'} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Estado das Tarefas</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center"><span className="text-2xl font-bold text-gray-400">{r.statusTarefas.aFazer}</span><p className="text-xs text-gray-400 mt-1">A fazer</p></div>
                <div className="text-center"><span className="text-2xl font-bold text-blue-500">{r.statusTarefas.emAndamento}</span><p className="text-xs text-gray-400 mt-1">Em andamento</p></div>
                <div className="text-center"><span className="text-2xl font-bold text-green-600">{r.statusTarefas.concluida}</span><p className="text-xs text-gray-400 mt-1">Concluidas</p></div>
                <div className="text-center"><span className="text-2xl font-bold text-red-500">{r.statusTarefas.atrasada}</span><p className="text-xs text-gray-400 mt-1">Atrasadas</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribuicao de Tempo</h3>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <M label="Prospeccao" value={HRS(k?.horasProspeccao)} sub={k?.pctProspeccao != null ? `${PCT(k.pctProspeccao)} do total` : ''} />
                <M label="Analise" value={HRS(k?.horasAnalise)} sub={k?.pctAnalise != null ? `${PCT(k.pctAnalise)} do total` : ''} />
                <M label="Relacional" value={HRS(k?.horasRelacional)} sub={k?.pctRelacional != null ? `${PCT(k.pctRelacional)} do total` : ''} />
                <M label="Gestao & Admin" value={HRS(k?.horasGestao)} sub={k?.pctGestao != null ? `${PCT(k.pctGestao)} do total` : ''} />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Estrutura de Custos Real</h3>
              <div className="grid grid-cols-3 gap-4">
                <M label="Custo de horas (15EUR/h)" value={EUR(r.custoHorasTotal)} sub={`${HRS(r.totalHoras)} x 15EUR`} />
                <M label="Custos fixos (ferramentas)" value={EUR(r.custoFixoTotal)} />
                <M label="Custo total operacao" value={EUR(r.custoOperacaoTotal)} highlight />
              </div>
            </div>
          </>
        )}

        {/* ══════════ TAREFAS ══════════ */}
        {tab === 'tarefas' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: 'semana', label: `Esta semana (${semanaAtivas.length})` },
                    { id: 'pendentes', label: `Todas pendentes (${ativas.length})` },
                    { id: 'arquivo', label: `Arquivo (${concluidas.length})` },
                  ].map(f => (
                    <button key={f.id} onClick={() => { setTaskFilter(f.id); setSelectedIds(new Set()) }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${taskFilter === f.id ? 'border-yellow-300 bg-yellow-50 text-yellow-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setViewMode(v => v === 'list' ? 'board' : 'list')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                    {viewMode === 'list' ? 'Board' : 'Lista'}
                  </button>
                  <button onClick={() => { setShowForm(true); setEditingTask(null) }}
                    className="px-4 py-2 text-sm font-medium rounded-lg text-white" style={{ backgroundColor: GOLD }}>
                    + Nova Tarefa
                  </button>
                </div>
              </div>

              {/* Barra de selecção — sempre visível */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500">
                  <input type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredTarefas.length}
                    onChange={selectAll}
                    className="rounded border-gray-300" />
                  {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : 'Selecionar todas'}
                </label>
                {selectedIds.size > 0 && (
                  <button onClick={bulkDelete}
                    className="px-3 py-1 text-xs font-semibold rounded-lg border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                    Apagar {selectedIds.size} tarefa(s)
                  </button>
                )}
                {selectedIds.size > 0 && (
                  <button onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">
                    Limpar selecção
                  </button>
                )}
              </div>
            </div>

            {(showForm || editingTask) && (
              <TaskForm
                initial={editingTask || undefined}
                onSave={saveTarefa}
                onCancel={() => { setShowForm(false); setEditingTask(null) }}
              />
            )}

            {/* Board View — só mostra A fazer / Em andamento / Atrasada (concluidas escondem) */}
            {viewMode === 'board' && taskFilter !== 'arquivo' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['A fazer', 'Em andamento', 'Atrasada'].map(status => {
                  const pool = (taskFilter === 'semana' ? semanaAtivas : ativas).filter(t => t.status === status)
                  const totalH = pool.reduce((s, t) => s + (t.tempo_horas || 0), 0)
                  return (
                    <div key={status} className="flex flex-col">
                      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${STATUS_COLOR[status]}`}>
                        <span className="text-xs font-semibold uppercase">{status}</span>
                        <span className="text-xs font-mono">{pool.length} · {HRS(totalH)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-2 bg-gray-50 rounded-b-xl min-h-[200px] border border-t-0 border-gray-200">
                        {pool.map(t => (
                          <div key={t.id} className={`bg-white rounded-lg p-3 shadow-sm border hover:border-gray-300 ${selectedIds.has(t.id) ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-200' : 'border-gray-100'}`}>
                            <div className="flex items-start gap-2.5">
                              <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)}
                                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400 shrink-0 cursor-pointer" />
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setEditingTask(t); setShowForm(false) }}>
                                <p className="text-sm text-gray-700 font-medium leading-tight">{t.tarefa}</p>
                                <div className="flex items-center justify-between mt-2">
                                  <span className="text-[10px] text-gray-400">{t.funcionario?.split(',')[0] || '—'}</span>
                                  <div className="flex items-center gap-2">
                                    {t.inicio && <span className="text-[10px] font-mono text-gray-400">
                                      {new Date(t.inicio).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                                      {t.inicio?.includes('T') && ' ' + t.inicio.slice(11, 16)}
                                    </span>}
                                    {t.tempo_horas > 0 && <span className="text-[10px] font-mono font-bold text-indigo-600">{HRS(t.tempo_horas)}</span>}
                                  </div>
                                </div>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); deleteTarefa(t.id) }}
                                className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors text-sm shrink-0" title="Apagar">
                                x
                              </button>
                            </div>
                          </div>
                        ))}
                        {pool.length === 0 && <p className="text-xs text-gray-300 text-center py-8">Sem tarefas</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* List View — para todos os filtros incluindo arquivo */}
            {(viewMode === 'list' || taskFilter === 'arquivo') && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {taskFilter === 'arquivo' && (
                  <div className="px-4 py-3 bg-green-50 border-b border-green-100 text-xs text-green-700">
                    Arquivo — tarefas concluidas. Seleciona e apaga as que ja nao precisas.
                  </div>
                )}
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase bg-gray-50">
                      <th className="py-2.5 px-3 w-8"><input type="checkbox" onChange={selectAll} checked={selectedIds.size > 0 && selectedIds.size === filteredTarefas.length} className="rounded border-gray-300" /></th>
                      <th className="text-left py-2.5 px-3">Tarefa</th>
                      <th className="text-left py-2.5 px-3 w-32">Status</th>
                      <th className="text-left py-2.5 px-3 w-36">Funcionario</th>
                      <th className="text-left py-2.5 px-3 w-28">Inicio</th>
                      <th className="text-left py-2.5 px-3 w-28">Fim</th>
                      <th className="text-right py-2.5 px-3 w-16">Horas</th>
                      <th className="text-right py-2.5 px-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTarefas.slice(0, 100).map(t => (
                      <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 ${selectedIds.has(t.id) ? 'bg-yellow-50' : ''} ${t.status === 'Concluída' ? 'opacity-60' : ''}`}>
                        <td className="py-2 px-3"><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="rounded border-gray-300" /></td>
                        <td className="py-2 px-3 text-gray-700 font-medium">
                          <span className={`cursor-pointer hover:underline ${t.status === 'Concluída' ? 'line-through' : ''}`}
                            onClick={() => { setEditingTask(t); setShowForm(false) }}>
                            {t.tarefa}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                            className={`px-2 py-0.5 rounded text-xs font-medium border-0 cursor-pointer ${STATUS_COLOR[t.status] || 'bg-gray-100'}`}>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-500">{t.funcionario || '—'}</td>
                        <td className="py-2 px-3 text-xs font-mono text-gray-500">
                          {t.inicio ? new Date(t.inicio).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) + (t.inicio?.includes('T') ? ' ' + t.inicio.slice(11, 16) : '') : '—'}
                        </td>
                        <td className="py-2 px-3 text-xs font-mono text-gray-500">
                          {t.fim ? new Date(t.fim).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) + (t.fim?.includes('T') ? ' ' + t.fim.slice(11, 16) : '') : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs font-bold text-indigo-600">{t.tempo_horas > 0 ? HRS(t.tempo_horas) : '—'}</td>
                        <td className="py-2 px-3 text-right">
                          <button onClick={() => deleteTarefa(t.id)} className="text-gray-300 hover:text-red-500 text-sm">x</button>
                        </td>
                      </tr>
                    ))}
                    {filteredTarefas.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-xs">
                        {taskFilter === 'arquivo' ? 'Sem tarefas concluidas' : 'Sem tarefas — clica em "+ Nova Tarefa"'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex justify-between text-xs text-gray-400">
                  <span>{filteredTarefas.length} tarefa(s)</span>
                  <span>Total: {HRS(filteredTarefas.reduce((s, t) => s + (t.tempo_horas || 0), 0))}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════ CALENDARIO ══════════ */}
        {tab === 'calendario' && (
          <>
            <SectionTitle>Esta Semana — Google Calendar + Tarefas</SectionTitle>
            <CalendarWeek events={calEvents} tarefas={tarefas} />

            {calEvents.length > 0 && (
              <>
                <SectionTitle>Proximos Eventos (Google Calendar)</SectionTitle>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex flex-col gap-2">
                    {calEvents.slice(0, 15).map((e, i) => (
                      <a key={i} href={e.link} target="_blank" rel="noreferrer"
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          <span className="text-sm text-gray-700 font-medium">{e.titulo}</span>
                        </div>
                        <div className="text-xs text-gray-400 font-mono">
                          {e.inicio ? new Date(e.inicio).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''}
                          {' '}
                          {!e.diaInteiro && e.inicio?.slice(11, 16)}
                          {!e.diaInteiro && e.fim && ` — ${e.fim.slice(11, 16)}`}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ══════════ HORAS & CUSTO ══════════ */}
        {tab === 'horas' && data?.meses && (
          <>
            <SectionTitle>Horas por Mes</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <HBar items={data.meses.map(m => ({ label: `${MES_LABEL[m.mes.slice(5)] || m.mes.slice(5)} ${m.mes.slice(0,4)}`, horas: m.horas, tarefas: m.tarefas }))} labelKey="label" colorFn={() => '#6366f1'} />
            </div>
            <SectionTitle>Detalhe Mensal</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-100 text-xs text-gray-400 uppercase"><th className="text-left py-2 px-3">Mes</th><th className="text-right py-2 px-3">Horas</th><th className="text-right py-2 px-3">Tarefas</th><th className="text-right py-2 px-3">Custo</th><th className="text-right py-2 px-3">h/sem</th></tr></thead>
                <tbody>
                  {data.meses.map(m => (
                    <tr key={m.mes} className="border-b border-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-700">{MES_LABEL[m.mes.slice(5)] || m.mes.slice(5)} {m.mes.slice(0,4)}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs font-bold">{HRS(m.horas)}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs">{m.tarefas}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-indigo-600">{EUR(m.custoHoras)}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-gray-500">{HRS(m.horas / 4.33)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-gray-200 font-bold"><td className="py-2 px-3">Total</td><td className="py-2 px-3 text-right font-mono">{HRS(r?.totalHoras)}</td><td className="py-2 px-3 text-right font-mono">{r?.totalTarefas}</td><td className="py-2 px-3 text-right font-mono text-indigo-600">{EUR(r?.custoHorasTotal)}</td><td className="py-2 px-3">—</td></tr></tfoot>
              </table>
            </div>
          </>
        )}

        {/* ══════════ ACTIVIDADES ══════════ */}
        {tab === 'categorias' && data?.categorias && (
          <>
            <SectionTitle>Tempo por Tipo de Actividade</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <HBar items={data.categorias.map(c => ({ label: c.categoria, horas: c.horas, tarefas: c.tarefas }))} labelKey="label" colorFn={(_, i) => CAT_COLORS[i % CAT_COLORS.length]} />
            </div>
            <SectionTitle>Detalhe</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-100 text-xs text-gray-400 uppercase"><th className="text-left py-2 px-3">Actividade</th><th className="text-right py-2 px-3">Horas</th><th className="text-right py-2 px-3">%</th><th className="text-right py-2 px-3">Tarefas</th><th className="text-right py-2 px-3">h/tarefa</th><th className="text-right py-2 px-3">Custo</th></tr></thead>
                <tbody>
                  {data.categorias.map((c, i) => (
                    <tr key={c.categoria} className="border-b border-gray-50">
                      <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} /><span className="text-gray-700 font-medium">{c.categoria}</span></div></td>
                      <td className="py-2 px-3 text-right font-mono text-xs font-bold">{HRS(c.horas)}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs">{PCT(c.pctHoras)}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs">{c.tarefas}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-gray-500">{c.tarefas > 0 ? HRS(c.horas / c.tarefas) : '—'}</td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-indigo-600">{EUR(c.custoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══════════ EQUIPA ══════════ */}
        {tab === 'equipa' && data?.funcionarios && (
          <>
            <SectionTitle>Performance por Funcionario</SectionTitle>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {data.funcionarios.map(f => (
                <div key={f.nome} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">{f.nome}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">{HRS(f.horas)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-[10px] text-gray-400 uppercase">Tarefas</span><p className="text-lg font-bold text-gray-800">{f.tarefas}</p></div>
                    <div><span className="text-[10px] text-gray-400 uppercase">Concluidas</span><p className="text-lg font-bold text-green-600">{f.concluidas}</p></div>
                    <div><span className="text-[10px] text-gray-400 uppercase">Taxa Conclusao</span><p className="text-lg font-bold text-gray-800">{PCT(f.taxaConclusao)}</p></div>
                    <div><span className="text-[10px] text-gray-400 uppercase">Custo Total</span><p className="text-lg font-bold text-indigo-600">{EUR(f.custoTotal)}</p></div>
                  </div>
                  {data.mesesFuncionario && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <span className="text-[10px] text-gray-400 uppercase">Evolucao mensal</span>
                      <div className="flex gap-2 mt-2">
                        {data.mesesFuncionario.filter(mf => mf.funcionario === f.nome).map(mf => (
                          <div key={mf.mes} className="flex flex-col items-center">
                            <div className="w-10 bg-gray-100 rounded-t overflow-hidden flex flex-col-reverse" style={{ height: '60px' }}>
                              <div className="bg-indigo-400 rounded-t transition-all" style={{ height: `${Math.max(4, Math.round(mf.horas / Math.max(...data.mesesFuncionario.filter(x => x.funcionario === f.nome).map(x => x.horas), 1) * 60))}px` }} />
                            </div>
                            <span className="text-[9px] text-gray-400 mt-1">{MES_LABEL[mf.mes.slice(5)] || mf.mes.slice(5)}</span>
                            <span className="text-[9px] font-mono font-bold">{HRS(mf.horas)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══════════ EFICIENCIA ══════════ */}
        {tab === 'eficiencia' && k && (
          <>
            <SectionTitle>Revenue per Hour (RPH)</SectionTitle>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="RPH (pipeline)" value={k.rph != null ? EUR(k.rph) : '—'} sub={`Pipeline: ${EUR(k.receitaTotal)}`} highlight />
              <M label="RPH (realizado)" value={k.rphRealizado != null ? EUR(k.rphRealizado) : '—'} warn={k.rphRealizado === null} />
              <M label="Receita pipeline" value={EUR(k.receitaTotal)} />
              <M label="Receita realizada" value={EUR(k.receitaRealizada)} />
            </div>
            <SectionTitle>Alocacao de Tempo</SectionTitle>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="% em Prospeccao" value={PCT(k.pctProspeccao)} sub={HRS(k.horasProspeccao)} highlight={k.pctProspeccao >= 30} warn={k.pctProspeccao < 20} />
              <M label="% em Analise" value={PCT(k.pctAnalise)} sub={HRS(k.horasAnalise)} />
              <M label="% em Relacional" value={PCT(k.pctRelacional)} sub={HRS(k.horasRelacional)} />
              <M label="% em Gestao/Admin" value={PCT(k.pctGestao)} sub={HRS(k.horasGestao)} warn={k.pctGestao > 40} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Diagnostico</h3>
              <div className="flex flex-col gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Alocacao</p>
                  <p className="text-sm text-gray-700">{k.pctProspeccao >= 40 ? 'Forte em prospeccao — bom para fase de crescimento.' : k.pctProspeccao >= 20 ? 'Equilibrada.' : 'Pouco tempo em prospeccao — deveria ser >40%.'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">RPH</p>
                  <p className="text-sm text-gray-700">{k.rphRealizado > 0 ? `${EUR(k.rphRealizado)}/h realizado.` : k.rph > 0 ? `Pipeline sugere ${EUR(k.rph)}/h. Meta: >30EUR/h.` : 'Sem receita — RPH fica positivo apos 1o deal.'}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
