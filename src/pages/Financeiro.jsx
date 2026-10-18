import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { Upload, X, FileText, Image, Trash2, Plus, ChevronDown, ChevronUp, Check, Download } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { ErrorState } from '../components/ui/ErrorState.jsx'
import { useChartColors, tooltipProps } from '../lib/useChartColors.js'
import { KPICard } from '../components/dashboard/KPICard.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'
import { useUrlState } from '../hooks/useUrlState.js'
import { REGIOES } from '../constants.js'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const EUR2 = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CAT_COLORS = {
  'Wholesaling':         '#475569',
  'Mediação Imobiliária': '#10b981',
  'Consultoria/Assessoria': '#0891b2',
  'CAEP':                 '#f59e0b',
  'Fix and Flip':         '#ef4444',
}
const CAT_COLORS_LIST = ['#475569','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6']

const FASE_COLOR = {
  'Fase de obras': 'bg-surface-muted text-ink',
  'Fase de venda': 'bg-warning/15 text-warning',
  'Vendido':       'bg-success/15 text-success',
}
const TIMING_COLOR = {
  'Mensalmente': 'bg-surface-muted text-ink',
  'Anual':       'bg-purple-100 text-purple-700',
  'Único':       'bg-surface-muted text-ink-muted',
}

const TABS = ['Visão Geral', 'Conta Corrente', 'Despesas', 'Tesouraria', 'P&L', 'Rentabilidade', 'Contabilidade']

export function Financeiro() {
  const C = useChartColors()
  const [tab,      setTab]      = useUrlState('tab', 'Visão Geral')
  const [editingDesp, setEditingDesp] = useState(null)

  const safe = (promise) => promise.then(r => r.ok ? r.json() : null).catch(() => null)

  // Migrado para React Query (Problema 23 da auditoria) e depois dividido em
  // 1 pedido "core" (sempre visível no banner do topo) + 1 pedido por
  // separador, só disparado quando esse separador é aberto (Problema 25 —
  // antes disparava sempre os 9 pedidos, mesmo vendo só 1 separador).
  const coreQuery = useQuery({
    queryKey: ['financeiro-core'],
    queryFn: async () => {
      const [k, c] = await Promise.all([safe(apiFetch('/api/kpis/financeiro')), safe(apiFetch('/api/financeiro/cashflow'))])
      if (!k) throw new Error('Erro ao carregar dados financeiros')
      return { kpis: k, cashflow: c }
    },
  })
  const analisesQuery = useQuery({
    queryKey: ['financeiro-analises'],
    enabled: tab === 'Visão Geral',
    queryFn: () => safe(apiFetch('/api/crm/analises-kpis')),
  })
  const despesasQuery = useQuery({
    queryKey: ['financeiro-despesas'],
    enabled: tab === 'Despesas',
    queryFn: async () => {
      const [d, ds] = await Promise.all([safe(apiFetch('/api/financeiro/despesas')), safe(apiFetch('/api/crm/despesas?limit=1000'))])
      return { despesas: d, crmDespesas: ds?.data ?? [] }
    },
  })
  const agingQuery = useQuery({
    queryKey: ['financeiro-aging'],
    enabled: tab === 'Tesouraria',
    queryFn: () => safe(apiFetch('/api/financeiro/aging')),
  })
  const projecaoQuery = useQuery({
    queryKey: ['financeiro-projecao'],
    enabled: tab === 'P&L',
    queryFn: () => safe(apiFetch('/api/financeiro/projecao')),
  })
  const rentQuery = useQuery({
    queryKey: ['financeiro-rentabilidade'],
    enabled: tab === 'Rentabilidade',
    queryFn: () => safe(apiFetch('/api/financeiro/rentabilidade')),
  })
  const contaQuery = useQuery({
    queryKey: ['financeiro-conta'],
    enabled: tab === 'Conta Corrente',
    queryFn: () => safe(apiFetch('/api/financeiro/conta-corrente')),
  })

  const kpis = coreQuery.data?.kpis ?? null
  const cashflow = coreQuery.data?.cashflow ?? null
  const analises = analisesQuery.data ?? null
  const despesas = despesasQuery.data?.despesas ?? null
  const crmDespesas = useMemo(() => despesasQuery.data?.crmDespesas ?? [], [despesasQuery.data])
  const aging = agingQuery.data ?? null
  const projecao = projecaoQuery.data ?? null
  const rent = rentQuery.data ?? null
  const conta = contaQuery.data ?? null
  const loading = coreQuery.isPending
  const [error, setError] = useState(null)
  // Botão "Actualizar" do Header: o essencial (banner) é sempre core; o
  // separador aberto no momento já está "activo" e é invalidado
  // automaticamente por qualquer mutação (ver src/lib/queryClient.js), por
  // isso não precisa de ser incluído aqui à parte.
  const load = coreQuery.refetch

  async function saveDespesa(form) {
    try {
      // Normalizar custo_mensal/custo_anual com base no timing
      const payload = { ...form }
      const mensal = parseFloat(payload.custo_mensal) || 0
      const anual = parseFloat(payload.custo_anual) || 0
      if (payload.timing === 'Mensalmente') {
        payload.custo_mensal = mensal || anual / 12
        payload.custo_anual = payload.custo_mensal * 12
      } else if (payload.timing === 'Anual') {
        payload.custo_anual = anual || mensal * 12
        payload.custo_mensal = 0
      } else {
        // Único ou Registado: valor fica em custo_mensal, anual = 0
        payload.custo_mensal = mensal || anual
        payload.custo_anual = 0
      }
      payload.custo_mensal = Math.round(payload.custo_mensal * 100) / 100
      payload.custo_anual = Math.round(payload.custo_anual * 100) / 100

      const isNew = !payload.id
      const url = isNew ? '/api/crm/despesas' : `/api/crm/despesas/${payload.id}`
      const r = await apiFetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${r.status}`)
      }
      setEditingDesp(null)
      setError(null)
      // Despesas afeta o burn rate do banner (core) e a lista desta aba.
      coreQuery.refetch(); despesasQuery.refetch()
    } catch (e) {
      console.error('[saveDespesa]', e)
      setError(e.message)
    }
  }

  async function deleteDespesa(id) {
    if (!confirm('Apagar esta despesa?')) return
    await apiFetch(`/api/crm/despesas/${id}`, { method: 'DELETE' })
    coreQuery.refetch(); despesasQuery.refetch()
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
      // Confirmar pagamento afeta pendentes/recebidos do cashflow (core).
      coreQuery.refetch()
    } catch (e) {
      console.error('[confirmarPagamento]', e)
      setError(e.message)
    }
  }

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
  const runwayColor = runwayMeses == null ? 'text-ink-muted' : runwayMeses >= 12 ? 'text-success' : runwayMeses >= 6 ? 'text-warning' : runwayMeses >= 3 ? 'text-orange-600' : 'text-danger'

  return (
    <>
      <Header title="Financeiro" subtitle="Atualização em tempo real" onRefresh={load} loading={loading} />

      {/* Tabs */}
      <div className="px-4 sm:px-6 pt-3 bg-surface-raised sticky top-0 z-10">
        <Tabs
          variant="underline"
          value={tab}
          onChange={setTab}
          items={TABS.map(t => ({ key: t, label: t }))}
        />
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        {(error || coreQuery.error) && (
          <ErrorState compact title="Não foi possível carregar os dados financeiros" error={error || coreQuery.error} onRetry={load} />
        )}

        {/* ══════════════════ VISÃO GERAL ══════════════════ */}
        {tab === 'Visão Geral' && (
          <>
            {/* Alertas */}
            {(kpis?.alertas ?? []).length > 0 && (
              <div className="space-y-2">
                {kpis.alertas.map((a, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                    a.tipo === 'critico' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-warning/10 border-warning/30 text-warning'
                  }`}>
                    <span className="text-lg">{a.icon}</span>
                    <span>{a.msg}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <KPICard label="Faturação Estimada" value={EUR(kpis?.lucroEstimadoTotal)} meta="—" status="green"                                       trend="neutral" unit="" />
              <KPICard label="Faturação Real"      value={EUR(kpis?.lucroRealTotal)}     meta="—" status={kpis?.lucroRealTotal > 0 ? 'green' : 'yellow'} trend="neutral" unit="" />
              <KPICard label="A Receber (pendente)" value={EUR((kpis?.lucroEstimadoTotal ?? 0) - (kpis?.lucroRealTotal ?? 0))} meta="—" status={(kpis?.lucroEstimadoTotal ?? 0) - (kpis?.lucroRealTotal ?? 0) > 0 ? 'yellow' : 'green'} trend="neutral" unit="" />
              <KPICard label="Burn Rate / Mês"     value={EUR(kpis?.burnRate)}           meta="—" status="green"                                       trend="neutral" unit="" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs flex flex-col gap-1">
                <span className="text-overline uppercase text-ink-muted">Runway</span>
                <span className={`font-display text-2xl num ${runwayColor}`}>{runwayLabel}</span>
                <div className="w-full bg-surface-muted rounded-full h-2 mt-1">
                  <div className={`h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] ${runwayMeses >= 12 ? 'bg-success' : runwayMeses >= 6 ? 'bg-warning' : runwayMeses >= 3 ? 'bg-orange-500' : 'bg-danger'}`}
                    style={{ width: `${Math.min(100, ((runwayMeses || 0) / 24) * 100)}%` }} />
                </div>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs flex flex-col gap-1">
                <span className="text-overline uppercase text-ink-muted">YTD Resultado</span>
                <span className={`font-display text-2xl num ${(kpis?.ytd?.resultado ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {EUR(kpis?.ytd?.resultado)}
                </span>
                <span className="text-xs text-ink-muted">Real {EUR(kpis?.ytd?.real)} − Desp. {EUR(kpis?.ytd?.despesas)}</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs flex flex-col gap-1">
                <span className="text-overline uppercase text-ink-muted">Negócios Ativos</span>
                <span className="font-display text-2xl text-ink num">{kpis?.negóciosAtivos ?? '—'}</span>
                <span className="text-xs text-ink-muted">{kpis?.negociosPendentes ?? 0} com pagamento pendente</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs flex flex-col gap-1">
                <span className="text-overline uppercase text-ink-muted">Concentração de Risco</span>
                <span className={`font-display text-2xl num ${(kpis?.concentracao ?? 0) > 60 ? 'text-danger' : (kpis?.concentracao ?? 0) > 40 ? 'text-warning' : 'text-success'}`}>
                  {kpis?.concentracao ?? 0}%
                </span>
                <span className="text-xs text-ink-muted">Maior deal no pipeline</span>
              </div>
            </div>

            {/* Tranches atrasadas */}
            {(kpis?.tranchesAtrasadas ?? []).length > 0 && (
              <div className="bg-danger/10 rounded-xl border border-danger/30 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-danger mb-3">Tranches Atrasadas</h2>
                <div className="space-y-2">
                  {kpis.tranchesAtrasadas.map((t, i) => (
                    <div key={i} className="flex items-center justify-between bg-surface-raised rounded-lg px-3 py-2 border border-danger/30">
                      <div>
                        <p className="text-sm font-medium text-ink">{t.negocio}</p>
                        <p className="text-xs text-ink-muted">{t.descricao || 'Pagamento'} — {t.dias} dias de atraso</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm num font-semibold text-danger">{EUR(t.valor)}</p>
                        <p className="text-xs text-ink-muted">{t.data}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
                <h2 className="text-sm font-semibold text-ink mb-4">Faturação por Categoria</h2>
                {categoriasPie.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={categoriasPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {categoriasPie.map((c, i) => (
                          <Cell key={i} fill={CAT_COLORS[c.name] ?? CAT_COLORS_LIST[i % CAT_COLORS_LIST.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipProps(C)} formatter={v => EUR(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>

              <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
                <h2 className="text-sm font-semibold text-ink mb-4">Negócios por Fase</h2>
                {porFaseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={porFaseData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: C.axis }} allowDecimals={false} />
                      <YAxis type="category" dataKey="fase" tick={{ fontSize: 11, fill: C.axis }} width={110} />
                      <Tooltip {...tooltipProps(C)} formatter={(v, n) => n === 'Faturação Estimada €' ? EUR(v) : v} />
                      <Legend />
                      <Bar dataKey="count"    name="Nº Negócios"     fill={C.muted} radius={[0,3,3,0]} />
                      <Bar dataKey="lucroEst" name="Faturação Estimada €"  fill={C.accent} radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </div>

            {/* Análises de Rentabilidade */}
            {analises?.total > 0 && (
              <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
                <h2 className="text-sm font-semibold text-ink mb-4">Pipeline de Análises (calculadora integrada)</h2>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                  <div className="bg-success/10 rounded-lg p-3 text-center">
                    <p className="text-xs text-ink-muted">Lucro Líquido Pipeline</p>
                    <p className="text-lg font-bold text-success">{EUR(analises.pipeline_lucro_liquido)}</p>
                  </div>
                  <div className="bg-surface-muted rounded-lg p-3 text-center">
                    <p className="text-xs text-ink-muted">Capital Necessário</p>
                    <p className="text-lg font-bold text-ink">{EUR(analises.pipeline_capital)}</p>
                  </div>
                  <div className="bg-warning/10 rounded-lg p-3 text-center">
                    <p className="text-xs text-ink-muted">RA Médio</p>
                    <p className="text-lg font-bold text-warning">{analises.media_retorno_anualizado}%</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${analises.imoveis_com_risco > 0 ? 'bg-danger/10' : 'bg-success/10'}`}>
                    <p className="text-xs text-ink-muted">Imóveis c/ Risco</p>
                    <p className={`text-lg font-bold ${analises.imoveis_com_risco > 0 ? 'text-danger' : 'text-success'}`}>{analises.imoveis_com_risco}</p>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-muted border-b">
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
                      <tr key={a.id} className="border-b border-line hover:bg-surface">
                        <td className="py-1.5 font-medium text-ink">{a.imovel_nome}</td>
                        <td className="py-1.5 text-right num">{EUR(a.compra)}</td>
                        <td className="py-1.5 text-right num">{EUR(a.vvr)}</td>
                        <td className="py-1.5 text-right num">{EUR(a.capital_necessario)}</td>
                        <td className={`py-1.5 text-right num font-semibold ${a.lucro_liquido >= 0 ? 'text-success' : 'text-danger'}`}>{EUR(a.lucro_liquido)}</td>
                        <td className={`py-1.5 text-right num ${a.retorno_anualizado >= 15 ? 'text-success' : a.retorno_anualizado >= 8 ? 'text-warning' : 'text-danger'}`}>{a.retorno_anualizado}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ CONTA CORRENTE ══════════════════ */}
        {tab === 'Contabilidade' && <ContabilidadeTab />}

        {tab === 'Conta Corrente' && (
          <ContaCorrenteTab conta={conta} />
        )}

        {/* ══════════════════ DESPESAS ══════════════════ */}
        {tab === 'Despesas' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <button onClick={() => setEditingDesp({})} className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground text-sm font-medium rounded-xl hover:brightness-[1.04] transition-[filter]">
                <Plus className="w-4 h-4" /> Nova Despesa
              </button>
            </div>

            {editingDesp !== null && (
              <DespesaForm item={editingDesp} onSave={saveDespesa} onCancel={() => setEditingDesp(null)} onReload={despesasQuery.refetch} />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              <KPICard label="Burn Rate / Mês"     value={EUR(despesas?.burnRate)}      meta="—" status="green"  trend="neutral" unit="" />
              <KPICard label="Burn Rate Anual"      value={EUR(despesas?.burnRateAnual)} meta="—" status="green"  trend="neutral" unit="" />
              <KPICard label="Total Despesas (ano)" value={EUR(despesas?.totalAnual)}    meta="—" status="yellow" trend="neutral" unit="" />
            </div>

            {/* Todas as despesas cronologicamente */}
            <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
              <h2 className="text-sm font-semibold text-ink mb-4">Todas as Despesas</h2>
              <ScrollableTable>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
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
                      .sort((a, b) => (b.data || '0').localeCompare(a.data || '0'))
                      .map(d => (
                      <tr key={d.id}
                        onClick={() => setEditingDesp(crmDespesas.find(x => x.id === d.id) || d)}
                        className="border-b border-line hover:bg-surface-muted cursor-pointer transition-colors">
                        <td className="py-2 px-3 text-xs text-ink-muted whitespace-nowrap">{d.data ?? '—'}</td>
                        <td className="py-2 px-3 font-medium text-ink">
                          {d.movimento}
                          {(() => {
                            // Badge de atribuição regional: partilhada (rateio) ou região única.
                            const rateioObj = d.rateio && typeof d.rateio === 'string' ? (() => { try { return JSON.parse(d.rateio) } catch { return null } })() : d.rateio
                            if (rateioObj && Object.keys(rateioObj).length >= 2) {
                              const txt = Object.entries(rateioObj).map(([k,v]) => `${k} ${Math.round(v*100)}%`).join(' / ')
                              return <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-warning/15 text-warning font-medium">Partilhada · {txt}</span>
                            }
                            if (d.regiao && d.regiao !== 'Coimbra') {
                              return <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-surface-muted text-ink">{d.regiao}</span>
                            }
                            return null
                          })()}
                        </td>
                        <td className="py-2 px-3 text-xs text-ink-muted">{d.categoria || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            TIMING_COLOR[d.timing] ?? (d.timing === 'Registado' ? 'bg-success/15 text-success' : 'bg-surface-muted text-ink-muted')
                          }`}>
                            {d.timing}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right num text-danger font-semibold">{EUR(d.custoMensal || d.custoAnual)}</td>
                        <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                          <button onClick={() => deleteDespesa(d.id)} className="px-1.5 py-0.5 text-xs bg-danger/10 text-danger rounded hover:bg-danger/15">x</button>
                        </td>
                      </tr>
                    ))}
                    {!(despesas?.todas ?? []).length && (
                      <tr><td colSpan={6} className="py-8 text-center text-ink-muted text-xs">Sem despesas registadas</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollableTable>
            </div>
          </>
        )}

        {/* ══════════════════ TESOURARIA ══════════════════ */}
        {tab === 'Tesouraria' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">A Receber</span>
                <span className="text-2xl font-bold text-warning">{EUR(cashflow?.lucroPendente)}</span>
                <span className="text-xs text-ink-muted block mt-1">{pendentes.length} negócios pendentes</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Faturação Real</span>
                <span className="text-2xl font-bold text-success">{EUR(cashflow?.lucroRecebido)}</span>
                <span className="text-xs text-ink-muted block mt-1">{recebidos.length} negócios fechados</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Burn Rate / Mês</span>
                <span className="text-2xl font-bold text-danger">{EUR(cashflow?.burnRate)}</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Runway</span>
                <span className={`font-display text-2xl num ${runwayColor}`}>{runwayLabel}</span>
              </div>
            </div>

            {/* Aging de Pagamentos */}
            {aging && aging.summary?.some(b => b.count > 0) && (
              <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
                <h2 className="text-sm font-semibold text-ink mb-4">Aging de Pagamentos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {aging.summary.map((b, i) => (
                    <div key={i} className={`rounded-lg p-3 text-center border ${
                      b.color === 'red' ? 'bg-danger/10 border-danger/30' :
                      b.color === 'yellow' ? 'bg-warning/10 border-warning/30' :
                      b.color === 'blue' ? 'bg-surface-muted border-line' :
                      b.color === 'indigo' ? 'bg-surface-muted border-line' :
                      'bg-surface border-line'
                    }`}>
                      <p className="text-xs text-ink-muted">{b.label}</p>
                      <p className={`text-lg font-bold ${
                        b.color === 'red' ? 'text-danger' :
                        b.color === 'yellow' ? 'text-warning' :
                        b.color === 'blue' ? 'text-ink' :
                        b.color === 'indigo' ? 'text-ink' :
                        'text-ink-muted'
                      }`}>{b.count > 0 ? EUR(b.total) : '—'}</p>
                      <p className="text-xs text-ink-muted">{b.count} tranche{b.count !== 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagamentos por Negócio */}
            <TesourariaPagamentos pendentes={pendentes} confirmarPagamento={confirmarPagamento} />

            {recebidos.length > 0 && (
              <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
                <h2 className="text-sm font-semibold text-ink mb-3">Pagamentos Recebidos</h2>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-3">Negócio</th>
                      <th className="text-left py-2 px-3">Categoria</th>
                      <th className="text-right py-2 px-3">Faturação Real</th>
                      <th className="text-left py-2 px-3">Data Venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recebidos.map(n => (
                      <tr key={n.id} className="border-b border-line hover:bg-surface">
                        <td className="py-2 px-3 font-medium text-ink">{n.movimento}</td>
                        <td className="py-2 px-3"><CatBadge cat={n.categoria} /></td>
                        <td className="py-2 px-3 text-right num font-bold text-success">{EUR(n.lucroReal)}</td>
                        <td className="py-2 px-3 text-ink-muted text-xs">{n.dataVenda ?? '—'}</td>
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
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Faturação Estimada</span>
                <span className="text-2xl font-bold text-ink">{EUR(projecao.pl.receitaEstimada)}</span>
                <span className="text-xs text-ink-muted block mt-1">Total estimado</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Faturação Real</span>
                <span className={`text-2xl font-bold ${projecao.pl.receitaReal > 0 ? 'text-success' : 'text-ink-muted'}`}>{EUR(projecao.pl.receitaReal)}</span>
                <span className="text-xs text-ink-muted block mt-1">Já recebido</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Despesas ({projecao.pl.mesesDecorridos} meses)</span>
                <span className="text-2xl font-bold text-danger">{EUR(projecao.pl.despesasAteAgora)}</span>
              </div>
              <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
                <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Resultado Líquido</span>
                <span className={`text-2xl font-bold ${projecao.pl.resultadoLiquido >= 0 ? 'text-success' : 'text-danger'}`}>
                  {EUR(projecao.pl.resultadoLiquido)}
                </span>
              </div>
            </div>

            {/* Margem Operacional */}
            <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
              <h2 className="text-sm font-semibold text-ink mb-3">Margem Operacional</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-ink-muted uppercase">Faturação Pipeline</p>
                  <p className="text-xl font-bold text-ink mt-1">{EUR(projecao.pl.receitaEstimada)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted uppercase">Despesas Anuais</p>
                  <p className="text-xl font-bold text-danger mt-1">{EUR(projecao.breakEven.despesasAnuais)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted uppercase">Margem Operacional</p>
                  {(() => {
                    const margem = projecao.pl.receitaEstimada > 0
                      ? Math.round((projecao.pl.receitaEstimada - projecao.breakEven.despesasAnuais) / projecao.pl.receitaEstimada * 100)
                      : 0
                    return <p className={`text-xl font-bold mt-1 ${margem >= 50 ? 'text-success' : margem >= 20 ? 'text-warning' : 'text-danger'}`}>{margem}%</p>
                  })()}
                </div>
              </div>
            </div>

            {/* Break-even */}
            <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
              <h2 className="text-sm font-semibold text-ink mb-3">Break-Even</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <div>
                  <p className="text-xs text-ink-muted uppercase">Despesas Anuais</p>
                  <p className="text-xl font-bold text-danger mt-1">{EUR(projecao.breakEven.despesasAnuais)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted uppercase">Faturação Média / Deal</p>
                  <p className="text-xl font-bold text-ink mt-1">{EUR(projecao.breakEven.lucroMedioDeal)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted uppercase">Deals para Break-Even</p>
                  <p className="text-xl font-bold text-ink mt-1">{projecao.breakEven.dealsNecessarios ?? '—'}</p>
                  <p className="text-xs text-ink-muted">por ano para cobrir despesas</p>
                </div>
              </div>
            </div>

            {/* Projeção Cash Flow */}
            <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
              <h2 className="text-sm font-semibold text-ink mb-4">Cash Flow Projetado — próximos 12 meses</h2>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={projecao.projecao}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip {...tooltipProps(C)} formatter={v => EUR(v)} />
                  <Legend />
                  <Bar dataKey="entradas" name="Entradas €" fill={C.success} radius={[3,3,0,0]} />
                  <Bar dataKey="saidas" name="Saídas €" fill={C.danger} radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="saldoAcumulado" name="Saldo Acum. €" stroke={C.ink} strokeWidth={2} dot={{ r: 3, fill: C.ink }} />
                  <ReferenceLine y={0} stroke={C.grid} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Tabela projeção */}
            <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
              <h2 className="text-sm font-semibold text-ink mb-3">Detalhe Mensal</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-ink-muted uppercase tracking-wide">
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
                      <tr key={m.label} className="border-b border-line hover:bg-surface">
                        <td className="py-1.5 px-2 font-medium text-ink">{m.label}</td>
                        <td className="py-1.5 px-2 text-right text-ink-muted">{m.deals || '—'}</td>
                        <td className="py-1.5 px-2 text-right num text-success">{m.entradas > 0 ? EUR(m.entradas) : '—'}</td>
                        <td className="py-1.5 px-2 text-right num text-danger">{EUR(m.saidas)}</td>
                        <td className={`py-1.5 px-2 text-right num font-semibold ${m.liquido >= 0 ? 'text-success' : 'text-danger'}`}>{EUR(m.liquido)}</td>
                        <td className={`py-1.5 px-2 text-right num ${m.saldoAcumulado >= 0 ? 'text-ink' : 'text-danger'}`}>{EUR(m.saldoAcumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {tab === 'P&L' && !projecao && !projecaoQuery.isPending && (
          <div className="text-center text-ink-muted py-12 text-sm">Sem dados de projeção disponíveis</div>
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
// ── Contabilidade: todas as faturas anexadas no CRM (despesas + projectos) ──
const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function periodoMeses(inicioOffset, fimOffset) {
  const hoje = new Date()
  const de = new Date(hoje.getFullYear(), hoje.getMonth() + inicioOffset, 1)
  const ate = new Date(hoje.getFullYear(), hoje.getMonth() + fimOffset + 1, 0)
  return { de: isoDia(de), ate: isoDia(ate) }
}
const PERIODO_TODAS = { de: '2000-01-01', ate: '2100-12-31' }
const PERIODOS_RAPIDOS = [
  { label: 'Todas', get: () => PERIODO_TODAS },
  { label: 'Mês anterior', get: () => periodoMeses(-1, -1) },
  { label: 'Este mês', get: () => periodoMeses(0, 0) },
  { label: 'Últimos 2 meses', get: () => periodoMeses(-2, -1) },
  { label: 'Últimos 3 meses', get: () => periodoMeses(-3, -1) },
  { label: 'Este ano', get: () => ({ de: `${new Date().getFullYear()}-01-01`, ate: isoDia(new Date()) }) },
]

function ContabilidadeTab() {
  const toast = useToast()
  const [periodo, setPeriodo] = useState(PERIODO_TODAS)
  const [pendentes, setPendentes] = useState(false)
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)

  const qs = `de=${periodo.de}&ate=${periodo.ate}${pendentes ? '&pendentes=1' : ''}`

  async function carregar() {
    if (!periodo.de || !periodo.ate) return
    setLoading(true); setErro(null)
    try {
      const r = await apiFetch(`/api/crm/contabilidade/faturas?${qs}`)
      const j = await r.json()
      if (!r.ok) throw Object.assign(new Error(j.error || ''), { status: r.status })
      setDados(j)
    } catch (e) { setErro(e); setDados(null) }
    setLoading(false)
  }
  useEffect(() => { carregar() }, [qs]) // eslint-disable-line react-hooks/exhaustive-deps

  const faturas = dados?.faturas ?? []
  // Valor conta uma vez por despesa (uma despesa pode ter vários anexos).
  const total = Object.values(Object.fromEntries(faturas.map(f => [`${f.fonte}:${f.registo_id}`, Number(f.valor) || 0]))).reduce((a, b) => a + b, 0)
  const porEnviar = faturas.filter(f => !f.enviada_em).length

  async function exportar() {
    setExportando(true); setAviso(null)
    try {
      const r = await apiFetch(`/api/crm/contabilidade/export?${qs}`, { timeoutMs: 300_000 })
      if (!r.ok) {
        const txt = await r.text()
        let msg = `HTTP ${r.status}`
        try { msg = JSON.parse(txt).error || msg } catch { /* texto cru */ }
        throw new Error(msg)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'Faturas_Somnium.zip'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)

      const emFalta = Number(r.headers.get('X-Faturas-Em-Falta') || 0)
      if (emFalta) setAviso(`${emFalta} ficheiro(s) não foram incluídos no ZIP. Ver a coluna "Observações" no Resumo.xlsx.`)

      if (faturas.length && window.confirm('ZIP descarregado. Marcar estas faturas como enviadas à contabilidade?')) {
        const despesaIds = [...new Set(faturas.filter(f => f.fonte === 'despesa').map(f => f.registo_id))]
        const documentoIds = [...new Set(faturas.filter(f => f.fonte === 'projeto_documento').map(f => f.registo_id))]
        const m = await apiFetch('/api/crm/contabilidade/marcar-enviadas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ despesaIds, documentoIds }),
        })
        if (!m.ok) throw new Error('ZIP descarregado, mas falhou marcar como enviadas.')
        toast('Faturas marcadas como enviadas.', 'success')
        await carregar()
      }
    } catch (e) { toast(friendlyError(e.message), 'error') }
    setExportando(false)
  }

  return (
    <>
      {/* Período + exportação */}
      <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {PERIODOS_RAPIDOS.map(p => {
            const v = p.get()
            const activo = v.de === periodo.de && v.ate === periodo.ate
            return (
              <button key={p.label} onClick={() => setPeriodo(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${activo ? 'bg-ink text-surface border-ink' : 'bg-surface-raised text-ink-muted border-line hover:border-ink/30'}`}>
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            De (data da despesa)
            <input type="date" value={periodo.de} onChange={e => setPeriodo(p => ({ ...p, de: e.target.value }))}
              className="px-3 py-2 border border-line rounded-lg text-sm text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Até
            <input type="date" value={periodo.ate} onChange={e => setPeriodo(p => ({ ...p, ate: e.target.value }))}
              className="px-3 py-2 border border-line rounded-lg text-sm text-ink" />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted sm:pb-2">
            <input type="checkbox" checked={pendentes} onChange={e => setPendentes(e.target.checked)} />
            Só por enviar
          </label>
          <button onClick={exportar} disabled={exportando || loading || !faturas.length}
            className="sm:ml-auto flex items-center justify-center gap-2 px-4 py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-xl hover:brightness-95 disabled:opacity-50 transition">
            <Download className="w-4 h-4" />
            {exportando ? 'A preparar ZIP...' : `Exportar ZIP (${faturas.length})`}
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          Aparecem todas as faturas com PDF anexado em Despesas e Projectos. O ZIP inclui as faturas organizadas por mês
          e um Resumo.xlsx. Documentos de projecto do tipo "Fatura" usam a data de carregamento.
        </p>
      </div>

      {erro && <ErrorState compact title="Não foi possível carregar as faturas" error={erro} onRetry={carregar} />}
      {aviso && <div className="p-4 bg-warning/10 border border-warning/30 text-warning rounded-xl text-sm">{aviso}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <KPICard label="Faturas no período" value={String(faturas.length)} meta="—" status="green" trend="neutral" unit="" />
        <KPICard label="Total faturado"     value={EUR2(total)}            meta="—" status="green" trend="neutral" unit="" />
        <KPICard label="Por enviar"         value={String(porEnviar)}      meta="—" status={porEnviar ? 'yellow' : 'green'} trend="neutral" unit="" />
      </div>

      {/* Lista de faturas */}
      <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-ink mb-4">Faturas</h2>
        <ScrollableTable>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3">Data</th>
                <th className="text-left py-2 px-3">Descrição</th>
                <th className="text-left py-2 px-3">Projecto / Imóvel</th>
                <th className="text-left py-2 px-3">Origem</th>
                <th className="text-right py-2 px-3">Valor</th>
                <th className="text-left py-2 px-3">Ficheiro</th>
                <th className="text-left py-2 px-3">Enviada</th>
              </tr>
            </thead>
            <tbody>
              {faturas.map(f => (
                <tr key={f.id} className="border-b border-line">
                  <td className="py-2 px-3 text-xs text-ink-muted whitespace-nowrap">{f.data}</td>
                  <td className="py-2 px-3 font-medium text-ink">
                    {f.descricao}
                    {f.fornecedor && <span className="block text-xs text-ink-muted">{f.fornecedor}</span>}
                  </td>
                  <td className="py-2 px-3 text-xs text-ink-muted">{f.projeto || '—'}</td>
                  <td className="py-2 px-3 text-xs text-ink-muted whitespace-nowrap">{f.origem}</td>
                  <td className="py-2 px-3 text-right num whitespace-nowrap">{f.valor == null ? '—' : EUR2(f.valor)}</td>
                  <td className="py-2 px-3 text-xs">
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink hover:underline max-w-[220px] truncate">
                      <FileText className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{f.ficheiro}</span>
                    </a>
                  </td>
                  <td className="py-2 px-3 text-xs whitespace-nowrap">
                    {f.enviada_em
                      ? <span className="px-2 py-0.5 rounded-full bg-success/15 text-success">{String(f.enviada_em).slice(0, 10)}</span>
                      : <span className="px-2 py-0.5 rounded-full bg-surface-muted text-ink-muted">Por enviar</span>}
                  </td>
                </tr>
              ))}
              {!faturas.length && (
                <tr><td colSpan={7} className="py-8 text-center text-ink-muted text-xs">
                  {loading ? 'A carregar faturas...' : 'Sem faturas com PDF anexado neste período'}
                </td></tr>
              )}
            </tbody>
          </table>
        </ScrollableTable>
      </div>
    </>
  )
}

function ContaCorrenteTab({ conta }) {
  if (!conta) return <div className="text-center text-ink-muted py-12 text-sm">A carregar conta corrente...</div>

  const movimentos = conta.movimentos ?? []
  const saldo = conta.saldo ?? 0
  const totalEntradas = movimentos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const totalSaidas = movimentos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)

  return (
    <>
      {/* Saldo actual */}
      <div className="bg-surface-raised  rounded-xl border border-line  p-6 shadow-xs">
        <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Saldo Conta Somnium Properties</span>
        <span className={`text-3xl font-bold ${saldo >= 0 ? 'text-success' : 'text-danger'}`}>{EUR(saldo)}</span>
        {conta?.dataInicio && <span className="text-xs text-ink-muted block mt-1">desde {conta.dataInicio}</span>}
        <div className="flex gap-6 mt-3">
          <div>
            <span className="text-xs text-ink-muted block">Total entradas</span>
            <span className="text-sm num font-semibold text-success">{EUR(totalEntradas)}</span>
          </div>
          <div>
            <span className="text-xs text-ink-muted block">Total saídas</span>
            <span className="text-sm num font-semibold text-danger">{EUR(totalSaidas)}</span>
          </div>
          <div>
            <span className="text-xs text-ink-muted block">Movimentos</span>
            <span className="text-sm font-semibold text-ink">{movimentos.length}</span>
          </div>
        </div>
      </div>

      {/* Extrato */}
      <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-ink mb-4">Extrato</h2>
        {movimentos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
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
                  <tr key={i} className="border-b border-line hover:bg-surface">
                    <td className="py-2 px-3 text-xs text-ink-muted whitespace-nowrap">{m.data}</td>
                    <td className="py-2 px-3 font-medium text-ink">
                      {m.descricao}
                      {m.projetado && <span className="ml-2 text-[10px] text-ink-muted font-normal">(auto)</span>}
                    </td>
                    <td className="py-2 px-3 text-xs text-ink-muted">{m.categoria || '—'}</td>
                    <td className="py-2 px-3 text-right num text-success">
                      {m.tipo === 'entrada' ? EUR(m.valor) : ''}
                    </td>
                    <td className="py-2 px-3 text-right num text-danger">
                      {m.tipo === 'saida' ? EUR(m.valor) : ''}
                    </td>
                    <td className={`py-2 px-3 text-right num font-semibold ${m.saldo >= 0 ? 'text-ink' : 'text-danger'}`}>
                      {EUR(m.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-muted text-center py-8">Sem movimentos registados</p>
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
      <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-ink mb-3">Pagamentos</h2>
        <p className="text-xs text-ink-muted text-center py-6">Sem pagamentos pendentes</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-ink">Pagamentos por Negócio</h2>

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
          <div key={n.id} className={`bg-surface-raised rounded-xl border shadow-sm overflow-hidden ${temAtrasado ? 'border-danger/30' : 'border-line'}`}>
            {/* Card header — always visible */}
            <button onClick={() => toggleDeal(n.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left">
              {isOpen ? <ChevronUp className="w-4 h-4 text-ink-muted shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink truncate">{n.movimento}</span>
                  <CatBadge cat={n.categoria} />
                  {n.fase && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${FASE_COLOR[n.fase] ?? 'bg-surface-muted text-ink-muted'}`}>{n.fase}</span>}
                  {temAtrasado && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-danger/15 text-danger">ATRASADO</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 max-w-[200px] bg-surface-muted rounded-full h-2">
                    <div className={`h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] ${pct === 100 ? 'bg-success' : temAtrasado ? 'bg-red-400' : 'bg-yellow-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-ink-muted">{received.length}/{pags.length} tranches</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm num font-semibold text-ink">{EUR(recVal)} <span className="text-ink-muted font-normal">/ {EUR(totalVal)}</span></p>
                {nextPending?.data && <p className="text-[10px] text-ink-muted mt-0.5">Próx: {nextPending.data}</p>}
              </div>
            </button>

            {/* Expanded — tranche list */}
            {isOpen && (
              <div className="border-t border-line px-4 py-3 bg-surface space-y-1.5">
                {pags.map((p, idx) => {
                  const atrasado = !p.recebido && p.data && new Date(p.data) < new Date()
                  return (
                    <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                      p.recebido ? 'bg-success/10 border-success/30' :
                      atrasado ? 'bg-danger/10 border-danger/30' :
                      'bg-warning/10 border-warning/30'
                    }`}>
                      {p.recebido
                        ? <Check className="w-4 h-4 text-success shrink-0" />
                        : <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${atrasado ? 'border-red-400' : 'border-yellow-400'}`} />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-ink">{p.descricao || 'Pagamento'}</p>
                        <p className="text-[10px] text-ink-muted">{p.data || 'Sem data'} {atrasado && <span className="text-danger font-medium">— ATRASADO</span>}</p>
                      </div>
                      <span className={`text-xs num font-semibold shrink-0 ${p.recebido ? 'text-success' : atrasado ? 'text-danger' : 'text-warning'}`}>{EUR(p.valor)}</span>
                      {!p.recebido && (
                        <button
                          onClick={() => confirmarPagamento(n.id, idx, `${n.movimento} — ${p.descricao || 'Pagamento'} (${EUR(p.valor)})`)}
                          className="px-2.5 py-1.5 text-[10px] font-medium bg-success text-white rounded-md hover:bg-green-700 transition-colors shrink-0"
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
        <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
          <h3 className="text-xs text-ink-muted uppercase tracking-wide mb-3">Negócios sem tranches definidas</h3>
          <NegociosTable rows={semTranches} emptyMsg="" />
        </div>
      )}
    </div>
  )
}

// RENTABILIDADE TAB
// ══════════════════════════════════════════════════════════════
function RentabilidadeTab({ rent }) {
  const C = useChartColors()
  if (!rent) return <div className="text-center text-ink-muted py-12 text-sm">A carregar rentabilidade...</div>

  return (
    <>
      {/* KPIs de topo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
          <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Ciclo Médio</span>
          <span className="text-2xl font-bold text-ink">{rent.cicloMedio != null ? `${rent.cicloMedio} dias` : '—'}</span>
          <span className="text-xs text-ink-muted block mt-1">Adicionado → Proposta aceite ({rent.cicloCount} imóveis)</span>
        </div>
        <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
          <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Faturação Total</span>
          <span className="text-2xl font-bold text-success">{EUR(rent.totalPipeline)}</span>
        </div>
        <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
          <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Concentração de Risco</span>
          <span className={`text-2xl font-bold ${rent.concentracao > 60 ? 'text-danger' : rent.concentracao > 40 ? 'text-warning' : 'text-success'}`}>
            {rent.concentracao}%
          </span>
          <span className="text-xs text-ink-muted block mt-1 truncate">{rent.topDeal || '—'}</span>
        </div>
        <div className="bg-surface-raised  rounded-xl border border-line  p-4 shadow-xs">
          <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1">Modelos Ativos</span>
          <span className="text-2xl font-bold text-ink">{rent.modelos?.length ?? 0}</span>
        </div>
      </div>

      {/* Margem por Modelo */}
      <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-ink mb-4">Margem por Modelo de Negócio</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          {(rent.modelos || []).map(m => (
            <div key={m.modelo} className="rounded-lg p-4 border border-line" style={{ borderLeftColor: CAT_COLORS[m.modelo] ?? '#475569', borderLeftWidth: '4px' }}>
              <p className="text-xs text-ink-muted font-medium">{m.modelo}</p>
              <p className="text-xl font-bold text-ink mt-1">{EUR(m.lucroEst)}</p>
              <div className="flex justify-between text-xs text-ink-muted mt-1">
                <span>{m.count} deal{m.count !== 1 ? 's' : ''}</span>
                <span>Média: {EUR(m.mediaEst)}</span>
              </div>
              {m.lucroReal > 0 && <p className="text-xs text-success num mt-1">Real: {EUR(m.lucroReal)}</p>}
            </div>
          ))}
        </div>
        {(rent.modelos || []).length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rent.modelos} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="modelo" tick={{ fontSize: 10, fill: C.axis }} />
              <YAxis tick={{ fontSize: 10, fill: C.axis }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip {...tooltipProps(C)} formatter={v => EUR(v)} />
              <Bar dataKey="lucroEst" name="Estimado" radius={[3,3,0,0]}>
                {rent.modelos.map((m, i) => <Cell key={i} fill={CAT_COLORS[m.modelo] ?? CAT_COLORS_LIST[i % CAT_COLORS_LIST.length]} />)}
              </Bar>
              <Bar dataKey="lucroReal" name="Real" fill={C.success} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Rentabilidade por Consultor */}
      {(rent.consultores || []).length > 0 && (
        <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-ink mb-3">Rentabilidade por Consultor</h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3">Consultor</th>
                <th className="text-right py-2 px-3">Deals</th>
                <th className="text-right py-2 px-3">Faturação Estimada</th>
                <th className="text-right py-2 px-3">Faturação Real</th>
                <th className="text-right py-2 px-3">Média / Deal</th>
              </tr>
            </thead>
            <tbody>
              {rent.consultores.map(c => (
                <tr key={c.nome} className="border-b border-line hover:bg-surface">
                  <td className="py-2 px-3 font-medium text-ink">{c.nome}</td>
                  <td className="py-2 px-3 text-right text-ink-muted">{c.count}</td>
                  <td className="py-2 px-3 text-right num text-ink font-semibold">{EUR(c.lucroEst)}</td>
                  <td className="py-2 px-3 text-right num text-success">{c.lucroReal > 0 ? EUR(c.lucroReal) : '—'}</td>
                  <td className="py-2 px-3 text-right num text-ink-muted">{EUR(c.mediaEst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ROI por Investidor */}
      {(rent.investidores || []).length > 0 && (
        <div className="bg-surface-raised  rounded-xl border border-line  p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-ink mb-3">ROI por Investidor</h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-3">Investidor</th>
                <th className="text-right py-2 px-3">Negócios</th>
                <th className="text-right py-2 px-3">Faturação Estimada</th>
                <th className="text-right py-2 px-3">Faturação Real</th>
                <th className="text-right py-2 px-3">Capital Investido</th>
                <th className="text-right py-2 px-3">ROI</th>
              </tr>
            </thead>
            <tbody>
              {rent.investidores.map(inv => (
                <tr key={inv.nome} className="border-b border-line hover:bg-surface">
                  <td className="py-2 px-3 font-medium text-ink">{inv.nome}</td>
                  <td className="py-2 px-3 text-right text-ink-muted">{inv.count}</td>
                  <td className="py-2 px-3 text-right num text-ink font-semibold">{EUR(inv.lucroEst)}</td>
                  <td className="py-2 px-3 text-right num text-success">{inv.lucroReal > 0 ? EUR(inv.lucroReal) : '—'}</td>
                  <td className="py-2 px-3 text-right num text-ink-muted">{inv.capitalInvestido > 0 ? EUR(inv.capitalInvestido) : '—'}</td>
                  <td className="py-2 px-3 text-right num text-ink-muted">
                    {(inv.roiReal ?? inv.roiEst) != null ? `${(inv.roiReal ?? inv.roiEst).toFixed(1)}%` : '—'}
                  </td>
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
  const color = CAT_COLORS[cat] ?? '#475569'
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
        <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
          <th className="text-left py-2 px-3">Negócio</th>
          <th className="text-left py-2 px-3">Categoria</th>
          <th className="text-left py-2 px-3">Fase</th>
          <th className="text-right py-2 px-3">Faturação Estimada</th>
          <th className="text-left py-2 px-3">Data Estimada</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(n => (
          <tr key={n.id} className="border-b border-line hover:bg-surface">
            <td className="py-2 px-3 font-medium text-ink">{n.movimento}</td>
            <td className="py-2 px-3"><CatBadge cat={n.categoria} /></td>
            <td className="py-2 px-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FASE_COLOR[n.fase] ?? 'bg-surface-muted text-ink-muted'}`}>
                {n.fase ?? '—'}
              </span>
            </td>
            <td className="py-2 px-3 text-right num font-bold text-ink">{EUR(n.lucroEstimado)}</td>
            <td className="py-2 px-3 text-ink-muted text-xs">{n.dataEstimada ?? n.dataVenda ?? '—'}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr><td colSpan={5} className="py-8 text-center text-ink-muted text-xs">{emptyMsg}</td></tr>
        )}
      </tbody>
    </table>
  )
}

function EmptyState() {
  return <p className="text-xs text-ink-muted text-center py-10">Sem dados suficientes</p>
}

// ── Despesa Form ─────────────────────────────────────────────
const DESP_CATEGORIAS = ['Salários', 'Operação', 'Marketing', 'Ferramentas', 'Legal', 'Contabilidade', 'Escritório', 'Formação', 'Viatura', 'Seguros', 'Telecomunicações', 'Subscrição Skool', 'Material Somnium', 'Outro']
const DESP_TIMING = ['Mensalmente', 'Anual', 'Único']

function DespesaForm({ item, onSave, onCancel, onReload }) {
  const toast = useToast()
  const isNew = !item.id
  // Normalizar campos camelCase → snake_case (endpoint financeiro vs CRM)
  const normalized = { ...item }
  if (normalized.custoMensal !== undefined && normalized.custo_mensal === undefined) normalized.custo_mensal = normalized.custoMensal
  if (normalized.custoAnual !== undefined && normalized.custo_anual === undefined) normalized.custo_anual = normalized.custoAnual
  // Rateio: serializado como JSON string na BD, objecto em memória.
  let rateioInicial = null
  try {
    const raw = normalized.rateio
    if (raw) rateioInicial = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch { rateioInicial = null }
  const [f, setF] = useState({
    movimento: '', categoria: '', timing: 'Mensalmente', custo_mensal: '', custo_anual: '', data: '', notas: '',
    regiao: 'Coimbra',
    ...normalized,
  })
  const [modoAtribuicao, setModoAtribuicao] = useState(rateioInicial ? 'partilhada' : 'unica')
  // Para partilhada, mantemos % Coimbra (0-100); AMP é o complemento.
  const [percCoimbra, setPercCoimbra] = useState(() => {
    if (rateioInicial && rateioInicial.Coimbra != null) return Math.round(rateioInicial.Coimbra * 100)
    return 50
  })
  const [docs, setDocs] = useState(() => {
    try { return item.documentos ? JSON.parse(item.documentos) : [] } catch { return [] }
  })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inputClass = "w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"

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
    } catch (err) { toast(friendlyError(err.message || 'Não foi possível enviar o ficheiro.'), 'error') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleDeleteDoc(docId) {
    try {
      const r = await apiFetch(`/api/crm/despesas/${item.id}/upload/${docId}`, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setDocs(d.documentos)
    } catch (err) { toast(friendlyError(err.message || 'Não foi possível remover o documento.'), 'error') }
  }

  return (
    <div className="bg-surface-raised rounded-xl border border-line p-4 sm:p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink mb-4">{isNew ? 'Nova Despesa' : 'Editar Despesa'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <div className="sm:col-span-2 xl:col-span-1">
          <label className="text-xs text-ink-muted block mb-1">Descrição *</label>
          <input value={f.movimento} onChange={e => set('movimento', e.target.value)} className={inputClass} placeholder="Ex: ChatGPT Plus, Contabilista..." />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Categoria</label>
          <select value={f.categoria} onChange={e => set('categoria', e.target.value)} className={inputClass}>
            <option value="">—</option>
            {DESP_CATEGORIAS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Periodicidade</label>
          <select value={f.timing} onChange={e => set('timing', e.target.value)} className={inputClass}>
            {DESP_TIMING.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">
            {f.timing === 'Anual' ? 'Valor Anual (€)' : f.timing === 'Mensalmente' ? 'Valor Mensal (€)' : 'Valor (€)'}
          </label>
          <input type="number" step="0.01"
            value={f.timing === 'Anual' ? f.custo_anual : f.custo_mensal}
            onChange={e => {
              const v = parseFloat(e.target.value) || 0
              if (f.timing === 'Anual') {
                setF(p => ({ ...p, custo_anual: v, custo_mensal: 0 }))
              } else if (f.timing === 'Mensalmente') {
                setF(p => ({ ...p, custo_mensal: v, custo_anual: Math.round(v * 12 * 100) / 100 }))
              } else {
                setF(p => ({ ...p, custo_mensal: v, custo_anual: 0 }))
              }
            }}
            className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">
            {f.timing === 'Mensalmente' ? 'Projecção Anual' : f.timing === 'Anual' ? 'Custo Mensal Equivalente' : '—'}
          </label>
          <div className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-sm num text-ink-muted">
            {f.timing === 'Mensalmente' && EUR((parseFloat(f.custo_mensal) || 0) * 12)}
            {f.timing === 'Anual' && EUR((parseFloat(f.custo_anual) || 0) / 12)}
            {!['Mensalmente', 'Anual'].includes(f.timing) && '—'}
          </div>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Data</label>
          <input type="date" value={f.data} onChange={e => set('data', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2 xl:col-span-3">
          <label className="text-xs text-ink-muted block mb-1">Notas</label>
          <textarea value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} rows={2} className={inputClass} />
        </div>
        <div className="sm:col-span-2 xl:col-span-3 mt-2 pt-3 border-t border-line">
          <label className="text-xs text-ink-muted block mb-2 font-semibold uppercase tracking-wide">Atribuição Regional</label>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" onClick={() => setModoAtribuicao('unica')}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${modoAtribuicao === 'unica' ? 'bg-accent/15 border-accent text-ink font-semibold' : 'bg-surface-raised border-line text-ink-muted hover:bg-surface'}`}>
              Região única
            </button>
            <button type="button" onClick={() => setModoAtribuicao('partilhada')}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${modoAtribuicao === 'partilhada' ? 'bg-accent/15 border-accent text-ink font-semibold' : 'bg-surface-raised border-line text-ink-muted hover:bg-surface'}`}>
              Partilhada (rateio %)
            </button>
          </div>
          {modoAtribuicao === 'unica' ? (
            <div className="max-w-xs">
              <select value={f.regiao || 'Coimbra'} onChange={e => set('regiao', e.target.value)} className={inputClass}>
                {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="text-xs text-ink-muted mt-1">Custo é atribuído 100% a esta região no P&L.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-lg p-3 max-w-md">
              <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                <span>Coimbra: <strong className="text-ink">{percCoimbra}%</strong></span>
                <span>AMP: <strong className="text-ink">{100 - percCoimbra}%</strong></span>
              </div>
              <input type="range" min="0" max="100" step="5" value={percCoimbra}
                onChange={e => setPercCoimbra(parseInt(e.target.value))}
                className="w-full accent-red-500" />
              <p className="text-xs text-ink-muted mt-2">Custo será dividido entre regiões no P&L. Ex: software CRM partilhado pelas duas equipas.</p>
            </div>
          )}
        </div>
      </div>

      {item.id && (
        <div className="mt-5 pt-4 border-t border-line">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Documentos / Faturas</h4>
            <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-surface-muted text-ink-muted' : 'bg-surface-muted text-ink hover:bg-surface-muted'}`}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'A enviar...' : 'Anexar ficheiro'}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
          </div>
          {docs.length > 0 ? (
            <div className="flex flex-col gap-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-surface rounded-lg border border-line">
                  {doc.type?.startsWith('image') ? <Image className="w-4 h-4 text-ink-muted shrink-0" /> : <FileText className="w-4 h-4 text-danger shrink-0" />}
                  <a href={doc.path} target="_blank" rel="noreferrer" className="flex-1 text-sm text-ink hover:text-ink hover:underline truncate">{doc.name}</a>
                  <span className="text-xs text-ink-muted shrink-0">{(doc.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => handleDeleteDoc(doc.id)} className="text-ink-muted/70 hover:text-danger transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted py-3 text-center">Sem documentos anexados.</p>
          )}
        </div>
      )}
      {isNew && (
        <p className="mt-4 text-xs text-ink-muted">Guarda a despesa primeiro para poderes anexar documentos.</p>
      )}

      <div className="flex gap-3 mt-4">
        <button onClick={() => {
          // Serializar rateio antes de submeter. Em modo "partilhada", `regiao`
          // perde sentido — limpamos para evitar confusão no relatório.
          const payload = { ...f }
          if (modoAtribuicao === 'partilhada') {
            const cb = Math.max(0, Math.min(100, percCoimbra)) / 100
            payload.rateio = JSON.stringify({ Coimbra: cb, AMP: 1 - cb })
            payload.regiao = null
          } else {
            payload.rateio = null
          }
          onSave(payload)
        }} disabled={!f.movimento?.trim()} className="px-5 py-2 bg-accent text-accent-foreground text-sm font-medium rounded-xl hover:brightness-[1.04] disabled:opacity-40">
          {isNew ? 'Criar' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="px-5 py-2 bg-surface-muted text-ink-muted text-sm font-medium rounded-xl hover:bg-line">Cancelar</button>
      </div>
    </div>
  )
}

