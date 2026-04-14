import { Inbox } from 'lucide-react'

export function EmptyState({ icon: Icon = Inbox, title = 'Sem dados', description = 'Nenhum registo encontrado.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-neutral-400" />
      </div>
      <h3 className="text-sm font-semibold text-neutral-600 mb-1">{title}</h3>
      <p className="text-xs text-neutral-400 max-w-xs">{description}</p>
    </div>
  )
}
