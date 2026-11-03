import { Wallet, Receipt, Calculator } from 'lucide-react'
import { EUR } from '../../constants.js'
import { Pillar, Group, fmtPct } from './_shared.jsx'
import { resumoAnalisesNegocios } from '../../../supabase/functions/_shared/regrasDashboard.js'
import { Indicador, PorMedir } from './Indicador.jsx'

// Departamento Financeiro — resultado, capital e tesouraria. Nada aqui é fecho
// realizado enquanto não houver escrituras de venda registadas.
export function FinanceiroDashboard({ data: d, finKpis: f, analises: a }) {
  const ca = d?.capital
  const pct = (v) => (v == null ? null : fmtPct(v))
  const eur = (v) => (v == null ? null : EUR(v))
  const vencidos = f?.tranchesAtrasadas?.reduce((s, t) => s + t.valor, 0)
  const r = resumoAnalisesNegocios(a?.analises)

  return (
    <div className="flex flex-col gap-5">
      <Pillar icon={Receipt} title="Tesouraria" hint="totais atuais, não dependem do período">
        <Group>
          <Indicador id="W01" value={eur(f?.lucroRealTotal)} tone="green" />
          <Indicador id="G45" value={eur(f?.lucroPendente)} tone="amber" />
          <Indicador id="F07" value={eur(vencidos)} tone={vencidos > 0 ? 'red' : 'green'} />
          <Indicador id="F02" value={eur(f?.burnRate)} tone="amber" />
          <Indicador id="G43" value={eur(f?.lucroEstimadoTotal)} />
        </Group>
      </Pillar>

      {r.total > 0 && (
        <Pillar icon={Calculator} title="Análises de rentabilidade" hint={`${r.total} ${r.total === 1 ? 'negócio' : 'negócios'} · valores previstos`}>
          <Group>
            <Indicador id="P03" value={eur(r.lucro)} tone="green" />
            <Indicador id="P04" value={pct(r.retornoTotal)} sub="alvo: 20% a 25%" tone="indigo" />
            <Indicador id="G53" value={pct(r.retornoAnualizado)} tone="indigo" />
            <Indicador id="G51" value={eur(r.capital)} />
          </Group>
        </Pillar>
      )}

      <Pillar icon={Wallet} title="Capital" hint="capital efetivamente investido">
        <Group>
          <Indicador id="I03" value={eur(ca?.mobilizado)} sub="só capital recebido" tone="green" />
          <Indicador id="G40" value={eur(ca?.ticketMedioSlot)} tone="green" />
          <Indicador id="I08" value={pct(ca?.concentracaoTop3)} tone={ca?.concentracaoTop3 > 60 ? 'red' : 'amber'} />
          <Indicador id="G42" value={eur(ca?.capitalPerdido)} sub={ca?.capitalPerdidoPct != null ? `${ca.capitalPerdidoPct}% do capital` : undefined} tone={ca?.capitalPerdido > 0 ? 'red' : 'green'} />
        </Group>
      </Pillar>

      <PorMedir departamento="financeiro" />
    </div>
  )
}
