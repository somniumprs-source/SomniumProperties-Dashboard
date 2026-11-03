// Rubricas da Análise Financeira e custo final previsto (O04) e erosão de
// lucro (P07). Fonte única para o quadro Estimado vs Real da ficha do projeto,
// o Express (server.js) e a Edge Function dashboard. Só funções puras.

const n = (v) => Number(v) || 0;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// Rubricas da Análise Financeira (calcAnalise em src/db/calcEngine.js). A soma
// dos estimados é igual ao custo_total da análise. `acumula`: rubricas que vão
// sendo faturadas ao longo do projecto (obra, custos mensais) — enquanto o
// projecto corre, o custo final previsto é max(real, estimado); nas restantes
// (pagamento único) uma fatura registada é tratada como valor final.
// `semCapital`: não conta para o capital a adiantar (comissão paga pelo sinal).
export const GRUPO_VENDA_DEDUCAO = 'Descontado na venda'

export const RUBRICAS = [
  // Compra = total de aquisição guardado menos os restantes custos de aquisição:
  // inclui o fee de cedência (Wholesaling), tal como calcAnalise o soma à compra.
  { key: 'compra',           grupo: 'Aquisição',      label: 'Preço de compra',            est: estCompra },
  { key: 'imt',              grupo: 'Aquisição',      label: 'IMT',                        est: a => n(a.imt) },
  { key: 'imposto_selo',     grupo: 'Aquisição',      label: 'Imposto do Selo',            est: a => n(a.imposto_selo) },
  { key: 'escritura',        grupo: 'Aquisição',      label: 'Escritura e registos',       est: a => (a.escritura == null ? 0 : n(a.escritura) || 700) },
  { key: 'cpcv_compra',      grupo: 'Aquisição',      label: 'CPCV de compra',             est: a => n(a.cpcv_compra) },
  { key: 'due_diligence',    grupo: 'Aquisição',      label: 'Due diligence',              est: a => n(a.due_diligence) },
  { key: 'financiamento',    grupo: 'Financiamento',  label: 'Custos bancários (IS, comissões, hipoteca, amortização)',
    est: a => n(a.is_financiamento) + n(a.comissoes_banco) + n(a.hipoteca) + n(a.penalizacao_amort) },
  { key: 'prestacoes',       grupo: 'Financiamento',  label: 'Prestações do crédito',      est: a => n(a.prestacao_mensal) * meses(a), acumula: true },
  { key: 'obra',             grupo: 'Obra',           label: 'Obra (c/ IVA)',              est: a => n(a.obra_com_iva), acumula: true },
  // Licenças e certificações: detalhe do subtotal licenciamento da Análise. A key
  // 'licenciamento' fica como "Outras" (residual) — compatível com faturas antigas
  // e com análises sem detalhe, e a soma das 3 é sempre igual a licenciamento.
  { key: 'lic_camara',       grupo: 'Licenças e certificações', label: 'Licenças e taxas camarárias', est: a => n(a.lic_camara) },
  { key: 'lic_aru',          grupo: 'Licenças e certificações', label: 'Certificação ARU',            est: a => n(a.lic_aru) },
  { key: 'licenciamento',    grupo: 'Licenças e certificações', label: 'Outras licenças e certidões',
    est: a => Math.max(n(a.licenciamento) - n(a.lic_camara) - n(a.lic_aru), 0) },
  { key: 'imi',              grupo: 'Detenção',       label: 'IMI proporcional',           est: a => n(a.imi_proporcional), acumula: true },
  { key: 'seguro',           grupo: 'Detenção',       label: 'Seguro',                     est: a => n(a.seguro_mensal) * meses(a), acumula: true },
  { key: 'condominio',       grupo: 'Detenção',       label: 'Condomínio',                 est: a => n(a.condominio_mensal) * meses(a), acumula: true },
  { key: 'utilidades',       grupo: 'Detenção',       label: 'Utilidades (água, luz, gás)', est: a => n(a.utilidades_mensal) * meses(a), acumula: true },
  { key: 'tranches',         grupo: 'Detenção',       label: 'Custos de tranches',         est: a => n(a.n_tranches || 1) * n(a.custo_tranche) },
  { key: 'ligacao_servicos', grupo: 'Detenção',       label: 'Ligação de serviços',        est: a => n(a.ligacao_servicos) },
  { key: 'excedente_capital',grupo: 'Detenção',       label: 'Excedente de capital (reserva)', est: a => n(a.excedente_capital) },
  // A comissão sai do preço de venda (paga no sinal do comprador): não é despesa
  // coberta pelo capital — fica num grupo próprio, mas conta para o lucro.
  { key: 'comissao_venda',   grupo: GRUPO_VENDA_DEDUCAO, label: 'Comissão de mediação (c/ IVA)', est: a => n(a.comissao_com_iva), semCapital: true },
  { key: 'cpcv_venda',       grupo: 'Venda',          label: 'CPCV de venda',              est: a => n(a.cpcv_venda) },
  { key: 'cert_energetico',  grupo: 'Venda',          label: 'Certificado energético',     est: a => n(a.cert_energetico) },
  { key: 'home_staging',     grupo: 'Venda',          label: 'Home staging',               est: a => n(a.home_staging) },
  { key: 'outros_venda',     grupo: 'Venda',          label: 'Outros custos de venda',     est: a => n(a.outros_venda) },
]
function meses(a) { return Math.max(parseInt(a.meses) || 6, 1) }
function estCompra(a) {
  const declarado = n(a.compra) + n(a.fee_cedencia)
  if (!(n(a.total_aquisicao) > 0)) return declarado
  const outros = n(a.imt) + n(a.imposto_selo) + (a.escritura == null ? 0 : n(a.escritura) || 700) + n(a.cpcv_compra) + n(a.due_diligence)
  const derivado = Math.max(n(a.total_aquisicao) - outros, 0)
  // Diferenças abaixo de 1 € são arredondamentos dos impostos guardados: usa o valor declarado.
  return Math.abs(derivado - declarado) < 1 ? declarado : derivado
}

export const RUBRICA_EXTRA = 'extra'


// Despesas pagas pelo capital primeiro; o que é descontado na venda fica no fim.
export const GRUPOS = [...new Set(RUBRICAS.map(r => r.grupo))]
  .sort((a, b) => (a === GRUPO_VENDA_DEDUCAO) - (b === GRUPO_VENDA_DEDUCAO))

// Despesas antigas sem rubrica: as registadas numa fase de obra contam como Obra.
export function rubricaDe(d) {
  if (d.rubrica_analise) return d.rubrica_analise
  if (d.fase_id) return 'obra'
  return null
}

// Custo final previsto (O04). Por rubrica:
//  · rubricas que vão sendo faturadas (acumula): a previsão escrita à mão, se
//    existir, nunca abaixo do já faturado; sem previsão, max(real, estimado);
//  · rubricas de pagamento único: a fatura é o valor final; sem fatura, o estimado.
// Custos extra e faturas por classificar entram pelo valor real.
export function custoFinalPrevisto(analise, despesas, previsoes = {}) {
  const a = analise || {};
  const porRubrica = {};
  for (const d of despesas || []) {
    const k = rubricaDe(d) || "__sem__";
    porRubrica[k] = (porRubrica[k] || 0) + n(d.custo_mensal);
  }
  const linhas = RUBRICAS.map((r) => {
    const estimado = round2(r.est(a));
    const real = round2(porRubrica[r.key] || 0);
    const temReal = r.key in porRubrica;
    const manual = r.acumula && previsoes?.[r.key] != null && previsoes[r.key] !== "" ? n(previsoes[r.key]) : null;
    const final = r.acumula
      ? (manual != null ? Math.max(manual, real) : Math.max(real, estimado))
      : (temReal ? real : estimado);
    return { key: r.key, estimado, real, manual, final: round2(final) };
  });
  const foraDaAnalise = round2(n(porRubrica[RUBRICA_EXTRA]) + n(porRubrica.__sem__));
  const orcamento = round2(linhas.reduce((s, l) => s + l.estimado, 0));
  const previsto = round2(linhas.reduce((s, l) => s + l.final, 0) + foraDaAnalise);
  return {
    linhas,
    orcamento,
    real: round2(Object.values(porRubrica).reduce((s, v) => s + v, 0)),
    restante: round2(Math.max(previsto - Object.values(porRubrica).reduce((s, v) => s + v, 0), 0)),
    previsto,
    desvio: round2(orcamento - previsto),
  };
}

// Erosão de lucro (P07): lucro de referência (congelado na compra) menos o
// lucro previsto hoje = lucro da análise atual corrigido pelo desvio do custo.
export function erosaoLucro(referencia, analiseAtual, custo) {
  if (!referencia || !analiseAtual || !custo) return null;
  const lucroReferencia = round2(n(referencia.lucro_bruto));
  const lucroPrevisto = round2(n(analiseAtual.lucro_bruto) + custo.desvio);
  return { lucroReferencia, lucroPrevisto, erosao: round2(lucroReferencia - lucroPrevisto) };
}
