/**
 * Button — sistema unificado com brand colors, micro-interactions, dark mode.
 *
 * Variantes:
 *  - primary     → CTA principal (preto + dourado)
 *  - gold        → acção dourada destacada
 *  - secondary   → branco + border
 *  - ghost       → discreto
 *  - destructive → vermelho
 *  - success     → verde
 *  - outline     → border brand
 *
 * Sizes: sm | md (default) | lg | xl
 */
import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary:     'bg-brand-dark text-brand-gold border border-brand-dark-700 hover:bg-brand-dark-light hover:shadow-md active:scale-[0.98] shadow-xs',
  gold:        'bg-brand-gold text-brand-dark border border-brand-gold-600 hover:bg-brand-gold-400 hover:shadow-gold active:scale-[0.98] shadow-xs',
  secondary:   'bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:border-gray-300 dark:hover:border-neutral-600 active:scale-[0.98]',
  ghost:       'bg-transparent text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 active:scale-[0.98]',
  destructive: 'bg-red-600 text-white border border-red-700 hover:bg-red-700 hover:shadow-md active:scale-[0.98] shadow-xs',
  success:     'bg-green-600 text-white border border-green-700 hover:bg-green-700 hover:shadow-md active:scale-[0.98] shadow-xs',
  outline:     'bg-transparent text-brand-dark dark:text-brand-gold border border-brand-dark dark:border-brand-gold hover:bg-brand-dark hover:text-brand-gold dark:hover:bg-brand-gold dark:hover:text-brand-dark active:scale-[0.98]',
}

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded-md',
  md: 'px-3.5 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-5 py-2.5 text-sm gap-2 rounded-lg',
  xl: 'px-6 py-3 text-base gap-2.5 rounded-xl',
}

const ICON_SIZE = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-4 h-4', xl: 'w-5 h-5' }

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled,
  fullWidth = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold transition-all whitespace-nowrap
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${fullWidth ? 'w-full' : ''}
        ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className={`${ICON_SIZE[size]} animate-spin shrink-0`} /> : (Icon && <Icon className={`${ICON_SIZE[size]} shrink-0`} />)}
      {children && <span>{children}</span>}
      {!loading && IconRight && <IconRight className={`${ICON_SIZE[size]} shrink-0`} />}
    </button>
  )
}
