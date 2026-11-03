import { useState } from 'react'
import { Building2, Users, Handshake } from 'lucide-react'
import { EUR } from '../../constants.js'
import { POR_MEDIR } from '../../lib/catalogoMetricas.js'
import { Subdivisoes, Bloco, Numeros, PrecisaAcao, RankList, fmtNum, pctOuNulo, numOuNulo } from './_shared.jsx'
import { Indicador, PorMedir } from './Indicador.jsx'
import { PeriodSelector } from './PeriodSelector.jsx'

// Departamento Comercial: as três entidades que gere, cada uma na sua vista.
const SUBDIVISOES = [
  { key: 'imoveis',      label: 'Imóveis',      icon: Building2 },
  { key: 'investidores', label: 'Investidores', icon: Users },
  { key: 'consultores',  label: 'Consultores',  icon: Handshake },
]

export function ComercialDashboard({ data: d, comKpis, alertas, periodo, onPeriodo }) {
  const [sub, setSub] = useState('imoveis')
  const fn = d?.funil, ve = d?.velocidade, ca = d?.capital, at = d?.atividade, co = d?.consultores
  const seletor = <PeriodSelector value={periodo} onChange={onPeriodo} />
  const notaPeriodo = d?.intervalo ? `${d.intervalo.de} a ${d.intervalo.ate}` : undefined

  return (
    <div className="flex flex-col gap-5">
      <Subdivisoes items={SUBDIVISOES} value={sub} onChange={setSub} />

      {sub === 'imoveis' && <>
        <PrecisaAcao itens={[
          { valor: fn?.backlogPorContactar, texto: 'imóveis por contactar', para: '/crm' },
          { valor: alertas?.imoveisParados, texto: 'imóveis parados há mais de 7 dias', para: '/crm' },
        ]} />
        <Bloco titulo="Situação atual">
          <Numeros>
            <Indicador id="G06" value={fmtNum(fn?.backlogPorContactar)} tone={fn?.backlogPorContactar ? 'amber' : 'green'} />
            <Indicador id="C11" value={numOuNulo(fn?.diasNaFase?.mediana)} sub={fn?.diasNaFase ? `mediana de ${fn.diasNaFase.amostra} imóveis` : undefined} tone="amber" />
            <Indicador id="G14" value={d ? EUR(d.pipelinePonderado) : null} sub="probabilidades estimadas" />
            <Indicador id="G12" value={numOuNulo(ve?.diasAteFechar)} tone="blue" />
          </Numeros>
        </Bloco>
        <Bloco titulo="Atividade no período" nota={notaPeriodo} acao={seletor}>
          <Numeros>
            <Indicador id="G01" value={fmtNum(fn?.atividade?.adicionados?.valor)} delta={fn?.atividade?.adicionados?.delta} />
            <Indicador id="G02" value={fmtNum(fn?.atividade?.chamadas?.valor)} delta={fn?.atividade?.chamadas?.delta}
              sub={fn?.chamadasCobertura ? `${fn.chamadasCobertura.com} de ${fn.chamadasCobertura.total} imóveis com chamada` : undefined} />
            <Indicador id="G03" value={fmtNum(fn?.atividade?.visitas?.valor)} delta={fn?.atividade?.visitas?.delta} />
            <Indicador id="G04" value={fmtNum(fn?.atividade?.em?.valor)} delta={fn?.atividade?.em?.delta} />
            <Indicador id="G05" value={fmtNum(fn?.atividade?.propostas?.valor)} delta={fn?.atividade?.propostas?.delta} />
          </Numeros>
        </Bloco>
        <Bloco titulo="Conversão dos imóveis adicionados no período">
          <Numeros>
            <Indicador id="C02" value={pctOuNulo(fn?.chamadaVisita)} tone="indigo" />
            <Indicador id="C03" value={pctOuNulo(fn?.visitaProposta)} tone="indigo" />
            <Indicador id="G07" value={pctOuNulo(fn?.aprovacaoAnalise)} tone="indigo" />
            <Indicador id="G08" value={pctOuNulo(fn?.chegamProposta)} tone="indigo" />
            <Indicador id="G09" value={pctOuNulo(fn?.taxaFecho)} tone="green" />
            <Indicador id="G10" value={pctOuNulo(d?.economia?.descontoMedio)} tone="amber" />
          </Numeros>
        </Bloco>
        <Bloco titulo="Contacto, prazos e fecho no período" nota={notaPeriodo}>
          <Numeros>
            <Indicador id="C01" value={pctOuNulo(fn?.contactoEfetivo?.pct)} tone="indigo"
              sub={fn?.contactoEfetivo ? `${fn.contactoEfetivo.com} de ${fn.contactoEfetivo.total} imóveis` : 'sem imóveis adicionados'} />
            <Indicador id="C12" value={pctOuNulo(fn?.cumprimentoTarefas?.pct)} tone={fn?.cumprimentoTarefas?.pct < 80 ? 'amber' : 'green'}
              sub={fn?.cumprimentoTarefas?.vencidas ? `${fn.cumprimentoTarefas.noPrazo} de ${fn.cumprimentoTarefas.vencidas} tarefas` : 'sem prazos vencidos'} />
            <Indicador id="G13" value={numOuNulo(ve?.throughput == null ? null : Math.round(ve.throughput * 10) / 10)} sub="negócios por mês" tone="green" />
            <Indicador id="G29" value={co?.lucroPorFonte?.[0]?.origem ?? (ve?.throughput != null ? 'Sem fechos' : null)}
              sub={co?.lucroPorFonte?.[0] ? EUR(co.lucroPorFonte[0].lucro) : undefined} />
          </Numeros>
        </Bloco>
        {fn?.origem?.length > 0 && (
          <Bloco titulo="Origem dos imóveis adicionados no período">
            <Barras linhas={fn.origem.map((o) => ({ nome: o.origem, total: o.total }))} />
          </Bloco>
        )}
        {fn?.motivosPerda?.perdas > 0 && (
          <Bloco titulo="Motivos de perda" nota={`C15 · ${fn.motivosPerda.comMotivo} de ${fn.motivosPerda.perdas} perdas com motivo`}>
            <Barras linhas={fn.motivosPerda.motivos.map((m) => ({ nome: m.motivo, total: m.total }))} />
          </Bloco>
        )}
      </>}

      {sub === 'investidores' && <>
        <PrecisaAcao itens={[{ valor: alertas?.investSemContacto, texto: 'investidores sem contacto há mais de 14 dias', para: '/crm' }]} />
        <Bloco titulo="Situação atual">
          <Numeros>
            <Indicador id="I10" value={ca?.parceria ? `${ca.parceria.porEstado} / ${ca.parceria.comAporte}` : null} sub="por estado / com capital" tone="green" />
            <Indicador id="I01" value={d ? EUR(ca?.capacidadeDeclarada) : null} sub="potencial, não confirmado" tone="amber" />
            <Indicador id="G47" value={fmtNum(comKpis?.investClassificados)} tone="indigo" />
            <Indicador id="G18" value={pctOuNulo(ca?.taxaConvInvestidor)} tone="indigo" />
            <Indicador id="G19" value={pctOuNulo(ca?.reinvestimento)} tone="green" />
          </Numeros>
        </Bloco>
        <Bloco titulo="Atividade no período" nota={notaPeriodo} acao={seletor}>
          <Numeros>
            <Indicador id="G15" value={fmtNum(at?.discoveryCalls?.valor)} delta={at?.discoveryCalls?.delta} tone="indigo" />
            <Indicador id="G16" value={fmtNum(at?.followUpCalls?.valor)} delta={at?.followUpCalls?.delta} tone="indigo" />
            <Indicador id="G17" value={fmtNum(at?.novosInvestidores)} delta={at?.deltas?.novosInvestidores} />
            <Indicador id="G20" value={pctOuNulo(ca?.saidaInvestidores)} tone={ca?.saidaInvestidores > 0 ? 'red' : 'green'} />
          </Numeros>
        </Bloco>
      </>}

      {sub === 'consultores' && <>
        <PrecisaAcao itens={[{ valor: alertas?.consFollowUpAtrasado, texto: 'follow-ups de consultores atrasados', para: '/crm' }]} />
        <Bloco titulo="Situação atual">
          <Numeros>
            <Indicador id="G25" value={pctOuNulo(co?.ativacao)} tone="green" />
            <Indicador id="G24" value={pctOuNulo(co?.taxaConversao)} tone="indigo" />
            <Indicador id="G26" value={pctOuNulo(co?.parceirosInativos)} tone={co?.parceirosInativos > 0 ? 'red' : 'green'} />
          </Numeros>
        </Bloco>
        <Bloco titulo="Atividade no período" nota={notaPeriodo} acao={seletor}>
          <Numeros>
            <Indicador id="C16" value={fmtNum(at?.chamadasConsultor)} delta={at?.deltas?.chamadasConsultor} />
            <Indicador id="G22" value={fmtNum(at?.chamadasSomnium)} delta={at?.deltas?.chamadasSomnium} />
            <Indicador id="G23" value={fmtNum(at?.novosConsultores)} delta={at?.deltas?.novosConsultores} />
          </Numeros>
        </Bloco>
        {co?.premium?.length > 0 && (
          <Bloco titulo="Lista Premium" nota="parceiros por imóveis enviados">
            <RankList rows={co.premium} valueFmt={(v) => (v ? EUR(v) : '—')} />
          </Bloco>
        )}
      </>}

      <PorMedir ids={POR_MEDIR.comercial[sub]} />
    </div>
  )
}

function Barras({ linhas }) {
  const maximo = linhas[0]?.total || 1
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-raised px-4 py-3">
      {linhas.slice(0, 6).map((l) => (
        <div key={l.nome} className="flex items-center gap-2">
          <span className="text-xs text-ink-muted w-36 truncate shrink-0" title={l.nome}>{l.nome}</span>
          <div className="flex-1 bg-surface-muted rounded-full h-2.5">
            <div className="h-2.5 rounded-full bg-ink-muted/60" style={{ width: `${Math.round(l.total / maximo * 100)}%` }} />
          </div>
          <span className="text-xs font-semibold text-ink num w-6 text-right">{l.total}</span>
        </div>
      ))}
    </div>
  )
}
