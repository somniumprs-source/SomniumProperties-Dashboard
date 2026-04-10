import { useState, useEffect } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const PCT = v => `${(v ?? 0).toFixed(1)}%`

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#0ea5e9']

export function Marketing() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [cr, ir] = await Promise.all([
        fetch('/api/kpis/comercial'),
        fetch('/api/comercial/historico'),
      ])
      if (!cr.ok) throw new Error('Erro no servidor')
      const [comercial, historico] = await Promise.all([cr.json(), ir.ok ? ir.json() : null])
      if (comercial.error) throw new Error(comercial.error)
      setData({ comercial, historico })
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const origens = data?.comercial?.origens ?? []
  const tipologias = data?.historico?.tipologias ?? []
  const meses = data?.historico?.meses ?? []
  const totalImoveis = data?.comercial?.imóveisTotal ?? 0
  const totalInvestidores = data?.comercial?.investidoresTotal ?? 0

  // Leads = imóveis adicionados (fonte real de "marketing" neste modelo de negócio)
  const totalAdicionados = meses.reduce((s, m) => s + m.adicionados, 0)

  return (
    <>
      <Header title="Marketing & Origens" subtitle="Análise de origens de leads e deal flow" onRefresh={load} loading={loading} />
      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          No modelo wholesaling, o "marketing" traduz-se em origens de leads (consultores, portais, referências).
          Esta página mostra de onde vêm os imóveis e investidores.
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard label="Total Imóveis" value={totalImoveis ?? '—'} meta={50} status={totalImoveis >= 20 ? 'green' : 'yellow'} trend="neutral" unit="" />
          <KPICard label="Total Investidores" value={totalInvestidores ?? '—'} meta={50} status={totalInvestidores >= 20 ? 'green' : 'yellow'} trend="neutral" unit="" />
          <KPICard label="Origens Ativas" value={origens.length} meta={5} status={origens.length >= 3 ? 'green' : 'yellow'} trend="neutral" unit="" />
          <KPICard label="Ativos no Pipeline" value={data?.comercial?.imóveisAtivos ?? '—'} meta={15} status={(data?.comercial?.imóveisAtivos ?? 0) >= 10 ? 'green' : 'yellow'} trend="neutral" unit="" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Origens dos imóveis */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Origem dos Imóveis</h2>
            {origens.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={origens} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                    {origens.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-gray-400 text-center py-8">Sem dados de origem</p>}
          </div>

          {/* Tipologias */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Imóveis por Tipologia</h2>
            {tipologias.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tipologias.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" name="Imóveis" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-gray-400 text-center py-8">Sem dados</p>}
          </div>
        </div>

        {/* Imóveis por mês */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Deal Flow — Imóveis Adicionados por Mês</h2>
          {meses.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={meses.slice(-6)} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="adicionados" name="Adicionados" fill="#6366f1" radius={[3,3,0,0]} />
                <Bar dataKey="ativos" name="Ativos" fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="descartados" name="Descartados" fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-gray-400 text-center py-8">Sem dados históricos</p>}
        </div>

        {/* Tabela de origens detalhada */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Performance por Origem</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-3">Origem</th>
                  <th className="text-right py-2 px-3">Imóveis</th>
                  <th className="text-right py-2 px-3">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {origens.map(o => (
                  <tr key={o.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-800">{o.name}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">{o.value}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-500">{totalImoveis > 0 ? PCT(o.value / totalImoveis * 100) : '—'}</td>
                  </tr>
                ))}
                {!origens.length && (
                  <tr><td colSpan={3} className="py-6 text-center text-gray-400 text-xs">Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
