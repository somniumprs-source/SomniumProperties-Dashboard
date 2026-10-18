import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { Bell, Menu, X, LogOut, UserCheck, ChevronDown } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { apiFetch, apiFetchJson } from '../../lib/api.js'
import { prefetchRoute } from '../../lib/prefetch.js'
import { tabIndicatorTransition, dialogVariants, overlayVariants } from '../../lib/motion.js'
import { VoiceButton } from '../ui/VoiceButton.jsx'
import { navVisivel } from './navConfig.js'

// Barra lateral sempre escura (identidade Somnium), nos dois temas.
// Dourado só no item ativo.
// Painéis do rodapé: abrem à direita da barra (em mobile, por cima da gaveta).
const PAINEL = 'fixed z-50 bottom-16 left-3 md:left-[236px] w-[min(18rem,calc(100vw-1.5rem))] bg-surface-raised text-ink rounded-xl shadow-lg border border-line'
const FOOTER_BTN = 'inline-flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors duration-fast ease-entry'

export function Sidebar() {
  const { profile, signOut, role, areas } = useAuth()
  const [badges, setBadges] = useState({ alertas: 0, crm: 0, tarefas: 0 })
  const [open, setOpen] = useState(false)
  const secoes = navVisivel(role, areas)

  useEffect(() => {
    const load = async () => {
      // Não fazer polling se a tab está inactiva (poupa requests/CPU)
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const [alertas, tarefasCount] = await Promise.all([
          apiFetchJson('/api/alertas').catch(() => null),
          // Endpoint dedicado de contagem — evita puxar ?limit=200 só para o badge.
          apiFetchJson('/api/crm/tarefas/count-atrasadas').catch(() => null),
        ])
        const criticos = alertas?.resumo?.criticos ?? 0
        const atrasadas = Number(tarefasCount?.atrasadas) || 0
        setBadges({ alertas: criticos, crm: 0, tarefas: atrasadas })
      } catch {}
    }
    load()
    // 90s — badges informativos, não críticos.
    const interval = setInterval(load, 90000)
    // Refresh imediato quando a tab volta a estar visível.
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Esc fecha o menu em mobile
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const handleNav = () => setOpen(false)

  return (
    <>
      {/* Botão do menu em mobile */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed top-3 left-3 z-50 md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-dark border border-white/10 text-white"
        aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div key="sidebar-overlay" variants={overlayVariants} initial="initial" animate="animate" exit="exit"
            className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setOpen(false)} />
        )}
      </AnimatePresence>

      {/* Um só aside: gaveta em mobile, coluna fixa em desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 flex flex-col shrink-0 bg-brand-dark border-r border-white/5
          transition-transform duration-moderate ease-entry
          md:sticky md:top-0 md:h-screen md:z-30 md:transform-none
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="border-b border-white/5">
          <img src="/logo-transparent.png" alt="Somnium Properties" className="mx-auto py-4 px-4" style={{ maxWidth: '78%', height: 'auto' }} />
        </div>

        <LayoutGroup id="sidebar">
          <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4" aria-label="Navegação principal">
            {secoes.map(s => (
              <div key={s.label}>
                <p className="px-3 mb-1 text-overline uppercase text-neutral-500">{s.label}</p>
                <div className="flex flex-col gap-px">
                  {s.items.map(item => <NavLeaf key={item.to} item={item} badges={badges} onNav={handleNav} />)}
                </div>
              </div>
            ))}
          </nav>
        </LayoutGroup>

        {/* Perfil e ações */}
        <div className="px-3 py-3 flex flex-col gap-2.5 border-t border-white/5">
          <PerfilActivoSelector />
          <div className="flex items-center gap-2 px-1">
            {profile && (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-overline font-semibold text-white shrink-0"
                  style={{ backgroundColor: profile.cor }}>
                  {profile.iniciais}
                </div>
                <div className="min-w-0">
                  <p className="text-caption font-medium text-white truncate">{profile.nome}</p>
                  {profile.role && <p className="text-overline uppercase text-neutral-500 truncate">{profile.role}</p>}
                </div>
              </div>
            )}
            <div className="flex items-center shrink-0">
              <VoiceButton className={FOOTER_BTN} />
              <NotificationsBell />
              <button onClick={signOut} className={FOOTER_BTN} title="Sair" aria-label="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

function NavLeaf({ item, badges, onNav }) {
  const { to, label, Icon, end, badgeKey } = item
  const n = badgeKey ? badges[badgeKey] || 0 : 0
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNav}
      onMouseEnter={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      onTouchStart={() => prefetchRoute(to)}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-[7px] rounded-lg text-ui font-medium transition-colors duration-fast ease-entry ${
          isActive ? 'text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="nav-active" transition={tabIndicatorTransition}
              className="absolute inset-0 rounded-lg bg-white/[0.07] pointer-events-none">
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
            </motion.span>
          )}
          <Icon className={`relative w-4 h-4 shrink-0 ${isActive ? 'text-accent' : ''}`} aria-hidden="true" />
          <span className="relative truncate">{label}</span>
          {n > 0 && (
            <span className="relative ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-overline font-semibold num flex items-center justify-center"
              aria-label={`${n} pendentes`}>
              {n > 9 ? '9+' : n}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}


// ════════════════════════════════════════════════════════════════
// F19 — Bell icon com notificações in-app
// ════════════════════════════════════════════════════════════════
function NotificationsBell() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpenPanel] = useState(false)
  const [listLoaded, setListLoaded] = useState(false)
  const panelRef = useRef(null)

  // Boot: só carrega o contador (endpoint leve). Lista detalhada é carregada
  // ao abrir o painel — evita query pesada no boot quando bell nunca é clicado.
  async function loadCount() {
    try {
      const r = await apiFetch('/api/crm/notificacoes/count')
      if (r.ok) {
        const j = await r.json()
        setUnread(j.unread || 0)
      }
    } catch {}
  }
  async function loadList() {
    try {
      const r = await apiFetch('/api/crm/notificacoes')
      if (r.ok) {
        const j = await r.json()
        setItems(j.notificacoes || [])
        setUnread(j.unread || 0)
        setListLoaded(true)
      }
    } catch {}
  }
  useEffect(() => {
    loadCount()
    // 120s (era 60s) — notificações são polling de baixa prioridade.
    const i = setInterval(() => { if (!document.hidden) loadCount() }, 120000)
    const onVisible = () => { if (!document.hidden) loadCount() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(i)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    function onClick(e) {
      if (open && panelRef.current && !panelRef.current.contains(e.target)) setOpenPanel(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function abrir() {
    const willOpen = !open
    setOpenPanel(willOpen)
    if (willOpen) {
      // Carrega a lista detalhada só agora (lazy)
      if (!listLoaded) await loadList()
      if (unread > 0) {
        await apiFetch('/api/crm/notificacoes/marcar-lidas', { method: 'POST' })
        setUnread(0)
      }
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={abrir} className={`relative ${FOOTER_BTN} ${unread > 0 ? 'text-white' : ''}`}
        title="Notificações" aria-label={unread > 0 ? `Notificações (${unread} por ler)` : 'Notificações'} aria-expanded={open}>
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-danger text-white text-[10px] leading-none font-semibold num flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div variants={dialogVariants} initial="initial" animate="animate" exit="exit"
            className={`${PAINEL} max-h-96 overflow-y-auto`} role="dialog" aria-label="Notificações">
            <div className="px-3 py-2 border-b border-line sticky top-0 bg-surface-raised">
              <p className="text-overline uppercase text-ink-muted">Notificações</p>
            </div>
            {items.length === 0 ? (
              <p className="text-caption text-ink-muted py-6 text-center">Sem notificações</p>
            ) : (
              items.map(n => (
                <button key={n.id} onClick={() => { setOpenPanel(false); if (n.link) navigate(n.link) }}
                  className={`w-full text-left px-3 py-2.5 border-b border-line last:border-0 hover:bg-surface-muted transition-colors duration-fast ${!n.lida ? 'bg-accent/10' : ''}`}>
                  <p className="text-caption font-semibold text-ink">{n.titulo}</p>
                  {n.mensagem && <p className="text-caption text-ink-muted mt-0.5">{n.mensagem}</p>}
                  <p className="text-overline text-ink-muted num mt-1">{new Date(n.created_at).toLocaleString('pt-PT')}</p>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Selector de perfil activo — distingue quem opera quando a equipa
// partilha a sessao Supabase. ID guardado em localStorage e enviado
// no header X-User-Id em todos os apiFetch (ver src/lib/api.js e
// src/main.jsx). O backend regista o nome no historico_alteracoes.
// ════════════════════════════════════════════════════════════════
const ACTIVE_USER_KEY = 'somnium:active_user_id'

function PerfilActivoSelector() {
  const [users, setUsers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    try { setActiveId(window.localStorage.getItem(ACTIVE_USER_KEY)) } catch {}
    apiFetch('/api/users').then(r => r.ok ? r.json() : { data: [] }).then(j => {
      setUsers((j.data || []).filter(u => u.ativo))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    function onClick(e) { if (open && ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function escolher(id) {
    try {
      if (id) window.localStorage.setItem(ACTIVE_USER_KEY, id)
      else window.localStorage.removeItem(ACTIVE_USER_KEY)
    } catch {}
    setActiveId(id)
    setOpen(false)
  }

  const active = users.find(u => u.id === activeId) || null

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-caption border border-white/10 hover:bg-white/5 transition-colors duration-fast ease-entry"
        title="Quem está a operar (para o histórico de alterações)">
        <UserCheck className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
        <span className={`flex-1 text-left truncate ${active ? 'text-white' : 'text-neutral-400'}`}>
          {active ? active.nome : 'Operar como…'}
        </span>
        <ChevronDown className={`w-3 h-3 shrink-0 text-neutral-500 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div variants={dialogVariants} initial="initial" animate="animate" exit="exit"
            className={`${PAINEL} max-h-72 overflow-y-auto`} role="listbox" aria-label="Operar como">
            <button onClick={() => escolher(null)}
              className="w-full text-left px-3 py-2 text-caption text-ink-muted italic hover:bg-surface-muted border-b border-line">
              (sem perfil ativo)
            </button>
            {users.length === 0 ? (
              <p className="text-caption text-ink-muted py-3 text-center">Sem utilizadores</p>
            ) : (
              users.map(u => (
                <button key={u.id} onClick={() => escolher(u.id)} role="option" aria-selected={activeId === u.id}
                  className={`w-full text-left px-3 py-2 hover:bg-surface-muted flex items-center gap-2 border-b border-line last:border-0 ${activeId === u.id ? 'bg-accent/10' : ''}`}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: u.cor || '#6b6962' }}>{u.iniciais}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-caption text-ink truncate">{u.nome}</p>
                    <p className="text-overline text-ink-muted truncate">{u.role}</p>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
