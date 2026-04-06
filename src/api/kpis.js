import * as faturacaoDB from '../notion/databases/faturacao.js'
import * as custosDB from '../notion/databases/custos.js'
import * as pipelineDB from '../notion/databases/pipeline.js'
import * as campanhasDB from '../notion/databases/campanhas.js'
import * as obrasDB from '../notion/databases/obras.js'

function round2(n) {
  return Math.round(n * 100) / 100
}

function getMesAtual() {
  const now = new Date()
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return { mes: meses[now.getMonth()], ano: now.getFullYear(), month: now.getMonth() + 1 }
}

function isThisMonth(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month
}

export async function calcFinanceiro() {
  const { mes, ano, month } = getMesAtual()

  const [faturacoes, custos] = await Promise.all([
    faturacaoDB.listAll(),
    custosDB.listAll(),
  ])

  const doMes = faturacoes.filter(f => f.mes === mes && f.ano === ano)
  const custosDoMes = custos.filter(c => isThisMonth(c.data, ano, month))

  const faturacaoTotal = doMes.reduce((s, f) => s + f.receitaFaturada, 0)
  const margemBrutaTotal = doMes.reduce((s, f) => s + f.margemBruta, 0)
  const custoOperacional = custosDoMes.reduce((s, c) => s + c.valor, 0)
  const ebitda = faturacaoTotal - custoOperacional

  return {
    faturacaoTotal:  round2(faturacaoTotal),
    margemBruta:     faturacaoTotal > 0 ? round2(margemBrutaTotal / faturacaoTotal * 100) : 0,
    custoOperacional:round2(custoOperacional),
    ebitda:          round2(ebitda),
    receitasRecentes: doMes.slice(0, 10),
  }
}

export async function calcComercial() {
  const { mes, ano, month } = getMesAtual()

  const [faturacoes, pipeline] = await Promise.all([
    faturacaoDB.listAll(),
    pipelineDB.listAll(),
  ])

  const doMes = faturacoes.filter(f => f.mes === mes && f.ano === ano)
  const faturacaoTotal = doMes.reduce((s, f) => s + f.receitaFaturada, 0)

  const novosContratos = pipeline.filter(p =>
    p.fase === 'Contrato fechado' && isThisMonth(p.dataFechoPrevista, ano, month)
  ).length

  const orcamentosEnviados = pipeline.filter(p =>
    p.fase === 'Orçamento enviado' || p.fase === 'Contrato fechado' || p.fase === 'Perdido'
  ).length

  const pipelineTotal = pipeline
    .filter(p => p.fase !== 'Perdido')
    .reduce((s, p) => s + p.valorEstimado, 0)

  const taxaConversao = orcamentosEnviados > 0
    ? round2(novosContratos / orcamentosEnviados * 100)
    : 0

  const ticketMedio = novosContratos > 0
    ? round2(faturacaoTotal / novosContratos)
    : 0

  return {
    novosContratos,
    pipelineTotal:  round2(pipelineTotal),
    taxaConversao,
    ticketMedio,
    pipelineRecente: pipeline.filter(p => p.fase !== 'Perdido').slice(0, 10),
  }
}

export async function calcMarketing() {
  const { ano, month } = getMesAtual()

  const campanhas = await campanhasDB.listAll()

  const doMes = campanhas.filter(c => isThisMonth(c.dataInicio, ano, month))
  const ativas = campanhas.filter(c => c.status === 'Ativa')

  const investimentoTotal = doMes.reduce((s, c) => s + c.investimento, 0)
  const leadsGerados = doMes.reduce((s, c) => s + c.leadsGerados, 0)
  const sql = doMes.reduce((s, c) => s + c.leadsQualificados, 0)
  const cpl = leadsGerados > 0 ? round2(investimentoTotal / leadsGerados) : 0
  const taxaQualificacao = leadsGerados > 0 ? round2(sql / leadsGerados * 100) : 0

  return {
    leadsGerados,
    cpl,
    sql,
    taxaQualificacao,
    campanhasAtivas: ativas.slice(0, 10),
  }
}

export async function calcOperacoes() {
  const { ano, month } = getMesAtual()

  const obras = await obrasDB.listAll()

  const obrasAtivas = obras.filter(o => o.status === 'Em curso')
  const obrasConcluidas = obras.filter(o =>
    o.status === 'Concluída' && isThisMonth(o.dataFimReal, ano, month)
  )

  const noPrazo = obrasConcluidas.filter(o =>
    o.dataFimReal && o.dataFimPrevista && o.dataFimReal <= o.dataFimPrevista
  ).length

  const percentNoPrazo = obrasConcluidas.length > 0
    ? round2(noPrazo / obrasConcluidas.length * 100)
    : 0

  const desvioVals = obrasConcluidas.filter(o => o.desvioPct !== 0).map(o => o.desvioPct)
  const desvioMedio = desvioVals.length > 0
    ? round2(desvioVals.reduce((s, v) => s + v, 0) / desvioVals.length)
    : 0

  return {
    obrasAtivas:      obrasAtivas.length,
    obrasConcluidas:  obrasConcluidas.length,
    percentNoPrazo,
    desvioMedio,
    obrasAtivasLista: obrasAtivas.slice(0, 10),
  }
}

export async function calcAllKPIs() {
  const [financeiro, comercial, marketing, operacoes] = await Promise.all([
    calcFinanceiro(),
    calcComercial(),
    calcMarketing(),
    calcOperacoes(),
  ])
  return { financeiro, comercial, marketing, operacoes, updatedAt: new Date().toISOString() }
}
