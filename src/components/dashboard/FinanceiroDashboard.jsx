import { useState } from 'react'
import { Receipt, Wallet, Calculator } from 'lucide-react'
import { EUR } from '../../constants.js'
import { POR_MEDIR } from '../../lib/catalogoMetricas.js'
import { resumoAnalisesNegocios } from '../../../supabase/functions/_shared/regrasDashboard.js'
import { Subdivisoes, Bloco, Numeros, PrecisaAcao, pctOuNulo } from './_shared.jsx'
import { Indicador, PorMedir } from './Indicador.jsx'
import { PeriodSelector } from './PeriodSelector.jsx'

// Departamento Financeiro: caixa, capital e rentabilidade em vistas separadas.
const SUBDIVISOES = [
  { key: 'caixa',         label: 'Caixa e recebimentos', icon: Receipt },
  { key: 'capital',       label: 'Capital',              icon: Wallet },
  { key: 'rentabilidade', label: 'Rentabilidade',        icon: Calculator },
]

const eur = (v) => (v == null ? null : EUR(v))

export function FinanceiroDashboard({ data: d, finKpis: f, analises: a, periodo, onPeriodo }) {
  const [sub, setSub] = useState('caixa')
  const ca = d?.capital
  const vencidos = f?.tranchesAtrasadas?.reduce((s, t) => s + t.valor, 0)
  const r = resumoAnalisesNegocios(a?.analises)

  return (
    <div className="flex flex-col gap-5">
      <Subdivisoes items={SUBDIVISOES} value={sub} onChange={setSub} />

      {sub === 'caixa' && <>
        <PrecisaAcao itens={[{ valor: f?.tranchesAtrasadas?.length, texto: 'recebimentos vencidos', para: '/financeiro' }]} />
        <Bloco titulo="Situação atual">
          <Numeros>
            <Indicador id="W01" value={eur(f?.lucroRealTotal)} tone="green" />
            <Indicador id="G45" value={eur(f?.lucroPendente)} tone="amber" />
            <Indicador id="F07" value={eur(vencidos)} tone={vencidos > 0 ? 'red' : 'green'} />
            <Indicador id="F02" value={eur(f?.burnRate)} tone="amber" />
          </Numeros>
        </Bloco>
      </>}

      {sub === 'capital' && <>
        <Bloco titulo="Situação atual" nota="capital efetivamente investido">
          <Numeros>
            <Indicador id="I03" value={eur(ca?.mobilizado)} sub="só capital recebido" tone="green" />
            <Indicador id="G40" value={eur(ca?.ticketMedioSlot)} tone="green" />
            <Indicador id="I08" value={pctOuNulo(ca?.concentracaoTop3)} tone={ca?.concentracaoTop3 > 60 ? 'red' : 'amber'} />
          </Numeros>
        </Bloco>
        <Bloco titulo="No período" nota={d?.intervalo ? `${d.intervalo.de} a ${d.intervalo.ate}` : undefined} acao={<PeriodSelector value={periodo} onChange={onPeriodo} />}>
          <Numeros>
            <Indicador id="G42" value={eur(ca?.capitalPerdido)} sub={ca?.capitalPerdidoPct != null ? `${pctOuNulo(ca.capitalPerdidoPct)} do capital` : undefined} tone={ca?.capitalPerdido > 0 ? 'red' : 'green'} />
          </Numeros>
        </Bloco>
      </>}

      {sub === 'rentabilidade' && (
        <Bloco titulo="Previsto" nota={r.total > 0 ? `${r.total} ${r.total === 1 ? 'negócio com análise' : 'negócios com análise'}` : undefined}>
          <Numeros>
            <Indicador id="G43" value={eur(f?.lucroEstimadoTotal)} />
            {r.total > 0 && <>
              <Indicador id="P03" value={eur(r.lucro)} tone="green" />
              <Indicador id="P04" value={pctOuNulo(r.retornoTotal)} sub="alvo: 20% a 25%" tone="indigo" />
              <Indicador id="G53" value={pctOuNulo(r.retornoAnualizado)} tone="indigo" />
              <Indicador id="G51" value={eur(r.capital)} />
            </>}
          </Numeros>
        </Bloco>
      )}

      <PorMedir ids={POR_MEDIR.financeiro[sub]} />
    </div>
  )
}
