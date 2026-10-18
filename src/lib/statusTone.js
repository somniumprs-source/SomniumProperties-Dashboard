// Estados e fases: cor por família, sobre a superfície neutra da plataforma.
// Lê a família de cor dos mapas antigos (ex.: 'bg-blue-100 text-blue-700')
// e devolve classes literais (o Tailwind não gera classes montadas em runtime).
//   dot  — ponto
//   pill — etiqueta (fundo translúcido + texto na cor, legível nos dois temas)
//   bar  — filete no topo da coluna do Kanban
//   head — fundo do cabeçalho da coluna
//   text — texto na cor (ex.: nome da etapa)
const T = {
  gray:   { dot: 'bg-ink-muted/50', pill: 'bg-ink/[0.06] text-ink-muted',                          bar: 'bg-ink-muted/40', head: 'bg-ink/[0.03]',          text: 'text-ink-muted' },
  gold:   { dot: 'bg-accent',       pill: 'bg-accent/15 text-accent-ink',                           bar: 'bg-accent',       head: 'bg-accent/[0.08]',       text: 'text-accent-ink' },
  yellow: { dot: 'bg-yellow-500',   pill: 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300',   bar: 'bg-yellow-500',   head: 'bg-yellow-500/[0.07]',   text: 'text-yellow-700 dark:text-yellow-300' },
  orange: { dot: 'bg-orange-500',   pill: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',   bar: 'bg-orange-500',   head: 'bg-orange-500/[0.07]',   text: 'text-orange-700 dark:text-orange-300' },
  blue:   { dot: 'bg-blue-500',     pill: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',         bar: 'bg-blue-500',     head: 'bg-blue-500/[0.07]',     text: 'text-blue-700 dark:text-blue-300' },
  indigo: { dot: 'bg-indigo-500',   pill: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',   bar: 'bg-indigo-500',   head: 'bg-indigo-500/[0.07]',   text: 'text-indigo-700 dark:text-indigo-300' },
  cyan:   { dot: 'bg-cyan-500',     pill: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',         bar: 'bg-cyan-500',     head: 'bg-cyan-500/[0.07]',     text: 'text-cyan-700 dark:text-cyan-300' },
  teal:   { dot: 'bg-teal-500',     pill: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',         bar: 'bg-teal-500',     head: 'bg-teal-500/[0.07]',     text: 'text-teal-700 dark:text-teal-300' },
  purple: { dot: 'bg-purple-500',   pill: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',   bar: 'bg-purple-500',   head: 'bg-purple-500/[0.07]',   text: 'text-purple-700 dark:text-purple-300' },
  pink:   { dot: 'bg-pink-500',     pill: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',         bar: 'bg-pink-500',     head: 'bg-pink-500/[0.07]',     text: 'text-pink-700 dark:text-pink-300' },
  green:  { dot: 'bg-success',      pill: 'bg-success/10 text-success',                             bar: 'bg-success',      head: 'bg-success/[0.07]',      text: 'text-success' },
  red:    { dot: 'bg-danger',       pill: 'bg-danger/10 text-danger',                               bar: 'bg-danger',       head: 'bg-danger/[0.06]',       text: 'text-danger' },
}
const ALIAS = {
  neutral: 'gray', slate: 'gray', stone: 'gray', zinc: 'gray',
  amber: 'gold', brand: 'gold', violet: 'purple', sky: 'blue',
  emerald: 'green', lime: 'green', rose: 'red',
}

export function toneOf(cls = '') {
  const fam = String(cls).match(/(?:bg|text)-([a-z]+)-\d+/)?.[1]
  return T[ALIAS[fam] || fam] || T.gray
}

export const dotClass = (cls = '') => toneOf(cls).dot
export const pillClass = (cls = '') => toneOf(cls).pill
