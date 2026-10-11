// Formatação partilhada pelos blocos "Próximos passos" (imóvel e pessoa).
export const inputClass = 'w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

export function fmtQuando(v) {
  if (!v) return 'Sem data'
  const d = new Date(v)
  if (isNaN(d)) return v
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(String(v))
  return d.toLocaleString('pt-PT', soData
    ? { weekday: 'short', day: '2-digit', month: '2-digit' }
    : { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const fmtDia = v => {
  const [y, m, d] = String(v || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : '—'
}

export function emDias(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function agoraLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Instante ISO a partir de data + hora locais; null se não houver hora.
export const comHora = (data, hora) => (data && hora ? new Date(`${data}T${hora}`).toISOString() : null)
