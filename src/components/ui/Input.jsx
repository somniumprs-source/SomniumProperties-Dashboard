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
    'w-full bg-white dark:bg-neutral-900',
    'border text-gray-900 dark:text-neutral-100',
    'placeholder:text-gray-400 dark:placeholder:text-neutral-500',
    'transition-colors',
    'focus:outline-none focus:ring-2',
    error
      ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20'
      : 'border-gray-200 dark:border-neutral-700 focus:border-brand-gold focus:ring-brand-gold/30',
    disabled ? 'bg-gray-50 dark:bg-neutral-800/50 cursor-not-allowed opacity-60' : '',
    SIZE[size] || SIZE.md,
  ].filter(Boolean).join(' ')
}

function Wrapper({ label, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-overline uppercase tracking-widest font-semibold text-gray-500 dark:text-neutral-400 mb-1.5">
          {label}
        </label>
      )}
      {children}
      {error && <p className="mt-1 text-caption text-red-600 dark:text-red-400">{error}</p>}
      {hint && !error && <p className="mt-1 text-caption text-gray-400 dark:text-neutral-500">{hint}</p>}
    </div>
  )
}

export const Input = forwardRef(function Input(
  { label, error, hint, size = 'md', prefix, suffix, className = '', wrapperClassName, ...rest }, ref
) {
  const input = (
    <input ref={ref} className={`${baseClass(size, error, rest.disabled)} ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-9' : ''} ${className}`} {...rest} />
  )
  const inner = (prefix || suffix) ? (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{prefix}</span>}
      {input}
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{suffix}</span>}
    </div>
  ) : input
  return <Wrapper label={label} error={error} hint={hint} className={wrapperClassName}>{inner}</Wrapper>
})

export const Select = forwardRef(function Select(
  { label, error, hint, size = 'md', children, className = '', wrapperClassName, ...rest }, ref
) {
  return (
    <Wrapper label={label} error={error} hint={hint} className={wrapperClassName}>
      <select ref={ref} className={`${baseClass(size, error, rest.disabled)} cursor-pointer pr-8 appearance-none bg-no-repeat bg-right ${className}`}
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
      <textarea ref={ref} className={`${baseClass(size, error, rest.disabled)} resize-y min-h-[60px] ${className}`} {...rest} />
    </Wrapper>
  )
})
