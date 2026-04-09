import { NavLink } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Users, Megaphone, HardHat, BarChart2 } from 'lucide-react'

const nav = [
  { to: '/',           label: 'Dashboard',  Icon: LayoutDashboard, end: true },
  { to: '/financeiro', label: 'Financeiro', Icon: TrendingUp },
  { to: '/comercial',  label: 'Comercial',  Icon: Users },
  { to: '/metricas',   label: 'KPI',        Icon: BarChart2 },
  { to: '/marketing',  label: 'Marketing',  Icon: Megaphone },
  { to: '/operacoes',  label: 'Operações',  Icon: HardHat },
]

export function Sidebar() {
  return (
    <aside className="w-60 min-h-screen flex flex-col shrink-0" style={{ backgroundColor: '#0d0d0d' }}>

      {/* Logo — sem padding, fundo da imagem funde com a sidebar */}
      <div className="w-full" style={{ backgroundColor: '#0d0d0d' }}>
        <img src="/logo.png" alt="Somnium Properties" className="w-full object-cover" style={{ height: '110px', objectPosition: 'center' }} />
      </div>

      {/* Separador dourado fino */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, #C9A84C55, transparent)' }} />

      {/* Nav label */}
      <p className="px-5 mt-5 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#333' }}>Navegação</p>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1">
        {nav.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive ? 'active-nav' : 'text-neutral-500 hover:text-white'
              }`
            }
            style={({ isActive }) => isActive ? {
              background: 'linear-gradient(90deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%)',
              color: '#C9A84C',
              borderLeft: '2px solid #C9A84C',
            } : { borderLeft: '2px solid transparent' }}
          >
            {({ isActive }) => (
              <>
                <Icon className="w-4 h-4 shrink-0 transition-colors"
                  style={{ color: isActive ? '#C9A84C' : undefined }} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-5" style={{ borderTop: '1px solid #1a1a1a' }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <p className="text-[11px]" style={{ color: '#444' }}>Sistema online</p>
        </div>
      </div>
    </aside>
  )
}
