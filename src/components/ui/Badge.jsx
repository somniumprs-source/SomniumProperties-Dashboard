/**
 * Badge — etiqueta para estados, categorias, contadores.
 *
 * Tones: gold (brand) | dark | gray | green | red | yellow | blue | purple | pink
 *        (indigo mantém-se por compatibilidade, mas desenha como gray)
 * Variants: solid | soft (default) | outline
 * Sizes: xs | sm (default) | md
 */

const SOFT = {
  gold:   'bg-accent/15 text-accent-ink border border-accent/30',
  dark:   'bg-surface-muted text-ink border border-line',
  gray:   'bg-surface-muted text-ink-muted border border-line',
  green:  'bg-success/10 text-success border border-success/30',
  red:    'bg-danger/10 text-danger border border-danger/30',
  yellow: 'bg-warning/10 text-warning border border-warning/30',
  blue:   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50',
  purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50',
  pink:   'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 border border-pink-200 dark:border-pink-800/50',
}
SOFT.indigo = SOFT.gray

const SOLID = {
  gold:   'bg-accent text-accent-foreground',
  dark:   'bg-ink text-surface',
  gray:   'bg-ink-muted text-surface',
  green:  'bg-success text-white',
  red:    'bg-danger text-white',
  yellow: 'bg-warning text-white',
  blue:   'bg-blue-600 text-white',
  purple: 'bg-purple-600 text-white',
  pink:   'bg-pink-600 text-white',
}
SOLID.indigo = SOLID.gray

const OUTLINE = {
  gold:   'border border-accent/40 text-accent-ink',
  dark:   'border border-ink/30 text-ink',
  gray:   'border border-line text-ink-muted',
  green:  'border border-success/40 text-success',
  red:    'border border-danger/40 text-danger',
  yellow: 'border border-warning/40 text-warning',
  blue:   'border border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400',
  purple: 'border border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400',
  pink:   'border border-pink-300 text-pink-700 dark:border-pink-700 dark:text-pink-400',
}
OUTLINE.indigo = OUTLINE.gray

const SIZE = {
  xs: 'px-1.5 py-px text-[11px] leading-4 gap-1',
  sm: 'px-2 py-0.5 text-[11px] leading-4 gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
}

export function Badge({ tone = 'gray', variant = 'soft', size = 'sm', icon: Icon, dot = false, className = '', children, ...rest }) {
  const map = variant === 'solid' ? SOLID : variant === 'outline' ? OUTLINE : SOFT
  return (
    <span className={`inline-flex items-center font-medium rounded-full whitespace-nowrap ${SIZE[size] || SIZE.sm} ${map[tone] || map.gray} ${className}`} {...rest}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${variant === 'solid' ? 'bg-current' : tone === 'green' ? 'bg-success' : tone === 'red' ? 'bg-danger' : tone === 'yellow' ? 'bg-warning' : tone === 'blue' ? 'bg-blue-500' : 'bg-current'} opacity-80`} />}
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  )
}
