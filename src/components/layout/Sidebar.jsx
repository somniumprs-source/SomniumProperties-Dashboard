import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { LayoutDashboard, TrendingUp, Database, Bell, Clock, BarChart3, Menu, X, LogOut, Briefcase, Shield, ScrollText } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { apiFetch } from '../../lib/api.js'

const nav = [
  { to: '/',                   label: 'Dashboard',  Icon: LayoutDashboard, end: true, area: 'dashboard' },
  { to: '/crm',                label: 'CRM',        Icon: Database, badgeKey: 'crm', area: 'crm' },
  { to: '/projectos',          label: 'Projectos',  Icon: Briefcase, area: 'projectos' },
  { to: '/financeiro',         label: 'Financeiro', Icon: TrendingUp, area: 'financeiro' },
  { to: '/operacoes',          label: 'Operações',  Icon: Clock, badgeKey: 'tarefas', area: 'operacoes' },
  { to: '/metricas',           label: 'Métricas',   Icon: BarChart3, area: 'metricas' },
  { to: '/alertas',            label: 'Alertas',    Icon: Bell, badgeKey: 'alertas', area: 'alertas' },
  { to: '/relatorios-admin',   label: 'Relatórios Administração', Icon: ScrollText, area: 'relatorios-admin' },
  { to: '/admin/utilizadores', label: 'Utilizadores', Icon: Shield, area: 'admin' },
]

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const [badges, setBadges] = useState({ alertas: 0, crm: 0, tarefas: 0 })
  const [open, setOpen] = useState(false)
  // Todos os links visíveis — excepto Utilizadores que só aparece para admin
  const visibleNav = nav.filter(item => item.area !== 'admin' || profile?.role === 'admin')

  useEffect(() => {
    const load = async () => {
      try {
        const [alertas, tarefas] = await Promise.all([
          apiFetch('/api/alertas').then(r => r.json()).catch(() => null),
          apiFetch('/api/crm/tarefas?limit=200').then(r => r.json()).catch(() => null),
        ])
        const criticos = alertas?.resumo?.criticos ?? 0
        const atrasadas = Array.isArray(tarefas?.data) ? tarefas.data.filter(t => t.estado === 'Atrasada').length : 0
        setBadges({ alertas: criticos, crm: 0, tarefas: atrasadas })
      } catch {}
    }
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
        <img src="/logo-transparent.png" alt="Somnium Properties" className="mx-auto py-5 px-4" style={{ maxWidth: '85%', height: 'auto' }} />
      </div>

      {/* Separador dourado */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, #C9A84C55, transparent)' }} />

      {/* Nav label */}
      <p className="px-5 mt-5 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#333' }}>Navegação</p>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1">
        {visibleNav.map(({ to, label, Icon, end, badgeKey }) => (
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
                {badgeKey && badges[badgeKey] > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {badges[badgeKey] > 9 ? '9+' : badges[badgeKey]}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Profile + Footer */}
      <div className="px-4 py-4 flex flex-col gap-3" style={{ borderTop: '1px solid #1a1a1a' }}>
        {profile && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ backgroundColor: profile.cor }}>
              {profile.iniciais}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{profile.nome}</p>
              <p className="text-[10px]" style={{ color: '#444' }}>Online</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {profile?.role && (
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded"
              style={{ color: '#C9A84C', backgroundColor: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)' }}>
              {profile.role}
            </span>
          )}
          <button onClick={signOut}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded transition-colors hover:bg-white/5"
            style={{ color: '#555' }} title="Sair">
            <LogOut className="w-3 h-3" /> Sair
          </button>
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
