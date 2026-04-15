import { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Upload, X, FileText, Image, Trash2, Plus, Filter, ArrowUpDown } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'
import { apiFetch } from '../lib/api.js'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const EUR2 = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CAT_COLORS = {
  'Wholesalling':         '#6366f1',
  'Mediação Imobiliária': '#10b981',
  'CAEP':                 '#f59e0b',
  'Fix and Flip':         '#ef4444',
}
const CAT_COLORS_LIST = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6']

const FASE_COLOR = {
  'Fase de obras': 'bg-blue-100 text-blue-700',
  'Fase de venda': 'bg-yellow-100 text-yellow-700',
  'Vendido':       'bg-green-100 text-green-700',
}
const TIMING_COLOR = {
  'Mensalmente': 'bg-blue-100 text-blue-700',
  'Anual':       'bg-purple-100 text-purple-700',
  'Único':       'bg-gray-100 text-gray-600',
}

const TABS = ['Visão Geral', 'Negócios', 'Despesas', 'Tesouraria', 'P&L', 'Rentabilidade']

export function Financeiro() {
  const [kpis,     setKpis]     = useState(null)
  const [despesas, setDespesas] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [projecao, setProjecao] = useState(null)
  const [analises, setAnalises] = useState(null)
  const [aging,    setAging]    = useState(null)
  const [rent,     setRent]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [tab,      setTab]      = useState('Visão Geral')
  const [editingNeg, setEditingNeg] = useState(null)
  const [editingDesp, setEditingDesp] = useState(null)
  const [crmNegocios, setCrmNegocios] = useState([])
  const [crmDespesas, setCrmDespesas] = useState([])

  async function load() {
    setLoading(true); setError(null)
    try {
      const [kr, dr, cr, pr, ar, nr, dsr, agr, rr] = await Promise.all([
        apiFetch('/api/kpis/financeiro'),
        apiFetch('/api/financeiro/despesas'),
        apiFetch('/api/financeiro/cashflow'),
        apiFetch('/api/financeiro/projecao'),
        apiFetch('/api/crm/analises-kpis'),
        apiFetch('/api/crm/negocios?limit=200'),
        apiFetch('/api/crm/despesas?limit=200'),
        apiFetch('/api/financeiro/aging'),
        apiFetch('/api/financeiro/rentabilidade'),
      ])
      if (!kr.ok || !dr.ok || !cr.ok) throw new Error('Erro no servidor')
      const [k, d, c, p, a, n, ds, ag, re] = await Promise.all([
        kr.json(), dr.json(), cr.json(), pr.ok ? pr.json() : null, ar.ok ? ar.json() : null,
        nr.json(), dsr.json(), agr.ok ? agr.json() : null, rr.ok ? rr.json() : null,
      ])
      if (k.error) throw new Error(k.error)
      setKpis(k); setDespesas(d); setCashflow(c); setProjecao(p); setAnalises(a)
      setCrmNegocios(n.data ?? []); setCrmDespesas(ds.data ?? [])
      setAging(ag); setRent(re)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function saveNegocio(form) {
    try {
      const isNew = !form.id
      const url = isNew ? '/api/crm/negocios' : `/api/crm/negocios/${form.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) throw new Error('Erro ao guardar')
      setEditingNeg(null); load()
    } catch (e) { setError(e.message) }
  }

  async function deleteNegocio(id) {
    if (!confirm('Apagar este negócio?')) return
    await apiFetch(`/api/crm/negocios/${id}`, { method: 'DELETE' })
    load()
  }

  async function saveDespesa(form) {
    try {
      const isNew = !form.id
      const url = isNew ? '/api/crm/despesas' : `/api/crm/despesas/${form.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) throw new Error('Erro ao guardar')
      setEditingDesp(null); load()
    } catch (e) { setError(e.message) }
  }

  async function deleteDespesa(id) {
    if (!confirm('Apagar esta despesa?')) return
    await apiFetch(`/api/crm/despesas/${id}`, { method: 'DELETE' })
    load()
  }

  useEffect(() => { load() }, [])

  const negociosLista  = kpis?.negociosLista ?? []
  const categoriasPie  = (kpis?.categorias ?? [])
    .filter(c => c.lucroEst > 0)
    .map(c => ({ name: c.categoria, value: c.lucroEst }))
  const porFaseData    = (kpis?.porFase ?? []).filter(f => f.count > 0)
  const despCat        = despesas?.categorias ?? []
  const despRecorrentes = despesas?.recorrentes ?? []
  const despOneTime    = [...(despesas?.unicaVez ?? []), ...(despesas?.anuais ?? [])]
  const pendentes      = cashflow?.pendentes ?? []
  const recebidos      = cashflow?.recebidos ?? []

  const runwayMeses  = cashflow?.runway
  const runwayLabel  = runwayMeses == null ? '—'
    : runwayMeses >= 99 ? '∞'
    : `${runwayMeses.toFixed(1)} meses`
  const runwayColor = runwayMeses == null ? 'text-gray-400' : runwayMeses >= 12 ? 'text-green-600' : runwayMeses >= 6 ? 'text-yellow-600' : runwayMeses >= 3 ? 'text-orange-600' : 'text-red-600'

  return (
    <>
      <Header title="Financeiro" subtitle="Atualização em tempo real" onRefresh={load} loading={loading}
        notionUrl="https://www.notion.so/333c6d45a01f81dc9cb4d12a999e28ed" />

      {/* Tabs */}
      <div className="px-4 sm:px-6 pt-4 flex gap-0.5 sm:gap-1 border-b border-gray-200 bg-white sticky top-0 z-10 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              tab === t
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>
        )}

        {/* ══════════════════ VISÃO GERAL ══════════════════ */}
        {tab === 'Visão Geral' && (
          <>
            {/* Alertas */}
            {(kpis?.alertas ?? []).length > 0 && (
              <div className="space-y-2">
                {kpis.alertas.map((a, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                    a.tipo === 'critico' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                  }`}>
                    <span className="text-lg">{a.icon}</span>
                    <span>{a.msg}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <KPICard label="Pipeline de Lucro"   value={EUR(kpis?.lucroEstimadoTotal)} meta="—" status="green"                                       trend="neutral" unit="" />
              <KPICard label="Lucro Real Recebido" value={EUR(kpis?.lucroRealTotal)}     meta="—" status={kpis?.lucroRealTotal > 0 ? 'green' : 'yellow'} trend="neutral" unit="" />
              <KPICard label="A Receber (pendente)" value={EUR(kpis?.lucroPendente)}     meta="—" status={kpis?.lucroPendente > 0 ? 'yellow' : 'green'} trend="neutral" unit="" />
              <KPICard label="Burn Rate / Mês"     value={EUR(kpis?.burnRate)}           meta="—" status="green"                                       trend="neutral" unit="" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Runway</span>
                <span className={`text-2xl font-bold ${runwayColor}`}>{runwayLabel}</span>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                  <div className={`h-full rounded-full transition-all ${runwayMeses >= 12 ? 'bg-green-500' : runwayMeses >= 6 ? 'bg-yellow-500' : runwayMeses >= 3 ? 'bg-orange-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, ((runwayMeses || 0) / 24) * 100)}%` }} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">YTD Resultado</span>
                <span className={`text-2xl font-bold ${(kpis?.ytd?.resultado ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {EUR(kpis?.ytd?.resultado)}
                </span>
                <span className="text-xs text-gray-400">Real {EUR(kpis?.ytd?.real)} − Desp. {EUR(kpis?.ytd?.despesas)}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Negócios Ativos</span>
                <span className="text-2xl font-bold text-indigo-600">{kpis?.negóciosAtivos ?? '—'}</span>
                <span className="text-xs text-gray-400">{kpis?.negociosPendentes ?? 0} com pagamento pendente</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Concentração de Risco</span>
                <span className={`text-2xl font-bold ${(kpis?.concentracao ?? 0) > 60 ? 'text-red-600' : (kpis?.concentracao ?? 0) > 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {kpis?.concentracao ?? 0}%
                </span>
                <span className="text-xs text-gray-400">Maior deal no pipeline</span>
              </div>
            </div>

            {/* Tranches atrasadas */}
            {(kpis?.tranchesAtrasadas ?? []).length > 0 && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-red-700 mb-3">Tranches Atrasadas</h2>
                <div className="space-y-2">
                  {kpis.tranchesAtrasadas.map((t, i) => (
                    <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t.negocio}</p>
                        <p className="text-xs text-gray-500">{t.descricao || 'Pagamento'} — {t.dias} dias de atraso</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold text-red-600">{EUR(t.valor)}</p>
                        <p className="text-xs text-gray-400">{t.data}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Lucro Estimado por Categoria</h2>
                {categoriasPie.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={categoriasPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {categoriasPie.map((c, i) => (
                          <Cell key={i} fill={CAT_COLORS[c.name] ?? CAT_COLORS_LIST[i % CAT_COLORS_LIST.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={v => EUR(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Negócios por Fase</h2>
                {porFaseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={porFaseData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="fase" tick={{ fontSize: 11 }} width={110} />
                      <Tooltip formatter={(v, n) => n === 'Lucro Est. €' ? EUR(v) : v} />
                      <Legend />
                      <Bar dataKey="count"    name="Nº Negócios"  fill="#6366f1" radius={[0,3,3,0]} />
                      <Bar dataKey="lucroEst" name="Lucro Est. €" fill="#10b981" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </div>

            {/* Análises de Rentabilidade */}
            {analises?.total > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline de Análises (calculadora integrada)</h2>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Lucro Líq. Pipeline</p>
                    <p className="text-lg font-bold text-green-700">{EUR(analises.pipeline_lucro_liquido)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Capital Necessário</p>
                    <p className="text-lg font-bold text-blue-700">{EUR(analises.pipeline_capital)}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">RA Médio</p>
                    <p className="text-lg font-bold text-yellow-700">{analises.media_retorno_anualizado}%</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${analises.imoveis_com_risco > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className="text-xs text-gray-500">Imóveis c/ Risco</p>
                    <p className={`text-lg font-bold ${analises.imoveis_com_risco > 0 ? 'text-red-600' : 'text-green-700'}`}>{analises.imoveis_com_risco}</p>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b">
                      <th className="text-left py-1.5">Imóvel</th>
                      <th className="text-right py-1.5">Compra</th>
                      <th className="text-right py-1.5">VVR</th>
                      <th className="text-right py-1.5">Capital</th>
                      <th className="text-right py-1.5">Lucro Líq.</th>
                      <th className="text-right py-1.5">RA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analises.analises?.map(a => (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 font-medium text-gray-700">{a.imovel_nome}</td>
                        <td className="py-1.5 text-right font-mono">{EUR(a.compra)}</td>
                        <td className="py-1.5 text-right font-mono">{EUR(a.vvr)}</td>
                        <td className="py-1.5 text-right font-mono">{EUR(a.capital_necessario)}</td>
                        <td className={`py-1.5 text-right font-mono font-semibold ${a.lucro_liquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{EUR(a.lucro_liquido)}</td>
                        <td className={`py-1.5 text-right font-mono ${a.retorno_anualizado >= 15 ? 'text-green-600' : a.retorno_anualizado >= 8 ? 'text-yellow-600' : 'text-red-600'}`}>{a.retorno_anualizado}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ NEGÓCIOS ══════════════════ */}
        {tab === 'Negócios' && (
          <NegociosTab
            kpis={kpis} negociosLista={negociosLista} crmNegocios={crmNegocios}
            editingNeg={editingNeg} setEditingNeg={setEditingNeg}
            saveNegocio={saveNegocio} deleteNegocio={deleteNegocio} load={load}
          />
        )}

        {/* ══════════════════ DESPESAS ══════════════════ */}
        {tab === 'Despesas' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <button onClick={() => setEditingDesp({})} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors">
                <Plus className="w-4 h-4" /> Nova Despesa
              </button>
            </div>

            {editingDesp !== null && (
              <DespesaForm item={editingDesp} onSave={saveDespesa} onCancel={() => setEditingDesp(null)} onReload={load} />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              <KPICard label="Burn Rate / Mês"     value={EUR(despesas?.burnRate)}      meta="—" status="green"  trend="neutral" unit="" />
              <KPICard label="Burn Rate Anual"      value={EUR(despesas?.burnRateAnual)} meta="—" status="green"  trend="neutral" unit="" />
              <KPICard label="Total Despesas (ano)" value={EUR(despesas?.totalAnual)}    meta="—" status="yellow" trend="neutral" unit="" />
            </div>

            {/* Previsão mensal de despesas */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Previsão Mensal de Despesas (próximos 12 meses)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={(() => {
                  const now = new Date()
                  const burnRate = despesas?.burnRate || 0
                  const anuais = despesas?.anuais || []
                  return Array.from({ length: 12 }, (_, i) => {
                    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
                    const m = d.getMonth()
                    let total = burnRate
                    for (const da of anuais) {
                      if (da.data) { const dd = new Date(da.data); if (dd.getMonth() === m) total += (da.custoAnual || da.custoMensal || 0) }
                    }
                    return { label: `${MES_ABREV[m]} ${String(d.getFullYear()).slice(2)}`, recorrente: burnRate, extra: Math.round((total - burnRate) * 100) / 100, total: Math.round(total * 100) / 100 }
                  })
                })()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}€`} />
                  <Tooltip formatter={v => EUR2(v)} />
                  <Bar dataKey="recorrente" name="Recorrente" fill="#ef4444" stackId="a" radius={[0,0,0,0]} />
                  <Bar dataKey="extra" name="Anual/Único" fill="#f59e0b" stackId="a" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Custo Anual por Categoria</h2>
                {despCat.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={despCat} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => EUR(v)} />
                      <YAxis type="category" dataKey="categoria" tick={{ fontSize: 10 }} width={160} />
                      <Tooltip formatter={v => EUR(v)} />
                      <Bar dataKey="custoAnual" name="Custo Anual €" fill="#ef4444" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Recorrentes (mensais)</h2>
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
                      <th className="text-left py-1.5 px-2">Despesa</th>
                      <th className="text-left py-1.5 px-2">Categoria</th>
                      <th className="text-right py-1.5 px-2">€/mês</th>
                      <th className="text-right py-1.5 px-2">€/ano</th>
                      <th className="py-1.5 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {despRecorrentes.map(d => (
                      <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-medium text-gray-700">
                          <button onClick={() => setEditingDesp(crmDespesas.find(x => x.id === d.id) || d)} className="text-left hover:text-indigo-600 hover:underline">{d.movimento}</button>
                        </td>
                        <td className="py-1.5 px-2 text-gray-500">{d.categoria}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-red-500">{EUR2(d.custoMensal)}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-600">{EUR(d.custoAnual)}</td>
                        <td className="py-1.5 px-2">
                          <div className="flex gap-1">
                            <button onClick={() => setEditingDesp(crmDespesas.find(x => x.id === d.id) || d)} className="px-1.5 py-0.5 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">Editar</button>
                            <button onClick={() => deleteDespesa(d.id)} className="px-1.5 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">x</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!despRecorrentes.length && (
                      <tr><td colSpan={5} className="py-4 text-center text-gray-400">Sem despesas mensais</td></tr>
                    )}
                    {despRecorrentes.length > 0 && (
                      <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                        <td colSpan={2} className="py-1.5 px-2 text-gray-700">TOTAL</td>
                        <td className="py-1.5 px-2 text-right font-mono text-red-600">{EUR2(despesas?.burnRate)}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-700">{EUR(despesas?.burnRateAnual)}</td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {despOneTime.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">One-time & Anuais</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                        <th className="text-left py-2 px-3">Despesa</th>
                        <th className="text-left py-2 px-3">Categoria</th>
                        <th className="text-left py-2 px-3">Tipo</th>
                        <th className="text-left py-2 px-3">Data</th>
                        <th className="text-right py-2 px-3">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {despOneTime.map(d => (
                        <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-800">{d.movimento}</td>
                          <td className="py-2 px-3 text-gray-500 text-xs">{d.categoria}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIMING_COLOR[d.timing] ?? 'bg-gray-100 text-gray-600'}`}>
                              {d.timing}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-400 text-xs">{d.data ?? '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-semibold">{EUR(d.custoAnual || d.custoMensal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ TESOURARIA ══════════════════ */}
        {tab === 'Tesouraria' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">A Receber</span>
                <span className="text-2xl font-bold text-yellow-600">{EUR(cashflow?.lucroPendente)}</span>
                <span className="text-xs text-gray-400 block mt-1">{pendentes.length} negócios pendentes</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Já Recebido</span>
                <span className="text-2xl font-bold text-green-600">{EUR(cashflow?.lucroRecebido)}</span>
                <span className="text-xs text-gray-400 block mt-1">{recebidos.length} negócios fechados</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Burn Rate / Mês</span>
                <span className="text-2xl font-bold text-red-500">{EUR(cashflow?.burnRate)}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Runway</span>
                <span className={`text-2xl font-bold ${runwayColor}`}>{runwayLabel}</span>
              </div>
            </div>

            {/* Aging de Pagamentos */}
            {aging && aging.summary?.some(b => b.count > 0) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Aging de Pagamentos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {aging.summary.map((b, i) => (
                    <div key={i} className={`rounded-lg p-3 text-center border ${
                      b.color === 'red' ? 'bg-red-50 border-red-200' :
                      b.color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                      b.color === 'blue' ? 'bg-blue-50 border-blue-200' :
                      b.color === 'indigo' ? 'bg-indigo-50 border-indigo-200' :
                      'bg-gray-50 border-gray-200'
                    }`}>
                      <p className="text-xs text-gray-500">{b.label}</p>
                      <p className={`text-lg font-bold ${
                        b.color === 'red' ? 'text-red-600' :
                        b.color === 'yellow' ? 'text-yellow-600' :
                        b.color === 'blue' ? 'text-blue-600' :
                        b.color === 'indigo' ? 'text-indigo-600' :
                        'text-gray-600'
                      }`}>{b.count > 0 ? EUR(b.total) : '—'}</p>
                      <p className="text-xs text-gray-400">{b.count} tranche{b.count !== 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagamentos Faseados Timeline */}
            {(() => {
              const allPags = pendentes.flatMap(n =>
                (n.pagamentosFaseados || []).map(p => ({ ...p, negocio: n.movimento, categoria: n.categoria }))
              ).sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999'))
              const pagsPendentes = allPags.filter(p => !p.recebido)
              const pagsRecebidos = allPags.filter(p => p.recebido)

              if (allPags.length === 0) return (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">Pagamentos Pendentes</h2>
                  <NegociosTable rows={pendentes} emptyMsg="Sem pagamentos pendentes" />
                </div>
              )

              return (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">Timeline de Pagamentos</h2>
                  {pagsPendentes.length > 0 && (
                    <>
                      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Pendentes ({pagsPendentes.length})</h3>
                      <div className="space-y-2 mb-5">
                        {pagsPendentes.map((p, i) => {
                          const atrasado = p.data && new Date(p.data) < new Date()
                          return (
                            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${atrasado ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'}`}>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${atrasado ? 'bg-red-400' : 'bg-yellow-400'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{p.negocio}</p>
                                <p className="text-xs text-gray-500">{p.descricao || 'Pagamento'} {atrasado && <span className="text-red-600 font-medium">— ATRASADO</span>}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-mono font-semibold ${atrasado ? 'text-red-700' : 'text-yellow-700'}`}>{EUR(p.valor)}</p>
                                <p className="text-xs text-gray-400">{p.data || 'Sem data'}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                  {pagsRecebidos.length > 0 && (
                    <>
                      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Recebidos ({pagsRecebidos.length})</h3>
                      <div className="space-y-2">
                        {pagsRecebidos.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-50 border border-green-100">
                            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{p.negocio}</p>
                              <p className="text-xs text-gray-500">{p.descricao || 'Pagamento'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-mono font-semibold text-green-700">{EUR(p.valor)}</p>
                              <p className="text-xs text-gray-400">{p.data || '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {pendentes.filter(n => !(n.pagamentosFaseados || []).length).length > 0 && (
                    <>
                      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2 mt-5">Negócios sem tranches definidas</h3>
                      <NegociosTable rows={pendentes.filter(n => !(n.pagamentosFaseados || []).length)} emptyMsg="" />
                    </>
                  )}
                </div>
              )
            })()}

            {recebidos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Pagamentos Recebidos</h2>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-3">Negócio</th>
                      <th className="text-left py-2 px-3">Categoria</th>
                      <th className="text-right py-2 px-3">Lucro Real</th>
                      <th className="text-left py-2 px-3">Data Venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recebidos.map(n => (
                      <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{n.movimento}</td>
                        <td className="py-2 px-3"><CatBadge cat={n.categoria} /></td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-green-600">{EUR(n.lucroReal)}</td>
                        <td className="py-2 px-3 text-gray-400 text-xs">{n.dataVenda ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ P&L ══════════════════ */}
        {tab === 'P&L' && projecao && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Receita Estimada</span>
                <span className="text-2xl font-bold text-indigo-600">{EUR(projecao.pl.receitaEstimada)}</span>
                <span className="text-xs text-gray-400 block mt-1">Pipeline total</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Receita Real</span>
                <span className={`text-2xl font-bold ${projecao.pl.receitaReal > 0 ? 'text-green-600' : 'text-gray-400'}`}>{EUR(projecao.pl.receitaReal)}</span>
                <span className="text-xs text-gray-400 block mt-1">Já recebido</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Despesas ({projecao.pl.mesesDecorridos} meses)</span>
                <span className="text-2xl font-bold text-red-500">{EUR(projecao.pl.despesasAteAgora)}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Resultado Líquido</span>
                <span className={`text-2xl font-bold ${projecao.pl.resultadoLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {EUR(projecao.pl.resultadoLiquido)}
                </span>
              </div>
            </div>

            {/* Margem Operacional */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Margem Operacional</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase">Receita Pipeline</p>
                  <p className="text-xl font-bold text-indigo-600 mt-1">{EUR(projecao.pl.receitaEstimada)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Despesas Anuais</p>
                  <p className="text-xl font-bold text-red-500 mt-1">{EUR(projecao.breakEven.despesasAnuais)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Margem Operacional</p>
                  {(() => {
                    const margem = projecao.pl.receitaEstimada > 0
                      ? Math.round((projecao.pl.receitaEstimada - projecao.breakEven.despesasAnuais) / projecao.pl.receitaEstimada * 100)
                      : 0
                    return <p className={`text-xl font-bold mt-1 ${margem >= 50 ? 'text-green-600' : margem >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>{margem}%</p>
                  })()}
                </div>
              </div>
            </div>

            {/* Break-even */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Break-Even</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <div>
                  <p className="text-xs text-gray-400 uppercase">Despesas Anuais</p>
                  <p className="text-xl font-bold text-red-500 mt-1">{EUR(projecao.breakEven.despesasAnuais)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Lucro Médio / Deal</p>
                  <p className="text-xl font-bold text-indigo-600 mt-1">{EUR(projecao.breakEven.lucroMedioDeal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Deals para Break-Even</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{projecao.breakEven.dealsNecessarios ?? '—'}</p>
                  <p className="text-xs text-gray-400">por ano para cobrir despesas</p>
                </div>
              </div>
            </div>

            {/* Projeção Cash Flow */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Cash Flow Projetado — próximos 12 meses</h2>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={projecao.projecao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => EUR(v)} />
                  <Legend />
                  <Bar dataKey="entradas" name="Entradas €" fill="#22c55e" radius={[3,3,0,0]} />
                  <Bar dataKey="saidas" name="Saídas €" fill="#ef4444" radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="saldoAcumulado" name="Saldo Acum. €" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Tabela projeção */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Detalhe Mensal</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
                      <th className="text-left py-1.5 px-2">Mês</th>
                      <th className="text-right py-1.5 px-2">Deals</th>
                      <th className="text-right py-1.5 px-2">Entradas</th>
                      <th className="text-right py-1.5 px-2">Saídas</th>
                      <th className="text-right py-1.5 px-2">Líquido</th>
                      <th className="text-right py-1.5 px-2">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projecao.projecao.map(m => (
                      <tr key={m.label} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-medium text-gray-700">{m.label}</td>
                        <td className="py-1.5 px-2 text-right text-gray-500">{m.deals || '—'}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-green-600">{m.entradas > 0 ? EUR(m.entradas) : '—'}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-red-500">{EUR(m.saidas)}</td>
                        <td className={`py-1.5 px-2 text-right font-mono font-semibold ${m.liquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(m.liquido)}</td>
                        <td className={`py-1.5 px-2 text-right font-mono ${m.saldoAcumulado >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{EUR(m.saldoAcumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {tab === 'P&L' && !projecao && !loading && (
          <div className="text-center text-gray-400 py-12 text-sm">Sem dados de projeção disponíveis</div>
        )}

        {/* ══════════════════ RENTABILIDADE ══════════════════ */}
        {tab === 'Rentabilidade' && (
          <RentabilidadeTab rent={rent} />
        )}
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// NEGÓCIOS TAB (with filters and relation columns)
// ══════════════════════════════════════════════════════════════
function NegociosTab({ kpis, negociosLista, crmNegocios, editingNeg, setEditingNeg, saveNegocio, deleteNegocio }) {
  const [filterCat, setFilterCat] = useState('')
  const [filterFase, setFilterFase] = useState('')
  const [sortKey, setSortKey] = useState('movimento')
  const [sortDir, setSortDir] = useState('asc')

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = negociosLista
    .filter(n => !filterCat || n.categoria === filterCat)
    .filter(n => !filterFase || n.fase === filterFase)
    .sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })

  const SortHeader = ({ label, field, className = '' }) => (
    <th className={`py-2 px-3 cursor-pointer hover:text-gray-600 select-none ${className}`} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">{label} {sortKey === field && <ArrowUpDown className="w-3 h-3" />}</span>
    </th>
  )

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <button onClick={() => setEditingNeg({})} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Novo Negócio
        </button>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5">
            <option value="">Todas categorias</option>
            {['Wholesalling','CAEP','Mediação Imobiliária','Fix and Flip'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterFase} onChange={e => setFilterFase(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5">
            <option value="">Todas fases</option>
            {['Fase de obras','Fase de venda','Vendido'].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {editingNeg !== null && (
        <NegocioForm item={editingNeg} onSave={saveNegocio} onCancel={() => setEditingNeg(null)} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {(kpis?.categorias ?? []).map(c => (
          <div key={c.categoria} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                style={{ background: CAT_COLORS[c.categoria] ?? '#6366f1' }} />
              <span className="text-xs text-gray-500 font-medium truncate">{c.categoria}</span>
            </div>
            <p className="text-xl font-bold text-gray-900">
              {c.count} <span className="text-sm font-normal text-gray-400">negócio{c.count !== 1 ? 's' : ''}</span>
            </p>
            <p className="text-sm text-indigo-600 font-mono">{EUR(c.lucroEst)} estimado</p>
            {c.lucroReal > 0 && <p className="text-xs text-green-600 font-mono">{EUR(c.lucroReal)} real</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Todos os Negócios
          <span className="text-xs text-gray-400 font-normal ml-2">({filtered.length}{filterCat || filterFase ? ` de ${negociosLista.length}` : ''})</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                <SortHeader label="Negócio" field="movimento" className="text-left" />
                <SortHeader label="Categoria" field="categoria" className="text-left" />
                <th className="text-left py-2 px-3">Imóvel</th>
                <th className="text-left py-2 px-3">Consultor</th>
                <SortHeader label="Fase" field="fase" className="text-left" />
                <SortHeader label="Comissão" field="comissaoPct" className="text-right" />
                <SortHeader label="Lucro Est." field="lucroEstimado" className="text-right" />
                <SortHeader label="Lucro Real" field="lucroReal" className="text-right" />
                <th className="text-left py-2 px-3">Pagamento</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => {
                const pags = n.pagamentosFaseados || []
                const temFaseados = pags.length > 0
                const pagsRecebidos = pags.filter(p => p.recebido)
                const totalFaseados = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                const totalRecebido = pagsRecebidos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                const crm = crmNegocios.find(x => x.id === n.id)
                const comPct = crm?.comissao_pct
                return (
                <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium text-gray-800">
                    <button onClick={() => setEditingNeg(crm || n)} className="text-left hover:text-indigo-600 hover:underline">{n.movimento}</button>
                  </td>
                  <td className="py-2 px-3"><CatBadge cat={n.categoria} /></td>
                  <td className="py-2 px-3 text-xs text-gray-500 max-w-[120px] truncate">{n.imovelNome || '—'}</td>
                  <td className="py-2 px-3 text-xs text-gray-500 max-w-[100px] truncate">{n.consultorNome || '—'}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FASE_COLOR[n.fase] ?? 'bg-gray-100 text-gray-600'}`}>{n.fase ?? '—'}</span>
                  </td>
                  <td className="py-2 px-3 text-right text-xs font-mono text-gray-500">
                    {comPct ? `${comPct}%` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-indigo-600 font-semibold">{EUR(n.lucroEstimado)}</td>
                  <td className="py-2 px-3 text-right font-mono text-green-600">
                    {n.lucroReal > 0 ? EUR(n.lucroReal) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {temFaseados ? (
                      <div>
                        <span className={`px-2 py-0.5 rounded-full font-medium ${pagsRecebidos.length === pags.length ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {pagsRecebidos.length}/{pags.length} tranches
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{EUR(totalRecebido)} / {EUR(totalFaseados)}</p>
                      </div>
                    ) : n.pagamentoEmFalta
                      ? <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pendente</span>
                      : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Recebido</span>}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditingNeg(crm || n)} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">Editar</button>
                      <button onClick={() => deleteNegocio(n.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Apagar</button>
                    </div>
                  </td>
                </tr>
              )})}
              {!filtered.length && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">Sem negócios registados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// RENTABILIDADE TAB
// ══════════════════════════════════════════════════════════════
function RentabilidadeTab({ rent }) {
  if (!rent) return <div className="text-center text-gray-400 py-12 text-sm">A carregar rentabilidade...</div>

  return (
    <>
      {/* KPIs de topo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Ciclo Médio</span>
          <span className="text-2xl font-bold text-indigo-600">{rent.cicloMedio != null ? `${rent.cicloMedio} dias` : '—'}</span>
          <span className="text-xs text-gray-400 block mt-1">Adicionado → Proposta aceite ({rent.cicloCount} imóveis)</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Pipeline Total</span>
          <span className="text-2xl font-bold text-green-600">{EUR(rent.totalPipeline)}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Concentração de Risco</span>
          <span className={`text-2xl font-bold ${rent.concentracao > 60 ? 'text-red-600' : rent.concentracao > 40 ? 'text-yellow-600' : 'text-green-600'}`}>
            {rent.concentracao}%
          </span>
          <span className="text-xs text-gray-400 block mt-1 truncate">{rent.topDeal || '—'}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Modelos Ativos</span>
          <span className="text-2xl font-bold text-gray-800">{rent.modelos?.length ?? 0}</span>
        </div>
      </div>

      {/* Margem por Modelo */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Margem por Modelo de Negócio</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          {(rent.modelos || []).map(m => (
            <div key={m.modelo} className="rounded-lg p-4 border border-gray-100" style={{ borderLeftColor: CAT_COLORS[m.modelo] ?? '#6366f1', borderLeftWidth: '4px' }}>
              <p className="text-xs text-gray-500 font-medium">{m.modelo}</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{EUR(m.lucroEst)}</p>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{m.count} deal{m.count !== 1 ? 's' : ''}</span>
                <span>Média: {EUR(m.mediaEst)}</span>
              </div>
              {m.lucroReal > 0 && <p className="text-xs text-green-600 font-mono mt-1">Real: {EUR(m.lucroReal)}</p>}
            </div>
          ))}
        </div>
        {(rent.modelos || []).length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rent.modelos} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="modelo" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => EUR(v)} />
              <Bar dataKey="lucroEst" name="Estimado" radius={[3,3,0,0]}>
                {rent.modelos.map((m, i) => <Cell key={i} fill={CAT_COLORS[m.modelo] ?? CAT_COLORS_LIST[i % CAT_COLORS_LIST.length]} />)}
              </Bar>
              <Bar dataKey="lucroReal" name="Real" fill="#22c55e" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Rentabilidade por Consultor */}
      {(rent.consultores || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Rentabilidade por Consultor</h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3">Consultor</th>
                <th className="text-right py-2 px-3">Deals</th>
                <th className="text-right py-2 px-3">Lucro Est.</th>
                <th className="text-right py-2 px-3">Lucro Real</th>
                <th className="text-right py-2 px-3">Média / Deal</th>
              </tr>
            </thead>
            <tbody>
              {rent.consultores.map(c => (
                <tr key={c.nome} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium text-gray-800">{c.nome}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{c.count}</td>
                  <td className="py-2 px-3 text-right font-mono text-indigo-600 font-semibold">{EUR(c.lucroEst)}</td>
                  <td className="py-2 px-3 text-right font-mono text-green-600">{c.lucroReal > 0 ? EUR(c.lucroReal) : '—'}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-600">{EUR(c.mediaEst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ROI por Investidor */}
      {(rent.investidores || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">ROI por Investidor</h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3">Investidor</th>
                <th className="text-right py-2 px-3">Negócios</th>
                <th className="text-right py-2 px-3">Lucro Est.</th>
                <th className="text-right py-2 px-3">Lucro Real</th>
                <th className="text-right py-2 px-3">Capital Investido</th>
              </tr>
            </thead>
            <tbody>
              {rent.investidores.map(inv => (
                <tr key={inv.nome} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium text-gray-800">{inv.nome}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{inv.count}</td>
                  <td className="py-2 px-3 text-right font-mono text-indigo-600 font-semibold">{EUR(inv.lucroEst)}</td>
                  <td className="py-2 px-3 text-right font-mono text-green-600">{inv.lucroReal > 0 ? EUR(inv.lucroReal) : '—'}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-600">{inv.capitalInvestido > 0 ? EUR(inv.capitalInvestido) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════
function CatBadge({ cat }) {
  const color = CAT_COLORS[cat] ?? '#6366f1'
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: color + '22', color }}>
      {cat}
    </span>
  )
}

function NegociosTable({ rows, emptyMsg = 'Sem dados' }) {
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
          <th className="text-left py-2 px-3">Negócio</th>
          <th className="text-left py-2 px-3">Categoria</th>
          <th className="text-left py-2 px-3">Fase</th>
          <th className="text-right py-2 px-3">Valor Esperado</th>
          <th className="text-left py-2 px-3">Data Estimada</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(n => (
          <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50">
            <td className="py-2 px-3 font-medium text-gray-800">{n.movimento}</td>
            <td className="py-2 px-3"><CatBadge cat={n.categoria} /></td>
            <td className="py-2 px-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FASE_COLOR[n.fase] ?? 'bg-gray-100 text-gray-600'}`}>
                {n.fase ?? '—'}
              </span>
            </td>
            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{EUR(n.lucroEstimado)}</td>
            <td className="py-2 px-3 text-gray-400 text-xs">{n.dataEstimada ?? n.dataVenda ?? '—'}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-xs">{emptyMsg}</td></tr>
        )}
      </tbody>
    </table>
  )
}

function EmptyState() {
  return <p className="text-xs text-gray-400 text-center py-10">Sem dados suficientes</p>
}

// ══════════════════════════════════════════════════════════════
// FORMS
// ══════════════════════════════════════════════════════════════
const NEG_CATEGORIAS = ['Wholesalling', 'CAEP', 'Mediação Imobiliária', 'Fix and Flip']
const NEG_FASES = ['Fase de obras', 'Fase de venda', 'Vendido']

function NegocioForm({ item, onSave, onCancel }) {
  const isNew = !item.id
  // Normalizar: aceitar tanto snake_case (DB) como camelCase (API mapped)
  const initPag = item.pagamentos_faseados ?? item.pagamentosFaseados ?? '[]'
  const pagStr = typeof initPag === 'string' ? initPag : JSON.stringify(initPag)
  const [f, setF] = useState({
    movimento: '', categoria: '', fase: '', lucro_estimado: '', lucro_real: '',
    custo_real_obra: '', capital_total: '', n_investidores: '', pagamento_em_falta: 1,
    data: '', data_compra: '', data_estimada_venda: '', data_venda: '', notas: '',
    ...item,
    pagamentos_faseados: pagStr,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"

  const pagamentos = (() => { try { const raw = f.pagamentos_faseados; return typeof raw === 'string' ? JSON.parse(raw || '[]') : Array.isArray(raw) ? raw : [] } catch { return [] } })()
  const setPagamentos = (pags) => set('pagamentos_faseados', JSON.stringify(pags))
  const addPagamento = () => setPagamentos([...pagamentos, { descricao: '', valor: 0, data: '', recebido: false }])
  const removePagamento = (i) => setPagamentos(pagamentos.filter((_, j) => j !== i))
  const updatePagamento = (i, field, value) => setPagamentos(pagamentos.map((p, j) => j === i ? { ...p, [field]: value } : p))

  const totalFaseados = pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const totalRecebido = pagamentos.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 p-4 sm:p-6 shadow-md">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{isNew ? 'Novo Negócio' : 'Editar Negócio'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <div className="sm:col-span-2 xl:col-span-1">
          <label className="text-xs text-gray-500 block mb-1">Nome do Negócio *</label>
          <input value={f.movimento} onChange={e => set('movimento', e.target.value)} className={inputClass} placeholder="Ex: M3 Eiras" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Categoria</label>
          <select value={f.categoria} onChange={e => set('categoria', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {NEG_CATEGORIAS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Fase</label>
          <select value={f.fase} onChange={e => set('fase', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {NEG_FASES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Lucro Estimado (€)</label>
          <input type="number" value={f.lucro_estimado} onChange={e => set('lucro_estimado', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Lucro Real (€)</label>
          <input type="number" value={f.lucro_real} onChange={e => set('lucro_real', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Pagamento</label>
          <select value={f.pagamento_em_falta} onChange={e => set('pagamento_em_falta', +e.target.value)} className={inputClass}>
            <option value={1}>Pendente</option>
            <option value={0}>Recebido</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data</label>
          <input type="date" value={f.data} onChange={e => set('data', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Compra</label>
          <input type="date" value={f.data_compra} onChange={e => set('data_compra', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Estimada Venda</label>
          <input type="date" value={f.data_estimada_venda} onChange={e => set('data_estimada_venda', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Venda</label>
          <input type="date" value={f.data_venda} onChange={e => set('data_venda', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2 xl:col-span-3">
          <label className="text-xs text-gray-500 block mb-1">Notas</label>
          <textarea value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} rows={2} className={inputClass} />
        </div>
      </div>

      {/* Pagamentos Faseados */}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pagamentos Faseados</h4>
            {pagamentos.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {EUR(totalRecebido)} recebido de {EUR(totalFaseados)} total
              </p>
            )}
          </div>
          <button onClick={addPagamento} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        </div>
        {pagamentos.length > 0 ? (
          <div className="space-y-2">
            {pagamentos.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <input value={p.descricao} placeholder="Ex: Sinal, 2ª tranche..."
                    onChange={e => updatePagamento(i, 'descricao', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2">
                  <input type="number" value={p.valor || ''} placeholder="€"
                    onChange={e => updatePagamento(i, 'valor', parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-3">
                  <input type="date" value={p.data || ''}
                    onChange={e => updatePagamento(i, 'data', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2 flex items-center gap-1.5">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={!!p.recebido}
                      onChange={e => updatePagamento(i, 'recebido', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-300" />
                    <span className="text-xs text-gray-500 hidden sm:inline">{p.recebido ? 'Recebido' : 'Pendente'}</span>
                  </label>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => removePagamento(i)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-2">Sem pagamentos faseados. Usa "Adicionar" para definir tranches com datas.</p>
        )}
      </div>

      <div className="flex gap-3 mt-4">
        <button onClick={() => onSave(f)} disabled={!f.movimento?.trim()} className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40">
          {isNew ? 'Criar' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200">Cancelar</button>
      </div>
    </div>
  )
}

// ── Despesa Form ─────────────────────────────────────────────
const DESP_CATEGORIAS = ['Salários', 'Operação', 'Marketing', 'Ferramentas', 'Legal', 'Contabilidade', 'Escritório', 'Formação', 'Viatura', 'Seguros', 'Telecomunicações', 'Subscrição Skool', 'Material Somnium', 'Outro']
const DESP_TIMING = ['Mensalmente', 'Anual', 'Único']

function DespesaForm({ item, onSave, onCancel, onReload }) {
  const isNew = !item.id
  const [f, setF] = useState({
    movimento: '', categoria: '', timing: 'Mensalmente', custo_mensal: '', custo_anual: '', data: '', notas: '',
    ...item,
  })
  const [docs, setDocs] = useState(() => {
    try { return item.documentos ? JSON.parse(item.documentos) : [] } catch { return [] }
  })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !item.id) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await apiFetch(`/api/crm/despesas/${item.id}/upload`, { method: 'POST', body: fd })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setDocs(d.documentos)
    } catch (err) { alert('Erro ao enviar: ' + err.message) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleDeleteDoc(docId) {
    try {
      const r = await apiFetch(`/api/crm/despesas/${item.id}/upload/${docId}`, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setDocs(d.documentos)
    } catch (err) { alert('Erro: ' + err.message) }
  }

  return (
    <div className="bg-white rounded-xl border-2 border-red-200 p-4 sm:p-6 shadow-md">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{isNew ? 'Nova Despesa' : 'Editar Despesa'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <div className="sm:col-span-2 xl:col-span-1">
          <label className="text-xs text-gray-500 block mb-1">Descrição *</label>
          <input value={f.movimento} onChange={e => set('movimento', e.target.value)} className={inputClass} placeholder="Ex: ChatGPT Plus, Contabilista..." />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Categoria</label>
          <select value={f.categoria} onChange={e => set('categoria', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {DESP_CATEGORIAS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Periodicidade</label>
          <select value={f.timing} onChange={e => set('timing', e.target.value)} className={inputClass}>
            {DESP_TIMING.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Custo Mensal (€)</label>
          <input type="number" step="0.01" value={f.custo_mensal} onChange={e => set('custo_mensal', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Custo Anual (€)</label>
          <input type="number" step="0.01" value={f.custo_anual} onChange={e => set('custo_anual', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data</label>
          <input type="date" value={f.data} onChange={e => set('data', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2 xl:col-span-3">
          <label className="text-xs text-gray-500 block mb-1">Notas</label>
          <textarea value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} rows={2} className={inputClass} />
        </div>
      </div>

      {item.id && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Documentos / Faturas</h4>
            <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'A enviar...' : 'Anexar ficheiro'}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
          </div>
          {docs.length > 0 ? (
            <div className="flex flex-col gap-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                  {doc.type?.startsWith('image') ? <Image className="w-4 h-4 text-blue-500 shrink-0" /> : <FileText className="w-4 h-4 text-red-500 shrink-0" />}
                  <a href={doc.path} target="_blank" rel="noreferrer" className="flex-1 text-sm text-gray-700 hover:text-indigo-600 hover:underline truncate">{doc.name}</a>
                  <span className="text-xs text-gray-400 shrink-0">{(doc.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-3 text-center">Sem documentos anexados.</p>
          )}
        </div>
      )}
      {isNew && (
        <p className="mt-4 text-xs text-gray-400">Guarda a despesa primeiro para poderes anexar documentos.</p>
      )}

      <div className="flex gap-3 mt-4">
        <button onClick={() => onSave(f)} disabled={!f.movimento?.trim()} className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-40">
          {isNew ? 'Criar' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200">Cancelar</button>
      </div>
    </div>
  )
}
