import { Link } from 'react-router-dom'
import { KPICard } from './KPICard.jsx'
import { ArrowRight } from 'lucide-react'

export function DepartmentSection({ title, icon: Icon, kpis, link }) {
  return (
    <div className="bg-surface-raised rounded-xl border border-line shadow-xs overflow-hidden flex flex-col">

      <div className="px-5 py-3.5 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-muted">
            <Icon className="w-4 h-4 text-ink-muted" />
          </div>
          <h2 className="text-ui font-semibold text-ink">{title}</h2>
        </div>
        <Link to={link}
          className="flex items-center gap-1.5 text-caption font-medium text-ink-muted hover:text-ink transition-colors duration-fast group">
          Ver detalhe
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform duration-fast" />
        </Link>
      </div>

      {/* KPIs */}
      <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {kpis.map((kpi, i) => (
          <KPICard key={i} {...kpi} />
        ))}
      </div>
    </div>
  )
}
