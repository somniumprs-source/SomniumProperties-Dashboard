/**
 * Avatar — círculo com iniciais (ou imagem) e cor brand-gold.
 * Sizes: xs | sm (default) | md | lg | xl
 */

const SIZE = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
  xl: 'w-14 h-14 text-base',
}

export function Avatar({ name, src, color = '#C9A84C', size = 'sm', className = '' }) {
  const initials = (name || '?')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  if (src) {
    return <img src={src} alt={name} className={`rounded-full object-cover ${SIZE[size]} ${className}`} />
  }
  return (
    <div className={`rounded-full flex items-center justify-center font-bold text-brand-dark flex-shrink-0 ${SIZE[size] || SIZE.sm} ${className}`}
      style={{ backgroundColor: color }}>
      {initials}
    </div>
  )
}
