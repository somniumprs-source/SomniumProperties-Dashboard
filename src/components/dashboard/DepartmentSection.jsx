import { Link } from 'react-router-dom'
import { KPICard } from './KPICard.jsx'
import { ArrowRight } from 'lucide-react'

export function DepartmentSection({ title, icon: Icon, kpis, link }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.05)' }}>

      {/* Header — preto com acento dourado */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ backgroundColor: '#0d0d0d', borderBottom: '1px solid #1a1a1a' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <Icon className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <h2 className="font-bold text-sm tracking-wide text-white">{title}</h2>
        </div>
        <Link to={link}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors group"
          style={{ color: '#C9A84C' }}>
          Ver detalhe
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
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
