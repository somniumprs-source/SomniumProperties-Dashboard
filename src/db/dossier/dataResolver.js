// Fonte de verdade unica para os numeros do deal.
//
// Todos os PDFs investidor (Dossier, Anonima, Analise, Relatorio Investimento,
// Relatorio CAEP) chamam `resolveDealData` — em vez de cada renderer ter os
// seus proprios fallbacks `a.compra || im.valor_proposta || ...`.
//
// Estrategia:
//   1. Recolhe inputs de `analise` (BD) e fallbacks de `imovel`.
//   2. Se ha inputs minimos para calcular (`compra` e `vvr`), invoca
//      `calcAnalise` de calcEngine.js para obter agregados canonicos
//      (incluindo `capital_necessario` que contabiliza alavancagem).
//   3. Se nao, devolve os agregados gravados em `analise` (BD legacy).
//   4. Anexa `moic` e `payback_meses` calculados em `metrics.js`.
//
// Nao reimplementa formulas — reusa o `calcEngine` existente.

import { calcAnalise } from '../calcEngine.js'
import { computeMOIC, computePayback } from './metrics.js'

const num = v => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

const numOr = (v, fallback = 0) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

// Constroi os inputs no shape esperado por `calcAnalise`. So copia campos
// quando existem — `calcAnalise` tem defaults para tudo o que faltar.
function buildCalcInputs(imovel, analise) {
  const im = imovel || {}
  const a = analise || {}
  const inputs = {}

  // Aquisicao
  if (a.compra != null) inputs.compra = a.compra
  else if (im.valor_proposta != null) inputs.compra = im.valor_proposta
  else if (im.ask_price != null) inputs.compra = im.ask_price
  if (a.vpt != null) inputs.vpt = a.vpt
  if (a.finalidade) inputs.finalidade = a.finalidade
  if (a.escritura != null) inputs.escritura = a.escritura
  if (a.cpcv_compra != null) inputs.cpcv_compra = a.cpcv_compra
  if (a.due_diligence != null) inputs.due_diligence = a.due_diligence

  // Financiamento
  if (a.perc_financiamento != null) inputs.perc_financiamento = a.perc_financiamento
  if (a.prazo_anos != null) inputs.prazo_anos = a.prazo_anos
  if (a.tan != null) inputs.tan = a.tan
  if (a.tipo_taxa) inputs.tipo_taxa = a.tipo_taxa
  if (a.comissoes_banco != null) inputs.comissoes_banco = a.comissoes_banco
  if (a.hipoteca != null) inputs.hipoteca = a.hipoteca

  // Obra
  if (a.obra != null) inputs.obra = a.obra
  else if (im.custo_estimado_obra != null) inputs.obra = im.custo_estimado_obra
  if (a.pmo_perc != null) inputs.pmo_perc = a.pmo_perc
  if (a.aru != null) inputs.aru = !!a.aru
  if (a.ampliacao != null) inputs.ampliacao = !!a.ampliacao
  if (a.licenciamento != null) inputs.licenciamento = a.licenciamento
  if (a.modo_obra) inputs.modo_obra = a.modo_obra

  // Detencao
  if (a.meses != null) inputs.meses = a.meses
  if (a.seguro_mensal != null) inputs.seguro_mensal = a.seguro_mensal
  if (a.condominio_mensal != null) inputs.condominio_mensal = a.condominio_mensal
  if (a.utilidades_mensal != null) inputs.utilidades_mensal = a.utilidades_mensal
  if (a.n_tranches != null) inputs.n_tranches = a.n_tranches
  if (a.custo_tranche != null) inputs.custo_tranche = a.custo_tranche
  if (a.taxa_imi != null) inputs.taxa_imi = a.taxa_imi
  if (a.ligacao_servicos != null) inputs.ligacao_servicos = a.ligacao_servicos
  if (a.excedente_capital != null) inputs.excedente_capital = a.excedente_capital

  // Venda
  if (a.vvr != null) inputs.vvr = a.vvr
  else if (im.valor_venda_remodelado != null) inputs.vvr = im.valor_venda_remodelado
  if (a.comissao_perc != null) inputs.comissao_perc = a.comissao_perc
  if (a.cpcv_venda != null) inputs.cpcv_venda = a.cpcv_venda
  if (a.cert_energetico != null) inputs.cert_energetico = a.cert_energetico
  if (a.home_staging != null) inputs.home_staging = a.home_staging
  if (a.outros_venda != null) inputs.outros_venda = a.outros_venda

  // Fiscal
  if (a.regime_fiscal) inputs.regime_fiscal = a.regime_fiscal
  if (a.derrama_perc != null) inputs.derrama_perc = a.derrama_perc
  if (a.perc_dividendos != null) inputs.perc_dividendos = a.perc_dividendos
  if (a.ano_aquisicao != null) inputs.ano_aquisicao = a.ano_aquisicao
  if (a.englobamento != null) inputs.englobamento = !!a.englobamento
  if (a.taxa_irs_marginal != null) inputs.taxa_irs_marginal = a.taxa_irs_marginal

  return inputs
}

function hasMinimumInputs(inputs) {
  return numOr(inputs.compra, 0) > 0 && numOr(inputs.vvr, 0) > 0
}

// Devolve um objecto canonico que todos os renderers podem usar com seguranca.
// Nunca atira — se houver excepcao no engine, faz fallback aos agregados da analise.
export function resolveDealData(imovel, analise, _orcamento) {
  const im = imovel || {}
  const a = analise || {}
  const warnings = []

  let computed = null
  const inputs = buildCalcInputs(im, a)

  if (hasMinimumInputs(inputs)) {
    try {
      computed = calcAnalise(inputs)
    } catch (e) {
      warnings.push(`calcAnalise falhou: ${e.message}`)
      computed = null
    }
  } else {
    warnings.push('Inputs minimos (compra, vvr) ausentes — fallback aos agregados gravados na analise.')
  }

  const compra = num(computed?.compra ?? inputs.compra)
  const obra = num(a.obra_com_iva ?? computed?.obra_com_iva ?? a.obra ?? inputs.obra)
  const vvr = num(computed?.vvr ?? inputs.vvr ?? a.vvr)
  const meses = parseInt(a.meses ?? inputs.meses ?? 6, 10)
  const capital_necessario = num(computed?.capital_necessario ?? a.capital_necessario)
  const lucro_bruto = num(computed?.lucro_bruto ?? a.lucro_bruto)
  const lucro_liquido = num(computed?.lucro_liquido ?? a.lucro_liquido)
  const retorno_total = num(computed?.retorno_total ?? a.retorno_total)
  const retorno_anualizado = num(computed?.retorno_anualizado ?? a.retorno_anualizado)
  const cash_on_cash = num(computed?.cash_on_cash ?? a.cash_on_cash)

  // Invariantes simples — alimentam warnings em modo dev.
  if ((compra ?? 0) > 0 && (computed?.imt ?? a.imt ?? null) == null) {
    warnings.push('compra > 0 mas IMT nao calculado.')
  }
  if ((capital_necessario ?? 0) > 0 && retorno_anualizado == null) {
    warnings.push('capital_necessario > 0 mas retorno_anualizado nao calculado.')
  }

  const moic = computeMOIC(capital_necessario, lucro_liquido)
  const payback_meses = computePayback({ meses, lucroLiquido: lucro_liquido })

  return {
    // Valores principais
    compra,
    obra,
    vvr,
    meses,
    // Resultados
    capital_necessario,
    lucro_bruto,
    lucro_liquido,
    retorno_total,
    retorno_anualizado,
    cash_on_cash,
    moic,
    payback_meses,
    // Decomposicao (preferir computed; fallback BD)
    imt: num(computed?.imt ?? a.imt) ?? 0,
    imposto_selo: num(computed?.imposto_selo ?? a.imposto_selo) ?? 0,
    escritura: num(a.escritura) ?? 0,
    total_aquisicao: num(computed?.total_aquisicao ?? a.total_aquisicao),
    iva_obra: num(computed?.iva_obra ?? a.iva_obra) ?? 0,
    obra_com_iva: num(computed?.obra_com_iva ?? a.obra_com_iva ?? obra),
    total_detencao: num(computed?.total_detencao ?? a.total_detencao) ?? 0,
    comissao_com_iva: num(computed?.comissao_com_iva ?? a.comissao_com_iva) ?? 0,
    impostos: num(computed?.impostos ?? a.impostos) ?? 0,
    break_even: num(computed?.break_even ?? a.break_even) ?? null,
    // Pressupostos (para glossario / footer)
    regime_fiscal: a.regime_fiscal || 'Empresa',
    perc_financiamento: numOr(a.perc_financiamento, 0),
    modo_obra: a.modo_obra || 'calculado',
    aru: !!a.aru,
    ampliacao: !!a.ampliacao,
    pmo_perc: numOr(a.pmo_perc, 65),
    comissao_perc: numOr(a.comissao_perc, 2.5),
    // Identificadores (passam atraves para o footer/hash)
    id: a.id ?? null,
    // Warnings de validacao (renderer pode mostrar em dev)
    _warnings: warnings,
  }
}
