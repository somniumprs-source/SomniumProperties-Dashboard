import { useState, useEffect } from 'react'
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Header } from '../components/layout/Header.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const PCT = v => v == null ? '—' : `${Number(v).toFixed(1)}%`
const DAYS = v => v == null ? '—' : `${Number(v).toFixed(0)}d`
const NUM = v => v == null ? '—' : String(v)

const GOLD = '#C9A84C'
const TABS = [
  { id: 'resumo',       label: 'Visão Geral' },
  { id: 'pipeline1',    label: 'Pipeline Imóveis' },
  { id: 'pipeline2',    label: 'Negócios / Equipa' },
  { id: 'pipeline3',    label: 'Investidores' },
  { id: 'transversal',  label: 'Transversal' },
]

const FUNNEL_COLORS_P1 = ['#94a3b8', '#60a5fa', '#818cf8', '#f59e0b', '#22c55e']
const FUNNEL_COLORS_P3 = ['#94a3b8', '#60a5fa', '#818cf8', '#f59e0b', '#22c55e']
const CAT_COLORS = {
  'Wholesalling': '#6366f1', 'CAEP': '#f59e0b',
  'Fix and Flip': '#ef4444', 'Mediação Imobiliária': '#10b981',
}

// ── Metric card ──────────────────────────────────────────────────────────────
function M({ label, value, sub, highlight = false, warn = false }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${
      highlight ? 'border-yellow-300 bg-yellow-50' :
      warn      ? 'border-red-200 bg-red-50' :
                  'border-gray-200 bg-white'
    }`}>
      <span className="text-[11px] text-gray-400 uppercase tracking-wide leading-tight">{label}</span>
      <span className={`text-xl font-bold ${
        highlight ? 'text-yellow-700' : warn ? 'text-red-600' : 'text-gray-900'
      }`}>{value}</span>
      {sub && <span className="text-xs text-gray-400 leading-tight">{sub}</span>}
    </div>
  )
}

// ── Funil visual ─────────────────────────────────────────────────────────────
function Funil({ steps, colors }) {
  if (!steps?.length) return <EmptyState />
  const max = steps[0]?.value || 1
  return (
    <div className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const pct = Math.max(Math.round(s.value / max * 100), 4)
        const conv = i > 0 && steps[i-1].value > 0
          ? ` (${Math.round(s.value / steps[i-1].value * 100)}% do anterior)`
          : ''
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-44 text-right shrink-0 leading-tight">{s.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
              <div className="h-full rounded-full flex items-center px-3 transition-all"
                style={{ width: `${pct}%`, backgroundColor: colors[i] ?? '#6366f1' }}>
                <span className="text-white text-xs font-bold">{s.value}</span>
              </div>
            </div>
            <span className="text-xs text-gray-400 w-28 shrink-0">{conv}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px flex-1 bg-gray-100" />
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{children}</span>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  )
}

function EmptyState() {
  return <p className="text-xs text-gray-400 text-center py-8">Sem dados suficientes — preenche os campos no Notion</p>
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function Metricas() {
  const [tab, setTab]       = useState('resumo')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/metricas')
      if (!r.ok) throw new Error('Erro no servidor')
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const top  = data?.top
  const p1   = data?.pipeline1
  const p2   = data?.pipeline2
  const p3   = data?.pipeline3
  const tr   = data?.transversal

  return (
    <>
      <Header title="Métricas" subtitle="Framework Wholesaling · Fix & Flip · Capital Passivo"
        onRefresh={load} loading={loading} />

      {/* Tab bar */}
      <div className="px-6 pt-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'text-yellow-700 border-b-2'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={tab === t.id ? { borderColor: GOLD, backgroundColor: '#fefce8' } : {}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* ══════════ VISÃO GERAL ══════════ */}
        {tab === 'resumo' && (
          <>
            {/* Top 4 KPIs transversais */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Receita prevista / mês"  value={EUR(top?.receitaPrevistaMes)}
                sub="Lucro estimado negócios activos" highlight />
              <M label="Deals fechados no mês"   value={NUM(top?.dealsFechadosMes)}
                sub={`de ${p2?.totalDeals ?? '—'} negócios totais`} />
              <M label="Capital passivo captado" value={EUR(top?.capitalPassivoCaptado)}
                sub={`${p3?.investidoresAtivos ?? '—'} investidores activos`} />
              <M label="Velocidade média do ciclo" value={DAYS(top?.velocidadeMediaCiclo)}
                sub="1.ª abordagem → proposta aceite" />
            </div>

            {/* Pipeline summary boxes */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {/* Pipeline 1 summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline 1 — Imóveis</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Leads no pipeline"     value={NUM(p1?.funil?.[0]?.value)} />
                  <Row label="Taxa lead → contrato"  value={PCT(p1?.taxaConversao)} />
                  <Row label="Spread médio negociação" value={p1?.spreadMedio != null ? PCT(p1.spreadMedio) : '—'} />
                  <Row label="Desconto s/ mercado (CAEP)" value={p1?.descontoMercado != null ? PCT(p1.descontoMercado) : '—'} />
                  <Row label="Em due diligence"      value={NUM(p1?.nDueDiligence)} />
                  <Row label="Taxa de descarte"      value={PCT(p1?.taxaDescarte)} />
                </div>
                <button onClick={() => setTab('pipeline1')}
                  className="mt-4 text-xs font-medium" style={{ color: GOLD }}>
                  Ver detalhes →
                </button>
              </div>

              {/* Pipeline 2 summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline 2 — Negócios</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Total negócios"         value={NUM(p2?.totalDeals)} />
                  <Row label="Fechados (Vendidos)"     value={NUM(p2?.dealsFechados)} />
                  <Row label="Taxa de realização"      value={PCT(p2?.taxaRealizacao)} />
                  <Row label="Margem média Wholesaling" value={EUR(p2?.margemWholesaling)} />
                  <Row label="Margem média Fix & Flip"  value={EUR(p2?.margemFF)} />
                  <Row label="% c/ capital passivo"    value={PCT(p2?.pctDealsCapitalPassivo)} />
                </div>
                <button onClick={() => setTab('pipeline2')}
                  className="mt-4 text-xs font-medium" style={{ color: GOLD }}>
                  Ver detalhes →
                </button>
              </div>

              {/* Pipeline 3 summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline 3 — Investidores</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Capital captado"         value={EUR(p3?.capitalCaptado)} />
                  <Row label="Investidores activos"    value={NUM(p3?.investidoresAtivos)} />
                  <Row label="Ticket médio"            value={EUR(p3?.ticketMedio)} />
                  <Row label="Taxa de conversão"       value={PCT(p3?.taxaConversao)} />
                  <Row label="Taxa de retenção"        value={p3?.taxaRetencao != null ? PCT(p3.taxaRetencao) : '—'} />
                  <Row label="ROI entregue"            value={p3?.roiEntregue != null ? PCT(p3.roiEntregue) : '—'} />
                </div>
                <button onClick={() => setTab('pipeline3')}
                  className="mt-4 text-xs font-medium" style={{ color: GOLD }}>
                  Ver detalhes →
                </button>
              </div>
            </div>

            {/* Transversal bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Métricas Transversais</h3>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <M label="Deal Flow / Capital"
                  value={tr?.ratioDealFlowCapital != null ? `${tr.ratioDealFlowCapital}×` : '—'}
                  sub="Pipeline value / capital disponível"
                  warn={tr?.ratioDealFlowCapital != null && tr.ratioDealFlowCapital < 1} />
                <M label="Ciclo completo médio"
                  value={DAYS(tr?.velocidadeCicloCompleto)}
                  sub="Lead adicionado → escritura" />
                <M label="ROE (capital passivo)"
                  value={tr?.roe != null ? PCT(tr.roe) : '—'}
                  sub="Lucro entregue / capital captado" />
                <M label="% projecções cumpridas"
                  value={tr?.cumpreProjeccao != null ? PCT(tr.cumpreProjeccao) : '—'}
                  sub="Lucro real ≥ 80% do estimado" />
              </div>
            </div>
          </>
        )}

        {/* ══════════ PIPELINE 1 — IMÓVEIS ══════════ */}
        {tab === 'pipeline1' && (
          <>
            <SectionTitle>Funil de Aquisição de Ativos</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <Funil steps={p1?.funil} colors={FUNNEL_COLORS_P1} />
            </div>

            <SectionTitle>Métricas de Conversão & Negociação</SectionTitle>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Taxa lead → contrato"           value={PCT(p1?.taxaConversao)}
                sub="Deals assinados / leads totais" />
              <M label="Spread médio negociação"        value={p1?.spreadMedio != null ? PCT(p1.spreadMedio) : '—'}
                sub="(Ask - Proposta) / Ask" />
              <M label="Desconto s/ mercado (CAEP)"     value={p1?.descontoMercado != null ? PCT(p1.descontoMercado) : '—'}
                sub="(VVR - Proposta) / VVR" />
              <M label="Tempo médio negociação"         value={DAYS(p1?.tempoMedioNegociacao)}
                sub="1.ª chamada → proposta aceite" />
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Taxa de descarte"               value={PCT(p1?.taxaDescarte)}
                sub={`${p1?.funil?.[0]?.value ?? 0} leads, ${p2?.totalDeals ?? 0} contratos`} />
              <M label="% F&F abaixo limiar rent."      value={p1?.abaixoLimiarFF != null ? PCT(p1.abaixoLimiarFF) : '—'}
                sub="ROI calculado < 15%" warn={p1?.abaixoLimiarFF > 40} />
              <M label="Em due diligence agora"         value={NUM(p1?.nDueDiligence)}
                sub="Estado: Estudo de VVR" />
              <M label="Leads este mês"                 value={NUM(p1?.imoveisDoMes)}
                sub="Adicionados no mês actual" />
            </div>

            <SectionTitle>Motivos de Descarte</SectionTitle>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                {p1?.motivosDescarte?.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {p1.motivosDescarte.map(m => (
                      <div key={m.motivo} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{m.motivo}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-32 bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-red-400"
                              style={{ width: `${Math.round(m.count / (p1.motivosDescarte[0]?.count || 1) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-mono text-gray-500 w-6 text-right">{m.count}</span>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-amber-600 mt-2">
                      ⚠ Preenche o campo "Motivo Descarte" no Notion para enriquecer esta análise
                    </p>
                  </div>
                ) : (
                  <div>
                    <EmptyState />
                    <p className="text-xs text-center text-amber-600">
                      Adiciona "Motivo Descarte" aos imóveis descartados no Notion
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Taxa de Descarte por Origem</h3>
                {p1?.descarteOrigem?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                          <th className="text-left py-1.5 px-2">Origem</th>
                          <th className="text-right py-1.5 px-2">Total</th>
                          <th className="text-right py-1.5 px-2">Descartados</th>
                          <th className="text-right py-1.5 px-2">Taxa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p1.descarteOrigem.map(d => (
                          <tr key={d.origem} className="border-b border-gray-50">
                            <td className="py-1.5 px-2 text-gray-700">{d.origem}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-xs">{d.total}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-xs text-red-500">{d.descartados}</td>
                            <td className={`py-1.5 px-2 text-right font-mono text-xs font-semibold ${
                              d.taxaDescarte > 80 ? 'text-red-600' : d.taxaDescarte > 60 ? 'text-amber-600' : 'text-gray-600'
                            }`}>{PCT(d.taxaDescarte)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyState />}
              </div>
            </div>

            <SectionTitle>Modelo de Negócio — Distribuição</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              {p1?.modeloNegocio?.length > 0 ? (
                <div className="flex gap-6 flex-wrap">
                  {p1.modeloNegocio.map(m => (
                    <div key={m.modelo} className="flex flex-col items-center gap-1">
                      <span className="text-3xl font-bold text-gray-900">{m.count}</span>
                      <span className="text-xs text-gray-500">{m.modelo}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <EmptyState />
                  <p className="text-xs text-center text-amber-600">
                    Preenche "Modelo de Negócio" nos imóveis activos no Notion
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════ PIPELINE 2 — NEGÓCIOS / EQUIPA ══════════ */}
        {tab === 'pipeline2' && (
          <>
            <SectionTitle>Performance dos Negócios</SectionTitle>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Deals fechados / mês"     value={NUM(p2?.dealsFechadosMes)}
                sub="Negócios com Fase = Vendido este mês" />
              <M label="Receita gerada / mês"     value={EUR(p2?.receitaMes)}
                sub="Lucro estimado dos fechados" highlight />
              <M label="Taxa de realização"        value={PCT(p2?.taxaRealizacao)}
                sub="Fechados / total negócios" />
              <M label="Holding médio (F&F)"      value={DAYS(p2?.holdingMedio)}
                sub="Compra → venda (em dias)" />
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Margem média Wholesaling"  value={EUR(p2?.margemWholesaling)}
                sub="Lucro real médio por deal" />
              <M label="Margem média Fix & Flip"   value={EUR(p2?.margemFF)}
                sub="Lucro real médio CAEP/F&F" />
              <M label="% deals c/ capital passivo" value={PCT(p2?.pctDealsCapitalPassivo)}
                sub="Com investidor associado" />
              <M label="Total negócios registados" value={NUM(p2?.totalDeals)} />
            </div>

            <SectionTitle>Resultados por Categoria</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              {p2?.dealsPorCategoria?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left py-2 px-3">Categoria</th>
                        <th className="text-right py-2 px-3">Negócios</th>
                        <th className="text-right py-2 px-3">Fechados</th>
                        <th className="text-right py-2 px-3">Lucro Est. Total</th>
                        <th className="text-right py-2 px-3">Lucro Real Total</th>
                        <th className="text-right py-2 px-3">Margem Média</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p2.dealsPorCategoria.map(c => (
                        <tr key={c.categoria} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: (CAT_COLORS[c.categoria] ?? '#6366f1') + '22', color: CAT_COLORS[c.categoria] ?? '#6366f1' }}>
                              {c.categoria}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{c.count}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-green-600">{c.fechados}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-indigo-600">{EUR(c.lucroEst)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-green-700">{c.lucroReal > 0 ? EUR(c.lucroReal) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{c.lucroMedio ? EUR(c.lucroMedio) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState />}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              <strong>Métricas de consultores individuais</strong> — a base de dados de consultores usa múltiplas fontes
              e não é acessível via API. Para medir KPIs por consultor (deals/mês, receita individual, taxa de conversão),
              associa o campo <strong>Consultor</strong> em cada registo de Faturação.
            </div>
          </>
        )}

        {/* ══════════ PIPELINE 3 — INVESTIDORES ══════════ */}
        {tab === 'pipeline3' && (
          <>
            <SectionTitle>Funil de Captação de Capital Passivo</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <Funil steps={p3?.funil} colors={FUNNEL_COLORS_P3} />
            </div>

            <SectionTitle>Métricas de Capital</SectionTitle>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Capital total captado"     value={EUR(p3?.capitalCaptado)}
                sub="Soma do montante investido" highlight />
              <M label="Investidores activos"      value={NUM(p3?.investidoresAtivos)}
                sub="Status: Em Parceria" />
              <M label="Ticket médio"              value={EUR(p3?.ticketMedio)}
                sub="Capital médio por investidor activo" />
              <M label="Capital disponível"        value={EUR(p3?.capitalDisponivel)}
                sub="Capital máx. dos investidores activos" />
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Capital alocado"           value={EUR(p3?.capitalAlocado)}
                sub="Deals activos (Wholesaling/F&F)" />
              <M label="Alocação / disponível"
                value={p3?.ratioCaptacaoAlocacao != null ? PCT(p3.ratioCaptacaoAlocacao) : '—'}
                sub="% capital actualmente alocado"
                warn={p3?.ratioCaptacaoAlocacao > 90} />
              <M label="Investidores em pipeline"  value={NUM(p3?.investEmPipeline)}
                sub="Potencial → Classificado" />
              <M label="Tempo médio captação"      value={DAYS(p3?.tempoMedioCaptacao)}
                sub="1.º contacto → capital transferido" />
            </div>

            <SectionTitle>Métricas de Conversão & Retenção</SectionTitle>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Taxa de conversão"         value={PCT(p3?.taxaConversao)}
                sub="Prospetados → Em Parceria" />
              <M label="Taxa de retenção"
                value={p3?.taxaRetencao != null ? PCT(p3.taxaRetencao) : '—'}
                sub="Com >1 negócio / activos"
                highlight={p3?.taxaRetencao > 50} />
              <M label="ROI entregue"
                value={p3?.roiEntregue != null ? PCT(p3.roiEntregue) : '—'}
                sub="Lucro real / capital captado" />
              <M label="Tempo médio captação"      value={DAYS(p3?.tempoMedioCaptacao)}
                sub="Preenche 'Data Capital Transferido' no Notion" />
            </div>

            {p3?.ltvTop5?.length > 0 && (
              <>
                <SectionTitle>LTV — Top 5 Investidores</SectionTitle>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                          <th className="text-left py-2 px-3">Investidor</th>
                          <th className="text-left py-2 px-3">Status</th>
                          <th className="text-right py-2 px-3">Capital Investido</th>
                          <th className="text-right py-2 px-3">Nº Negócios</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p3.ltvTop5.map((inv, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium text-gray-800">{inv.nome}</td>
                            <td className="py-2 px-3 text-xs">
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                inv.status === 'Em Parceria' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                              }`}>{inv.status}</span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{EUR(inv.ltv)}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{inv.negocios || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              Para medir <strong>Tempo médio de captação</strong> e <strong>ROI entregue por investidor</strong>,
              preenche no Notion:<br />
              • <strong>Data Capital Transferido</strong> nos investidores activos<br />
              • <strong>Investidor</strong> (relação) em cada registo de Faturação
            </div>
          </>
        )}

        {/* ══════════ TRANSVERSAL ══════════ */}
        {tab === 'transversal' && (
          <>
            <SectionTitle>Cruzamento de Pipelines</SectionTitle>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Deal Flow / Capital"
                value={tr?.ratioDealFlowCapital != null ? `${tr.ratioDealFlowCapital}×` : '—'}
                sub="Pipeline value / capital disponível"
                warn={tr?.ratioDealFlowCapital != null && tr.ratioDealFlowCapital < 1}
                highlight={tr?.ratioDealFlowCapital >= 2} />
              <M label="% deals financiados c/ capital passivo"
                value={PCT(tr?.pctDealsCapitalPassivo)}
                sub="Negócios com investidor associado" />
              <M label="Ciclo completo médio"
                value={DAYS(tr?.velocidadeCicloCompleto)}
                sub="Lead adicionado → escritura" />
              <M label="ROE (capital passivo)"
                value={tr?.roe != null ? PCT(tr.roe) : '—'}
                sub="Lucro entregue / capital captado" />
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Deals simultâneos em execução"
                value={NUM(tr?.dealsSilmultaneos)}
                sub="Negócios activos (não Vendido)" />
              <M label="% projecções cumpridas"
                value={tr?.cumpreProjeccao != null ? PCT(tr.cumpreProjeccao) : '—'}
                sub="Lucro real ≥ 80% do estimado" />
              <M label="Margem média Wholesaling"
                value={EUR(tr?.margemWholesaling)}
                sub="Por deal fechado" />
              <M label="Margem média Fix & Flip"
                value={EUR(tr?.margemFF)}
                sub="Por deal fechado (CAEP/F&F)" />
            </div>

            <SectionTitle>Diagnóstico Estratégico</SectionTitle>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-col gap-4">
                <Diagnostico
                  label="Bottleneck: Imóveis vs Capital"
                  value={tr?.ratioDealFlowCapital}
                  renderMsg={v => v == null
                    ? 'Sem dados suficientes — preenche os campos no Notion'
                    : v < 0.5
                      ? '🔴 Excesso de capital — precisas de mais deal flow. Foca a prospecção de imóveis.'
                      : v > 3
                        ? '🔴 Excesso de deal flow — precisas de mais capital. Foca a captação de investidores.'
                        : '🟢 Equilíbrio saudável entre deal flow e capital disponível.'
                  }
                />
                <Diagnostico
                  label="Qualidade do Pipeline"
                  value={tr?.cumpreProjeccao}
                  renderMsg={v => v == null
                    ? 'Sem deals fechados suficientes para calcular'
                    : v >= 80
                      ? '🟢 Projecções CAEP fiáveis — estimativas alinhadas com resultados reais.'
                      : v >= 60
                        ? '🟡 Desvio moderado — revê os critérios do CAEP e estimativas de obra.'
                        : '🔴 Projecções pouco fiáveis — os resultados reais ficam sistematicamente abaixo do estimado.'
                  }
                />
                <Diagnostico
                  label="Retenção de Capital Passivo"
                  value={p3?.taxaRetencao}
                  renderMsg={v => v == null
                    ? 'Sem investidores activos com múltiplos negócios'
                    : v >= 60
                      ? '🟢 Alta retenção — investidores satisfeitos reinvestem. Activo estratégico valioso.'
                      : v >= 30
                        ? '🟡 Retenção moderada — verifica o ROI entregue e a frequência de comunicação.'
                        : '🔴 Baixa retenção — maioria dos investidores não reinveste. Prioriza a relação com os actuais.'
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="font-semibold text-gray-800 text-sm">{value}</span>
    </div>
  )
}

function Diagnostico({ label, value, renderMsg }) {
  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-700">{renderMsg(value)}</p>
    </div>
  )
}
