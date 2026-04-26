import { RefreshCw, Moon, Sun, ArrowLeft, ChevronRight } from 'lucide-react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext.jsx'

function NotionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
    </svg>
  )
}

export function Header({ title, subtitle, onRefresh, loading, notionUrl, breadcrumbs }) {
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
    <header className="flex items-center justify-between px-4 sm:px-7 py-3 sm:py-4 bg-white dark:bg-neutral-900 sticky top-0 z-20 ml-10 md:ml-0 border-b border-neutral-200 dark:border-neutral-700"
      style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
      <div className="min-w-0 flex-1 flex items-center gap-3">
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
        {notionUrl && (
          <a href={notionUrl} target="_blank" rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:opacity-80 active:scale-95 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
            <NotionIcon />
            <span className="hidden md:inline">Notion</span>
          </a>
        )}
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
