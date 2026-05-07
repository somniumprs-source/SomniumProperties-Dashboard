/**
 * Botão unificado da app.
 *
 * Variantes:
 *  - primary     → acção principal (preto + dourado da brand)
 *  - secondary   → acção secundária (branco + border cinza)
 *  - ghost       → acções discretas (sem border, hover suave)
 *  - destructive → apagar / acções perigosas (vermelho)
 *
 * Tamanhos: sm | md (default) | lg
 *
 * Aceita ícone Lucide opcional via prop `icon` (componente, não JSX).
 */

const VARIANTS = {
  primary:     'bg-[#0d0d0d] text-[#C9A84C] border border-[#2a2a2a] hover:bg-[#1a1a1a] active:scale-[0.98]',
  secondary:   'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:scale-[0.98]',
  ghost:       'bg-transparent text-gray-600 hover:bg-gray-100 active:scale-[0.98]',
  destructive: 'bg-red-600 text-white border border-red-700 hover:bg-red-700 active:scale-[0.98]',
  success:     'bg-green-600 text-white border border-green-700 hover:bg-green-700 active:scale-[0.98]',
}

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
}

const ICON_SIZE = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-4 h-4' }

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={`${ICON_SIZE[size]} ${loading ? 'animate-spin' : ''} shrink-0`} />}
      {children && <span>{children}</span>}
      {IconRight && <IconRight className={`${ICON_SIZE[size]} shrink-0`} />}
    </button>
  )
}
