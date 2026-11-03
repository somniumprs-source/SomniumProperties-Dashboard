import { useState } from 'react'
import { Filter, Gauge, Users, Trophy, LayoutGrid } from 'lucide-react'
import { EUR } from '../../constants.js'
import { Tabs } from '../ui/Tabs.jsx'
import { Pillar, Group, RankList, fmtNum, fmtPct } from './_shared.jsx'
import { Indicador, PorMedir } from './Indicador.jsx'

// Sub-vistas do departamento Comercial. Permitem ver cada pilar 1 a 1
// (em vez de todos empilhados) — "Tudo" mantém a visão geral.
const SUB_TABS = [
  { key: 'tudo',          label: 'Tudo',                    icon: LayoutGrid },
  { key: 'funil',         label: 'Originação & Funil',      icon: Filter },
  { key: 'velocidade',    label: 'Velocidade de vendas',    icon: Gauge },
  { key: 'investidores',  label: 'Investidores & Parceiros', icon: Users },
]

// Departamento Comercial — só o que a equipa comercial aciona:
// originar, converter e gerir relações (investidores + consultores).
// Métricas financeiras (lucro, margem, ROI, capital) vivem no Financeiro.
export function ComercialDashboard({ data: d, comKpis }) {
  const [sub, setSub] = useState('tudo')
  // null = sem base de cálculo neste período; nunca aparece como 0.
  const pct = (v) => (v == null ? null : fmtPct(v))
  const num = (v) => (v == null ? null : fmtNum(v))
  const fn = d?.funil, ve = d?.velocidade, ca = d?.capital, at = d?.atividade, co = d?.consultores
  const conv = fn?.conversao
  const show = (key) => sub === 'tudo' || sub === key

  // ───── PILAR 1 — ORIGINAÇÃO & FUNIL ─────
  const pilarFunil = (
    <Pillar icon={Filter} title="Originação & Funil" hint="qualidade do deal flow, não só volume">
      <Group label="Atividade (leading)">
        <Indicador id="G01" value={fmtNum(fn?.atividade?.adicionados?.valor)} delta={fn?.atividade?.adicionados?.delta} />
        <Indicador id="G02" value={fmtNum(fn?.atividade?.chamadas?.valor)} delta={fn?.atividade?.chamadas?.delta}
          sub={fn?.chamadasCobertura ? `${fn.chamadasCobertura.com} de ${fn.chamadasCobertura.total} imóveis com chamada` : undefined} />
        <Indicador id="G03" value={fmtNum(fn?.atividade?.visitas?.valor)} delta={fn?.atividade?.visitas?.delta} />
        <Indicador id="G04" value={fmtNum(fn?.atividade?.em?.valor)} delta={fn?.atividade?.em?.delta} />
        <Indicador id="G05" value={fmtNum(fn?.atividade?.propostas?.valor)} delta={fn?.atividade?.propostas?.delta} />
        <Indicador id="G06" value={fmtNum(fn?.backlogPorContactar)} tone={fn?.backlogPorContactar ? 'amber' : 'green'} />
      </Group>
      <Group label="Eficiência do funil">
        <Indicador id="C02" value={pct(fn?.chamadaVisita)} tone="indigo" />
        <Indicador id="C03" value={pct(fn?.visitaProposta)} tone="indigo" />
        <Indicador id="G07" value={pct(fn?.aprovacaoAnalise)} tone="indigo" />
        <Indicador id="G08" value={pct(fn?.chegamProposta)} tone="indigo" />
        <Indicador id="G09" value={pct(fn?.taxaFecho)} tone="green" />
        <Indicador id="G10" value={pct(d?.economia?.descontoMedio)} tone="amber" />
      </Group>
      {conv && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted mb-2">Conversão por fase</p>
          <div className="flex flex-col gap-1.5">
            {[['Chamada', conv.chamada], ['Visita', conv.visita], ['Análise', conv.analise], ['Proposta', conv.proposta]].map(([lbl, v]) => (
              <div key={lbl} className="flex items-center gap-2">
                <span className="text-xs text-ink-muted w-20 shrink-0">{lbl}</span>
                <div className="flex-1 bg-surface-muted  rounded-full h-2.5">
                  <div className="h-2.5 rounded-full bg-accent" style={{ width: `${Math.min(100, v || 0)}%` }} />
                </div>
                <span className="text-xs font-semibold text-ink num w-12 text-right">{fmtPct(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {fn?.origem?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted mb-2">Origem / canal de captação</p>
          <div className="flex flex-col gap-1.5">
            {fn.origem.slice(0, 6).map((o) => {
              const max = fn.origem[0]?.total || 1
              return (
                <div key={o.origem} className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted w-32 truncate shrink-0">{o.origem}</span>
                  <div className="flex-1 bg-surface-muted  rounded-full h-2.5">
                    <div className="h-2.5 rounded-full bg-ink-muted/60" style={{ width: `${Math.round(o.total / max * 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-ink num w-6 text-right">{o.total}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Pillar>
  )

  // ───── PILAR 2 — VELOCIDADE DE VENDAS ─────
  const pilarVelocidade = (
    <Pillar icon={Gauge} title="Velocidade de vendas" hint="rapidez e ritmo do pipeline">
      <Group>
        <Indicador id="G12" value={num(ve?.diasAteFechar)} tone="blue" />
        <Indicador id="C11" value={num(fn?.diasNaFase?.mediana)} sub={fn?.diasNaFase ? `mediana de ${fn.diasNaFase.amostra} imóveis` : undefined} tone="amber" />
        <Indicador id="G14" value={d ? EUR(d.pipelinePonderado) : null} sub="probabilidades estimadas" tone="gold" />
      </Group>
    </Pillar>
  )

  // ───── PILAR 3 — INVESTIDORES & PARCEIROS (relação) ─────
  const pilarInvestidores = (
    <Pillar icon={Users} title="Investidores & Parceiros" hint="aquisição e relação — não a contabilidade do capital">
      <Group label="Investidores">
        <Indicador id="I10" value={ca?.parceria ? `${ca.parceria.porEstado} / ${ca.parceria.comAporte}` : null} sub="por estado / com capital" tone="green" />
        <Indicador id="I01" value={d ? EUR(ca?.capacidadeDeclarada) : null} sub="potencial, não confirmado" tone="amber" />
        <Indicador id="G47" value={fmtNum(comKpis?.investClassificados)} tone="indigo" />
        <Indicador id="G16" value={fmtNum(at?.followUpCalls?.valor)} delta={at?.followUpCalls?.delta} tone="indigo" />
        <Indicador id="G17" value={fmtNum(at?.novosInvestidores)} delta={at?.deltas?.novosInvestidores} />
        <Indicador id="G18" value={pct(ca?.taxaConvInvestidor)} tone="indigo" />
        <Indicador id="G19" value={pct(ca?.reinvestimento)} tone="green" />
        <Indicador id="G20" value={pct(ca?.saidaInvestidores)} tone={ca?.saidaInvestidores > 0 ? 'red' : 'green'} />
      </Group>
      <Group label="Consultores">
        <Indicador id="C16" value={fmtNum(at?.chamadasConsultor)} delta={at?.deltas?.chamadasConsultor} sub="chamadas no período" />
        <Indicador id="G22" value={fmtNum(at?.chamadasSomnium)} delta={at?.deltas?.chamadasSomnium} />
        <Indicador id="G23" value={fmtNum(at?.novosConsultores)} delta={at?.deltas?.novosConsultores} />
        <Indicador id="G24" value={pct(co?.taxaConversao)} tone="indigo" />
        <Indicador id="G25" value={pct(co?.ativacao)} tone="green" />
        <Indicador id="G26" value={pct(co?.parceirosInativos)} tone={co?.parceirosInativos > 0 ? 'red' : 'green'} />
      </Group>
      {co?.premium?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted mb-2 flex items-center gap-1.5">
            <Trophy className="w-3 h-3 text-ink-muted" /> Lista Premium — parceiros por imóveis enviados (lucro gerado por ligar)
          </p>
          <RankList rows={co.premium} valueFmt={(v) => (v ? EUR(v) : '—')} />
        </div>
      )}
    </Pillar>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Sub-seletor — escolher cada pilar 1 a 1 (ou "Tudo") */}
      <Tabs variant="segmented" size="sm" items={SUB_TABS} value={sub} onChange={setSub} className="self-start" />

      {show('funil') && pilarFunil}
      {show('velocidade') && pilarVelocidade}
      {show('investidores') && pilarInvestidores}
      <PorMedir departamento="comercial" />
    </div>
  )
}
