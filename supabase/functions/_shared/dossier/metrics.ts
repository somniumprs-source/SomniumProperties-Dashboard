// Metricas adicionais para o Dossier de Investimento.
//
// Modelo do deal: capital unico no inicio, saida unica no exit (flip).
// Por isso nao calculamos IRR/NPV — colapsariam para retorno anualizado simples.
//
// MOIC (Equity Multiple) e Payback sao as metricas que faltavam ao Dossier
// para comunicar de forma directa com investidores que comparam com outras
// alternativas (depositos, OT, fundos imobiliarios).

const safeNum = (v: any): number => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// MOIC = (Capital + Lucro Liquido) / Capital
// Devolve numero (ex. 1.42) ou null se capital invalido.
export function computeMOIC(capital: any, lucroLiquido: any): number | null {
  const c = safeNum(capital)
  if (c <= 0) return null
  const l = safeNum(lucroLiquido)
  return (c + l) / c
}

// Payback (em meses): para deal de capital unico + saida unica, e o proprio
// prazo do deal se o lucro liquido for >= 0; null se nao recuperar (lucro
// negativo). Esclarece ao investidor que o capital so volta no exit.
export function computePayback({ meses, lucroLiquido }: { meses: any; lucroLiquido: any }): number | null {
  const m = parseInt(meses, 10)
  if (!Number.isFinite(m) || m <= 0) return null
  const l = safeNum(lucroLiquido)
  if (l < 0) return null
  return m
}

// Formatadores — usados pelos renderers PDF.
export function formatMOIC(v: any): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(2)}x`
}

export function formatPayback(meses: any): string {
  if (meses == null) return '—'
  return `${meses} meses`
}
