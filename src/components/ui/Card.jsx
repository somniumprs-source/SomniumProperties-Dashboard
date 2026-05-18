/**
 * Card — wrapper padrão com border, padding, sombra coerentes.
 *
 * Variantes:
 *  - default  → card branco com sombra subtil
 *  - elevated → mais destaque (shadow-md)
 *  - dark     → fundo brand-dark (preto), texto dourado
 *  - outlined → só border, sem sombra
 *
 * Padding sizes: none | sm | md (default) | lg
 * Subcomponentes: Card.Header, Card.Body, Card.Footer
 */

const VARIANTS = {
  default:  'bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-xs',
  elevated: 'bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-md',
  dark:     'bg-brand-dark text-white border border-brand-dark-700',
  outlined: 'bg-transparent border border-gray-200 dark:border-neutral-800',
  glass:    'bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border border-white/20 dark:border-neutral-800/50 shadow-md',
}

const PADDING = {
  none: '',
  sm:   'p-3',
  md:   'p-4 sm:p-5',
  lg:   'p-5 sm:p-6',
}

export function Card({ variant = 'default', padding = 'md', hover = false, onClick, className = '', children, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.default
  const p = PADDING[padding] ?? PADDING.md
  const interactive = !!onClick
  const cls = `${v} ${p} rounded-xl ${hover || interactive ? 'transition-all hover:shadow-md hover:-translate-y-0.5' : ''} ${interactive ? 'cursor-pointer' : ''} ${className}`
  return <div onClick={onClick} className={cls} {...rest}>{children}</div>
}

Card.Header = function CardHeader({ title, subtitle, action, icon: Icon, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 mb-3 ${className}`}>
      <div className="min-w-0 flex-1">
        {(title || subtitle) && (
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-brand-gold" />}
            {title && <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100 truncate">{title}</h3>}
          </div>
        )}
        {subtitle && <p className="text-caption text-gray-500 dark:text-neutral-400 mt-0.5 truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

Card.Body = function CardBody({ className = '', children }) {
  return <div className={className}>{children}</div>
}

Card.Footer = function CardFooter({ className = '', children }) {
  return <div className={`mt-4 pt-3 border-t border-gray-100 dark:border-neutral-800 ${className}`}>{children}</div>
}
