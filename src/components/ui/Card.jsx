/**
 * Card — wrapper padrão com border, padding, sombra coerentes.
 *
 * Variantes:
 *  - default  → card branco com sombra subtil
 *  - elevated → mais destaque (shadow-md)
 *  - dark     → fundo tinta (preto), texto claro
 *  - outlined → só border, sem sombra
 *
 * Padding sizes: none | sm | md (default) | lg
 * Subcomponentes: Card.Header, Card.Body, Card.Footer
 */

const VARIANTS = {
  default:  'bg-surface-raised border border-line shadow-xs',
  elevated: 'bg-surface-raised border border-line shadow-md',
  dark:     'bg-brand-dark text-white border border-brand-dark-700',
  outlined: 'bg-transparent border border-line',
  glass:    'bg-surface-raised/85 backdrop-blur-md border border-line shadow-md',
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
  const cls = `${v} ${p} rounded-xl ${hover || interactive ? 'transition-[box-shadow,border-color] duration-base ease-entry hover:shadow-md hover:border-ink/20' : ''} ${interactive ? 'cursor-pointer' : ''} ${className}`
  return <div onClick={onClick} className={cls} {...rest}>{children}</div>
}

Card.Header = function CardHeader({ title, subtitle, action, icon: Icon, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 mb-3 ${className}`}>
      <div className="min-w-0 flex-1">
        {(title || subtitle) && (
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-ink-muted" />}
            {title && <h3 className="text-sm font-semibold text-ink truncate">{title}</h3>}
          </div>
        )}
        {subtitle && <p className="text-caption text-ink-muted mt-0.5 truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

Card.Body = function CardBody({ className = '', children }) {
  return <div className={className}>{children}</div>
}

Card.Footer = function CardFooter({ className = '', children }) {
  return <div className={`mt-4 pt-3 border-t border-line ${className}`}>{children}</div>
}
