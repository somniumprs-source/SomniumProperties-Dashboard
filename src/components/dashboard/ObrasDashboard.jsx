import { useState } from 'react'
import { Construction, CalendarClock } from 'lucide-react'
import { EUR } from '../../constants.js'
import { POR_MEDIR } from '../../lib/catalogoMetricas.js'
import { Subdivisoes, Bloco, Numeros, PrecisaAcao, fmtNum, fmtData } from './_shared.jsx'
import { Indicador, PorMedir } from './Indicador.jsx'

// Departamento de Obras: cada projeto no seu cartão, prazos e bloqueios à parte.
const SUBDIVISOES = [
  { key: 'projetos', label: 'Projetos',           icon: Construction },
  { key: 'prazos',   label: 'Prazos e bloqueios', icon: CalendarClock },
]

function Dado({ titulo, children }) {
  return (
    <div>
      <dt className="text-overline uppercase text-ink-muted">{titulo}</dt>
      <dd className="text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

function CartaoProjeto({ p }) {
  return (
    <article className="rounded-xl border border-line bg-surface-raised p-4 flex flex-col gap-3">
      <div>
        <h4 className="font-semibold text-ink">{p.nome}</h4>
        <p className="text-caption text-ink-muted">{p.modelo}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Dado titulo="Fases em curso">{p.fasesEmCurso.join(', ') || 'Nenhuma'}</Dado></div>
        <Dado titulo="Atraso">{p.prazos.atrasadas ? `${p.prazos.atrasadas} ${p.prazos.atrasadas === 1 ? 'fase' : 'fases'}, até ${p.prazos.maiorAtrasoDias} dias` : 'Sem atraso registado'}</Dado>
        <Dado titulo="Fases com data">{p.prazos.comPrevisao} de {p.prazos.total}</Dado>
        <Dado titulo="Custo real">{EUR(p.custoReal)}</Dado>
        <Dado titulo="Venda prevista">{fmtData(p.vendaPrevista)}</Dado>
        <div className="col-span-2"><Dado titulo="Próximo bloqueio">Por registar</Dado></div>
      </dl>
    </article>
  )
}

export function ObrasDashboard({ data: d }) {
  const [sub, setSub] = useState('projetos')
  const o = d?.obras, f = o?.fases
  return (
    <div className="flex flex-col gap-5">
      <Subdivisoes items={SUBDIVISOES} value={sub} onChange={setSub} />
      <PrecisaAcao itens={[{ valor: f?.atrasadas, texto: 'fases em atraso', para: '/projectos' }]} />

      {sub === 'projetos' && <>
        <Bloco titulo="Projetos" nota="situação atual">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {o?.projetos?.map(p => <CartaoProjeto key={p.id} p={p} />)}
          </div>
        </Bloco>
        <Bloco titulo="Situação atual">
          <Numeros>
            <Indicador id="G46" value={fmtNum(o?.negociosAtivos)} />
            <Indicador id="O01" value={o ? `${o.comAnaliseFinal} de ${o.negociosTotal}` : null} sub="com análise final" />
            <Indicador id="O02" value={o ? EUR(o.custoReal) : null} tone="amber" />
          </Numeros>
        </Bloco>
      </>}

      {sub === 'prazos' && (
        <Bloco titulo="Prazos" nota="situação atual">
          <Numeros>
            <Indicador id="O07" value={fmtNum(f?.atrasadas)} tone={f?.atrasadas ? 'red' : 'green'} sub={f ? `até ${f.maiorAtrasoDias} dias · ${f.comPrevisao} de ${f.total} fases com data` : undefined} />
          </Numeros>
        </Bloco>
      )}

      <PorMedir ids={POR_MEDIR.obras[sub]} />
    </div>
  )
}
