// Estados e fases: cor só num ponto, sobre pílula/coluna neutra.
// Lê a família de cor dos mapas antigos (ex.: 'bg-blue-100 text-blue-700')
// e devolve uma classe literal (o Tailwind não gera classes montadas em runtime).
const DOT = {
  gray: 'bg-ink-muted/40', neutral: 'bg-ink-muted/40', slate: 'bg-ink-muted/40', indigo: 'bg-ink-muted', violet: 'bg-purple-500',
  amber: 'bg-amber-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500', blue: 'bg-blue-500', sky: 'bg-sky-500',
  cyan: 'bg-cyan-500', teal: 'bg-teal-500', purple: 'bg-purple-500', pink: 'bg-pink-500', green: 'bg-success',
  emerald: 'bg-success', lime: 'bg-success', red: 'bg-danger', rose: 'bg-danger',
}

export function dotClass(cls = '') {
  const fam = String(cls).match(/(?:bg|text)-([a-z]+)-\d+/)?.[1]
  return DOT[fam] || DOT.gray
}
