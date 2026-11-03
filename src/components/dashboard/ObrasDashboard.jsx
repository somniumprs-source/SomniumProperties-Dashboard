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

function CartaoProjeto({ p, bloqueios }) {
  const doProjeto = bloqueios?.bloqueios.filter(b => b.negocioId === p.id) || []
  const prazos = bloqueios?.prazos.filter(x => x.negocioId === p.id) || []
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
        {bloqueios && <div className="col-span-2"><Dado titulo="Bloqueios abertos">
          {doProjeto.length ? doProjeto.map(b => `${b.descricao} (há ${b.dias} ${b.dias === 1 ? 'dia' : 'dias'})`).join(' · ') : 'Nenhum'}
        </Dado></div>}
        {prazos.length > 0 && <div className="col-span-2"><Dado titulo="Próximo prazo contratual">
          {`${prazos[0].descricao}, ${fmtData(prazos[0].dataLimite)}`}
        </Dado></div>}
      </dl>
    </article>
  )
}

export function ObrasDashboard({ data: d }) {
  const [sub, setSub] = useState('projetos')
  const o = d?.obras, f = o?.fases, bl = o?.bloqueios
  const nomeProjeto = (id) => o?.projetos?.find(p => p.id === id)?.nome || 'Projeto fechado'
  return (
    <div className="flex flex-col gap-5">
      <Subdivisoes items={SUBDIVISOES} value={sub} onChange={setSub} />
      <PrecisaAcao itens={[
        { valor: f?.atrasadas, texto: 'fases em atraso', para: '/projectos' },
        { valor: bl?.prazosVencidos, texto: 'prazos contratuais ultrapassados', para: '/projectos' },
      ]} />

      {sub === 'projetos' && <>
        <Bloco titulo="Projetos" nota="situação atual">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {o?.projetos?.map(p => <CartaoProjeto key={p.id} p={p} bloqueios={bl} />)}
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

      {sub === 'prazos' && <>
        <Bloco titulo="Prazos e bloqueios" nota="situação atual">
          <Numeros>
            <Indicador id="O07" value={fmtNum(f?.atrasadas)} tone={f?.atrasadas ? 'red' : 'green'} sub={f ? `até ${f.maiorAtrasoDias} dias · ${f.comPrevisao} de ${f.total} fases com data` : undefined} />
            <Indicador id="O09" value={bl ? fmtNum(bl.maiorBloqueioDias) : null} tone={bl?.maiorBloqueioDias > 14 ? 'red' : 'amber'}
              sub={bl ? (bl.bloqueios.length ? `dias do mais antigo · ${bl.bloqueios.length} ${bl.bloqueios.length === 1 ? 'aberto' : 'abertos'}` : 'sem bloqueios abertos') : undefined} />
            <Indicador id="W04" value={bl ? fmtNum(bl.prazosVencidos + bl.prazos30Dias) : null} tone={bl?.prazosVencidos ? 'red' : 'amber'}
              sub={bl ? `${bl.prazosVencidos} ultrapassados · ${bl.prazos30Dias} nos próximos 30 dias` : undefined} />
          </Numeros>
        </Bloco>
        {(bl?.bloqueios.length > 0 || bl?.prazos.length > 0) && (
          <Bloco titulo="Em aberto">
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface-raised">
              {bl.bloqueios.map(b => (
                <li key={b.id} className="px-4 py-2.5 text-sm text-ink flex flex-wrap justify-between gap-2">
                  <span><strong>{nomeProjeto(b.negocioId)}</strong> · {b.descricao}{b.dependeDe ? ` (depende de ${b.dependeDe})` : ''}</span>
                  <span className="text-ink-muted num">bloqueio há {b.dias} {b.dias === 1 ? 'dia' : 'dias'}</span>
                </li>
              ))}
              {bl.prazos.map(x => (
                <li key={x.id} className="px-4 py-2.5 text-sm text-ink flex flex-wrap justify-between gap-2">
                  <span><strong>{nomeProjeto(x.negocioId)}</strong> · {x.descricao}</span>
                  <span className={`num ${x.diasAteLimite < 0 ? 'text-danger' : 'text-ink-muted'}`}>
                    {x.diasAteLimite < 0 ? `ultrapassado há ${-x.diasAteLimite} dias` : `prazo ${fmtData(x.dataLimite)}`}
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
        )}
      </>}

      <PorMedir ids={POR_MEDIR.obras[sub]} />
    </div>
  )
}
