/**
 * Metricas profissionais derivadas para o relatorio de Analise de Rentabilidade.
 * Calculadas on-the-fly a partir do registo persistido em `analises` + `imoveis`.
 * Nada e gravado em BD: alteracoes a estas formulas reflectem-se em todos os relatorios.
 */

import { calcIRC } from './calcEngine.js'

const DIVIDENDOS_RETENCAO = 0.28
const IRS_TAXA_AUTONOMA = 0.28

function safeNum(v) {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

function lucroLiqFor(lb, regime, derramaPerc, percDiv) {
  if (lb <= 0) return lb
  if (regime === 'Empresa') {
    const { total: irc } = calcIRC(lb, derramaPerc)
    const aposIRC = Math.max(lb - irc, 0)
    const retencao = aposIRC * (percDiv / 100) * DIVIDENDOS_RETENCAO
    return lb - irc - retencao
  }
  return lb * (1 - IRS_TAXA_AUTONOMA)
}

function calcTIR(equity, lucroLiq, meses) {
  if (!equity || equity <= 0 || !meses || meses <= 0) return null
  const cf = new Array(meses + 1).fill(0)
  cf[0] = -Math.abs(equity)
  cf[meses] = Math.abs(equity) + lucroLiq
  let r = 0.01
  for (let i = 0; i < 200; i++) {
    let npv = 0, dnpv = 0
    for (let t = 0; t < cf.length; t++) {
      const denom = Math.pow(1 + r, t)
      npv += cf[t] / denom
      dnpv -= t * cf[t] / (denom * (1 + r))
    }
    if (!isFinite(npv) || !isFinite(dnpv) || Math.abs(dnpv) < 1e-12) break
    const delta = npv / dnpv
    r -= delta
    if (!isFinite(r) || r <= -0.999) return null
    if (Math.abs(delta) < 1e-10) break
  }
  if (!isFinite(r) || r <= -1) return null
  return Math.pow(1 + r, 12) - 1
}

export function calcMetricsExtra(a, im = {}) {
  const compra = safeNum(a.compra) || safeNum(im.valor_proposta) || safeNum(im.ask_price)
  const obra = safeNum(a.obra)
  const obraComIva = safeNum(a.obra_com_iva) || obra
  const vvr = safeNum(a.vvr) || safeNum(im.valor_venda_remodelado)
  const meses = Math.max(safeNum(a.meses), 0)
  const cap = safeNum(a.capital_necessario)
  const lb = safeNum(a.lucro_bruto)
  const ll = safeNum(a.lucro_liquido)
  const totalAq = safeNum(a.total_aquisicao)
  const totalDet = safeNum(a.total_detencao)
  const totalVen = safeNum(a.total_venda)
  const licen = safeNum(a.licenciamento)
  const valorFin = safeNum(a.valor_financiado)
  const percFin = safeNum(a.perc_financiamento)
  const regime = a.regime_fiscal || 'Empresa'
  const derramaPerc = a.derrama_perc != null ? safeNum(a.derrama_perc) : 1.5
  const percDiv = a.perc_dividendos != null ? safeNum(a.perc_dividendos) : 100
  const comissaoPerc = a.comissao_perc != null ? safeNum(a.comissao_perc) : 2.5
  const seguroMensal = safeNum(a.seguro_mensal)
  const condominioMensal = safeNum(a.condominio_mensal)
  const taxaImi = safeNum(a.taxa_imi)
  const vpt = safeNum(a.vpt)
  const impostos = safeNum(a.impostos)
  const retencaoDiv = safeNum(a.retencao_dividendos)
  const area = safeNum(im.area_bruta)

  const custoTotal = cap + valorFin
  const custoFinanciamento = Math.max(custoTotal - totalAq - obraComIva - licen - totalDet - totalVen, 0)
  const comissaoComIva = safeNum(a.comissao_com_iva) || (vvr * comissaoPerc / 100 * 1.23)
  const fixedSaleCosts = Math.max(totalVen - comissaoComIva, 0)
  const custoExcVenda = totalAq + obraComIva + licen + totalDet + custoFinanciamento + fixedSaleCosts
  const custoExcObra = totalAq + licen + totalDet + custoFinanciamento + totalVen

  const moic = cap > 0 ? 1 + ll / cap : null
  const tirAnual = calcTIR(cap, ll, meses)
  const equityReal = cap - valorFin
  const tirAlavancada = (percFin > 0 && equityReal > 0) ? calcTIR(equityReal, ll, meses) : null

  const lucroMensal = meses > 0 ? ll / meses : null
  const racio = cap > 0 ? ll / cap : null

  const margemCusto = custoTotal > 0 ? lb / custoTotal : null

  const aquisicaoM2 = area > 0 ? compra / area : null
  const custoTotalM2 = area > 0 ? custoTotal / area : null
  const vvrM2 = area > 0 ? vvr / area : null

  const spreadEur = vvr - (compra + obraComIva)
  const baseSpread = compra + obraComIva
  const spreadPct = baseSpread > 0 ? spreadEur / baseSpread : null

  const ltv = (percFin > 0 && vvr > 0) ? valorFin / vvr : null
  const ltc = (percFin > 0 && custoTotal > 0) ? valorFin / custoTotal : null

  let beVVR = null
  if (custoExcVenda > 0 && comissaoPerc >= 0 && comissaoPerc < 100) {
    const passo = Math.max(Math.round(custoExcVenda / 1000), 50)
    const start = Math.max(custoExcVenda * 0.5, 1000)
    const max = custoExcVenda * 3
    for (let v = start; v <= max; v += passo) {
      const com = v * comissaoPerc / 100 * 1.23
      const lbV = v - (custoExcVenda + com)
      const llV = lucroLiqFor(lbV, regime, derramaPerc, percDiv)
      if (llV >= 0) { beVVR = Math.round(v); break }
    }
  }
  const margemSegVVR = (beVVR != null && vvr > 0) ? (vvr - beVVR) / vvr : null

  let beObra = null
  if (vvr > 0 && obraComIva > 0) {
    const ivaPct = obra > 0 ? (obraComIva / obra) - 1 : 0
    const passo = Math.max(Math.round(vvr / 1000), 50)
    for (let o = 0; o <= vvr; o += passo) {
      const oCI = o * (1 + ivaPct)
      const lbO = vvr - (custoExcObra + oCI)
      const llO = lucroLiqFor(lbO, regime, derramaPerc, percDiv)
      if (llO <= 0) { beObra = Math.round(o); break }
    }
  }
  const margemSegObra = (beObra != null && obra > 0) ? (beObra - obra) / obra : null

  const imiAnual = vpt * (taxaImi / 100)
  const custoMensalFixo = seguroMensal + condominioMensal + (imiAnual / 12)
  const mesesExtra = (custoMensalFixo > 0 && ll > 0) ? Math.floor(ll / custoMensalFixo) : null
  const prazoMaxMeses = mesesExtra != null ? meses + mesesExtra : null

  function impactoObra(deltaPct) {
    if (obraComIva <= 0) return null
    const incremento = obraComIva * deltaPct
    const lbNew = lb - incremento
    const llNew = lucroLiqFor(lbNew, regime, derramaPerc, percDiv)
    const roi = cap > 0 ? llNew / cap : null
    return { delta: deltaPct, lucro_liquido: llNew, roi }
  }

  const variacoes = [-0.15, -0.10, -0.05, 0, 0.05, 0.10]
  const sensibilidadeVvr = variacoes.map(d => {
    const vvrAdj = vvr * (1 + d)
    const comissaoAdj = vvrAdj * comissaoPerc / 100 * 1.23
    const lbAdj = vvrAdj - (custoExcVenda + comissaoAdj)
    const llAdj = lucroLiqFor(lbAdj, regime, derramaPerc, percDiv)
    const roiAdj = cap > 0 ? llAdj / cap : null
    return { delta: d, vvr: vvrAdj, lucro_liquido: llAdj, roi: roiAdj }
  })

  let fiscal = null
  if (regime === 'Empresa' && lb > 0) {
    const { irc, derrama, total } = calcIRC(lb, derramaPerc)
    fiscal = {
      irc_base: irc,
      derrama_eur: derrama,
      total_irc: total,
      dividendos_eur: retencaoDiv,
      taxa_efectiva: lb > 0 ? impostos / lb : null,
    }
  } else if (regime !== 'Empresa' && lb > 0) {
    fiscal = {
      taxa_efectiva: impostos / lb,
    }
  }

  return {
    moic,
    tir_anual: tirAnual,
    tir_alavancada: tirAlavancada,
    lucro_mensal: lucroMensal,
    racio_risco_retorno: racio,
    custo_total_eur: custoTotal,
    margem_custo_total: margemCusto,
    aquisicao_m2: aquisicaoM2,
    custo_total_m2: custoTotalM2,
    vvr_m2: vvrM2,
    spread_eur: spreadEur,
    spread_pct: spreadPct,
    ltv,
    ltc,
    break_even_vvr: beVVR,
    margem_seg_vvr: margemSegVVR,
    break_even_obra: beObra,
    margem_seg_obra: margemSegObra,
    prazo_max_meses: prazoMaxMeses,
    meses_extra: mesesExtra,
    contingencia_10: impactoObra(0.10),
    contingencia_20: impactoObra(0.20),
    sensibilidade_vvr: sensibilidadeVvr,
    fiscal,
    has_area: area > 0,
    has_financiamento: percFin > 0,
  }
}

export function MULT(v) {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(2) + 'x'
}

export function EUR_M2(v) {
  if (v == null || !isFinite(v)) return '—'
  return Math.round(v).toLocaleString('pt-PT') + ' €/m²'
}

export function RACIO(v) {
  if (v == null || !isFinite(v)) return '—'
  return '1 : ' + v.toFixed(2)
}

export function PCT_DEC(v, decimals = 1) {
  if (v == null || !isFinite(v)) return '—'
  return (v * 100).toFixed(decimals) + '%'
}

export function EUR_S(v) {
  if (v == null || !isFinite(v)) return '—'
  return Math.round(v).toLocaleString('pt-PT') + ' €'
}

export function colorMargem(v) {
  if (v == null || !isFinite(v)) return null
  if (v < 0.20) return '#8B1A1A'
  if (v >= 0.25) return '#1B5E20'
  return '#8C6A30'
}

export function colorPositivo(v) {
  if (v == null || !isFinite(v)) return null
  return v >= 0 ? '#1B5E20' : '#8B1A1A'
}
