// Pagina partilhada "Pressupostos e Glossario" — chamada pelo Dossier de
// Investimento e pela Proposta Anonima. Garante que ambos os documentos
// mostram exactamente os mesmos pressupostos e definicoes.
//
// Layout compacto: cabe numa unica pagina A4. Pressupostos em tabela,
// glossario em duas listas de definicoes inline (label seguido de "—"
// e descricao curta).

const PCT_DEFAULT = '—'

function pctOrDash(v) {
  if (v == null || isNaN(parseFloat(v))) return PCT_DEFAULT
  return `${parseFloat(v)}%`
}

function regimeIvaLabel(deal) {
  if (deal.aru) return 'ARU — 6% sobre toda a obra'
  if (deal.ampliacao) return 'Ampliacao — 23% sobre toda a obra'
  const pmo = parseFloat(deal.pmo_perc) || 65
  return `Normal — MO (${pmo}%) a 6% + Materiais a 23%`
}

function modoObraLabel(deal) {
  if (deal.modo_obra === 'fixo') return 'Fixo (empreiteiro)'
  return 'Calculado (PMO + IVA)'
}

function financiamentoLabel(deal) {
  const p = parseFloat(deal.perc_financiamento) || 0
  if (p <= 0) return '100% capitais proprios'
  return `${p}% financiado · ${100 - p}% capitais proprios`
}

// Renderiza a seccao numa pagina dedicada e isolada no fim do PDF.
// Layout escolhido para caber em UMA pagina A4 (sem overflow para a seguinte):
//   - PRESSUPOSTOS: tabela compacta
//   - GLOSSARIO: rotulos+definicoes em paragrafos `note` (font 7.5pt)
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
  b.space(8)

  b.header('GLOSSARIO E FORMULAS')
  b.space(4)

  // Indicadores financeiros (texto compacto, fonte 7.5pt)
  const indicadores = [
    'Capital Necessario — Compra + IMT + IS + Escritura + Obra com IVA + Detencao + Comissao Venda.',
    'Lucro Bruto — VVR − Capital Necessario.',
    'Lucro Liquido — Lucro Bruto − Impostos do regime fiscal aplicavel.',
    'Retorno Total — Lucro Liquido / Capital Necessario.',
    'Retorno Anualizado — ((1 + Retorno Total) ^ (12 / meses)) − 1.',
    'MOIC (Equity Multiple) — (Capital + Lucro Liquido) / Capital. Multiplo de bolso do investidor.',
    'Cash-on-Cash — Lucro Liquido / Capital efectivamente desembolsado.',
    'Payback — Prazo ate recuperacao integral do capital. No modelo de capital unico, e o proprio prazo do deal.',
  ]
  b.subheader('Indicadores financeiros')
  for (const linha of indicadores) b.note(linha)
  b.space(6)

  // Acronimos imobiliarios
  const acronimos = [
    'CAEP — Contrato de Associacao em Participacao.',
    'ARU — Area de Reabilitacao Urbana (regime IVA reduzido a 6%).',
    'IMT / IS — Imposto Municipal sobre Transmissoes / Imposto do Selo.',
    'PMO — Peso da Mao-de-Obra no custo total da obra.',
    'BDI — Beneficios e Despesas Indirectas (margem do empreiteiro).',
    'VVR — Valor de Venda Remodelado (estimativa de venda apos obra).',
    'VPT — Valor Patrimonial Tributario (referencia para IMT/IMI).',
    'CPCV — Contrato Promessa de Compra e Venda.',
  ]
  b.subheader('Acronimos do dominio imobiliario')
  for (const linha of acronimos) b.note(linha)
}
