import { Filter, Gauge, Users, Trophy } from 'lucide-react'
import { EUR } from '../../constants.js'
import { KpiCard } from '../ui/KpiCard.jsx'
import { Pillar, Group, MetricCard, RankList, fmtNum, fmtPct } from './_shared.jsx'

// Departamento Comercial — só o que a equipa comercial aciona:
// originar, converter e gerir relações (investidores + consultores).
// Métricas financeiras (lucro, margem, ROI, capital) vivem no Financeiro.
export function ComercialDashboard({ data: d }) {
  const fn = d?.funil, ve = d?.velocidade, ca = d?.capital, at = d?.atividade, co = d?.consultores
  const conv = fn?.conversao

  return (
    <div className="flex flex-col gap-5">
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
          <KpiCard label="Desconto médio" value={fmtPct(d?.economia?.descontoMedio)} sub="Discount rate · negociação" tone="amber" size="md" />
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

      {/* ───── PILAR 2 — VELOCIDADE DE VENDAS ───── */}
      <Pillar icon={Gauge} title="Velocidade de vendas" hint="rapidez e ritmo do pipeline">
        <Group>
          <KpiCard label="Dias até fechar" value={fmtNum(ve?.diasAteFechar)} sub="Sales cycle" tone="blue" size="md" />
          <KpiCard label="Ritmo de fecho" value={fmtNum(ve?.throughput)} sub="Deals / mês" tone="green" size="md" />
          <KpiCard label="Pipeline ponderado" value={EUR(d?.pipelinePonderado)} sub="Weighted pipeline" tone="gold" size="md" />
        </Group>
      </Pillar>

      {/* ───── PILAR 3 — INVESTIDORES & PARCEIROS (relação) ───── */}
      <Pillar icon={Users} title="Investidores & Parceiros" hint="aquisição e relação — não a contabilidade do capital">
        <Group label="Investidores">
          <MetricCard label="Discovery Calls" metric={at?.discoveryCalls} tone="amber" />
          <MetricCard label="Follow Up Calls" metric={at?.followUpCalls} tone="indigo" />
          <KpiCard label="Novos investidores" value={fmtNum(at?.novosInvestidores)} tone="gold" size="md" />
          <KpiCard label="Conversão investidor" value={fmtPct(ca?.taxaConvInvestidor)} sub="Investor conversion" tone="indigo" size="md" />
          <KpiCard label="Reinvestimento" value={fmtPct(ca?.reinvestimento)} sub="Reinvestment rate" tone="green" size="md" />
          <KpiCard label="Saída de investidores" value={fmtPct(ca?.saidaInvestidores)} sub="Churn" tone={ca?.saidaInvestidores > 0 ? 'red' : 'green'} size="md" />
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
