import { useState, useEffect, useCallback } from 'react'
import { Home, Users, Briefcase, Trophy } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { EUR } from '../../constants.js'
import { PeriodSelector } from './PeriodSelector.jsx'
import { KpiCard } from '../ui/KpiCard.jsx'

const PERIODO_LABEL = { semana: 'esta semana', mes: 'este mês', trimestre: 'este trimestre', ano: 'este ano' }

const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-PT').format(n))
const fmtPct = (n) => (n == null ? '—' : `${n}%`)
const fmtDias = (n) => (n == null ? '—' : `${n} dias`)

// Card de métrica de fluxo: valor + comparação ▲▼ vs período anterior.
function MetricCard({ label, metric, format = fmtNum, tone = 'gold' }) {
  const valor = metric?.valor
  const delta = metric?.delta
  const sub = delta == null ? null
    : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} ${Math.abs(delta)}% vs anterior`
  return <KpiCard label={label} value={format(valor)} sub={sub} tone={tone} size="md" />
}

function EntityBlock({ icon: Icon, title, children }) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: '#0d0d0d', borderBottom: '1px solid #1a1a1a' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <Icon className="w-4 h-4" style={{ color: '#C9A84C' }} />
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

function Group({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">{children}</div>
    </div>
  )
}

export function ComercialDashboard({ regiao }) {
  const [periodo, setPeriodo] = useState('mes')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch(`/api/comercial/dashboard?periodo=${periodo}`, { regiao })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.error) throw new Error(j.error)
      setData(j)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [periodo, regiao])

  useEffect(() => { load() }, [load])

  const im = data?.imoveis, co = data?.consultores, inv = data?.investidores

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">Departamento Comercial</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Imóveis · Consultores · Investidores — {PERIODO_LABEL[periodo]}
            {data?.intervalo ? ` (${data.intervalo.de} a ${data.intervalo.ate})` : ''}
            {loading ? ' · a carregar…' : ''}
          </p>
        </div>
        <PeriodSelector value={periodo} onChange={setPeriodo} />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro ao carregar: {error}</div>
      )}

      {/* ───── IMÓVEIS ───── */}
      <EntityBlock icon={Home} title="Imóveis">
        <Group label="Métricas">
          <MetricCard label="Adicionados" metric={im?.metricas?.adicionados} />
          <MetricCard label="Chamadas" metric={im?.metricas?.chamadas} />
          <MetricCard label="Visitas" metric={im?.metricas?.visitas} />
          <MetricCard label="Estudos de Mercado" metric={im?.metricas?.em} />
          <MetricCard label="Propostas" metric={im?.metricas?.propostas} />
          <KpiCard label="Por contactar" value={fmtNum(im?.metricas?.backlogPorContactar)}
            sub="backlog 1.º contacto" tone={im?.metricas?.backlogPorContactar ? 'amber' : 'green'} size="md" />
        </Group>
        <Group label="KPI">
          <KpiCard label="Lucro médio / negócio" value={EUR(im?.kpi?.ticketMedio)} tone="green" size="md" />
          <KpiCard label="Chegam a proposta" value={fmtPct(im?.kpi?.taxaConversao)} tone="indigo" size="md" />
          <KpiCard label="Taxa de fecho" value={fmtPct(im?.kpi?.winRate)} tone="indigo" size="md" />
          <KpiCard label="Desconto médio" value={fmtPct(im?.kpi?.descontoMedio)} tone="amber" size="md" />
          <KpiCard label="Dias até fechar" value={fmtNum(im?.kpi?.cicloVendasDias)} sub="média lead → fecho" tone="blue" size="md" />
        </Group>
        {im?.origem?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">Origem / canal de captação</p>
            <div className="flex flex-col gap-1.5">
              {im.origem.slice(0, 6).map((o) => {
                const max = im.origem[0]?.total || 1
                return (
                  <div key={o.origem} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 w-32 truncate shrink-0">{o.origem}</span>
                    <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full h-2.5">
                      <div className="h-2.5 rounded-full" style={{ width: `${Math.round(o.total / max * 100)}%`, backgroundColor: '#C9A84C' }} />
                    </div>
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 w-6 text-right">{o.total}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </EntityBlock>

      {/* ───── CONSULTORES ───── */}
      <EntityBlock icon={Users} title="Consultores">
        <Group label="Métricas">
          <MetricCard label="Chamadas" metric={co?.metricas?.chamadas} />
          <MetricCard label="Novos consultores" metric={co?.metricas?.novos} />
          <MetricCard label="Chamadas Somnium" metric={co?.metricas?.chamadasSomnium} />
        </Group>
        <Group label="KPI">
          <KpiCard label="Taxa de conversão" value={fmtPct(co?.kpi?.taxaConversao)} tone="indigo" size="md" />
          <KpiCard label="Parceiros inativos" value={fmtPct(co?.kpi?.churn)} sub="60d sem enviar imóvel" tone={co?.kpi?.churn > 0 ? 'red' : 'green'} size="md" />
        </Group>
        {co?.premium?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-1.5">
              <Trophy className="w-3 h-3" style={{ color: '#C9A84C' }} /> Lista Premium — parceiros por valor gerado
            </p>
            <div className="flex flex-col gap-1">
              {co.premium.map((p, i) => (
                <div key={p.nome} className="flex items-center gap-2 text-sm py-1 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <span className="w-5 text-xs font-bold text-neutral-400">{i + 1}.</span>
                  <span className="flex-1 truncate text-neutral-800 dark:text-neutral-200">{p.nome}</span>
                  <span className="text-xs text-neutral-400">{p.imoveis} imóveis</span>
                  <span className="font-semibold text-neutral-900 dark:text-white w-24 text-right">{EUR(p.lucroGerado)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </EntityBlock>

      {/* ───── INVESTIDORES ───── */}
      <EntityBlock icon={Briefcase} title="Investidores">
        <Group label="Métricas">
          <MetricCard label="Discovery Calls" metric={inv?.metricas?.discoveryCalls} />
          <MetricCard label="Follow Up Calls" metric={inv?.metricas?.followUpCalls} />
          <MetricCard label="Novos investidores" metric={inv?.metricas?.novos} />
        </Group>
        <Group label="KPI">
          <KpiCard label="Taxa de conversão" value={fmtPct(inv?.kpi?.taxaConversao)} tone="indigo" size="md" />
          <KpiCard label="Investimento médio / slot" value={EUR(inv?.kpi?.ticketMedioSlot)} tone="green" size="md" />
          <KpiCard label="Saída de investidores" value={fmtPct(inv?.kpi?.churn)} tone={inv?.kpi?.churn > 0 ? 'red' : 'green'} size="md" />
          <KpiCard label="Capital perdido" value={EUR(inv?.kpi?.capitalChurn)}
            sub={inv?.kpi?.capitalChurnPct != null ? `${inv.kpi.capitalChurnPct}% do mobilizado` : null}
            tone={inv?.kpi?.capitalChurn > 0 ? 'red' : 'green'} size="md" />
          <KpiCard label="Capital mobilizado" value={EUR(inv?.capitalMobilizado)} tone="gold" size="md" />
        </Group>
      </EntityBlock>
    </div>
  )
}
