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
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
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
  pre_aquisicao: '#1F4E5F',
  pre_obra: '#5F4D20',
  aquisicao: '#475569',
  projeto_licenca: '#1F4E5F',
  demolicoes: '#7C2D40',
  estrutura_especialidades: '#5F4D20',
  acabamentos: '#C9A84C',
  exterior_fecho: '#D5B65A',
  comercializacao: '#866B2D',
  vendido: '#8a877e', // neutro: o preto desaparecia no modo escuro
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
      <Header title="Calendário de obras" subtitle="Deadlines de fases e tarefas" onRefresh={load} loading={loading} />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navegar(-1)} aria-label="Mês anterior" className="p-2 rounded-lg bg-surface-raised border border-line text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-display text-xl text-ink min-w-[150px] sm:min-w-[200px] text-center">
              {MESES[month]} <span className="font-normal text-ink-muted">{year}</span>
            </h2>
            <button onClick={() => navegar(1)} aria-label="Mês seguinte" className="p-2 rounded-lg bg-surface-raised border border-line text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast">
              <ChevronRight className="w-4 h-4" />
            </button>
            <Button variant="secondary" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}>Hoje</Button>
          </div>
          <div className="flex items-center gap-2">
            <Tabs size="sm" value={tipoFiltro} onChange={setTipoFiltro}
              items={[{ key: 'todos', label: 'Todos' }, { key: 'fase', label: 'Fases' }, { key: 'tarefa', label: 'Tarefas' }]} />
            <Link to="/projectos">
              <Button variant="ghost" size="sm" icon={Briefcase}>Voltar</Button>
            </Link>
          </div>
        </div>

        {/* KPIs do mês */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <KpiCard icon={CalendarIcon} label="Fases" value={stats.fases} size="sm" />
          <KpiCard icon={CheckCircle2} label="Tarefas" value={stats.tarefas} size="sm" />
          <KpiCard icon={AlertTriangle} label="Em atraso" value={stats.atrasados} tone={stats.atrasados ? 'red' : 'gray'} size="sm" />
        </div>

        {/* Calendário */}
        <Card variant="default" padding="none" className="overflow-hidden">
          <div className="grid grid-cols-7 bg-surface border-b border-line">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="px-2 py-2.5 text-center text-overline font-semibold uppercase text-ink-muted">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {matrix.flat().map((d, idx) => {
              if (!d) return <div key={idx} className="min-h-[72px] sm:min-h-[120px] bg-surface border-r border-b border-line" />
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              const events = eventosPorDia[key] || []
              const isToday = d.toDateString() === today.toDateString()
              const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate())
              return (
                <div key={idx} className={`min-h-[72px] sm:min-h-[120px] border-r border-b border-line p-1 sm:p-2 min-w-0 transition-colors duration-fast ${isToday ? 'bg-accent/[0.06]' : 'hover:bg-surface'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-semibold num ${isToday ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent text-accent-foreground' : isPast ? 'text-ink-muted' : 'text-ink'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 4).map(e => {
                      const cor = e.tipo === 'fase' ? (FASE_COR[e.fase_key] || 'rgb(var(--ink-muted))') : 'rgb(var(--ink-muted))'
                      const isConcluido = (e.tipo === 'fase' && e.estado === 'concluida') || (e.tipo === 'tarefa' && e.concluida)
                      const isAtraso = isPast && !isConcluido
                      return (
                        <Link key={`${e.tipo}-${e.id}`} to={`/projectos/${e.negocio_id}`}
                          className={`${isAtraso ? 'bg-danger/10 text-danger' : 'bg-surface-muted text-ink'} block h-1.5 max-sm:!bg-[var(--cor)] sm:h-auto sm:px-1.5 sm:py-1 rounded text-[10px] truncate transition-[background-color,transform] duration-fast ease-entry hover:translate-x-0.5 ${isConcluido ? 'opacity-50 line-through' : ''}`}
                          style={{ '--cor': isAtraso ? 'rgb(var(--danger))' : cor, borderLeft: `2px solid ${isAtraso ? 'rgb(var(--danger))' : cor}` }}
                          title={`${e.projeto} · ${e.titulo}`} aria-label={`${e.projeto} · ${e.titulo}`}>
                          <span className="hidden sm:inline"><span className="font-semibold">{e.projeto.split(' ')[0]}</span> · {e.titulo}</span>
                        </Link>
                      )
                    })}
                    {events.length > 4 && (
                      <p className="text-[10px] text-ink-muted pl-1.5 font-medium">+{events.length - 4} mais</p>
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

