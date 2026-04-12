import { useState, useEffect } from 'react'
import { Header } from '../components/layout/Header.jsx'

const EUR = v => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const PCT = v => v == null ? '—' : `${Number(v).toFixed(1)}%`
const DAYS = v => v == null ? '—' : `${Number(v).toFixed(0)}d`
const NUM = v => v == null ? '—' : String(v)
const RATIO = v => v == null ? '—' : `${Number(v).toFixed(1)}:1`

const GOLD = '#C9A84C'
const TABS = [
  { id: 'resumo',       label: 'Visão Geral' },
  { id: 'receita',      label: '1.1 Receita' },
  { id: 'conversao',    label: '1.2 Conversão' },
  { id: 'ticket',       label: '1.3 Ticket' },
  { id: 'margem',       label: '1.4 Margem' },
  { id: 'cac',          label: '2.1 CPA' },
  { id: 'ciclo',        label: '2.2 Ciclo' },
  { id: 'perda',        label: '2.3 Perda' },
  { id: 'volume',       label: '2.4 Volume' },
  { id: 'ltv',          label: '3.1 AUM' },
  { id: 'recompra',     label: '3.2 Reinvest.' },
  { id: 'churn',        label: '3.3 Inatividade' },
  { id: 'avancado',     label: 'Avançado' },
  { id: 'okrs',         label: 'OKRs Q2' },
]

const FUNNEL_COLORS = ['#94a3b8', '#60a5fa', '#818cf8', '#f59e0b', '#22c55e']

// ── Metric card with target comparison ──────────────────────────
function M({ label, value, sub, highlight = false, warn = false, meta, metaLabel }) {
  const hitsMeta = meta != null && value !== '—' && typeof value === 'string'
    ? false // can't auto-compare formatted strings
    : false
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
      {meta != null && <span className="text-[10px] text-gray-300">{metaLabel || 'Meta'}: {typeof meta === 'number' && meta > 100 ? EUR(meta) : meta}</span>}
    </div>
  )
}

// ── Metric card with vs-meta status ─────────────────────────────
function MvsMeta({ label, value, meta, format = 'num', invert = false, sub }) {
  const fmt = v => v == null ? '—' : format === 'eur' ? EUR(v) : format === 'pct' ? PCT(v) : format === 'days' ? DAYS(v) : format === 'ratio' ? RATIO(v) : NUM(v)
  const raw = value
  const ok = raw != null && meta != null
    ? (invert ? raw <= meta : raw >= meta)
    : null
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 shadow-sm ${
      ok === true ? 'border-green-200 bg-green-50' :
      ok === false ? 'border-red-200 bg-red-50' :
      'border-gray-200 bg-white'
    }`}>
      <span className="text-[11px] text-gray-400 uppercase tracking-wide leading-tight">{label}</span>
      <span className={`text-xl font-bold ${
        ok === true ? 'text-green-700' : ok === false ? 'text-red-600' : 'text-gray-900'
      }`}>{fmt(raw)}</span>
      <span className="text-[10px] text-gray-300">Meta: {fmt(meta)} {ok === true ? '✓' : ok === false ? '✗' : ''}</span>
      {sub && <span className="text-xs text-gray-400 leading-tight">{sub}</span>}
    </div>
  )
}

// ── Funil visual ────────────────────────────────────────────────
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

// ── Motivo bar list ─────────────────────────────────────────────
function MotivoList({ items, emptyMsg }) {
  if (!items?.length) return <p className="text-xs text-gray-400 text-center py-4">{emptyMsg || 'Sem dados'}</p>
  const max = items[0]?.count || 1
  return (
    <div className="flex flex-col gap-2">
      {items.map(m => (
        <div key={m.motivo || m.fase} className="flex items-center justify-between text-sm">
          <span className="text-gray-600 truncate max-w-[200px]">{m.motivo || m.fase}</span>
          <div className="flex items-center gap-3">
            <div className="w-32 bg-gray-100 rounded-full h-2">
              <div className="h-2 rounded-full bg-red-400" style={{ width: `${Math.round(m.count / max * 100)}%` }} />
            </div>
            <span className="text-xs font-mono text-gray-500 w-8 text-right">{m.count}{m.pct != null ? ` (${PCT(m.pct)})` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Progress bar towards target ─────────────────────────────────
function ProgressMeta({ label, value, meta, format = 'eur' }) {
  const fmt = v => format === 'eur' ? EUR(v) : format === 'pct' ? PCT(v) : NUM(v)
  const pct = meta > 0 ? Math.min(100, Math.round((value || 0) / meta * 100)) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-700">{fmt(value)} / {fmt(meta)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div className={`h-3 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 text-right">{pct}% da meta</span>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────
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

  const top = data?.top
  const p1  = data?.pipeline1
  const p2  = data?.pipeline2
  const p3  = data?.pipeline3
  const tr  = data?.transversal
  const tk  = data?.tracker

  return (
    <>
      <Header title="Métricas & KPIs" subtitle="Framework Completo — Wholesaling · CAEP · Capital Passivo"
        onRefresh={load} loading={loading} />

      {/* Tab bar */}
      <div className="px-6 pt-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors ${
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
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <M label="Receita prevista / mês" value={EUR(top?.receitaPrevistaMes)} sub="Lucro estimado negócios activos" highlight />
              <M label="Deals fechados no mês" value={NUM(top?.dealsFechadosMes)} sub={`de ${p2?.totalDeals ?? '—'} negócios totais`} />
              <M label="Capital passivo captado" value={EUR(top?.capitalPassivoCaptado)} sub={`${p3?.investidoresAtivos ?? '—'} investidores activos`} />
              <M label="Velocidade média do ciclo" value={DAYS(top?.velocidadeMediaCiclo)} sub="1.ª abordagem → proposta aceite" />
            </div>

            {/* Pipeline summaries */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline 1 — Imóveis</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Leads no pipeline" value={NUM(p1?.funil?.[0]?.value)} />
                  <Row label="Taxa lead → contrato" value={PCT(p1?.taxaConversao)} />
                  <Row label="Spread médio negociação" value={p1?.spreadMedio != null ? PCT(p1.spreadMedio) : '—'} />
                  <Row label="Em due diligence" value={NUM(p1?.nDueDiligence)} />
                  <Row label="Taxa de descarte" value={PCT(p1?.taxaDescarte)} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline 2 — Negócios</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Total negócios" value={NUM(p2?.totalDeals)} />
                  <Row label="Fechados (Vendidos)" value={NUM(p2?.dealsFechados)} />
                  <Row label="Taxa de realização" value={PCT(p2?.taxaRealizacao)} />
                  <Row label="Margem média Wholesaling" value={EUR(p2?.margemWholesaling)} />
                  <Row label="% c/ capital passivo" value={PCT(p2?.pctDealsCapitalPassivo)} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline 3 — Investidores</h3>
                <div className="flex flex-col gap-2 text-sm">
                  <Row label="Capital captado" value={EUR(p3?.capitalCaptado)} />
                  <Row label="Investidores activos" value={NUM(p3?.investidoresAtivos)} />
                  <Row label="Ticket médio" value={EUR(p3?.ticketMedio)} />
                  <Row label="Taxa de conversão" value={PCT(p3?.taxaConversao)} />
                  <Row label="ROI entregue" value={p3?.roiEntregue != null ? PCT(p3.roiEntregue) : '—'} />
                </div>
              </div>
            </div>

            {/* Transversal */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Métricas Transversais</h3>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <M label="Deal Flow / Capital" value={tr?.ratioDealFlowCapital != null ? `${tr.ratioDealFlowCapital}×` : '—'}
                  sub="Pipeline value / capital disponível" warn={tr?.ratioDealFlowCapital != null && tr.ratioDealFlowCapital < 1} />
                <M label="Ciclo completo médio" value={DAYS(tr?.velocidadeCicloCompleto)} sub="Lead adicionado → escritura" />
                <M label="ROE (capital passivo)" value={tr?.roe != null ? PCT(tr.roe) : '—'} sub="Lucro entregue / capital captado" />
                <M label="% projecções cumpridas" value={tr?.cumpreProjeccao != null ? PCT(tr.cumpreProjeccao) : '—'} sub="Lucro real ≥ 80% do estimado" />
              </div>
            </div>

            {/* Diagnóstico */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Diagnóstico Estratégico</h3>
              <div className="flex flex-col gap-4">
                <Diagnostico label="Bottleneck: Imóveis vs Capital" value={tr?.ratioDealFlowCapital}
                  renderMsg={v => v == null ? 'Sem dados suficientes' : v < 0.5
                    ? '🔴 Excesso de capital — precisas de mais deal flow.'
                    : v > 3 ? '🔴 Excesso de deal flow — precisas de mais capital.'
                    : '🟢 Equilíbrio saudável entre deal flow e capital.'} />
                <Diagnostico label="Qualidade do Pipeline" value={tr?.cumpreProjeccao}
                  renderMsg={v => v == null ? 'Sem deals fechados suficientes'
                    : v >= 80 ? '🟢 Projecções fiáveis — estimativas alinhadas.' : v >= 60
                    ? '🟡 Desvio moderado — revê critérios.'
                    : '🔴 Projecções pouco fiáveis.'} />
              </div>
            </div>
          </>
        )}

        {/* ══════════ 1.1 RECEITA / FATURAÇÃO ══════════ */}
        {tab === 'receita' && tk?.receita && (() => {
          const wh = tk.receita.wholesaling
          const caep = tk.receita.caep
          return (
            <>
              <SectionTitle>Wholesaling — Receita</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <ProgressMeta label="Receita Anual vs Meta" value={wh.receitaAnual} meta={wh.metaAnual} />
                <ProgressMeta label="Receita Trimestral vs Meta" value={wh.receitaTrimestral} meta={wh.metaTrimestral} />
                <ProgressMeta label="Receita Semestral vs Meta" value={wh.receitaSemestral} meta={wh.metaSemestral} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="Faturação média / deal" value={wh.faturacaoMedia} meta={8333} format="eur" sub="Meta ≥ 8.333€" />
                <MvsMeta label="Faturação mínima" value={wh.faturacaoMinima} meta={5000} format="eur" sub="Meta ≥ 5.000€" />
                <MvsMeta label="% deals acima da média" value={wh.pctAcimaMedia} meta={50} format="pct" />
                <M label="Negócios WH" value={`${NUM(wh.nFechados)} fechados / ${NUM(wh.nDeals)} total`} />
              </div>

              <SectionTitle>CAEP — Receita (Quota Somnium)</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <ProgressMeta label="Faturação CAEP Anual vs Meta" value={caep.faturacaoAnual} meta={caep.metaAnual} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="Quota Somnium média / deal" value={caep.quotaMediaPorNegocio} meta={20000} format="eur" sub="Mín 20k / Alvo 31k" />
                <M label="Quota Somnium total" value={EUR(caep.quotaSomniumTotal)} />
                <MvsMeta label="Faturação média CAEP" value={caep.faturacaoMedia} meta={25000} format="eur" />
                <M label="Negócios CAEP" value={`${NUM(caep.nFechados)} fechados / ${NUM(caep.nDeals)} total`} />
              </div>

              {caep.lucroEstVsReal?.length > 0 && (
                <>
                  <SectionTitle>CAEP — Estimado vs Real</SectionTitle>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                          <th className="text-left py-2 px-3">Negócio</th>
                          <th className="text-right py-2 px-3">Estimado</th>
                          <th className="text-right py-2 px-3">Real</th>
                          <th className="text-right py-2 px-3">Desvio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caep.lucroEstVsReal.map((n, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-2 px-3 text-gray-700">{n.movimento}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{EUR(n.estimado)}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs font-semibold">{n.real > 0 ? EUR(n.real) : '—'}</td>
                            <td className={`py-2 px-3 text-right font-mono text-xs ${n.desvio != null && n.desvio < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {n.desvio != null ? `${n.desvio > 0 ? '+' : ''}${PCT(n.desvio)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )
        })()}

        {/* ══════════ 1.2 CONVERSÃO ══════════ */}
        {tab === 'conversao' && tk?.conversao && (() => {
          const im = tk.conversao.imoveis
          const inv = tk.conversao.investidores
          const cons = tk.conversao.consultores
          return (
            <>
              <SectionTitle>Funil Imóveis — Taxa de Conversão</SectionTitle>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <Funil steps={[
                  { label: `Adicionados (${im.totais.leads})`, value: im.totais.leads },
                  { label: `Chamadas (${im.totais.chamadas})`, value: im.totais.chamadas },
                  { label: `Visitas (${im.totais.visitas})`, value: im.totais.visitas },
                  { label: `Propostas (${im.totais.propostas})`, value: im.totais.propostas },
                  { label: `Fechos (${im.totais.fechos})`, value: im.totais.fechos },
                ]} colors={FUNNEL_COLORS} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                <MvsMeta label="Add → Chamada" value={im.addToChamada} meta={im.metaAddToChamada} format="pct" />
                <MvsMeta label="Chamada → Visita" value={im.chamadaToVisita} meta={im.metaChamadaToVisita} format="pct" />
                <MvsMeta label="Visita → Proposta" value={im.visitaToProposta} meta={im.metaVisitaToProposta} format="pct" />
                <MvsMeta label="Proposta → Fecho" value={im.propostaToFecho} meta={im.metaPropostaToFecho} format="pct" />
                <MvsMeta label="Global (Add → Fecho)" value={im.global} meta={im.metaGlobal} format="pct" />
              </div>
              {im.mixWH != null && (
                <div className="grid grid-cols-2 gap-4">
                  <M label="Mix Wholesaling" value={PCT(im.mixWH)} sub="% dos negócios fechados" />
                  <M label="Mix CAEP" value={PCT(im.mixCAEP)} sub="% dos negócios fechados" />
                </div>
              )}

              <SectionTitle>Funil Investidores — Taxa de Conversão</SectionTitle>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <Funil steps={[
                  { label: `Contactados (${inv.totais.contactos})`, value: inv.totais.contactos },
                  { label: `Reunião (${inv.totais.reunioes})`, value: inv.totais.reunioes },
                  { label: `Classificados (${inv.totais.classificados})`, value: inv.totais.classificados },
                  { label: `Com investimento (${inv.totais.investidores})`, value: inv.totais.investidores },
                  { label: `Em parceria (${inv.totais.emParceria})`, value: inv.totais.emParceria },
                ]} colors={FUNNEL_COLORS} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="Contacto → Reunião" value={inv.contactToReuniao} meta={inv.metaContactToReuniao} format="pct" />
                <MvsMeta label="Reunião → Classificado" value={inv.reuniaoToClassificado} meta={inv.metaReuniaoToClassificado} format="pct" />
                <MvsMeta label="Classificado → 1.º Invest." value={inv.classificadoTo1st} meta={inv.metaClassificadoTo1st} format="pct" />
                <MvsMeta label="Global (Contacto → Ativo)" value={inv.global} meta={inv.metaGlobal} format="pct" />
              </div>

              <SectionTitle>Funil Consultores — Taxa de Conversão</SectionTitle>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <Funil steps={[
                  { label: `Contactados (${cons.totais.contactos})`, value: cons.totais.contactos },
                  { label: `Com call (${cons.totais.calls})`, value: cons.totais.calls },
                  { label: `Ativos (${cons.totais.ativos})`, value: cons.totais.ativos },
                  { label: `Com negócio (${cons.totais.comNegocio})`, value: cons.totais.comNegocio },
                  { label: `Com fecho (${cons.totais.comFecho})`, value: cons.totais.comFecho },
                ]} colors={FUNNEL_COLORS} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="Contacto → Call" value={cons.contactToCall} meta={cons.metaContactToCall} format="pct" />
                <MvsMeta label="Call → Ativo" value={cons.callToAtivo} meta={cons.metaCallToAtivo} format="pct" />
                <MvsMeta label="Ativo → Negócio" value={cons.ativoToNegocio} meta={cons.metaAtivoToNegocio} format="pct" />
                <MvsMeta label="Global (Contacto → Fecho)" value={cons.global} meta={cons.metaGlobal} format="pct" />
              </div>
            </>
          )
        })()}

        {/* ══════════ 1.3 TICKET MÉDIO ══════════ */}
        {tab === 'ticket' && tk?.ticketMedio && (() => {
          const wh = tk.ticketMedio.wholesaling
          const caep = tk.ticketMedio.caep
          const cons = tk.ticketMedio.consultores
          return (
            <>
              <SectionTitle>Wholesaling — Ticket Médio</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="Lucro médio / deal" value={wh.lucroMedio} meta={wh.metaLucroMedio} format="eur" />
                <MvsMeta label="Lucro mínimo" value={wh.lucroMinimo} meta={wh.metaLucroMinimo} format="eur" sub={`Alvo: ${EUR(wh.metaAlvo)}`} />
                <MvsMeta label="% deals acima da média" value={wh.pctAcimaMedia} meta={50} format="pct" />
              </div>

              <SectionTitle>CAEP — Ticket Médio</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <M label="Capital médio / negócio" value={EUR(caep.capitalMedioPorNegocio)} />
                <M label="Capital médio / investidor" value={EUR(caep.capitalMedioPorInvestidor)} />
                <M label="N.º médio investidores / negócio" value={caep.nMedioInvestidores != null ? caep.nMedioInvestidores.toFixed(1) : '—'} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Lucro Somnium / capital total" value={caep.lucroSomniumSobreCapital} meta={caep.metaLucroSobreCapital} format="pct" sub="Meta ≥ 8%" />
                <MvsMeta label="Lucro Somnium / mês retenção" value={caep.lucroSomniumPorMes} meta={caep.metaLucroPorMes} format="eur" sub="Meta ≥ 2.500€/mês" />
                <MvsMeta label="ROI do investidor" value={caep.roiInvestidor} meta={caep.metaRoiInvestidor} format="pct" sub="Meta ≥ 20%" />
              </div>

              <SectionTitle>Consultores — Valor Gerado</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <M label="Ask price médio (via consultor)" value={EUR(cons.askPriceMedio)} sub="Imóveis trazidos por consultores" />
                <MvsMeta label="Lucro médio gerado / consultor" value={cons.lucroMedioGerado} meta={cons.metaLucroMedio} format="eur" />
                <MvsMeta label="% negócios via consultores" value={cons.pctNegociosViaConsultor} meta={cons.metaPctViaConsultor} format="pct" />
              </div>
              {cons.rankingValor?.length > 0 && (
                <>
                  <SectionTitle>Ranking de Valor por Consultor</SectionTitle>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                          <th className="text-left py-2 px-3">#</th>
                          <th className="text-left py-2 px-3">Consultor</th>
                          <th className="text-right py-2 px-3">Lucro Gerado</th>
                          <th className="text-left py-2 px-3">Classificação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cons.rankingValor.map((c, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-2 px-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                            <td className="py-2 px-3 text-gray-700 font-medium">{c.nome}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-green-700">{EUR(c.lucroGerado)}</td>
                            <td className="py-2 px-3"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{c.classificacao || '—'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )
        })()}

        {/* ══════════ 1.4 MARGEM ══════════ */}
        {tab === 'margem' && tk?.margem && (() => {
          const wh = tk.margem.wholesaling
          const caep = tk.margem.caep
          return (
            <>
              <SectionTitle>Wholesaling — Margem</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <M label="Margem bruta média" value={wh.margemBrutaMedia != null ? PCT(wh.margemBrutaMedia) : '—'} sub="Lucro estimado / Ask Price" />
                <M label="Margem líquida média (após IRC)" value={wh.margemLiquidaMedia != null ? PCT(wh.margemLiquidaMedia) : '—'} sub="~21% IRC" />
                <M label="Desvio orçamento obra médio" value={wh.desvioObraMedia != null ? `${wh.desvioObraMedia > 0 ? '+' : ''}${PCT(wh.desvioObraMedia)}` : '—'}
                  sub="Custo real vs estimado" warn={wh.desvioObraMedia > 20} />
              </div>

              <SectionTitle>CAEP — Margem</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <M label="ROI médio do negócio" value={caep.roiMedio != null ? PCT(caep.roiMedio) : '—'} sub="Lucro / capital total investido" />
                <M label="Margem Somnium" value={PCT(caep.margemSomniumPct)} sub="Fixo: 40% × 2/3 = 26,7%" highlight />
                <M label="Desvio orçamento obra médio" value={caep.desvioObraMedia != null ? `${caep.desvioObraMedia > 0 ? '+' : ''}${PCT(caep.desvioObraMedia)}` : '—'}
                  sub="Custo real vs estimado" warn={caep.desvioObraMedia > 20} />
              </div>

              {tk.margem.porNegocio?.length > 0 && (
                <>
                  <SectionTitle>Margens por Negócio</SectionTitle>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                          <th className="text-left py-2 px-3">Negócio</th>
                          <th className="text-left py-2 px-3">Categoria</th>
                          <th className="text-right py-2 px-3">Margem Bruta</th>
                          <th className="text-right py-2 px-3">Margem Líquida</th>
                          <th className="text-right py-2 px-3">Desvio Obra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tk.margem.porNegocio.map((n, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-2 px-3 text-gray-700">{n.movimento}</td>
                            <td className="py-2 px-3 text-xs"><span className="px-2 py-0.5 bg-gray-100 rounded">{n.categoria}</span></td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{PCT(n.margemBruta)}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{PCT(n.margemLiquida)}</td>
                            <td className={`py-2 px-3 text-right font-mono text-xs ${n.desvioObra != null && n.desvioObra > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {n.desvioObra != null ? `${n.desvioObra > 0 ? '+' : ''}${PCT(n.desvioObra)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )
        })()}

        {/* ══════════ 2.1 CAC ══════════ */}
        {tab === 'cac' && tk?.cac && (() => {
          const c = tk.cac
          return (
            <>
              <SectionTitle>Estrutura de Custos</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <M label="Custo / hora" value={EUR(c.constantes.custoHora)} sub="João e Alexandre" />
                <M label="Custos fixos mensais" value={EUR(c.constantes.custosFixosMensais)} sub="Notion + Claude + Alfredo + Skool" />
                <M label="Burn rate mensal real" value={EUR(c.constantes.burnRateMensal)} sub="Despesas recorrentes" />
                <M label="Meses de operação" value={NUM(c.constantes.mesesOperacao)} sub={`Custo total: ${EUR(c.constantes.custoTotalOperacao)}`} />
              </div>

              <SectionTitle>CAC — Imóveis</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="CAC / negócio fechado" value={c.imoveis.cacPorNegocio} meta={c.imoveis.metaCACNegocio} format="eur" invert />
                <MvsMeta label="Custo / imóvel adicionado" value={c.imoveis.custoPorImovel} meta={c.imoveis.metaCustoPorImovel} format="eur" invert />
                <MvsMeta label="Custo / visita" value={c.imoveis.custoPorVisita} meta={c.imoveis.metaCustoPorVisita} format="eur" invert />
                <MvsMeta label="Custo / estudo mercado" value={c.imoveis.custoPorEstudo} meta={c.imoveis.metaCustoPorEstudo} format="eur" invert />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Chamadas / visita" value={c.imoveis.chamadasPorVisita} meta={c.imoveis.metaChamadasPorVisita} format="num" invert />
                <MvsMeta label="Visitas / proposta" value={c.imoveis.visitasPorProposta} meta={c.imoveis.metaVisitasPorProposta} format="num" invert />
                <MvsMeta label="Propostas / negócio" value={c.imoveis.propostasPorNegocio} meta={c.imoveis.metaPropostasPorNegocio} format="num" invert />
              </div>

              <SectionTitle>CAC — Investidores</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-2 gap-4">
                <MvsMeta label="Custo / investidor ativo" value={c.investidores.custoPorInvestidorAtivo} meta={c.investidores.metaCusto} format="eur" invert />
                <MvsMeta label="Tempo até 1.º investimento" value={c.investidores.tempoAte1stInvest} meta={c.investidores.metaTempo} format="days" invert />
              </div>

              <SectionTitle>CAC — Consultores</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-2 gap-4">
                <MvsMeta label="Custo / consultor ativo" value={c.consultores.custoPorConsultorAtivo} meta={c.consultores.metaCusto} format="eur" invert />
                <MvsMeta label="Descontinuados vs ativos" value={c.consultores.descontinuadosVsAtivos} meta={c.consultores.metaRatio} format="ratio" invert />
              </div>

              <SectionTitle>Ferramentas vs Receita</SectionTitle>
              <div className="grid grid-cols-1 gap-4">
                <MvsMeta label="Ferramentas / receita total" value={c.ferramentas.ferramentasSobreReceita} meta={c.ferramentas.metaPct} format="pct" invert
                  sub="Custo total de ferramentas / receita acumulada" />
              </div>
            </>
          )
        })()}

        {/* ══════════ 2.2 CICLO DE VENDAS ══════════ */}
        {tab === 'ciclo' && tk?.ciclo && (() => {
          const im = tk.ciclo.imoveis
          const inv = tk.ciclo.investidores
          const cons = tk.ciclo.consultores
          return (
            <>
              <SectionTitle>Ciclo Imóveis — Tempo entre Fases</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Lead → Chamada" value={im.leadToChamada} meta={im.metaLeadToChamada} format="days" invert />
                <MvsMeta label="Chamada → Visita" value={im.chamadaToVisita} meta={im.metaChamadaToVisita} format="days" invert />
                <MvsMeta label="Visita → Estudo" value={im.visitaToEstudo} meta={im.metaVisitaToEstudo} format="days" invert />
                <MvsMeta label="Estudo → Proposta" value={im.estudoToProposta} meta={im.metaEstudoToProposta} format="days" invert />
                <MvsMeta label="Proposta → Fecho" value={im.propostaToFecho} meta={im.metaPropostaToFecho} format="days" invert />
                <MvsMeta label="Lead → Fecho (total)" value={im.leadToFechoTotal} meta={im.metaLeadToFecho} format="days" invert />
              </div>

              {im.faseMaiorDemora && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  <strong>Bottleneck:</strong> A fase com maior demora é <strong>{im.faseMaiorDemora.fase}</strong> com média de <strong>{DAYS(im.faseMaiorDemora.dias)}</strong>.
                </div>
              )}

              {im.fases?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Todas as Fases (ordenadas por demora)</h3>
                  <div className="flex flex-col gap-2">
                    {im.fases.map(f => (
                      <div key={f.fase} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-40 text-right shrink-0">{f.fase}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-400 flex items-center px-3"
                            style={{ width: `${Math.max(5, Math.round(f.dias / (im.fases[0]?.dias || 1) * 100))}%` }}>
                            <span className="text-white text-xs font-bold">{DAYS(f.dias)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <SectionTitle>Ciclo Investidores</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Contacto → Reunião" value={inv.contactoToReuniao} meta={inv.metaContactoToReuniao} format="days" invert />
                <MvsMeta label="Negócio → Aprovação" value={inv.negocioToAprovacao} meta={inv.metaNegocioToAprovacao} format="days" invert />
                <MvsMeta label="Contacto → Capital (total)" value={inv.contactoToCapitalTotal} meta={inv.metaContactoToCapital} format="days" invert />
              </div>

              <SectionTitle>Ciclo Consultores</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <MvsMeta label="1.ª Call → 1.º Negócio" value={cons.callTo1stNegocio} meta={cons.metaCallToNegocio} format="days" invert />
                <MvsMeta label="Follow-up médio entre contactos" value={cons.followUpMedio} meta={cons.metaFollowUp} format="days" invert />
              </div>
            </>
          )
        })()}

        {/* ══════════ 2.3 MOTIVOS DE PERDA ══════════ */}
        {tab === 'perda' && tk?.motivosPerda && (() => {
          const im = tk.motivosPerda.imoveis
          const inv = tk.motivosPerda.investidores
          const cons = tk.motivosPerda.consultores
          return (
            <>
              <SectionTitle>Imóveis — Motivos de Descarte</SectionTitle>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Motivos de Descarte</h3>
                  <MotivoList items={im.todosPorPct} emptyMsg="Preenche 'Motivo Descarte' nos imóveis descartados" />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fase de Descarte</h3>
                  <MotivoList items={im.faseMediaDescarte} emptyMsg="Sem dados de fase de descarte" />
                </div>
              </div>
              <M label="Taxa de descarte global" value={PCT(im.taxaDescarte)} sub="Descartados / leads totais" />

              <SectionTitle>Investidores — Motivos</SectionTitle>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Motivos de Não Aprovação</h3>
                  <MotivoList items={inv.motivosNaoAprovacao} emptyMsg="Preenche 'Motivo Não Aprovação' nos investidores" />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Motivos de Inatividade</h3>
                  <MotivoList items={inv.motivosInatividade} emptyMsg="Preenche 'Motivo Inatividade' nos investidores" />
                </div>
              </div>

              <SectionTitle>Consultores — Descontinuação</SectionTitle>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Motivos de Descontinuação</h3>
                  <MotivoList items={cons.motivosDescontinuacao} emptyMsg="Preenche 'Motivo Descontinuação' nos consultores" />
                </div>
                <div className="flex flex-col gap-4">
                  <MvsMeta label="Descontinuados vs Ativos" value={cons.descontinuadosVsAtivos} meta={cons.metaRatio || 5} format="ratio" invert />
                  <MvsMeta label="Tempo médio até descontinuação" value={cons.tempoMedioAteDescontinuacao} meta={cons.metaTempo} format="days" invert />
                </div>
              </div>
            </>
          )
        })()}

        {/* ══════════ 2.4 VOLUME DE ATIVIDADES ══════════ */}
        {tab === 'volume' && tk?.volume && (() => {
          const im = tk.volume.imoveis
          const inv = tk.volume.investidores
          const cons = tk.volume.consultores
          return (
            <>
              <SectionTitle>Volume — Imóveis</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="Adicionados / semana" value={im.addSemana} meta={im.metaAddSemana} format="num" sub={`${im.addMes} este mês`} />
                <MvsMeta label="Chamadas / semana" value={im.chamadasSemana} meta={im.metaChamadasSemana} format="num" sub={`${im.chamadasMes} este mês`} />
                <MvsMeta label="Visitas / semana" value={im.visitasSemana} meta={im.metaVisitasSemana} format="num" sub={`${im.visitasMes} este mês`} />
                <MvsMeta label="Follow-ups ativos" value={im.followUpAtivos} meta={im.metaFollowUpAtivos} format="num" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <MvsMeta label="Estudos de mercado / mês" value={im.estudosMes} meta={im.metaEstudosMes} format="num" />
                <MvsMeta label="Propostas enviadas / mês" value={im.propostasMes} meta={im.metaPropostasMes} format="num" />
              </div>

              <SectionTitle>Volume — Investidores</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Novos contactados / semana" value={inv.novosContactadosSemana} meta={inv.metaNovos} format="num" />
                <MvsMeta label="Reuniões / semana" value={inv.reunioesSemana} meta={inv.metaReunioes} format="num" />
                <MvsMeta label="Sem contacto > 30 dias" value={inv.semContacto30d} meta={inv.metaSemContacto} format="num" invert
                  warn={inv.semContacto30d > 0} />
              </div>

              <SectionTitle>Volume — Consultores</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Follow-ups / semana" value={cons.followUpsSemana} meta={cons.metaFollowUps} format="num" />
                <MvsMeta label="Sem contacto > 15 dias" value={cons.semContacto15d} meta={cons.metaSemContacto} format="num" invert
                  warn={cons.semContacto15d > 0} />
                <MvsMeta label="Ativos c/ follow-up em dia" value={cons.ativosFollowUpEmDia} meta={cons.metaAtivosEmDia} format="num" />
              </div>
            </>
          )
        })()}

        {/* ══════════ 3.1 LTV ══════════ */}
        {tab === 'ltv' && tk?.ltv && (() => {
          const inv = tk.ltv.investidores
          const cons = tk.ltv.consultores
          return (
            <>
              <SectionTitle>LTV — Investidores</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <M label="LTV acumulado total" value={EUR(inv.ltvAcumulado)} highlight />
                <M label="Capital total mobilizado" value={EUR(inv.capitalMobilizado)} />
                <M label="Meta LTV / investidor" value={EUR(inv.metaLTV)} sub="≥ 25.000€ por investidor" />
              </div>
              {inv.porInvestidor?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-3">Investidor</th>
                        <th className="text-left py-2 px-3">Status</th>
                        <th className="text-right py-2 px-3">LTV (Capital)</th>
                        <th className="text-right py-2 px-3">N.º Negócios</th>
                        <th className="text-right py-2 px-3">ROI %</th>
                        <th className="text-right py-2 px-3">vs Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.porInvestidor.map((i, idx) => (
                        <tr key={idx} className="border-b border-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-800">{i.nome}</td>
                          <td className="py-2 px-3 text-xs"><span className={`px-2 py-0.5 rounded-full font-medium ${
                            i.status === 'Investidor em parceria' || i.status === 'Em Parceria' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>{i.status}</span></td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{EUR(i.ltv)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{i.negocios || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{i.roiInvestidor ? PCT(i.roiInvestidor) : '—'}</td>
                          <td className="py-2 px-3 text-right text-xs">{i.ltv >= 25000
                            ? <span className="text-green-600 font-semibold">Acima</span>
                            : <span className="text-red-500">Abaixo</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <SectionTitle>LTV — Consultores (Top 5)</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <M label="Meta LTV / consultor" value={EUR(cons.metaLTV)} sub="≥ 8.000€ por consultor ativo" />
              </div>
              {cons.top5?.length > 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-3">#</th>
                        <th className="text-left py-2 px-3">Consultor</th>
                        <th className="text-right py-2 px-3">Lucro Gerado</th>
                        <th className="text-right py-2 px-3">vs Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cons.top5.map((c, idx) => (
                        <tr key={idx} className="border-b border-gray-50">
                          <td className="py-2 px-3 text-gray-400 font-mono text-xs">{idx + 1}</td>
                          <td className="py-2 px-3 font-medium text-gray-700">{c.nome}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-green-700">{EUR(c.ltv)}</td>
                          <td className="py-2 px-3 text-right text-xs">{c.ltv >= 8000
                            ? <span className="text-green-600 font-semibold">Acima</span>
                            : <span className="text-red-500">Abaixo</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState />}
            </>
          )
        })()}

        {/* ══════════ 3.2 RECOMPRA ══════════ */}
        {tab === 'recompra' && tk?.recompra && (() => {
          const inv = tk.recompra.investidores
          const cons = tk.recompra.consultores
          return (
            <>
              <SectionTitle>Investidores — Recompra</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Investidores que reinvestiram" value={inv.nReinvestiram} meta={1} format="num" sub="Com > 1 negócio" />
                <MvsMeta label="Reinvestiram em 2026" value={inv.nReinvestiram2026} meta={inv.metaReinvestiram} format="num" />
              </div>

              <SectionTitle>Consultores — Recompra</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <M label="% consultores com ≥ 2 negócios" value={cons.pctCom2Negocios != null ? PCT(cons.pctCom2Negocios) : '—'} sub="Meta ≥ 40% (semestral)" />
                <MvsMeta label="Consultores com ≥ 2 negócios" value={cons.nCom2Negocios} meta={cons.metaN} format="num" sub="Meta ≥ 2 em 2026" />
              </div>
            </>
          )
        })()}

        {/* ══════════ 3.3 CHURN ══════════ */}
        {tab === 'churn' && tk?.churn && (() => {
          const inv = tk.churn.investidores
          const cons = tk.churn.consultores
          return (
            <>
              <SectionTitle>Investidores — Churn</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                <MvsMeta label="Inativos sem contacto > 60d" value={inv.inativosSem60d} meta={inv.metaInativos} format="num" invert
                  warn={inv.inativosSem60d > 0} />
                <M label="Perdidos no período" value={NUM(inv.perdidosPeriodo)} sub="Com motivo de inatividade ou não aprovação" warn={inv.perdidosPeriodo > 0} />
                <M label="Motivo mais frequente" value={inv.motivoMaisFrequente || '—'} />
              </div>

              <SectionTitle>Consultores — Churn</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="% descontinuados" value={cons.pctDescontinuados} meta={cons.metaPct} format="pct" invert />
                <MvsMeta label="Inativos > 30 dias" value={cons.inativosMais30d} meta={cons.metaInativos} format="num" invert
                  warn={cons.inativosMais30d > 0} />
                <MvsMeta label="Tempo médio até descontinuação" value={cons.tempoMedioAteDescontinuacao} meta={cons.metaTempo} format="days" invert />
                <M label="Motivo mais frequente" value={cons.motivoMaisFrequente || '—'} />
              </div>
            </>
          )
        })()}

        {/* ══════════ AVANÇADO ══════════ */}
        {tab === 'avancado' && data?.avancado && (() => {
          const av = data.avancado
          return (
            <>
              <SectionTitle>Pipeline Velocity</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <M label="Pipeline Velocity" value={av.pipelineVelocity?.valor != null ? `${EUR(av.pipelineVelocity.valor)}/dia` : '—'}
                  sub="(Deals × Ticket × Win Rate) / Ciclo" highlight />
                <M label="Ticket medio" value={EUR(av.pipelineVelocity?.ticketMedio)} />
                <M label="Win Rate" value={PCT(av.pipelineVelocity?.winRate)} warn={av.pipelineVelocity?.winRate === 0} />
                <M label="Ciclo medio" value={DAYS(av.pipelineVelocity?.cicloMedioDias)} />
              </div>

              <SectionTitle>Lead Response Time</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <MvsMeta label="Response time medio" value={av.leadResponseTime?.medio} meta={av.leadResponseTime?.metaDias} format="days" invert />
                <M label="Response time esta semana" value={DAYS(av.leadResponseTime?.semana)} sub="Media dos leads desta semana" />
                <M label="Leads nao contactados" value={NUM(av.leadResponseTime?.naoContactados)}
                  sub="Ativos sem chamada nem visita" warn={av.leadResponseTime?.naoContactados > 0} />
              </div>

              <SectionTitle>Deal Qualification Score</SectionTitle>
              {av.dealQualification?.length > 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-3">Imovel</th>
                        <th className="text-left py-2 px-3">Estado</th>
                        <th className="text-left py-2 px-3">Modelo</th>
                        <th className="text-right py-2 px-3">ROI</th>
                        <th className="text-right py-2 px-3">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {av.dealQualification.slice(0, 10).map((d, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-700">{d.nome}</td>
                          <td className="py-2 px-3 text-xs"><span className="px-2 py-0.5 bg-gray-100 rounded">{d.estado}</span></td>
                          <td className="py-2 px-3 text-xs">{d.modeloNegocio || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{d.roi > 0 ? PCT(d.roi) : '—'}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={`font-mono font-bold text-sm ${d.score >= 50 ? 'text-green-600' : d.score >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {d.score}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-gray-400 text-center py-4">Sem imoveis ativos</p>}

              <SectionTitle>Win/Loss por Fonte</SectionTitle>
              {av.winLossBySource?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-3">Fonte</th>
                        <th className="text-right py-2 px-3">Total</th>
                        <th className="text-right py-2 px-3">Wins</th>
                        <th className="text-right py-2 px-3">Losses</th>
                        <th className="text-right py-2 px-3">Win Rate</th>
                        <th className="text-right py-2 px-3">Loss Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {av.winLossBySource.map((s, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-700">{s.fonte}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{s.total}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-green-600 font-bold">{s.wins}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-red-500">{s.losses}</td>
                          <td className={`py-2 px-3 text-right font-mono text-xs font-bold ${s.winRate > 0 ? 'text-green-600' : 'text-gray-400'}`}>{PCT(s.winRate)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-red-400">{PCT(s.lossRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <SectionTitle>Consultant Activation & Follow-up Effectiveness</SectionTitle>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <M label="Activation rate real (30d)" value={av.consultantActivation?.taxa != null ? PCT(av.consultantActivation.taxa) : '—'}
                  sub={`${av.consultantActivation?.activosReais ?? 0} de ${av.consultantActivation?.totalConsultores ?? 0}`}
                  warn={av.consultantActivation?.taxa < 10} />
                <M label="Follow-up eff. investidores" value={av.followUpEffectiveness?.investidores != null ? PCT(av.followUpEffectiveness.investidores) : '—'}
                  sub="% com follow-up que avancaram" />
                <M label="Follow-up eff. consultores" value={av.followUpEffectiveness?.consultores != null ? PCT(av.followUpEffectiveness.consultores) : '—'}
                  sub="% com follow-up em parceria" />
              </div>

              <SectionTitle>Performance por Zona</SectionTitle>
              {av.zonaPerformance?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-3">Zona</th>
                        <th className="text-right py-2 px-3">Total</th>
                        <th className="text-right py-2 px-3">Ativos</th>
                        <th className="text-right py-2 px-3">Deals</th>
                        <th className="text-right py-2 px-3">ROI Medio</th>
                        <th className="text-right py-2 px-3">Ask Medio</th>
                        <th className="text-right py-2 px-3">Ciclo</th>
                        <th className="text-right py-2 px-3">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {av.zonaPerformance.map((z, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-700">{z.zona}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{z.total}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-green-600">{z.ativos}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-bold">{z.comDeal}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{z.roiMedio != null ? PCT(z.roiMedio) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{z.askMedio ? EUR(z.askMedio) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{z.cicloMedio ? DAYS(z.cicloMedio) : '—'}</td>
                          <td className={`py-2 px-3 text-right font-mono text-xs font-bold ${z.winRate > 0 ? 'text-green-600' : 'text-gray-400'}`}>{PCT(z.winRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <SectionTitle>CPA por Cohort Mensal</SectionTitle>
              {av.cacCohort?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-3">Cohort</th>
                        <th className="text-right py-2 px-3">Leads</th>
                        <th className="text-right py-2 px-3">Chamadas</th>
                        <th className="text-right py-2 px-3">Visitas</th>
                        <th className="text-right py-2 px-3">Fechos</th>
                        <th className="text-right py-2 px-3">CPA/Lead</th>
                        <th className="text-right py-2 px-3">CPA/Deal</th>
                        <th className="text-right py-2 px-3">Conversao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {av.cacCohort.map((c, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 px-3 font-medium text-gray-700">{c.mes}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{c.leads}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{c.chamadas}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{c.visitas}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-bold text-green-600">{c.fechos}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{c.cacPorLead ? EUR(c.cacPorLead) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{c.cacPorDeal ? EUR(c.cacPorDeal) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{PCT(c.taxaConversao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {av.reFinancials?.length > 0 && (
                <>
                  <SectionTitle>Metricas RE — Cash-on-Cash, IRR, Equity Multiple</SectionTitle>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                          <th className="text-left py-2 px-3">Negocio</th>
                          <th className="text-left py-2 px-3">Cat.</th>
                          <th className="text-right py-2 px-3">Cap. Proprio</th>
                          <th className="text-right py-2 px-3">Cap. Passivo</th>
                          <th className="text-right py-2 px-3">Cash-on-Cash</th>
                          <th className="text-right py-2 px-3">IRR</th>
                          <th className="text-right py-2 px-3">Eq. Multiple</th>
                          <th className="text-right py-2 px-3">DPI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {av.reFinancials.map((rf, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-2 px-3 font-medium text-gray-700">{rf.movimento}</td>
                            <td className="py-2 px-3 text-xs"><span className="px-2 py-0.5 bg-gray-100 rounded">{rf.categoria}</span></td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{EUR(rf.capitalProprio)}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{rf.capitalPassivo > 0 ? EUR(rf.capitalPassivo) : '—'}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs font-bold">{rf.cashOnCash != null ? PCT(rf.cashOnCash) : '—'}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{rf.irr != null ? PCT(rf.irr) : '—'}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{rf.equityMultiple != null ? `${rf.equityMultiple}x` : '—'}</td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{rf.dpi != null ? `${rf.dpi}x` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )
        })()}

        {/* ══════════ OKRs Q2 2026 ══════════ */}
        {tab === 'okrs' && data?.avancado?.okrs && (() => {
          const okrs = data.avancado.okrs
          const wa = data.avancado.weeklyActivity
          return (
            <>
              {/* Weekly Activity Score */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Weekly Activity Score</h3>
                  <span className={`text-2xl font-bold ${wa.score >= 70 ? 'text-green-600' : wa.score >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {wa.score}%
                  </span>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {Object.entries(wa).filter(([k]) => k !== 'score').map(([key, v]) => {
                    const pct = v.meta > 0 ? Math.min(100, Math.round(v.valor / v.meta * 100)) : 0
                    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
                    return (
                      <div key={key} className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">{label}</span>
                          <span className="font-semibold">{v.valor} / {v.meta}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                          <div className={`h-2.5 rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* OKRs */}
              <SectionTitle>OKRs Q2 2026</SectionTitle>
              <div className="flex flex-col gap-5">
                {okrs.map((okr, oi) => (
                  <div key={oi} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700">O{oi + 1}: {okr.objectivo}</h3>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-100 rounded-full h-3">
                          <div className={`h-3 rounded-full ${okr.progresso >= 75 ? 'bg-green-500' : okr.progresso >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${okr.progresso}%` }} />
                        </div>
                        <span className={`text-sm font-bold ${okr.progresso >= 75 ? 'text-green-600' : okr.progresso >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {okr.progresso}%
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {okr.krs.map((kr, ki) => {
                        const pct = kr.progresso
                        return (
                          <div key={ki} className="flex items-center gap-3">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              pct >= 100 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                            }`}>{pct >= 100 ? '✓' : ki + 1}</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-600">{kr.kr}</span>
                                <span className="font-mono font-semibold">{kr.valor}{kr.unidade} / {kr.meta}{kr.unidade}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div className={`h-2 rounded-full transition-all ${
                                  pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                                }`} style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        })()}

      </div>
    </>
  )
}
