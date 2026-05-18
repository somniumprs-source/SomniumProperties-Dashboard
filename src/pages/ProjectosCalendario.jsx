/**
 * Vista calendário mensal de deadlines (fases + tarefas) dos projectos.
 * Filtros: mês actual ± navegação, tipo (todos/fases/tarefas), estado.
 */
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Briefcase, Calendar as CalendarIcon, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { apiFetch } from '../lib/api.js'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

function getMonthMatrix(year, month) {
  // Retorna array de semanas; cada semana = array de 7 datas (Date|null se fora do mês actual)
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  // Dia da semana de Segunda=0, Terça=1, ..., Domingo=6
  const startDay = (first.getDay() + 6) % 7
  const total = last.getDate()
  const matrix = []
  let week = new Array(startDay).fill(null)
  for (let d = 1; d <= total; d++) {
    week.push(new Date(year, month, d))
    if (week.length === 7) { matrix.push(week); week = [] }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); matrix.push(week) }
  return matrix
}

const FASE_COR = {
  aquisicao: '#6366f1', projeto_licenca: '#0ea5e9', demolicoes: '#ef4444',
  estrutura_especialidades: '#f59e0b', acabamentos: '#10b981', exterior_fecho: '#8b5cf6',
  comercializacao: '#ec4899', vendido: '#22c55e',
}

export function ProjectosCalendario() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [tipoFiltro, setTipoFiltro] = useState('todos') // todos | fase | tarefa
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)

  const matrix = useMemo(() => getMonthMatrix(year, month), [year, month])
  const firstDay = matrix[0].find(d => d !== null) || new Date(year, month, 1)
  const lastDay = [...matrix].reverse().find(w => w.some(d => d))?.filter(d => d).slice(-1)[0] || new Date(year, month + 1, 0)

  async function load() {
    setLoading(true)
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDate = new Date(year, month + 1, 0).getDate()
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`
      const r = await apiFetch(`/api/crm/projetos/calendario?from=${from}&to=${to}`)
      if (r.ok) setEventos((await r.json()).eventos || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [year, month])

  const eventosFiltrados = useMemo(
    () => eventos.filter(e => tipoFiltro === 'todos' || e.tipo === tipoFiltro),
    [eventos, tipoFiltro]
  )

  const eventosPorDia = useMemo(() => {
    const map = {}
    for (const e of eventosFiltrados) {
      const key = e.data.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [eventosFiltrados])

  function navegar(delta) {
    let m = month + delta, y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y)
  }

  const stats = useMemo(() => ({
    fases: eventosFiltrados.filter(e => e.tipo === 'fase').length,
    tarefas: eventosFiltrados.filter(e => e.tipo === 'tarefa').length,
    atrasados: eventosFiltrados.filter(e => {
      const d = new Date(e.data); d.setHours(0,0,0,0)
      const hoje = new Date(); hoje.setHours(0,0,0,0)
      return d < hoje && !(e.tipo === 'fase' && e.estado === 'concluida') && !(e.tipo === 'tarefa' && e.concluida)
    }).length,
  }), [eventosFiltrados])

  return (
    <>
      <Header title="Calendário de Projectos" subtitle="Deadlines de fases e tarefas" onRefresh={load} loading={loading} />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navegar(-1)} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-semibold text-gray-800 min-w-[180px] text-center">
              {MESES[month]} {year}
            </h2>
            <button onClick={() => navegar(1)} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
              className="ml-2 text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">Hoje</button>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
              {[{ key: 'todos', label: 'Todos' }, { key: 'fase', label: 'Fases' }, { key: 'tarefa', label: 'Tarefas' }].map(o => (
                <button key={o.key} onClick={() => setTipoFiltro(o.key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${tipoFiltro === o.key ? 'bg-[#0d0d0d] text-[#C9A84C]' : 'text-gray-500'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <Link to="/projectos" className="text-xs text-[#C9A84C] hover:underline inline-flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" /> Voltar
            </Link>
          </div>
        </div>

        {/* KPIs do mês */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard icon={CalendarIcon} label="Fases" value={stats.fases} cor="#C9A84C" />
          <KpiCard icon={CheckCircle2} label="Tarefas" value={stats.tarefas} cor="#0ea5e9" />
          <KpiCard icon={AlertTriangle} label="Em atraso" value={stats.atrasados} cor="#ef4444" />
        </div>

        {/* Calendário */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {matrix.flat().map((d, idx) => {
              if (!d) return <div key={idx} className="min-h-[110px] bg-gray-50 border-r border-b border-gray-100" />
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              const events = eventosPorDia[key] || []
              const isToday = d.toDateString() === today.toDateString()
              const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate())
              return (
                <div key={idx} className={`min-h-[110px] border-r border-b border-gray-100 p-1.5 ${isToday ? 'bg-[#C9A84C]/10' : ''}`}>
                  <p className={`text-[11px] font-semibold mb-1 ${isToday ? 'text-[#0d0d0d]' : isPast ? 'text-gray-400' : 'text-gray-700'}`}>
                    {d.getDate()}
                    {isToday && <span className="ml-1 text-[8px] uppercase tracking-wider text-[#C9A84C]">hoje</span>}
                  </p>
                  <div className="space-y-1">
                    {events.slice(0, 4).map(e => {
                      const cor = e.tipo === 'fase' ? (FASE_COR[e.fase_key] || '#6b7280') : '#0ea5e9'
                      const isConcluido = (e.tipo === 'fase' && e.estado === 'concluida') || (e.tipo === 'tarefa' && e.concluida)
                      const isAtraso = isPast && !isConcluido
                      return (
                        <Link key={`${e.tipo}-${e.id}`} to={`/projectos/${e.negocio_id}`}
                          className={`block px-1.5 py-0.5 rounded text-[9px] truncate transition-colors ${isConcluido ? 'opacity-50 line-through' : ''}`}
                          style={{
                            background: isAtraso ? '#fee2e2' : `${cor}20`,
                            color: isAtraso ? '#991b1b' : cor,
                            borderLeft: `2px solid ${isAtraso ? '#ef4444' : cor}`,
                          }}
                          title={`${e.projeto} · ${e.titulo}`}>
                          <span className="font-bold">{e.projeto.split(' ')[0]}</span> · {e.titulo}
                        </Link>
                      )
                    })}
                    {events.length > 4 && (
                      <p className="text-[9px] text-gray-400 pl-1.5">+{events.length - 4} mais</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

function KpiCard({ icon: Icon, label, value, cor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${cor}20` }}>
        <Icon className="w-4 h-4" style={{ color: cor }} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-800">{value}</p>
      </div>
    </div>
  )
}
