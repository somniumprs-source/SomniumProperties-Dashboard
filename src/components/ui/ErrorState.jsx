/**
 * ErrorState — erro explicado em linguagem simples, com ação para recuperar.
 * Nunca mostra JSON, stack traces nem mensagens técnicas (ficam na consola).
 *
 *   <ErrorState error={err} onRetry={load} />
 *   <ErrorState title="Nova versão disponível" description="…" onRetry={reload} retryLabel="Atualizar" />
 */
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button.jsx'
import { friendlyError } from '../../lib/friendlyError.js'

export function ErrorState({
  title = 'Não foi possível carregar',
  description,
  error,
  onRetry,
  retryLabel = 'Tentar novamente',
  retryVariant = 'secondary',
  compact = false,
  className = '',
}) {
  const texto = description ?? friendlyError(error)
  return (
    <div role="alert" className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'min-h-[50vh] py-12 px-6'} ${className}`}>
      <div className="w-11 h-11 mb-4 rounded-full bg-danger/10 flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-danger" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-sm text-ui text-ink-muted">{texto}</p>
      {onRetry && (
        <Button variant={retryVariant} className="mt-5" onClick={onRetry}>{retryLabel}</Button>
      )}
    </div>
  )
}
