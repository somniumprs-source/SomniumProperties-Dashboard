/**
 * Vista calendário mensal de deadlines (fases + tarefas) dos projectos.
 * Filtros: mês actual ± navegação, tipo (todos/fases/tarefas), estado.
 */
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Briefcase, Calendar as CalendarIcon, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
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
  aquisicao: '#475569',
  projeto_licenca: '#1F4E5F',
  demolicoes: '#7C2D40',
  estrutura_especialidades: '#5F4D20',
  acabamentos: '#C9A84C',
  exterior_fecho: '#D5B65A',
  comercializacao: '#866B2D',
  vendido: '#0d0d0d',
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
            <button onClick={() => navegar(-1)} className="p-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-bold text-gray-900 dark:text-neutral-100 min-w-[200px] text-center">
              {MESES[month]} <span className="font-normal text-gray-400">{year}</span>
            </h2>
            <button onClick={() => navegar(1)} className="p-2 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <Button variant="secondary" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}>Hoje</Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg p-0.5 shadow-xs">
              {[{ key: 'todos', label: 'Todos' }, { key: 'fase', label: 'Fases' }, { key: 'tarefa', label: 'Tarefas' }].map(o => (
                <button key={o.key} onClick={() => setTipoFiltro(o.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tipoFiltro === o.key ? 'bg-brand-dark text-brand-gold shadow-xs' : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <Link to="/projectos">
              <Button variant="ghost" size="sm" icon={Briefcase}>Voltar</Button>
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
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-800">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="px-2 py-2.5 text-center text-overline font-semibold uppercase tracking-widest text-gray-500 dark:text-neutral-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {matrix.flat().map((d, idx) => {
              if (!d) return <div key={idx} className="min-h-[120px] bg-gray-50 dark:bg-neutral-900/50 border-r border-b border-gray-100 dark:border-neutral-800" />
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              const events = eventosPorDia[key] || []
              const isToday = d.toDateString() === today.toDateString()
              const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate())
              return (
                <div key={idx} className={`min-h-[120px] border-r border-b border-gray-100 dark:border-neutral-800 p-2 transition-colors ${isToday ? 'bg-brand-gold/10' : 'hover:bg-gray-50 dark:hover:bg-neutral-900/30'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-bold ${isToday ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-gold text-brand-dark' : isPast ? 'text-gray-400 dark:text-neutral-600' : 'text-gray-700 dark:text-neutral-300'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 4).map(e => {
                      const cor = e.tipo === 'fase' ? (FASE_COR[e.fase_key] || '#6b7280') : '#0ea5e9'
                      const isConcluido = (e.tipo === 'fase' && e.estado === 'concluida') || (e.tipo === 'tarefa' && e.concluida)
                      const isAtraso = isPast && !isConcluido
                      return (
                        <Link key={`${e.tipo}-${e.id}`} to={`/projectos/${e.negocio_id}`}
                          className={`block px-1.5 py-1 rounded text-[10px] truncate transition-all hover:translate-x-0.5 ${isConcluido ? 'opacity-50 line-through' : ''}`}
                          style={{
                            background: isAtraso ? '#fee2e2' : `${cor}20`,
                            color: isAtraso ? '#991b1b' : cor,
                            borderLeft: `2px solid ${isAtraso ? '#ef4444' : cor}`,
                          }}
                          title={`${e.projeto} · ${e.titulo}`}>
                          <span className="font-semibold">{e.projeto.split(' ')[0]}</span> · {e.titulo}
                        </Link>
                      )
                    })}
                    {events.length > 4 && (
                      <p className="text-[10px] text-gray-400 dark:text-neutral-500 pl-1.5 font-medium">+{events.length - 4} mais</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </>
  )
}

function KpiCard({ icon: Icon, label, value, cor }) {
  return (
    <Card variant="default" padding="sm" className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cor}20`, border: `1px solid ${cor}30` }}>
        <Icon className="w-4 h-4" style={{ color: cor }} />
      </div>
      <div className="min-w-0">
        <p className="text-overline uppercase tracking-widest text-gray-500 dark:text-neutral-400 font-semibold">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-neutral-100 truncate">{value}</p>
      </div>
    </Card>
  )
}
