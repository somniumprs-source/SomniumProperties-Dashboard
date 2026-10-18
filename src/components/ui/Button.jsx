/**
 * Button — sistema unificado (tokens semânticos, dark mode automático).
 *
 * Variantes:
 *  - primary     → acção principal da página (dourado; uma por zona)
 *  - gold        → alias de primary (compatibilidade)
 *  - secondary   → superfície + linha (acções correntes: Atualizar, Exportar…)
 *  - ghost       → discreto
 *  - destructive → perigo
 *  - success     → confirmação
 *  - outline     → só contorno
 *
 * Sizes: sm | md (default) | lg | xl
 */
import { Loader2 } from 'lucide-react'

const PRIMARY = 'bg-accent text-accent-foreground border border-accent hover:brightness-[1.04] shadow-xs'

const VARIANTS = {
  primary:     PRIMARY,
  gold:        PRIMARY,
  secondary:   'bg-surface-raised text-ink border border-line hover:bg-surface-muted hover:border-ink/20',
  ghost:       'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-muted',
  destructive: 'bg-danger text-white dark:text-accent-foreground border border-danger hover:brightness-110 shadow-xs',
  success:     'bg-success text-white dark:text-accent-foreground border border-success hover:brightness-110 shadow-xs',
  outline:     'bg-transparent text-ink border border-ink/30 hover:border-ink hover:bg-surface-muted',
}

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded-md',
  md: 'px-3.5 py-2 text-ui gap-2 rounded-lg',
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
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap
        transition-[background-color,border-color,color,box-shadow,filter,transform] duration-fast ease-entry
        active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
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
