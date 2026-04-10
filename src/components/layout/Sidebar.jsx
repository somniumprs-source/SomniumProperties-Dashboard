import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { LayoutDashboard, TrendingUp, Database, Bell, Menu, X } from 'lucide-react'

const nav = [
  { to: '/',           label: 'Dashboard',  Icon: LayoutDashboard, end: true },
  { to: '/crm',        label: 'CRM',        Icon: Database },
  { to: '/financeiro', label: 'Financeiro', Icon: TrendingUp },
  { to: '/alertas',    label: 'Alertas',    Icon: Bell, badge: true },
]

export function Sidebar() {
  const [alertCount, setAlertCount] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const load = () => fetch('/api/alertas').then(r => r.json()).then(d => setAlertCount(d.resumo?.criticos ?? 0)).catch(() => {})
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  // Close mobile sidebar on navigation
  const handleNav = () => setOpen(false)

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="w-full" style={{ backgroundColor: '#0d0d0d' }}>
        <img src="/logo.png" alt="Somnium Properties" className="w-full object-cover" style={{ height: '110px', objectPosition: 'center' }} />
      </div>

      {/* Separador dourado */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, #C9A84C55, transparent)' }} />

      {/* Nav label */}
      <p className="px-5 mt-5 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#333' }}>Navegação</p>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1">
        {nav.map(({ to, label, Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={handleNav}
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
                {badge && alertCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
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
    </>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg"
        style={{ backgroundColor: '#0d0d0d', border: '1px solid #1a1a1a' }}
      >
        {open ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5" style={{ color: '#C9A84C' }} />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 min-h-screen flex-col shrink-0" style={{ backgroundColor: '#0d0d0d' }}>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 flex flex-col transform transition-transform duration-200 md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: '#0d0d0d' }}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
