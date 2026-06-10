import { Coins, Wallet } from 'lucide-react'
import { EUR } from '../../constants.js'
import { KpiCard } from '../ui/KpiCard.jsx'
import { Pillar, Group, fmtNum, fmtPct, fmtX } from './_shared.jsx'

// Departamento Financeiro — resultado e capital (a contabilidade do que o
// Comercial gera). Alimentado pelo mesmo snapshot de dados do CRM.
export function FinanceiroDashboard({ data: d }) {
  const ec = d?.economia, ve = d?.velocidade, ca = d?.capital

  return (
    <div className="flex flex-col gap-5">
      {/* ───── ECONOMIA POR NEGÓCIO ───── */}
      <Pillar icon={Coins} title="Economia por negócio" hint="quanto vale e custa cada deal">
        <Group>
          <KpiCard label="Lucro médio / negócio" value={EUR(ec?.lucroMedio)} sub="Ticket médio" tone="green" size="md" />
          <KpiCard label="Margem média" value={fmtPct(ec?.margemPct)} sub="Margin %" tone="green" size="md" />
          <KpiCard label="Custo por negócio" value={EUR(ec?.cac)} sub="CAC" tone="amber" size="md" />
          <KpiCard label="ROI médio" value={fmtPct(ec?.roiMedio)} sub="ROI" tone="indigo" size="md" />
          <KpiCard label="ROI anualizado" value={fmtPct(ec?.roiAnualizadoMedio)} sub="Annualized ROI" tone="indigo" size="md" />
        </Group>
      </Pillar>

      {/* ───── CAPITAL & EFICIÊNCIA ───── */}
      <Pillar icon={Wallet} title="Capital & eficiência" hint="motor de funding e rotação do capital">
        <Group>
          <KpiCard label="Capital mobilizado" value={EUR(ca?.mobilizado)} sub="Deployed" tone="gold" size="md" />
          <KpiCard label="Capital disponível" value={EUR(ca?.disponivel)} sub="Dry powder" tone="green" size="md" />
          <KpiCard label="Fluxo líquido" value={EUR(ca?.netFlow)} sub="Net capital flow" tone={ca?.netFlow < 0 ? 'red' : 'green'} size="md" />
          <KpiCard label="Rotação de capital" value={fmtX(ve?.capitalTurns)} sub="Capital turns / ano" tone="gold" size="md" />
          <KpiCard label="Investimento médio / slot" value={EUR(ca?.ticketMedioSlot)} sub="Ticket / slot" tone="green" size="md" />
          <KpiCard label="Concentração top-3" value={fmtPct(ca?.concentracaoTop3)} sub="Concentration (risco)" tone={ca?.concentracaoTop3 > 60 ? 'red' : 'amber'} size="md" />
          <KpiCard label="Capital perdido" value={EUR(ca?.capitalPerdido)} sub={ca?.capitalPerdidoPct != null ? `Capital churn · ${ca.capitalPerdidoPct}%` : 'Capital churn'} tone={ca?.capitalPerdido > 0 ? 'red' : 'green'} size="md" />
        </Group>
      </Pillar>
    </div>
  )
}
