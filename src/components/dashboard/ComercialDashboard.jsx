import { useState, useEffect, useCallback } from 'react'
import { Target, Filter, Coins, Gauge, Wallet, Activity, Trophy } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { EUR } from '../../constants.js'
import { PeriodSelector } from './PeriodSelector.jsx'
import { KpiCard } from '../ui/KpiCard.jsx'

const PERIODO_LABEL = { semana: 'esta semana', mes: 'este mês', trimestre: 'este trimestre', ano: 'este ano' }

const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-PT').format(n))
const fmtPct = (n) => (n == null ? '—' : `${n}%`)
const fmtX = (n) => (n == null ? '—' : `${n}×`)

// Card de métrica de fluxo: valor + comparação ▲▼ vs período anterior.
function MetricCard({ label, metric, format = fmtNum, tone = 'gold' }) {
  const delta = metric?.delta
  const sub = delta == null ? null : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} ${Math.abs(delta)}% vs anterior`
  return <KpiCard label={label} value={format(metric?.valor)} sub={sub} tone={tone} size="md" />
}

function Pillar({ icon: Icon, title, hint, children }) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: '#0d0d0d', borderBottom: '1px solid #1a1a1a' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <Icon className="w-4 h-4" style={{ color: '#C9A84C' }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {hint && <p className="text-[10px] text-neutral-500">{hint}</p>}
        </div>
      </div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

function Group({ label, children }) {
  return (
    <div>
      {label && <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">{label}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">{children}</div>
    </div>
  )
}

function RankList({ rows, valueFmt }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={r.nome || r.origem} className="flex items-center gap-2 text-sm py-1 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
          <span className="w-5 text-xs font-bold text-neutral-400">{i + 1}.</span>
          <span className="flex-1 truncate text-neutral-800 dark:text-neutral-200">{r.nome || r.origem}</span>
          {r.imoveis != null && <span className="text-xs text-neutral-400">{r.imoveis} imóveis</span>}
          <span className="font-semibold text-neutral-900 dark:text-white w-24 text-right">{valueFmt(r.lucroGerado ?? r.lucro)}</span>
        </div>
      ))}
    </div>
  )
}

export function ComercialDashboard({ regiao }) {
  const [periodo, setPeriodo] = useState('mes')
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch(`/api/comercial/dashboard?periodo=${periodo}`, { regiao })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.error) throw new Error(j.error)
      setD(j)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [periodo, regiao])

  useEffect(() => { load() }, [load])

  const ns = d?.northStar, fn = d?.funil, ec = d?.economia, ve = d?.velocidade, ca = d?.capital, at = d?.atividade, co = d?.consultores
  const conv = fn?.conversao

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">Departamento Comercial</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {PERIODO_LABEL[periodo]}{d?.intervalo ? ` (${d.intervalo.de} a ${d.intervalo.ate})` : ''}{loading ? ' · a carregar…' : ''}
          </p>
        </div>
        <PeriodSelector value={periodo} onChange={setPeriodo} />
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro ao carregar: {error}</div>}

      {/* ───── NORTH STAR ───── */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg bg-gradient-to-br from-brand-dark via-brand-dark-light to-brand-dark-700">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-brand-gold mb-1">North Star</p>
            <h3 className="text-base font-semibold">Lucro por € de capital / ano</h3>
            <p className="text-xs text-white/50 mt-0.5">ROIC anualizado — origina × margem × velocidade × capital</p>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-3xl font-bold font-mono" style={{ color: '#C9A84C' }}>{fmtPct(ns?.roicAnualizado)}</p>
              <p className="text-[10px] uppercase tracking-widest text-white/40 mt-0.5">ROIC anualizado</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-white">{EUR(ns?.lucroLiquido)}</p>
              <p className="text-[10px] uppercase tracking-widest text-white/40 mt-0.5">Lucro no período</p>
            </div>
          </div>
        </div>
      </div>

      {/* ───── PILAR 1 — ORIGINAÇÃO & FUNIL ───── */}
      <Pillar icon={Filter} title="Originação & Funil" hint="qualidade do deal flow, não só volume">
        <Group label="Atividade (leading)">
          <MetricCard label="Adicionados" metric={fn?.atividade?.adicionados} />
          <MetricCard label="Chamadas" metric={fn?.atividade?.chamadas} />
          <MetricCard label="Visitas" metric={fn?.atividade?.visitas} />
          <MetricCard label="Estudos de Mercado" metric={fn?.atividade?.em} />
          <MetricCard label="Propostas" metric={fn?.atividade?.propostas} />
          <KpiCard label="Por contactar" value={fmtNum(fn?.backlogPorContactar)} sub="backlog 1.º contacto" tone={fn?.backlogPorContactar ? 'amber' : 'green'} size="md" />
        </Group>
        <Group label="Eficiência do funil">
          <KpiCard label="Aprovação em análise" value={fmtPct(fn?.aprovacaoAnalise)} sub="Underwriting pass" tone="indigo" size="md" />
          <KpiCard label="Chegam a proposta" value={fmtPct(fn?.chegamProposta)} sub="Conversion" tone="indigo" size="md" />
          <KpiCard label="Taxa de fecho" value={fmtPct(fn?.taxaFecho)} sub="Win rate" tone="green" size="md" />
        </Group>
        {conv && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">Conversão por fase</p>
            <div className="flex flex-col gap-1.5">
              {[['Chamada', conv.chamada], ['Visita', conv.visita], ['Análise', conv.analise], ['Proposta', conv.proposta]].map(([lbl, v]) => (
                <div key={lbl} className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 w-20 shrink-0">{lbl}</span>
                  <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, v || 0)}%`, backgroundColor: '#C9A84C' }} />
                  </div>
                  <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 w-12 text-right">{fmtPct(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {fn?.origem?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">Origem / canal de captação</p>
            <div className="flex flex-col gap-1.5">
              {fn.origem.slice(0, 6).map((o) => {
                const max = fn.origem[0]?.total || 1
                return (
                  <div key={o.origem} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 w-32 truncate shrink-0">{o.origem}</span>
                    <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full h-2.5">
                      <div className="h-2.5 rounded-full" style={{ width: `${Math.round(o.total / max * 100)}%`, backgroundColor: '#8a6d2f' }} />
                    </div>
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 w-6 text-right">{o.total}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Pillar>

      {/* ───── PILAR 2 — UNIT ECONOMICS ───── */}
      <Pillar icon={Coins} title="Economia por negócio" hint="quanto vale e custa cada deal">
        <Group>
          <KpiCard label="Lucro médio / negócio" value={EUR(ec?.lucroMedio)} sub="Ticket médio" tone="green" size="md" />
          <KpiCard label="Margem média" value={fmtPct(ec?.margemPct)} sub="Margin %" tone="green" size="md" />
          <KpiCard label="Custo por negócio" value={EUR(ec?.cac)} sub="CAC" tone="amber" size="md" />
          <KpiCard label="ROI médio" value={fmtPct(ec?.roiMedio)} sub="ROI" tone="indigo" size="md" />
          <KpiCard label="ROI anualizado" value={fmtPct(ec?.roiAnualizadoMedio)} sub="Annualized ROI" tone="indigo" size="md" />
          <KpiCard label="Desconto médio" value={fmtPct(ec?.descontoMedio)} sub="Discount rate" tone="amber" size="md" />
        </Group>
      </Pillar>

      {/* ───── PILAR 3 — VELOCIDADE & CAPITAL ───── */}
      <Pillar icon={Gauge} title="Velocidade & eficiência do capital" hint="onde se ganha mesmo: rapidez e rotação">
        <Group>
          <KpiCard label="Dias até fechar" value={fmtNum(ve?.diasAteFechar)} sub="Sales cycle" tone="blue" size="md" />
          <KpiCard label="Rotação de capital" value={fmtX(ve?.capitalTurns)} sub="Capital turns / ano" tone="gold" size="md" />
          <KpiCard label="Ritmo de fecho" value={fmtNum(ve?.throughput)} sub="Deals / mês" tone="green" size="md" />
          <KpiCard label="Pipeline ponderado" value={EUR(d?.pipelinePonderado)} sub="Weighted pipeline" tone="gold" size="md" />
        </Group>
      </Pillar>

      {/* ───── PILAR 4 — CAPITAL & RELAÇÕES ───── */}
      <Pillar icon={Wallet} title="Capital & relações" hint="saúde do motor de funding">
        <Group>
          <KpiCard label="Capital mobilizado" value={EUR(ca?.mobilizado)} sub="Deployed" tone="gold" size="md" />
          <KpiCard label="Capital disponível" value={EUR(ca?.disponivel)} sub="Dry powder" tone="green" size="md" />
          <KpiCard label="Fluxo líquido" value={EUR(ca?.netFlow)} sub="Net capital flow" tone={ca?.netFlow < 0 ? 'red' : 'green'} size="md" />
          <KpiCard label="Reinvestimento" value={fmtPct(ca?.reinvestimento)} sub="Reinvestment rate" tone="green" size="md" />
          <KpiCard label="Concentração top-3" value={fmtPct(ca?.concentracaoTop3)} sub="Concentration (risco)" tone={ca?.concentracaoTop3 > 60 ? 'red' : 'amber'} size="md" />
          <KpiCard label="Investimento médio / slot" value={EUR(ca?.ticketMedioSlot)} sub="Ticket / slot" tone="green" size="md" />
          <KpiCard label="Conversão investidor" value={fmtPct(ca?.taxaConvInvestidor)} sub="Investor conversion" tone="indigo" size="md" />
          <KpiCard label="Saída de investidores" value={fmtPct(ca?.saidaInvestidores)} sub="Churn" tone={ca?.saidaInvestidores > 0 ? 'red' : 'green'} size="md" />
          <KpiCard label="Capital perdido" value={EUR(ca?.capitalPerdido)} sub={ca?.capitalPerdidoPct != null ? `Capital churn · ${ca.capitalPerdidoPct}%` : 'Capital churn'} tone={ca?.capitalPerdido > 0 ? 'red' : 'green'} size="md" />
        </Group>
      </Pillar>

      {/* ───── ATIVIDADE & CANAIS ───── */}
      <Pillar icon={Activity} title="Atividade & canais" hint="motor de contactos, parceiros e fontes">
        <Group label="Investidores">
          <MetricCard label="Discovery Calls" metric={at?.discoveryCalls} tone="amber" />
          <MetricCard label="Follow Up Calls" metric={at?.followUpCalls} tone="indigo" />
          <KpiCard label="Novos investidores" value={fmtNum(at?.novosInvestidores)} tone="gold" size="md" />
        </Group>
        <Group label="Consultores">
          <KpiCard label="Chamadas" value={fmtNum(at?.chamadasConsultor)} tone="gold" size="md" />
          <KpiCard label="Chamadas Somnium" value={fmtNum(at?.chamadasSomnium)} tone="gold" size="md" />
          <KpiCard label="Novos consultores" value={fmtNum(at?.novosConsultores)} tone="gold" size="md" />
          <KpiCard label="Taxa de conversão" value={fmtPct(co?.taxaConversao)} sub="Conversion" tone="indigo" size="md" />
          <KpiCard label="Ativação" value={fmtPct(co?.ativacao)} sub="Activation rate" tone="green" size="md" />
          <KpiCard label="Parceiros inativos" value={fmtPct(co?.parceirosInativos)} sub="Churn · 60d s/ imóvel" tone={co?.parceirosInativos > 0 ? 'red' : 'green'} size="md" />
        </Group>
        {co?.premium?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-1.5">
              <Trophy className="w-3 h-3" style={{ color: '#C9A84C' }} /> Lista Premium — parceiros por valor gerado
            </p>
            <RankList rows={co.premium} valueFmt={EUR} />
          </div>
        )}
        {co?.lucroPorFonte?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">Lucro por fonte / canal</p>
            <RankList rows={co.lucroPorFonte} valueFmt={EUR} />
          </div>
        )}
      </Pillar>
    </div>
  )
}
