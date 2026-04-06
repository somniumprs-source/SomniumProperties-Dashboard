import { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'
import { DATABASES } from '../config/notion.js'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const PCT = v => `${(v ?? 0).toFixed(1)}%`

function st(val, meta, higher = true) {
  if (val === null || val === undefined) return 'yellow'
  const r = val / meta
  return higher ? (r >= 0.9 ? 'green' : r >= 0.7 ? 'yellow' : 'red')
                : (r <= 1.1 ? 'green' : r <= 1.3 ? 'yellow' : 'red')
}

const STATUS_COLOR = {
  'Em curso':  'bg-blue-100 text-blue-700',
  'Planeada':  'bg-gray-100 text-gray-600',
  'Pausada':   'bg-yellow-100 text-yellow-700',
  'Concluída': 'bg-green-100 text-green-700',
  'Cancelada': 'bg-red-100 text-red-700',
}

const STATUS_PIE_COLORS = {
  'Em curso':  '#3b82f6',
  'Planeada':  '#94a3b8',
  'Pausada':   '#f59e0b',
  'Concluída': '#22c55e',
  'Cancelada': '#ef4444',
}

const TIPO_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6']

export function Operacoes() {
  const [kpis, setKpis]       = useState(null)
  const [hist, setHist]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [kr, hr] = await Promise.all([
        fetch('/api/kpis/operacoes'),
        fetch('/api/operacoes/historico'),
      ])
      if (!kr.ok || !hr.ok) throw new Error('Erro no servidor')
      const [k, h] = await Promise.all([kr.json(), hr.json()])
      if (k.error) throw new Error(k.error)
      setKpis(k); setHist(h)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const notionUrl = `https://www.notion.so/${DATABASES.obras?.replace(/-/g, '')}`
  const ultimos6  = hist?.meses?.slice(-6) ?? []

  return (
    <>
      <Header title="Operações" subtitle="Atualização em tempo real" onRefresh={load} loading={loading} />
      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard label="Obras Ativas"      value={kpis?.obrasAtivas ?? '—'}                meta={5}    status="green"                               trend="neutral" unit="" />
          <KPICard label="No Prazo"          value={kpis ? PCT(kpis.percentNoPrazo) : '—'}   meta="80%"  status={st(kpis?.percentNoPrazo, 80)}        trend="neutral" unit="" />
          <KPICard label="Desvio Médio Orç." value={kpis ? PCT(kpis.desvioMedio) : '—'}      meta="5%"   status={st(kpis?.desvioMedio, 5, false)}     trend="neutral" unit="" />
          <KPICard label="Não Conformidades" value={kpis?.naoConformidades ?? '—'}            meta={0}    status={kpis?.naoConformidades === 0 ? 'green' : kpis?.naoConformidades <= 3 ? 'yellow' : 'red'} trend="neutral" unit="" />
        </div>

        {/* Métricas secundárias */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Valor em Carteira</span>
            <span className="text-xl font-bold text-indigo-600">{EUR(kpis?.valorCarteira)}</span>
            <span className="text-xs text-gray-400">Orçamento total das obras ativas</span>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Taxa de Faturação</span>
            <span className={`text-xl font-bold ${(kpis?.taxaFaturacao ?? 0) >= 80 ? 'text-green-600' : 'text-yellow-600'}`}>
              {kpis ? PCT(kpis.taxaFaturacao) : '—'}
            </span>
            <span className="text-xs text-gray-400">Valor faturado / orçamento</span>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Obras Concluídas (mês)</span>
            <span className="text-xl font-bold text-gray-900">{kpis?.obrasConcluidas ?? '—'}</span>
            <span className="text-xs text-gray-400">Finalizadas este mês</span>
          </div>
        </div>

        {/* Status actual (pie) + Tipos de obra */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Estado Atual das Obras</h2>
            {hist?.porStatus?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={hist.porStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={75}
                    label={({ status, count }) => `${status} (${count})`} labelLine={true}>
                    {hist.porStatus.map((s,i) => <Cell key={i} fill={STATUS_PIE_COLORS[s.status] ?? '#94a3b8'} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Obras por Tipo</h2>
            {hist?.tipos?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hist.tipos} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" name="Nº Obras" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>
        </div>

        {/* Obras concluídas + desvio por mês */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Obras Concluídas & Desvio Médio — últimos 6 meses</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ultimos6} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left"  dataKey="concluidas" name="Concluídas" fill="#22c55e" radius={[3,3,0,0]} />
              <Bar yAxisId="left"  dataKey="iniciadas"  name="Iniciadas"  fill="#94a3b8" radius={[3,3,0,0]} />
              <Line yAxisId="right" type="monotone" dataKey="desvioMedio" name="Desvio Orç. %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine yAxisId="right" y={0} stroke="#e5e7eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela obras ativas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Obras em Curso</h2>
            <a href={notionUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">Abrir no Notion</a>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-3">Obra</th>
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Tipo</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-right py-2 px-3">Orçamento</th>
                  <th className="text-right py-2 px-3">Custo Real</th>
                  <th className="text-right py-2 px-3">Faturado</th>
                  <th className="text-right py-2 px-3">Desvio</th>
                  <th className="text-left py-2 px-3">Fim Prev.</th>
                </tr>
              </thead>
              <tbody>
                {(kpis?.obrasAtivasLista ?? []).map(o => {
                  const custoExcede = o.custoReal > o.orcamentoAprovado * 1.05
                  return (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-800">{o.nome}</td>
                      <td className="py-2 px-3 text-gray-500 text-xs">{o.cliente}</td>
                      <td className="py-2 px-3 text-gray-500 text-xs">{o.tipoObra}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">{EUR(o.orcamentoAprovado)}</td>
                      <td className={`py-2 px-3 text-right font-mono text-xs ${custoExcede ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                        {o.custoReal > 0 ? EUR(o.custoReal) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">
                        {o.valorFaturado > 0 ? EUR(o.valorFaturado) : '—'}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono text-xs ${o.desvioPct > 5 ? 'text-red-600' : o.desvioPct > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {o.desvioPct !== 0 ? `${o.desvioPct > 0 ? '+' : ''}${o.desvioPct}%` : '—'}
                      </td>
                      <td className="py-2 px-3 text-gray-400 text-xs">{o.dataFimPrevista}</td>
                    </tr>
                  )
                })}
                {(!kpis?.obrasAtivasLista?.length) && (
                  <tr><td colSpan={9} className="py-6 text-center text-gray-400 text-xs">Sem obras em curso</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function EmptyState() {
  return <p className="text-xs text-gray-400 text-center py-10">Sem dados suficientes</p>
}
