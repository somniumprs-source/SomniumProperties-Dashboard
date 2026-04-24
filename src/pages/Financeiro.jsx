import { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Upload, X, FileText, Image, Trash2, Plus, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'
import { apiFetch } from '../lib/api.js'
import { useUrlState } from '../hooks/useUrlState.js'

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

const TABS = ['Visão Geral', 'Conta Corrente', 'Despesas', 'Tesouraria', 'P&L', 'Rentabilidade']

export function Financeiro() {
  const [kpis,     setKpis]     = useState(null)
  const [despesas, setDespesas] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [projecao, setProjecao] = useState(null)
  const [analises, setAnalises] = useState(null)
  const [aging,    setAging]    = useState(null)
  const [rent,     setRent]     = useState(null)
  const [conta,    setConta]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [tab,      setTab]      = useUrlState('tab', 'Visão Geral')
  const [editingDesp, setEditingDesp] = useState(null)
  const [crmDespesas, setCrmDespesas] = useState([])

  async function load() {
    setLoading(true); setError(null)
    try {
      const safe = (promise) => promise.then(r => r.ok ? r.json() : null).catch(() => null)
      const [k, d, c, p, a, ds, ag, re, cc] = await Promise.all([
        safe(apiFetch('/api/kpis/financeiro')),
        safe(apiFetch('/api/financeiro/despesas')),
        safe(apiFetch('/api/financeiro/cashflow')),
        safe(apiFetch('/api/financeiro/projecao')),
        safe(apiFetch('/api/crm/analises-kpis')),
        safe(apiFetch('/api/crm/despesas?limit=200')),
        safe(apiFetch('/api/financeiro/aging')),
        safe(apiFetch('/api/financeiro/rentabilidade')),
        safe(apiFetch('/api/financeiro/conta-corrente')),
      ])
      if (!k) throw new Error('Erro ao carregar dados financeiros')
      setKpis(k); setDespesas(d); setCashflow(c); setProjecao(p); setAnalises(a)
      setCrmDespesas(ds?.data ?? [])
      setAging(ag); setRent(re); setConta(cc)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function saveDespesa(form) {
    try {
      const isNew = !form.id
      const url = isNew ? '/api/crm/despesas' : `/api/crm/despesas/${form.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${r.status}`)
      }
      setEditingDesp(null)
      setError(null)
      load()
    } catch (e) {
      console.error('[saveDespesa]', e)
      setError(e.message)
    }
  }

  async function deleteDespesa(id) {
    if (!confirm('Apagar esta despesa?')) return
    await apiFetch(`/api/crm/despesas/${id}`, { method: 'DELETE' })
    load()
  }

  async function confirmarPagamento(negocioId, trancheIndex, descricao) {
    if (!confirm(`Confirmar recebimento: ${descricao || 'Pagamento'}?`)) return
    try {
      const r = await apiFetch(`/api/crm/negocios/${negocioId}/confirmar-pagamento`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trancheIndex }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${r.status}`)
      }
      load()
    } catch (e) {
      console.error('[confirmarPagamento]', e)
      setError(e.message)
    }
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
              <KPICard label="Faturação Expectável" value={EUR(kpis?.lucroEstimadoTotal)} meta="—" status="green"                                       trend="neutral" unit="" />
              <KPICard label="Faturação Real"      value={EUR(kpis?.lucroRealTotal)}     meta="—" status={kpis?.lucroRealTotal > 0 ? 'green' : 'yellow'} trend="neutral" unit="" />
              <KPICard label="A Receber (pendente)" value={EUR((kpis?.lucroEstimadoTotal ?? 0) - (kpis?.lucroRealTotal ?? 0))} meta="—" status={(kpis?.lucroEstimadoTotal ?? 0) - (kpis?.lucroRealTotal ?? 0) > 0 ? 'yellow' : 'green'} trend="neutral" unit="" />
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
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Faturação por Categoria</h2>
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
                      <Tooltip formatter={(v, n) => n === 'Faturação Expectável €' ? EUR(v) : v} />
                      <Legend />
                      <Bar dataKey="count"    name="Nº Negócios"     fill="#6366f1" radius={[0,3,3,0]} />
                      <Bar dataKey="lucroEst" name="Faturação Expectável €"  fill="#10b981" radius={[0,3,3,0]} />
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
                    <p className="text-xs text-gray-500">Lucro Líquido Pipeline</p>
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
                      <th className="text-right py-1.5">Lucro Líquido</th>
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

        {/* ══════════════════ CONTA CORRENTE ══════════════════ */}
        {tab === 'Conta Corrente' && (
          <ContaCorrenteTab conta={conta} />
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

            {/* Todas as despesas cronologicamente */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Todas as Despesas</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-3">Data</th>
                      <th className="text-left py-2 px-3">Despesa</th>
                      <th className="text-left py-2 px-3">Categoria</th>
                      <th className="text-left py-2 px-3">Tipo</th>
                      <th className="text-right py-2 px-3">Valor</th>
                      <th className="py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(despesas?.todas ?? [])]
                      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
                      .map(d => (
                      <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{d.data ?? '—'}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">
                          <button onClick={() => setEditingDesp(crmDespesas.find(x => x.id === d.id) || d)} className="text-left hover:text-indigo-600 hover:underline">{d.movimento}</button>
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-500">{d.categoria || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            TIMING_COLOR[d.timing] ?? (d.timing === 'Registado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')
                          }`}>
                            {d.timing}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-red-500 font-semibold">{EUR(d.custoMensal || d.custoAnual)}</td>
                        <td className="py-2 px-3">
                          <div className="flex gap-1">
                            <button onClick={() => setEditingDesp(crmDespesas.find(x => x.id === d.id) || d)} className="px-1.5 py-0.5 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">Editar</button>
                            <button onClick={() => deleteDespesa(d.id)} className="px-1.5 py-0.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">x</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!(despesas?.todas ?? []).length && (
                      <tr><td colSpan={6} className="py-8 text-center text-gray-400 text-xs">Sem despesas registadas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Faturação Real</span>
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

            {/* Pagamentos por Negócio */}
            <TesourariaPagamentos pendentes={pendentes} confirmarPagamento={confirmarPagamento} />

            {recebidos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Pagamentos Recebidos</h2>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-3">Negócio</th>
                      <th className="text-left py-2 px-3">Categoria</th>
                      <th className="text-right py-2 px-3">Faturação Real</th>
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
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Faturação Expectável</span>
                <span className="text-2xl font-bold text-indigo-600">{EUR(projecao.pl.receitaEstimada)}</span>
                <span className="text-xs text-gray-400 block mt-1">Total expectável</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Faturação Real</span>
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
                  <p className="text-xs text-gray-400 uppercase">Faturação Pipeline</p>
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
                  <p className="text-xs text-gray-400 uppercase">Faturação Média / Deal</p>
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
// CONTA CORRENTE
// ══════════════════════════════════════════════════════════════
function ContaCorrenteTab({ conta }) {
  if (!conta) return <div className="text-center text-gray-400 py-12 text-sm">A carregar conta corrente...</div>

  const movimentos = conta.movimentos ?? []
  const saldo = conta.saldo ?? 0
  const totalEntradas = movimentos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const totalSaidas = movimentos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)

  return (
    <>
      {/* Saldo actual */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Saldo Conta Somnium Properties</span>
        <span className={`text-3xl font-bold ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(saldo)}</span>
        <div className="flex gap-6 mt-3">
          <div>
            <span className="text-xs text-gray-400 block">Total entradas</span>
            <span className="text-sm font-mono font-semibold text-green-600">{EUR(totalEntradas)}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block">Total saídas</span>
            <span className="text-sm font-mono font-semibold text-red-500">{EUR(totalSaidas)}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block">Movimentos</span>
            <span className="text-sm font-semibold text-gray-700">{movimentos.length}</span>
          </div>
        </div>
      </div>

      {/* Extrato */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Extrato</h2>
        {movimentos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-3">Data</th>
                  <th className="text-left py-2 px-3">Descrição</th>
                  <th className="text-left py-2 px-3">Categoria</th>
                  <th className="text-right py-2 px-3">Entrada</th>
                  <th className="text-right py-2 px-3">Saída</th>
                  <th className="text-right py-2 px-3">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {[...movimentos].reverse().map((m, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{m.data}</td>
                    <td className="py-2 px-3 font-medium text-gray-800">{m.descricao}</td>
                    <td className="py-2 px-3 text-xs text-gray-500">{m.categoria || '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-green-600">
                      {m.tipo === 'entrada' ? EUR(m.valor) : ''}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-red-500">
                      {m.tipo === 'saida' ? EUR(m.valor) : ''}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-semibold ${m.saldo >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                      {EUR(m.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-8">Sem movimentos registados</p>
        )}
      </div>
    </>
  )
}

// TESOURARIA — PAGAMENTOS AGRUPADOS POR NEGÓCIO
// ══════════════════════════════════════════════════════════════
function TesourariaPagamentos({ pendentes, confirmarPagamento }) {
  const [expandedDeals, setExpandedDeals] = useState(new Set())
  const toggleDeal = (id) => setExpandedDeals(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const comTranches = pendentes.filter(n => (n.pagamentosFaseados || []).length > 0)
  const semTranches = pendentes.filter(n => !(n.pagamentosFaseados || []).length)

  if (!comTranches.length && !semTranches.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Pagamentos</h2>
        <p className="text-xs text-gray-400 text-center py-6">Sem pagamentos pendentes</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">Pagamentos por Negócio</h2>

      {comTranches.map(n => {
        const pags = n.pagamentosFaseados || []
        const received = pags.filter(p => p.recebido)
        const totalVal = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
        const recVal = received.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
        const pct = totalVal > 0 ? Math.round((recVal / totalVal) * 100) : 0
        const isOpen = expandedDeals.has(n.id)
        const temAtrasado = pags.some(p => !p.recebido && p.data && new Date(p.data) < new Date())
        const nextPending = pags.find(p => !p.recebido)

        return (
          <div key={n.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${temAtrasado ? 'border-red-200' : 'border-gray-200'}`}>
            {/* Card header — always visible */}
            <button onClick={() => toggleDeal(n.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
              {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 truncate">{n.movimento}</span>
                  <CatBadge cat={n.categoria} />
                  {n.fase && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${FASE_COLOR[n.fase] ?? 'bg-gray-100 text-gray-600'}`}>{n.fase}</span>}
                  {temAtrasado && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">ATRASADO</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 max-w-[200px] bg-gray-100 rounded-full h-2">
                    <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : temAtrasado ? 'bg-red-400' : 'bg-yellow-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{received.length}/{pags.length} tranches</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-semibold text-gray-800">{EUR(recVal)} <span className="text-gray-400 font-normal">/ {EUR(totalVal)}</span></p>
                {nextPending?.data && <p className="text-[10px] text-gray-400 mt-0.5">Próx: {nextPending.data}</p>}
              </div>
            </button>

            {/* Expanded — tranche list */}
            {isOpen && (
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-1.5">
                {pags.map((p, idx) => {
                  const atrasado = !p.recebido && p.data && new Date(p.data) < new Date()
                  return (
                    <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                      p.recebido ? 'bg-green-50 border-green-100' :
                      atrasado ? 'bg-red-50 border-red-100' :
                      'bg-yellow-50 border-yellow-100'
                    }`}>
                      {p.recebido
                        ? <Check className="w-4 h-4 text-green-600 shrink-0" />
                        : <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${atrasado ? 'border-red-400' : 'border-yellow-400'}`} />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800">{p.descricao || 'Pagamento'}</p>
                        <p className="text-[10px] text-gray-400">{p.data || 'Sem data'} {atrasado && <span className="text-red-600 font-medium">— ATRASADO</span>}</p>
                      </div>
                      <span className={`text-xs font-mono font-semibold shrink-0 ${p.recebido ? 'text-green-700' : atrasado ? 'text-red-700' : 'text-yellow-700'}`}>{EUR(p.valor)}</span>
                      {!p.recebido && (
                        <button
                          onClick={() => confirmarPagamento(n.id, idx, `${n.movimento} — ${p.descricao || 'Pagamento'} (${EUR(p.valor)})`)}
                          className="px-2.5 py-1.5 text-[10px] font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shrink-0"
                        >
                          Confirmar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {semTranches.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-3">Negócios sem tranches definidas</h3>
          <NegociosTable rows={semTranches} emptyMsg="" />
        </div>
      )}
    </div>
  )
}

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
          <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Faturação Total</span>
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
                <th className="text-right py-2 px-3">Faturação Expectável</th>
                <th className="text-right py-2 px-3">Faturação Real</th>
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
                <th className="text-right py-2 px-3">Faturação Expectável</th>
                <th className="text-right py-2 px-3">Faturação Real</th>
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
          <th className="text-right py-2 px-3">Faturação Expectável</th>
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

// ── Despesa Form ─────────────────────────────────────────────
const DESP_CATEGORIAS = ['Salários', 'Operação', 'Marketing', 'Ferramentas', 'Legal', 'Contabilidade', 'Escritório', 'Formação', 'Viatura', 'Seguros', 'Telecomunicações', 'Subscrição Skool', 'Material Somnium', 'Outro']
const DESP_TIMING = ['Mensalmente', 'Anual', 'Único']

function DespesaForm({ item, onSave, onCancel, onReload }) {
  const isNew = !item.id
  // Normalizar campos camelCase → snake_case (endpoint financeiro vs CRM)
  const normalized = { ...item }
  if (normalized.custoMensal !== undefined && normalized.custo_mensal === undefined) normalized.custo_mensal = normalized.custoMensal
  if (normalized.custoAnual !== undefined && normalized.custo_anual === undefined) normalized.custo_anual = normalized.custoAnual
  const [f, setF] = useState({
    movimento: '', categoria: '', timing: 'Mensalmente', custo_mensal: '', custo_anual: '', data: '', notas: '',
    ...normalized,
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
