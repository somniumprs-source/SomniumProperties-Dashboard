import { RefreshCw, Moon, Sun, ArrowLeft, ChevronRight } from 'lucide-react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext.jsx'

export function Header({ title, subtitle, onRefresh, loading, breadcrumbs }) {
  const now = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  // So mostrar seta de Voltar se estamos numa rota aninhada (path com mais de 1 segmento).
  // Em paginas top-level (/crm, /dashboard, /financeiro), a seta nao tem destino util.
  const pathSegments = location.pathname.split('/').filter(Boolean)
  const canGoBack = pathSegments.length > 1
  const trail = breadcrumbs?.filter(Boolean) ?? []

  return (
    <header className="flex items-center justify-between gap-2 pl-14 pr-4 sm:px-7 py-3 sm:py-4 bg-white dark:bg-neutral-900 sticky top-0 z-20 border-b border-neutral-200 dark:border-neutral-700"
      style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
      <div className="min-w-0 flex-1 flex items-center gap-2 sm:gap-3">
        {canGoBack && (
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl transition-all hover:opacity-80 active:scale-95 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 shrink-0"
            title="Voltar (Alt+←)"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {trail.length > 0 ? (
            <>
              <nav className="flex items-center gap-1 text-xs text-neutral-400 truncate" aria-label="Breadcrumb">
                {trail.map((b, i) => {
                  const isLast = i === trail.length - 1
                  const content = isLast ? (
                    <span className="font-semibold text-black dark:text-white truncate" aria-current="page">{b.label}</span>
                  ) : b.to ? (
                    <Link to={b.to} className="hover:text-black dark:hover:text-white transition-colors truncate">{b.label}</Link>
                  ) : b.onClick ? (
                    <button onClick={b.onClick} className="hover:text-black dark:hover:text-white transition-colors truncate">{b.label}</button>
                  ) : (
                    <span className="truncate">{b.label}</span>
                  )
                  return (
                    <span key={i} className="flex items-center gap-1 min-w-0">
                      {content}
                      {!isLast && <ChevronRight className="w-3 h-3 shrink-0 text-neutral-300" />}
                    </span>
                  )
                })}
              </nav>
              <p className="text-xs mt-0.5 capitalize truncate text-neutral-400">{subtitle ?? now}</p>
            </>
          ) : (
            <>
              <h1 className="text-lg sm:text-xl font-bold text-black dark:text-white tracking-tight truncate">{title}</h1>
              <p className="text-xs mt-0.5 capitalize truncate text-neutral-400">{subtitle ?? now}</p>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="hidden sm:block text-xs capitalize text-neutral-400">{now}</span>
        <button
          onClick={toggle}
          className="p-2 rounded-xl transition-all hover:opacity-80 active:scale-95 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
          title={isDark ? 'Tema claro' : 'Tema escuro'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all disabled:opacity-40 active:scale-95"
            style={{ backgroundColor: '#0d0d0d', color: '#C9A84C', border: '1px solid #2a2a2a' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        )}
      </div>
    </header>
  )
}
