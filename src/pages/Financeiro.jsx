import { useState, useEffect } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const EUR2 = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)

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

const TABS = ['Resumo', 'Negócios', 'Despesas', 'Cashflow', 'P&L']

export function Financeiro() {
  const [kpis,     setKpis]     = useState(null)
  const [despesas, setDespesas] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [projecao, setProjecao] = useState(null)
  const [analises, setAnalises] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [tab,      setTab]      = useState('Resumo')

  async function load() {
    setLoading(true); setError(null)
    try {
      const [kr, dr, cr, pr, ar] = await Promise.all([
        fetch('/api/kpis/financeiro'),
        fetch('/api/financeiro/despesas'),
        fetch('/api/financeiro/cashflow'),
        fetch('/api/financeiro/projecao'),
        fetch('/api/crm/analises-kpis'),
      ])
      if (!kr.ok || !dr.ok || !cr.ok) throw new Error('Erro no servidor')
      const [k, d, c, p, a] = await Promise.all([kr.json(), dr.json(), cr.json(), pr.ok ? pr.json() : null, ar.ok ? ar.json() : null])
      if (k.error) throw new Error(k.error)
      setKpis(k); setDespesas(d); setCashflow(c); setProjecao(p); setAnalises(a)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
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

  return (
    <>
      <Header title="Financeiro" subtitle="Atualização em tempo real" onRefresh={load} loading={loading}
        notionUrl="https://www.notion.so/333c6d45a01f81dc9cb4d12a999e28ed" />

      {/* Tabs */}
      <div className="px-6 pt-4 flex gap-1 border-b border-gray-200 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-6 flex flex-col gap-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>
        )}

        {/* ══════════════════ RESUMO ══════════════════ */}
        {tab === 'Resumo' && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard label="Pipeline de Lucro"   value={EUR(kpis?.lucroEstimadoTotal)} meta="—" status="green"                                       trend="neutral" unit="" />
              <KPICard label="Lucro Real Recebido" value={EUR(kpis?.lucroRealTotal)}     meta="—" status={kpis?.lucroRealTotal > 0 ? 'green' : 'yellow'} trend="neutral" unit="" />
              <KPICard label="A Receber (pendente)" value={EUR(kpis?.lucroPendente)}     meta="—" status={kpis?.lucroPendente > 0 ? 'yellow' : 'green'} trend="neutral" unit="" />
              <KPICard label="Burn Rate / Mês"     value={EUR(kpis?.burnRate)}           meta="—" status="green"                                       trend="neutral" unit="" />
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Runway</span>
                <span className={`text-2xl font-bold ${runwayMeses == null ? 'text-gray-400' : runwayMeses >= 12 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {runwayLabel}
                </span>
                <span className="text-xs text-gray-400">Pendente / burn rate mensal</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Negócios Ativos</span>
                <span className="text-2xl font-bold text-indigo-600">{kpis?.negóciosAtivos ?? '—'}</span>
                <span className="text-xs text-gray-400">{kpis?.negociosPendentes ?? 0} com pagamento pendente</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Despesas Anuais</span>
                <span className="text-xl font-bold text-red-500">{EUR(kpis?.despesasAnuaisTotal)}</span>
                <span className="text-xs text-gray-400">Subscriptions + one-time</span>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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

            {pendentes.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Pagamentos Pendentes</h2>
                <NegociosTable rows={pendentes} />
              </div>
            )}

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
          <>
            <div className="flex justify-end">
              <a href="https://www.notion.so/ecbb876ee01e4e65b8f561499d42a2b2" target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ backgroundColor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' }}>
                Abrir Faturação no Notion →
              </a>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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
              {(!kpis?.categorias?.length) && <div className="col-span-4"><EmptyState /></div>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Todos os Negócios</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-3">Negócio</th>
                      <th className="text-left py-2 px-3">Categoria</th>
                      <th className="text-left py-2 px-3">Fase</th>
                      <th className="text-right py-2 px-3">Lucro Est.</th>
                      <th className="text-right py-2 px-3">Lucro Real</th>
                      <th className="text-left py-2 px-3">Pagamento</th>
                      <th className="text-left py-2 px-3">Data Prevista</th>
                    </tr>
                  </thead>
                  <tbody>
                    {negociosLista.map(n => (
                      <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{n.movimento}</td>
                        <td className="py-2 px-3">
                          <CatBadge cat={n.categoria} />
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FASE_COLOR[n.fase] ?? 'bg-gray-100 text-gray-600'}`}>
                            {n.fase ?? '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-indigo-600 font-semibold">{EUR(n.lucroEstimado)}</td>
                        <td className="py-2 px-3 text-right font-mono text-green-600">
                          {n.lucroReal > 0 ? EUR(n.lucroReal) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {n.pagamentoEmFalta
                            ? <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pendente</span>
                            : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Recebido</span>}
                        </td>
                        <td className="py-2 px-3 text-gray-400 text-xs">{n.dataEstimada ?? n.dataVenda ?? '—'}</td>
                      </tr>
                    ))}
                    {!negociosLista.length && (
                      <tr><td colSpan={7} className="py-8 text-center text-gray-400 text-xs">Sem negócios registados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════ DESPESAS ══════════════════ */}
        {tab === 'Despesas' && (
          <>
            <div className="flex justify-end">
              <a href="https://www.notion.so/ae764d5955004c1bb0fba7705bb6931c" target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ backgroundColor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' }}>
                Abrir Despesas no Notion →
              </a>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              <KPICard label="Burn Rate / Mês"     value={EUR(despesas?.burnRate)}      meta="—" status="green"  trend="neutral" unit="" />
              <KPICard label="Burn Rate Anual"      value={EUR(despesas?.burnRateAnual)} meta="—" status="green"  trend="neutral" unit="" />
              <KPICard label="Total Despesas (ano)" value={EUR(despesas?.totalAnual)}    meta="—" status="yellow" trend="neutral" unit="" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                    </tr>
                  </thead>
                  <tbody>
                    {despRecorrentes.map(d => (
                      <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-medium text-gray-700">{d.movimento}</td>
                        <td className="py-1.5 px-2 text-gray-500">{d.categoria}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-red-500">{EUR2(d.custoMensal)}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-600">{EUR(d.custoAnual)}</td>
                      </tr>
                    ))}
                    {!despRecorrentes.length && (
                      <tr><td colSpan={4} className="py-4 text-center text-gray-400">Sem despesas mensais</td></tr>
                    )}
                    {despRecorrentes.length > 0 && (
                      <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                        <td colSpan={2} className="py-1.5 px-2 text-gray-700">TOTAL</td>
                        <td className="py-1.5 px-2 text-right font-mono text-red-600">{EUR2(despesas?.burnRate)}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-700">{EUR(despesas?.burnRateAnual)}</td>
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

        {/* ══════════════════ CASHFLOW ══════════════════ */}
        {tab === 'Cashflow' && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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
                <span className="text-xs text-gray-400 block mt-1">Despesas recorrentes</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Runway</span>
                <span className={`text-2xl font-bold ${
                  cashflow?.runway == null ? 'text-gray-400'
                  : cashflow.runway >= 12  ? 'text-green-600'
                  : cashflow.runway >= 3   ? 'text-yellow-600'
                  :                          'text-red-600'
                }`}>
                  {runwayLabel}
                </span>
                <span className="text-xs text-gray-400 block mt-1">Meses cobertos pelos pendentes</span>
              </div>
            </div>

            {cashflow?.runway != null && cashflow.runway < 99 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Cobertura de Runway</h2>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        cashflow.runway >= 12 ? 'bg-green-500' : cashflow.runway >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, (cashflow.runway / 24) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-24 text-right">{runwayLabel}</span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-gray-400">
                  <span>0</span><span>6 meses</span><span>12 meses</span><span>18 meses</span><span>24 meses</span>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  Com {EUR(cashflow.lucroPendente)} pendentes e {EUR(cashflow.burnRate)}/mês de burn rate
                </p>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Pagamentos Pendentes (por ordem de data)</h2>
              <NegociosTable rows={pendentes} emptyMsg="Sem pagamentos pendentes" />
            </div>

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
            {/* P&L Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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
                <span className="text-xs text-gray-400 block mt-1">Burn rate acumulado</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Resultado Líquido</span>
                <span className={`text-2xl font-bold ${projecao.pl.resultadoLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {EUR(projecao.pl.resultadoLiquido)}
                </span>
                <span className="text-xs text-gray-400 block mt-1">Receita real − despesas</span>
              </div>
            </div>

            {/* Break-even */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Break-Even Analysis</h2>
              <div className="grid grid-cols-3 gap-6">
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
      </div>
    </>
  )
}

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
