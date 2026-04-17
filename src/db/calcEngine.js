/**
 * Motor de cálculo de rentabilidade imobiliária.
 * Portado da calculadora standalone (index.html) para Node.js.
 * Fórmulas OE 2026 (IRC, IMT, IRS, IVA).
 *
 * Fonte única de verdade — o frontend nunca calcula, só envia inputs.
 */

// ── Tabelas fiscais OE 2026 ─────────────────────────────────

const IMT_HPP = [
  { limite: 106346, taxa: 0, parcela: 0 },
  { limite: 145470, taxa: 0.02, parcela: 2126.92 },
  { limite: 198347, taxa: 0.05, parcela: 6490.02 },
  { limite: 330539, taxa: 0.07, parcela: 10456.96 },
  { limite: 660982, taxa: 0.08, parcela: 13762.35 },
  { limite: 1150853, taxa: 0.06, parcela: 0 },  // taxa flat
  { limite: Infinity, taxa: 0.075, parcela: 0 }, // taxa flat
]

const IMT_HS = [
  { limite: 106346, taxa: 0.01, parcela: 0 },
  { limite: 145470, taxa: 0.02, parcela: 1063.46 },
  { limite: 198347, taxa: 0.05, parcela: 5427.56 },
  { limite: 330539, taxa: 0.07, parcela: 9394.50 },
  { limite: 633931, taxa: 0.08, parcela: 12700.09 },
  { limite: 1150853, taxa: 0.06, parcela: 0 },  // taxa flat
  { limite: Infinity, taxa: 0.075, parcela: 0 }, // taxa flat
]

const IRC_TAXA_1 = 0.15  // primeiros 50.000€
const IRC_TAXA_2 = 0.19  // acima de 50.000€
const IRC_LIMIAR = 50000
const DIVIDENDOS_RETENCAO = 0.28

const IRS_ESCALOES = [
  { limite: 8342, taxa: 0.125 },
  { limite: 12587, taxa: 0.157 },
  { limite: 17838, taxa: 0.212 },
  { limite: 23089, taxa: 0.241 },
  { limite: 29397, taxa: 0.311 },
  { limite: 43091, taxa: 0.349 },
  { limite: 46567, taxa: 0.431 },
  { limite: 86634, taxa: 0.446 },
  { limite: Infinity, taxa: 0.48 },
]

// ── Funções de cálculo ──────────────────────────────────────

function calcIMT(base, finalidade) {
  if (finalidade === 'Empresa_isencao') return 0
  if (finalidade === 'Empresa') return 0 // empresa imobiliária isenta (Lei 56/2023)

  const tabela = (finalidade === 'HS') ? IMT_HS : IMT_HPP
  for (const escalao of tabela) {
    if (base <= escalao.limite) {
      // Últimos 2 escalões são taxa flat (sem parcela a abater)
      if (escalao.limite >= 1150853 || escalao.limite === Infinity) {
        return round2(base * escalao.taxa)
      }
      return round2(base * escalao.taxa - escalao.parcela)
    }
  }
  return 0
}

function calcIS(base) {
  return round2(base * 0.008)
}

function calcIVA(obra, pmoPerc, aru, ampliacao) {
  if (!obra || obra <= 0) return { iva: 0, obraComIva: 0 }
  const pmo = pmoPerc / 100

  if (aru) {
    // ARU: 6% em tudo
    const iva = round2(obra * 0.06)
    return { iva, obraComIva: round2(obra + iva) }
  }
  if (ampliacao) {
    // Ampliação: 23% em tudo
    const iva = round2(obra * 0.23)
    return { iva, obraComIva: round2(obra + iva) }
  }
  // Normal: MO a 6%, materiais a 23%
  const mo = obra * pmo
  const mat = obra * (1 - pmo)
  const iva = round2(mo * 0.06 + mat * 0.23)
  return { iva, obraComIva: round2(obra + iva) }
}

function calcISFinanciamento(valorFinanciado) {
  return round2(valorFinanciado * 0.005)
}

function calcPrestacaoMensal(capital, tanAnual, prazoAnos) {
  if (!capital || capital <= 0 || !tanAnual || tanAnual <= 0 || !prazoAnos) return 0
  const r = tanAnual / 100 / 12
  const n = prazoAnos * 12
  return round2(capital * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
}

function calcPenalizacaoAmortizacao(valorFinanciado, tipoTaxa) {
  if (!valorFinanciado) return 0
  const taxa = tipoTaxa === 'Variável' ? 0.005 : 0.02
  return round2(valorFinanciado * taxa)
}

function calcIRC(lucroTributavel, derramaPerc) {
  if (lucroTributavel <= 0) return { irc: 0, derrama: 0, total: 0 }
  const base1 = Math.min(lucroTributavel, IRC_LIMIAR)
  const base2 = Math.max(lucroTributavel - IRC_LIMIAR, 0)
  const irc = round2(base1 * IRC_TAXA_1 + base2 * IRC_TAXA_2)
  const derrama = round2(lucroTributavel * (derramaPerc / 100))
  return { irc, derrama, total: round2(irc + derrama) }
}

function calcRetencaoDividendos(lucroLiquido, percDividendos) {
  const dividendos = lucroLiquido * (percDividendos / 100)
  return round2(dividendos * DIVIDENDOS_RETENCAO)
}

function calcIRS(maisValia, anoAquisicao, englobamento, taxaMarginal) {
  if (maisValia <= 0) return 0
  // Exclusão: 50% se adquirido antes de 2023
  const exclusao = (anoAquisicao && anoAquisicao < 2023) ? 0.5 : 0
  const base = maisValia * (1 - exclusao)
  if (englobamento && taxaMarginal > 0) {
    return round2(base * (taxaMarginal / 100))
  }
  return round2(base * 0.28)  // taxa autónoma 28%
}

// ── Cálculo principal ────────────────────────────────────────

export function calcAnalise(inputs) {
  const i = { ...inputs }

  // Defaults
  const compra = parseFloat(i.compra) || 0
  const vpt = parseFloat(i.vpt) || 0
  const finalidade = i.finalidade || 'Empresa_isencao'
  const escritura = parseFloat(i.escritura) || 700
  const cpcvCompra = parseFloat(i.cpcv_compra) || 0
  const dueDiligence = parseFloat(i.due_diligence) || 0

  const percFinanciamento = parseFloat(i.perc_financiamento) || 0
  const prazoAnos = parseInt(i.prazo_anos) || 30
  const tan = parseFloat(i.tan) || 0
  const tipoTaxa = i.tipo_taxa || 'Fixa'
  const comissoesBanco = parseFloat(i.comissoes_banco) || 0
  const hipoteca = parseFloat(i.hipoteca) || 0

  const obra = parseFloat(i.obra) || 0
  const pmoPerc = parseFloat(i.pmo_perc) || 65
  const aru = !!i.aru
  const ampliacao = !!i.ampliacao
  const licenciamento = parseFloat(i.licenciamento) || 0

  const meses = Math.max(parseInt(i.meses) || 6, 1)
  const seguroMensal = parseFloat(i.seguro_mensal) || 0
  const condominioMensal = parseFloat(i.condominio_mensal) || 0
  const utilidadesMensal = parseFloat(i.utilidades_mensal) || 0
  const nTranches = parseInt(i.n_tranches) || 1
  const custoTranche = parseFloat(i.custo_tranche) || 0
  const taxaImi = parseFloat(i.taxa_imi) || 0.3
  const ligacaoServicos = parseFloat(i.ligacao_servicos) || 0
  const excedenteCapital = parseFloat(i.excedente_capital) || 0

  const vvr = parseFloat(i.vvr) || 0
  const comissaoPerc = isNaN(parseFloat(i.comissao_perc)) ? 2.5 : parseFloat(i.comissao_perc)
  const cpcvVenda = parseFloat(i.cpcv_venda) || 0
  const certEnergetico = parseFloat(i.cert_energetico) || 0
  const homeStaging = parseFloat(i.home_staging) || 0
  const outrosVenda = parseFloat(i.outros_venda) || 0

  const regimeFiscal = i.regime_fiscal || 'Empresa'
  const derramaPerc = isNaN(parseFloat(i.derrama_perc)) ? 1.5 : parseFloat(i.derrama_perc)
  const percDividendos = isNaN(parseFloat(i.perc_dividendos)) ? 100 : parseFloat(i.perc_dividendos)
  const anoAquisicao = parseInt(i.ano_aquisicao) || new Date().getFullYear()
  const englobamento = !!i.englobamento
  const taxaIrsMarginal = parseFloat(i.taxa_irs_marginal) || 0

  // ── A. Aquisição ──────────────────────────────────────────
  const baseIMT = Math.max(compra, vpt)
  const imt = calcIMT(baseIMT, finalidade)
  const impostoSelo = calcIS(baseIMT)
  const totalAquisicao = round2(compra + imt + impostoSelo + escritura + cpcvCompra + dueDiligence)

  // ── B. Financiamento ──────────────────────────────────────
  const valorFinanciado = round2(compra * percFinanciamento / 100)
  const prestacaoMensal = calcPrestacaoMensal(valorFinanciado, tan, prazoAnos)
  const isFinanciamento = calcISFinanciamento(valorFinanciado)
  const penalizacaoAmort = calcPenalizacaoAmortizacao(valorFinanciado, tipoTaxa)
  const custoFinanciamento = round2(
    isFinanciamento + comissoesBanco + hipoteca +
    (prestacaoMensal * meses) + penalizacaoAmort
  )

  // ── C. Obra ───────────────────────────────────────────────
  const { iva: ivaObra, obraComIva } = calcIVA(obra, pmoPerc, aru, ampliacao)

  // ── D. Detenção ───────────────────────────────────────────
  const imiProporcional = round2(vpt * (taxaImi / 100) * (meses / 12))
  const manutencaoMensal = round2(seguroMensal + condominioMensal + utilidadesMensal)
  const totalDetencao = round2(
    imiProporcional +
    (manutencaoMensal * meses) +
    (nTranches * custoTranche) +
    ligacaoServicos +
    excedenteCapital
  )

  // ── E. Venda ──────────────────────────────────────────────
  const comissaoComIva = round2(vvr * (comissaoPerc / 100) * 1.23)
  const totalVenda = round2(comissaoComIva + cpcvVenda + certEnergetico + homeStaging + outrosVenda)

  // ── Totais ────────────────────────────────────────────────
  const custoTotal = round2(totalAquisicao + custoFinanciamento + obraComIva + licenciamento + totalDetencao + totalVenda)
  const capitalNecessario = round2(custoTotal - valorFinanciado)
  const lucroBruto = round2(vvr - custoTotal)

  // ── F. Fiscalidade ────────────────────────────────────────
  let impostos = 0
  let retencaoDividendos = 0

  if (regimeFiscal === 'Empresa') {
    const { total: totalIRC } = calcIRC(Math.max(lucroBruto, 0), derramaPerc)
    const lucroAposIRC = Math.max(lucroBruto - totalIRC, 0)
    retencaoDividendos = calcRetencaoDividendos(lucroAposIRC, percDividendos)
    impostos = round2(totalIRC + retencaoDividendos)
  } else {
    // Particular — IRS sobre mais-valias
    // Base dedutível (Art.51 CIRS): compra + IS + IMT + escritura + CPCV + obra + comissão + CPCV venda
    const baseDedutivel = compra + impostoSelo + imt + escritura + cpcvCompra + obraComIva + comissaoComIva + cpcvVenda
    const maisValia = Math.max(vvr - baseDedutivel, 0)
    impostos = calcIRS(maisValia, anoAquisicao, englobamento, taxaIrsMarginal)
  }

  const lucroLiquido = round2(lucroBruto - impostos)

  // ── KPIs ──────────────────────────────────────────────────
  const retornoTotal = capitalNecessario > 0 ? round2((lucroBruto / capitalNecessario) * 100) : 0
  const retornoAnualizado = capitalNecessario > 0 && meses > 0
    ? round2((Math.pow(1 + lucroBruto / capitalNecessario, 12 / meses) - 1) * 100)
    : 0
  const cashOnCash = capitalNecessario > 0 ? round2((lucroLiquido / capitalNecessario) * 100) : 0
  const breakEven = comissaoPerc > 0
    ? round2(custoTotal / (1 - (comissaoPerc / 100) * 1.23))
    : custoTotal

  return {
    // Calculados A — Aquisição
    imt,
    imposto_selo: impostoSelo,
    total_aquisicao: totalAquisicao,
    // Calculados B — Financiamento
    valor_financiado: valorFinanciado,
    prestacao_mensal: prestacaoMensal,
    is_financiamento: isFinanciamento,
    penalizacao_amort: penalizacaoAmort,
    // Calculados C — Obra
    iva_obra: ivaObra,
    obra_com_iva: obraComIva,
    // Calculados D — Detenção
    imi_proporcional: imiProporcional,
    total_detencao: totalDetencao,
    // Calculados E — Venda
    comissao_com_iva: comissaoComIva,
    total_venda: totalVenda,
    // Calculados F — Fiscalidade
    impostos,
    retencao_dividendos: retencaoDividendos,
    // Resultados
    capital_necessario: capitalNecessario,
    lucro_bruto: lucroBruto,
    lucro_liquido: lucroLiquido,
    retorno_total: retornoTotal,
    retorno_anualizado: retornoAnualizado,
    cash_on_cash: cashOnCash,
    break_even: breakEven,
  }
}

// ── Stress Tests ─────────────────────────────────────────────

export function calcStressTests(inputs) {
  const base = calcAnalise(inputs)
  const vvr = parseFloat(inputs.vvr) || 0
  const obra = parseFloat(inputs.obra) || 0
  const meses = Math.max(parseInt(inputs.meses) || 6, 1)

  function cenario(label, descricao, overrides) {
    const r = calcAnalise({ ...inputs, ...overrides })
    return {
      label,
      descricao,
      lucro_liquido: r.lucro_liquido,
      delta: round2(r.lucro_liquido - base.lucro_liquido),
      retorno_total: r.retorno_total,
      retorno_anualizado: r.retorno_anualizado,
    }
  }

  const downside = [
    cenario('VVR −10%', 'Venda 10% abaixo', { vvr: round2(vvr * 0.9) }),
    cenario('VVR −20%', 'Venda 20% abaixo', { vvr: round2(vvr * 0.8) }),
    cenario('Obra +10%', 'Derrapagem 10%', { obra: round2(obra * 1.1) }),
    cenario('Obra +20%', 'Derrapagem 20%', { obra: round2(obra * 1.2) }),
    cenario('Prazo +3m', 'Atraso 3 meses', { meses: meses + 3 }),
    cenario('Prazo +6m', 'Atraso 6 meses', { meses: meses + 6 }),
    cenario('VVR−10% + Obra+10%', 'Combinado moderado', { vvr: round2(vvr * 0.9), obra: round2(obra * 1.1) }),
    cenario('VVR−20% + Obra+20% + 6m', 'Pior cenário', { vvr: round2(vvr * 0.8), obra: round2(obra * 1.2), meses: meses + 6 }),
  ]

  const upside = [
    cenario('VVR +10%', 'Venda 10% acima', { vvr: round2(vvr * 1.1) }),
    cenario('VVR +20%', 'Venda 20% acima', { vvr: round2(vvr * 1.2) }),
    cenario('Obra −10%', 'Poupança 10%', { obra: round2(obra * 0.9) }),
    cenario('Obra −20%', 'Poupança 20%', { obra: round2(obra * 0.8) }),
    cenario('Prazo −2m', 'Antecipação 2 meses', { meses: Math.max(meses - 2, 1) }),
    cenario('Prazo −3m', 'Antecipação 3 meses', { meses: Math.max(meses - 3, 1) }),
    cenario('VVR+10% + Obra−10%', 'Combinado favorável', { vvr: round2(vvr * 1.1), obra: round2(obra * 0.9) }),
    cenario('VVR+20% + Obra−20% − 3m', 'Melhor cenário', { vvr: round2(vvr * 1.2), obra: round2(obra * 0.8), meses: Math.max(meses - 3, 1) }),
  ]

  const pior = downside[downside.length - 1]
  const melhor = upside[upside.length - 1]

  return {
    base: {
      lucro_liquido: base.lucro_liquido,
      retorno_total: base.retorno_total,
      retorno_anualizado: base.retorno_anualizado,
    },
    pior,
    melhor,
    downside,
    upside,
    veredicto: pior.lucro_liquido >= 0 ? 'resiliente' : 'risco',
  }
}

// ── CAEP (Parcerias) ─────────────────────────────────────────

export function calcCAEP(inputs, caepConfig) {
  if (!caepConfig) return null

  const base = calcAnalise(inputs)
  const percSomnium = parseFloat(caepConfig.perc_somnium) || 40
  const baseDistribuicao = caepConfig.base_distribuicao || 'liquido'
  const investidores = caepConfig.investidores || []

  const lucroBase = baseDistribuicao === 'liquido' ? base.lucro_liquido : base.lucro_bruto
  const quotaSomnium = round2(lucroBase * percSomnium / 100)
  const lucroInvestidores = round2(lucroBase - quotaSomnium)

  // Distribuição proporcional ao capital investido (não por % manual)
  const capitalTotal = investidores.reduce((s, inv) => s + (parseFloat(inv.capital) || 0), 0)
  const meses = Math.max(parseInt(inputs.meses) || 6, 1)

  const detalhes = investidores.map(inv => {
    const capital = parseFloat(inv.capital) || 0
    // Percentagem calculada automaticamente com base no capital
    const perc = capitalTotal > 0 ? round2((capital / capitalTotal) * 100) : 0
    const lucro = capitalTotal > 0 ? round2(lucroInvestidores * capital / capitalTotal) : 0
    const tipo = inv.tipo || 'particular'

    let impostos = 0
    if (tipo === 'empresa') {
      const { total } = calcIRC(Math.max(lucro, 0), 1.5)
      impostos = total
    } else {
      impostos = round2(Math.max(lucro, 0) * DIVIDENDOS_RETENCAO)
    }

    const lucroLiq = round2(lucro - impostos)
    const roi = capital > 0 ? round2((lucroLiq / capital) * 100) : 0
    const ra = capital > 0 && meses > 0
      ? round2((Math.pow(1 + lucroLiq / capital, 12 / meses) - 1) * 100)
      : 0

    return {
      nome: inv.nome,
      capital,
      perc_lucro: perc,
      tipo,
      lucro_bruto: lucro,
      impostos,
      lucro_liquido: lucroLiq,
      roi,
      retorno_anualizado: ra,
    }
  })

  return {
    perc_somnium: percSomnium,
    base_distribuicao: baseDistribuicao,
    quota_somnium: quotaSomnium,
    capital_total: capitalTotal,
    investidores: detalhes,
    lucro_base: lucroBase,
  }
}

// ── Quick Check ──────────────────────────────────────────────

export function quickCheck({ compra, obra, vvr, meses }) {
  const c = parseFloat(compra) || 0
  const o = parseFloat(obra) || 0
  const v = parseFloat(vvr) || 0
  const m = Math.max(parseInt(meses) || 6, 1)

  if (!c || !v) return null

  // Simplificado: empresa imobiliária, IMT isento, comissão 2.5%
  const is = round2(c * 0.008)
  const escritura = 700
  const ivaObra = calcIVA(o, 65, false, false).iva
  const obraTotal = round2(o + ivaObra)
  const imi = round2(c * 0.003 * (m / 12))
  const comissao = round2(v * 0.025 * 1.23)

  const custoTotal = round2(c + is + escritura + obraTotal + imi + comissao)
  const lucroBruto = round2(v - custoTotal)

  // IRC PME
  const { total: irc } = calcIRC(Math.max(lucroBruto, 0), 1.5)
  const lucroLiquido = round2(lucroBruto - irc)

  const capital = custoTotal
  const rt = capital > 0 ? round2((lucroBruto / capital) * 100) : 0
  const ra = capital > 0 && m > 0
    ? round2((Math.pow(1 + lucroBruto / capital, 12 / m) - 1) * 100)
    : 0

  let veredicto = 'NAO_ENTRA'
  if (ra >= 15) veredicto = 'ENTRA'
  else if (ra >= 8) veredicto = 'ANALISAR'

  return {
    capital,
    lucro_bruto: lucroBruto,
    lucro_liquido: lucroLiquido,
    retorno_total: rt,
    retorno_anualizado: ra,
    veredicto,
    decomposicao: { is, escritura, obra: obraTotal, imi, comissao, irc },
  }
}

// ── Helper ───────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100
}
