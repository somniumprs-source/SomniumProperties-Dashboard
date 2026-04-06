import { calcAllKPIs } from '../kpis.js'

/**
 * Calcula todos os KPIs e retorna o resultado.
 * Pode ser chamado manualmente ou pelo script monthly.js.
 */
export async function runCalcKPIs() {
  console.log('[calcKPIs] A calcular KPIs...')
  const kpis = await calcAllKPIs()
  console.log('[calcKPIs] KPIs calculados:', JSON.stringify(kpis, null, 2))
  return kpis
}
