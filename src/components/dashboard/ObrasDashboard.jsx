import { Construction } from 'lucide-react'
import { EUR } from '../../constants.js'
import { Pillar, Group, fmtNum } from './_shared.jsx'
import { Indicador, PorMedir } from './Indicador.jsx'

// Departamento de Obras — custo, prazo e bloqueios dos projetos em curso.
export function ObrasDashboard({ data: d }) {
  const o = d?.obras, f = o?.fases
  return (
    <div className="flex flex-col gap-5">
      <Pillar icon={Construction} title="Projetos" hint="situação atual, não depende do período">
        <Group>
          <Indicador id="G46" value={fmtNum(o?.negociosAtivos)} sub={o ? `${o.negociosTotal} no total` : undefined} />
          <Indicador id="O01" value={o ? `${o.comAnaliseFinal} de ${o.negociosTotal}` : null} sub="com análise final" />
          <Indicador id="O02" value={o ? EUR(o.custoReal) : null} tone="amber" />
          <Indicador id="O07" value={fmtNum(f?.atrasadas)} tone={f?.atrasadas ? 'red' : 'green'}
            sub={f ? `até ${f.maiorAtrasoDias} dias · ${f.comPrevisao} de ${f.total} fases com data` : undefined} />
        </Group>
      </Pillar>
      <PorMedir departamento="obras" />
    </div>
  )
}
