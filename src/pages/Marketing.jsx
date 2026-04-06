import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'
import { DATABASES } from '../config/notion.js'

const EUR  = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const PCT  = v => `${(v ?? 0).toFixed(1)}%`

function st(val, meta, higher = true) {
  if (val === null || val === undefined) return 'yellow'
  const r = val / meta
  return higher ? (r >= 0.9 ? 'green' : r >= 0.7 ? 'yellow' : 'red')
                : (r <= 1.1 ? 'green' : r <= 1.3 ? 'yellow' : 'red')
}

const PIE_COLORS = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#14b8a6','#f97316','#0ea5e9']

const STATUS_COLOR = {
  'Planeada':  'bg-gray-100 text-gray-600',
  'Ativa':     'bg-green-100 text-green-700',
  'Pausada':   'bg-yellow-100 text-yellow-700',
  'Concluída': 'bg-blue-100 text-blue-700',
  'Cancelada': 'bg-red-100 text-red-700',
}

export function Marketing() {
  const [kpis, setKpis]       = useState(null)
  const [hist, setHist]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [kr, hr] = await Promise.all([
        fetch('/api/kpis/marketing'),
        fetch('/api/marketing/historico'),
      ])
      if (!kr.ok || !hr.ok) throw new Error('Erro no servidor')
      const [k, h] = await Promise.all([kr.json(), hr.json()])
      if (k.error) throw new Error(k.error)
      setKpis(k); setHist(h)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const notionUrl = `https://www.notion.so/${DATABASES.campanhas?.replace(/-/g, '')}`
  const ultimos6  = hist?.meses?.slice(-6) ?? []

  // Distribuição investimento por canal (para pie)
  const pieCanais = (hist?.canais ?? []).map(c => ({ name: c.canal, value: c.investimento })).filter(c => c.value > 0)

  return (
    <>
      <Header title="Marketing" subtitle="Atualização em tempo real" onRefresh={load} loading={loading} />
      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard label="Leads Gerados"    value={kpis?.leadsGerados ?? '—'}              meta={20}         status={st(kpis?.leadsGerados, 20)}         trend="neutral" unit="" />
          <KPICard label="Custo por Lead"   value={EUR(kpis?.cpl)}                          meta={EUR(50)}    status={st(kpis?.cpl, 50, false)}           trend="neutral" unit="" />
          <KPICard label="SQL"              value={kpis?.sql ?? '—'}                        meta={8}          status={st(kpis?.sql, 8)}                   trend="neutral" unit="" />
          <KPICard label="Taxa Qualificação" value={kpis ? PCT(kpis.taxaQualificacao) : '—'} meta="40%"       status={st(kpis?.taxaQualificacao, 40)}     trend="neutral" unit="" />
        </div>

        {/* Métricas ROI */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Receita Atribuída</span>
            <span className="text-xl font-bold text-green-600">{EUR(kpis?.receitaAtribuida)}</span>
            <span className="text-xs text-gray-400">Campanhas do mês</span>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">ROI Marketing</span>
            <span className={`text-xl font-bold ${(kpis?.roi ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {kpis ? PCT(kpis.roi) : '—'}
            </span>
            <span className="text-xs text-gray-400">(Receita − Investimento) / Invest.</span>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Campanhas Ativas</span>
            <span className="text-xl font-bold text-indigo-600">{kpis?.campanhasAtivas?.length ?? '—'}</span>
            <span className="text-xs text-gray-400">Em curso agora</span>
          </div>
        </div>

        {/* Leads & Investimento por mês */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Leads & Investimento — últimos 6 meses</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ultimos6} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left"  dataKey="leads" name="Leads Gerados" fill="#6366f1" radius={[3,3,0,0]} />
              <Bar yAxisId="left"  dataKey="sql"   name="SQL"           fill="#10b981" radius={[3,3,0,0]} />
              <Line yAxisId="right" type="monotone" dataKey="investimento" name="Invest. €" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* CPL evolução + ROI */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Custo por Lead & Receita Atribuída — últimos 6 meses</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ultimos6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left"  tick={{ fontSize: 11 }} tickFormatter={v => EUR(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => EUR(v)} />
              <Tooltip formatter={v => EUR(v)} />
              <Legend />
              <Line yAxisId="left"  type="monotone" dataKey="cpl"     name="CPL €"             stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="receita" name="Receita Atribuída €" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Investimento por canal + performance */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Investimento por Canal</h2>
            {pieCanais.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieCanais} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                    label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {pieCanais.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => EUR(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Performance por Canal</h2>
            {hist?.canais?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
                      <th className="text-left py-1.5 px-2">Canal</th>
                      <th className="text-right py-1.5 px-2">Leads</th>
                      <th className="text-right py-1.5 px-2">CPL</th>
                      <th className="text-right py-1.5 px-2">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.canais.map(c => (
                      <tr key={c.canal} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-medium text-gray-700">{c.canal}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{c.leads}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{EUR(c.cpl)}</td>
                        <td className={`py-1.5 px-2 text-right font-mono font-semibold ${c.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {PCT(c.roi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState />}
          </div>
        </div>

        {/* Tabela campanhas ativas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Campanhas Ativas</h2>
            <a href={notionUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">Abrir no Notion</a>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-3">Campanha</th>
                  <th className="text-left py-2 px-3">Canal</th>
                  <th className="text-right py-2 px-3">Invest.</th>
                  <th className="text-right py-2 px-3">Leads</th>
                  <th className="text-right py-2 px-3">SQL</th>
                  <th className="text-right py-2 px-3">CPL</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(kpis?.campanhasAtivas ?? []).map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-800">{c.campanha}</td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{c.canal}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{EUR(c.investimento)}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.leadsGerados}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.leadsQualificados}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{EUR(c.custoPorLead)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
                {(!kpis?.campanhasAtivas?.length) && (
                  <tr><td colSpan={7} className="py-6 text-center text-gray-400 text-xs">Sem campanhas ativas</td></tr>
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
