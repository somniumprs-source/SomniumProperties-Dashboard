// Pagina partilhada "Pressupostos e Glossario" — chamada pelo Dossier de
// Investimento e pela Proposta Anonima. Garante que ambos os documentos
// mostram exactamente os mesmos pressupostos e definicoes.

const PCT_DEFAULT = '—'

function pctOrDash(v) {
  if (v == null || isNaN(parseFloat(v))) return PCT_DEFAULT
  return `${parseFloat(v)}%`
}

function regimeIvaLabel(deal) {
  if (deal.aru) return 'ARU — 6% sobre toda a obra'
  if (deal.ampliacao) return 'Ampliacao — 23% sobre toda a obra'
  const pmo = parseFloat(deal.pmo_perc) || 65
  return `Normal — Mao-de-obra (${pmo}%) a 6% + Materiais a 23%`
}

function modoObraLabel(deal) {
  if (deal.modo_obra === 'fixo') return 'Fixo (valor final do empreiteiro)'
  return 'Calculado (PMO + IVA)'
}

function financiamentoLabel(deal) {
  const p = parseFloat(deal.perc_financiamento) || 0
  if (p <= 0) return '100% capitais proprios'
  return `${p}% financiado · ${100 - p}% capitais proprios`
}

// Renderiza a seccao no DocBuilder. Comeca em nova pagina para garantir
// que o glossario nao fica partido a meio.
export function renderAssumptionsAndGlossary(b, deal) {
  if (!b || !deal) return

  b.newPage()
  b.header('PRESSUPOSTOS DO ESTUDO')
  b.simpleTable([
    { label: 'Regime fiscal (SPV)', value: deal.regime_fiscal || 'Empresa' },
    { label: 'Estrutura de capital', value: financiamentoLabel(deal) },
    { label: 'Prazo de detencao', value: deal.meses ? `${deal.meses} meses` : '—' },
    { label: 'Peso PMO (mao-de-obra)', value: pctOrDash(deal.pmo_perc) },
    { label: 'Regime IVA da obra', value: regimeIvaLabel(deal) },
    { label: 'Modo de calculo da obra', value: modoObraLabel(deal) },
    { label: 'Comissao de venda assumida', value: pctOrDash(deal.comissao_perc) },
  ])
  b.space(6)

  b.header('GLOSSARIO E FORMULAS')
  b.space(2)

  b.subheader('Indicadores financeiros')
  b.simpleTable([
    { label: 'Capital Necessario', value: 'Compra + IMT + IS + Escritura + Obra com IVA + Detencao + Comissao Venda' },
    { label: 'Lucro Bruto', value: 'VVR − Capital Necessario' },
    { label: 'Lucro Liquido', value: 'Lucro Bruto − Impostos (regime SPV)' },
    { label: 'Retorno Total', value: 'Lucro Liquido / Capital Necessario' },
    { label: 'Retorno Anualizado', value: '((1 + Retorno Total) ^ (12 / meses)) − 1' },
    { label: 'MOIC (Equity Multiple)', value: '(Capital + Lucro Liquido) / Capital' },
    { label: 'Cash-on-Cash', value: 'Lucro Liquido / Capital efectivamente desembolsado' },
    { label: 'Payback', value: 'Prazo ate recuperacao integral do capital (no exit do deal)' },
  ])
  b.space(6)

  b.subheader('Acronimos do dominio imobiliario')
  b.simpleTable([
    { label: 'CAEP', value: 'Contrato de Associacao em Participacao' },
    { label: 'ARU', value: 'Area de Reabilitacao Urbana (regime IVA reduzido a 6%)' },
    { label: 'IMT / IS', value: 'Imposto Municipal sobre Transmissoes / Imposto do Selo' },
    { label: 'PMO', value: 'Peso da Mao-de-Obra no custo total da obra' },
    { label: 'BDI', value: 'Beneficios e Despesas Indirectas (margem do construtor)' },
    { label: 'VVR', value: 'Valor de Venda Remodelado (estimativa de venda apos obra)' },
    { label: 'VPT', value: 'Valor Patrimonial Tributario (referencia para IMT/IMI)' },
    { label: 'CPCV', value: 'Contrato Promessa de Compra e Venda' },
  ])
  b.space(4)

  b.note('Os pressupostos acima reflectem a configuracao actual da analise. Numeros sao calculados de forma uniforme em todos os documentos investidor (Dossier, Proposta Anonima, Analise de Rentabilidade, Relatorio CAEP).')
}
