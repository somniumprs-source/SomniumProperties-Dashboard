import { Inbox } from 'lucide-react'

export function EmptyState({ icon: Icon = Inbox, title = 'Sem dados', description = 'Nenhum registo encontrado.', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-ink-muted" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-ink mb-1">{title}</h3>
      <p className="text-ui text-ink-muted max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
