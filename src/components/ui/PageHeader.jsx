/**
 * PageHeader — cabeçalho único de todas as páginas.
 *
 *   <PageHeader title="Financeiro" subtitle="…" onRefresh={load} loading={loading}
 *     regiao={<RegiaoToggle … />} actions={<Button icon={Plus}>Novo</Button>} />
 *
 * - Título em IBM Plex Sans (font-display); subtítulo opcional (sem subtítulo mostra a data, uma só vez).
 * - `regiao`: seletor de região à esquerda das ações.
 * - `actions`: ações da página (a principal em Button primary).
 * - "Atualizar" é secundário, para não competir com a ação principal.
 * - `breadcrumbs`: [{ label, to? | onClick? }]; o último é o título.
 * - `backTo`: destino fixo da seta de voltar (sem ele, volta no histórico).
 */
import { RefreshCw, Moon, Sun, ArrowLeft, ChevronRight } from 'lucide-react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext.jsx'

const ICON_BTN = 'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-surface-raised text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast ease-entry disabled:opacity-50'

function hoje() {
  return new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function PageHeader({ title, subtitle, onRefresh, loading, breadcrumbs, regiao, actions, backTo }) {
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  // Seta de voltar só em rotas aninhadas; nas de topo não tem destino útil.
  const canGoBack = location.pathname.split('/').filter(Boolean).length > 1
  const trail = breadcrumbs?.filter(Boolean) ?? []
  const anteriores = trail.slice(0, -1)
  const titulo = trail.length ? trail[trail.length - 1].label : title

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 pl-14 pr-4 sm:px-7 py-3 sm:py-4 bg-surface-raised border-b border-line">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {canGoBack && (
          <button onClick={() => (backTo ? navigate(backTo) : navigate(-1))} className={`${ICON_BTN} shrink-0`} title="Voltar (Alt+←)" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {anteriores.length > 0 && (
            <nav className="flex items-center gap-1 text-caption text-ink-muted min-w-0" aria-label="Caminho">
              {anteriores.map((b, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  {b.to ? <Link to={b.to} className="truncate hover:text-ink transition-colors duration-fast">{b.label}</Link>
                    : b.onClick ? <button onClick={b.onClick} className="truncate hover:text-ink transition-colors duration-fast">{b.label}</button>
                    : <span className="truncate">{b.label}</span>}
                  <ChevronRight className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
                </span>
              ))}
            </nav>
          )}
          <h1 className="font-display text-xl sm:text-title font-medium tracking-tight text-ink truncate" aria-current={trail.length ? 'page' : undefined}>
            {titulo}
          </h1>
          {anteriores.length === 0 && (
            <p className="text-caption text-ink-muted truncate">{subtitle ?? hoje()}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {regiao && <div className="hidden md:block">{regiao}</div>}
        {actions}
        {onRefresh && (
          <button onClick={onRefresh} disabled={loading} title="Atualizar" aria-label="Atualizar"
            className={`${ICON_BTN} sm:w-auto sm:px-3 gap-2 text-ui font-medium`}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        )}
        <button onClick={toggle} className={ICON_BTN} title={isDark ? 'Tema claro' : 'Tema escuro'} aria-label={isDark ? 'Tema claro' : 'Tema escuro'}>
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
      {regiao && <div className="md:hidden w-full overflow-x-auto">{regiao}</div>}
    </header>
  )
}
