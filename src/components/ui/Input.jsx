/**
 * Input, Select, Textarea — todos com mesmo design system.
 * Suportam: label, error, hint, prefix, suffix, size (sm/md/lg).
 */
import { forwardRef } from 'react'

const SIZE = {
  sm: 'px-2.5 py-1.5 text-xs rounded-md',
  md: 'px-3 py-2 text-sm rounded-lg',
  lg: 'px-3.5 py-2.5 text-sm rounded-lg',
}

function baseClass(size, error, disabled) {
  return [
    'w-full bg-surface-raised',
    'border text-ink',
    'placeholder:text-ink-muted/70',
    'transition-colors duration-fast',
    'focus:outline-none focus:ring-2',
    error
      ? 'border-danger/60 focus:border-danger focus:ring-danger/20'
      : 'border-line focus:border-accent focus:ring-accent/30',
    disabled ? 'bg-surface-muted cursor-not-allowed opacity-60' : '',
    SIZE[size] || SIZE.md,
  ].filter(Boolean).join(' ')
}

function Wrapper({ label, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-overline uppercase font-semibold text-ink-muted mb-1.5">
          {label}
        </label>
      )}
      {children}
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      {hint && !error && <p className="mt-1 text-caption text-ink-muted">{hint}</p>}
    </div>
  )
}

export const Input = forwardRef(function Input(
  { label, error, hint, size = 'md', prefix, suffix, className = '', wrapperClassName, ...rest }, ref
) {
  // Números sem `step` explícito ficariam limitados a valores inteiros pelo
  // browser (arredonda ao usar as setas do campo ou o scroll do rato) — "any"
  // permite decimais (ex: valores em €) sem afectar campos que já pedem um step próprio.
  const numberProps = rest.type === 'number'
    ? { step: rest.step ?? 'any', onWheel: rest.onWheel ?? (e => e.target.blur()) }
    : null
  const input = (
    <input ref={ref} aria-invalid={error ? true : undefined} className={`${baseClass(size, error, rest.disabled)} ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-9' : ''} ${className}`} {...rest} {...numberProps} />
  )
  const inner = (prefix || suffix) ? (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">{prefix}</span>}
      {input}
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">{suffix}</span>}
    </div>
  ) : input
  return <Wrapper label={label} error={error} hint={hint} className={wrapperClassName}>{inner}</Wrapper>
})

export const Select = forwardRef(function Select(
  { label, error, hint, size = 'md', children, className = '', wrapperClassName, ...rest }, ref
) {
  return (
    <Wrapper label={label} error={error} hint={hint} className={wrapperClassName}>
      <select ref={ref} aria-invalid={error ? true : undefined} className={`${baseClass(size, error, rest.disabled)} cursor-pointer pr-8 appearance-none bg-no-repeat bg-right ${className}`}
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 10px center', backgroundSize: '12px' }}
        {...rest}>
        {children}
      </select>
    </Wrapper>
  )
})

export const Textarea = forwardRef(function Textarea(
  { label, error, hint, size = 'md', className = '', wrapperClassName, ...rest }, ref
) {
  return (
    <Wrapper label={label} error={error} hint={hint} className={wrapperClassName}>
      <textarea ref={ref} aria-invalid={error ? true : undefined} className={`${baseClass(size, error, rest.disabled)} resize-y min-h-[60px] ${className}`} {...rest} />
    </Wrapper>
  )
})
