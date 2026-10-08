// Tempo no mercado: calculado a partir da data de entrada no mercado
// (`imoveis.data_anuncio`, tirada do Casafari). Nunca é guardado — conta-se
// sempre até hoje, por isso atualiza sozinho de dia para dia.
export function diasNoMercado(dataEntrada, hoje = new Date()) {
  if (!dataEntrada) return null
  const d = dataEntrada instanceof Date
    ? [dataEntrada.getFullYear(), dataEntrada.getMonth() + 1, dataEntrada.getDate()]
    : String(dataEntrada).slice(0, 10).split('-').map(Number)
  if (d.length !== 3 || d.some(n => !Number.isFinite(n))) return null
  const dias = Math.round((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - Date.UTC(d[0], d[1] - 1, d[2])) / 86400000)
  return dias >= 0 ? dias : null
}

export function fmtTempoMercado(dataEntrada) {
  const dias = diasNoMercado(dataEntrada)
  if (dias == null) return '—'
  return dias === 1 ? '1 dia' : `${dias} dias`
}
