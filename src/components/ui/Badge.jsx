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
  green:  'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800/50',
  red:    'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800/50',
  yellow: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/50',
  blue:   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50',
  purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50',
  pink:   'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 border border-pink-200 dark:border-pink-800/50',
}
SOFT.indigo = SOFT.gray

const SOLID = {
  gold:   'bg-accent text-accent-foreground',
  dark:   'bg-ink text-surface',
  gray:   'bg-ink-muted text-surface',
  green:  'bg-green-600 text-white',
  red:    'bg-red-600 text-white',
  yellow: 'bg-yellow-500 text-white',
  blue:   'bg-blue-600 text-white',
  purple: 'bg-purple-600 text-white',
  pink:   'bg-pink-600 text-white',
}
SOLID.indigo = SOLID.gray

const OUTLINE = {
  gold:   'border border-accent/40 text-accent-ink',
  dark:   'border border-ink/30 text-ink',
  gray:   'border border-line text-ink-muted',
  green:  'border border-green-300 text-green-700 dark:border-green-700 dark:text-green-400',
  red:    'border border-red-300 text-red-700 dark:border-red-700 dark:text-red-400',
  yellow: 'border border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-400',
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
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${variant === 'solid' ? 'bg-current' : tone === 'green' ? 'bg-green-500' : tone === 'red' ? 'bg-red-500' : tone === 'yellow' ? 'bg-yellow-500' : tone === 'blue' ? 'bg-blue-500' : 'bg-current'} opacity-80`} />}
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  )
}
