/**
 * Cálculos financeiros partilhados — fonte única para burn rate e despesas
 * anuais da empresa, usados em vários endpoints de KPIs/dashboard.
 *
 * Antes desta função existiam ~11 implementações inline ligeiramente
 * diferentes; uma delas (em /api/kpis/financeiro) somava o termo anual/12
 * duas vezes por engano, inflacionando o Burn Rate mostrado no Dashboard e
 * o alerta de "Runway crítico".
 *
 * Despesas de obra (negocioId preenchido) já estão contabilizadas no
 * lucro/custo do negócio a que pertencem — nunca devem entrar nos totais
 * "gerais da empresa" calculados aqui, senão o mesmo custo conta a dobrar.
 */

// Filtra despesas de obra/projecto fora do universo "despesas da empresa".
export function despesasDaEmpresa(despesas) {
  return (despesas || []).filter(d => !d.negocioId)
}

// Burn rate mensal = soma simples das despesas mensais + (despesas anuais / 12),
// uma vez só, só despesas gerais da empresa.
export function calcBurnRateMensal(despesas) {
  const gerais = despesasDaEmpresa(despesas)
  const mensal = gerais.filter(d => d.timing === 'Mensalmente').reduce((s, d) => s + (d.custoMensal || 0), 0)
  const anualComoMensal = gerais.filter(d => d.timing === 'Anual').reduce((s, d) => s + (d.custoAnual || 0) / 12, 0)
  return Math.round((mensal + anualComoMensal) * 100) / 100
}

// Total anual = burn rate mensal × 12 + despesas "Única vez" do ano corrente,
// só despesas gerais da empresa.
export function calcDespesasAnuaisTotal(despesas, { anoCorrente } = {}) {
  const gerais = despesasDaEmpresa(despesas)
  const burnAnual = calcBurnRateMensal(despesas) * 12
  const unicaVez = gerais
    .filter(d => d.timing === 'Único' && (!anoCorrente || (d.data || '').slice(0, 4) === String(anoCorrente)))
    .reduce((s, d) => s + (d.custoMensal || d.custoAnual || 0), 0)
  return Math.round((burnAnual + unicaVez) * 100) / 100
}
