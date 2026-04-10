import { useState, useEffect } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const PCT = v => `${(v ?? 0).toFixed(1)}%`

const ZONE_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#0ea5e9','#ec4899','#84cc16']

function st(val, meta, higher = true) {
  if (val === null || val === undefined) return 'yellow'
  const r = val / meta
  return higher ? (r >= 0.9 ? 'green' : r >= 0.7 ? 'yellow' : 'red')
                : (r <= 1.1 ? 'green' : r <= 1.3 ? 'yellow' : 'red')
}

export function Operacoes() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/ops-scorecard')
      if (!r.ok) throw new Error('Erro no servidor')
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setData(d)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const cons = data?.consultores ?? {}
  const pipe = data?.pipeline ?? {}
  const inv = data?.investidores ?? {}
  const ranking = data?.rankingConsultores ?? []
  const zonas = data?.zonas ?? []
  const timings = data?.pipeline?.faseTimings ?? {}

  return (
    <>
      <Header title="Operações" subtitle="Scorecard operacional em tempo real" onRefresh={load} loading={loading} />
      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard label="Consultores Ativos" value={cons.ativos ?? '—'} meta={15} status={st(cons.ativos, 15)} trend="neutral" unit="" />
          <KPICard label="Taxa Ativação" value={cons.taxaAtivacao != null ? PCT(cons.taxaAtivacao) : '—'} meta="30%" status={st(cons.taxaAtivacao, 30)} trend="neutral" unit="" />
          <KPICard label="Imóveis Ativos" value={pipe.imoveisAtivos ?? '—'} meta={20} status={st(pipe.imoveisAtivos, 20)} trend="neutral" unit="" />
          <KPICard label="Invest. Conversão" value={inv.taxaConversao != null ? PCT(inv.taxaConversao) : '—'} meta="15%" status={st(inv.taxaConversao, 15)} trend="neutral" unit="" />
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Consultores Total</span>
            <p className="text-xl font-bold text-gray-900 mt-1">{cons.total ?? '—'}</p>
            <p className="text-xs text-gray-400">{cons.emParceria ?? 0} em parceria</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Tempo Médio na Fase</span>
            <p className={`text-xl font-bold mt-1 ${(pipe.tempoMedioFase ?? 0) > 10 ? 'text-red-600' : 'text-green-600'}`}>
              {pipe.tempoMedioFase != null ? `${pipe.tempoMedioFase} dias` : '—'}
            </p>
            <p className="text-xs text-gray-400">Dias parado na fase atual</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Invest. com Reunião</span>
            <p className="text-xl font-bold text-indigo-600 mt-1">{inv.comReuniao ?? '—'}</p>
            <p className="text-xs text-gray-400">de {inv.total ?? 0} total</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Invest. em Parceria</span>
            <p className="text-xl font-bold text-green-600 mt-1">{inv.emParceria ?? '—'}</p>
            <p className="text-xs text-gray-400">{inv.classificados ?? 0} classificados</p>
          </div>
        </div>

        {/* Tempo por fase (bottleneck) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Tempo Médio por Fase (dias) — Bottleneck Analysis</h2>
          {Object.keys(timings).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={Object.entries(timings).filter(([,v]) => v != null).map(([fase, dias]) => ({ fase, dias }))} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} unit=" d" />
                <YAxis type="category" dataKey="fase" tick={{ fontSize: 10 }} width={150} />
                <Tooltip formatter={v => `${v} dias`} />
                <Bar dataKey="dias" name="Dias" fill="#6366f1" radius={[0,3,3,0]}>
                  {Object.entries(timings).filter(([,v]) => v != null).map(([, dias], i) => (
                    <Cell key={i} fill={dias > 10 ? '#ef4444' : dias > 5 ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-gray-400 text-center py-8">Sem dados suficientes</p>}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Pipeline por Zona */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline por Zona</h2>
            {zonas.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={zonas.slice(0, 8)} dataKey="ativos" nameKey="zona" cx="50%" cy="50%" outerRadius={75}
                    label={({ zona, ativos }) => `${zona} (${ativos})`} labelLine={false}>
                    {zonas.slice(0, 8).map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-gray-400 text-center py-8">Sem dados</p>}
          </div>

          {/* Funil Investidores */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Funil de Investidores</h2>
            <div className="space-y-2">
              {[
                { label: 'Total Contactados', value: inv.total ?? 0 },
                { label: 'Com Reunião', value: inv.comReuniao ?? 0 },
                { label: 'Classificados', value: inv.classificados ?? 0 },
                { label: 'Em Parceria', value: inv.emParceria ?? 0 },
              ].map((step, i) => {
                const pct = (inv.total ?? 0) > 0 ? (step.value / inv.total * 100) : 0
                return (
                  <div key={step.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-36 shrink-0">{step.label}</span>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: ZONE_COLORS[i] }} />
                    </div>
                    <span className="text-xs font-mono w-16 text-right font-semibold">{step.value} ({pct.toFixed(0)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Ranking Consultores */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Ranking de Consultores (por volume)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">Consultor</th>
                  <th className="text-left py-2 px-2">Estatuto</th>
                  <th className="text-right py-2 px-2">Leads</th>
                  <th className="text-right py-2 px-2">Ativos</th>
                  <th className="text-right py-2 px-2">Avançados</th>
                  <th className="text-right py-2 px-2">Visitas</th>
                  <th className="text-right py-2 px-2">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((c, i) => (
                  <tr key={c.nome} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-400 font-semibold">{i + 1}</td>
                    <td className="py-2 px-2 font-medium text-gray-800">{c.nome}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        c.consultor?.estatuto?.includes('Parceria') ? 'bg-green-100 text-green-700'
                        : c.consultor?.estatuto === 'Follow up' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{c.consultor?.estatuto ?? '—'}</span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold">{c.total}</td>
                    <td className="py-2 px-2 text-right font-mono text-green-600">{c.ativos}</td>
                    <td className="py-2 px-2 text-right font-mono text-indigo-600">{c.avancados}</td>
                    <td className="py-2 px-2 text-right font-mono">{c.visitas}</td>
                    <td className={`py-2 px-2 text-right font-mono font-semibold ${c.taxaConversao >= 30 ? 'text-green-600' : c.taxaConversao >= 15 ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {PCT(c.taxaConversao)}
                    </td>
                  </tr>
                ))}
                {!ranking.length && (
                  <tr><td colSpan={8} className="py-6 text-center text-gray-400">Sem dados de consultores</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
