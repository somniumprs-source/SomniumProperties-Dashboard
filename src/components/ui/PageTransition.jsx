import { Suspense, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrandLoader } from './BrandLoader.jsx'
import { useLocation, Outlet } from 'react-router-dom'
import { EASE, DURATION, pageVariants as variants } from '../../lib/motion.js'

export const EASE_OUT = EASE.entry

// Secções com abas próprias por rota (ex.: /administracao/agenda) animam só o
// conteúdo da aba; a página-mãe (cabeçalho + abas) fica fixa.
const SECCOES_COM_ABAS = ['/administracao']

// Nome mostrado no carregamento, pela secção do endereço.
const NOMES = {
  '': 'Dashboard', crm: 'Departamento Comercial', projectos: 'Departamento de Obras',
  financeiro: 'Departamento Financeiro', marketing: 'Departamento de Marketing',
  administracao: 'Administração', alertas: 'Alertas', admin: 'Administração', metricas: 'Métricas',
}
export function nomeDaSeccao(pathname) {
  return NOMES[pathname.split('/')[1] || ''] || 'A carregar'
}

function chaveDaPagina(pathname) {
  const sec = SECCOES_COM_ABAS.find(p => pathname === p || pathname.startsWith(p + '/'))
  return sec || pathname
}

/**
 * Envolve o <Outlet/> com a transição entre páginas: fade curto com 6 px de
 * deslocação (260 ms a entrar, 120 ms a sair).
 */
export function PageTransition() {
  const location = useLocation()
  const key = chaveDaPagina(location.pathname)
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex-1 flex flex-col min-w-0 relative"
        >
          <Suspense fallback={<BrandLoader label={nomeDaSeccao(location.pathname)} />}>
            <Outlet />
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </>
  )
}

/**
 * Conteúdo de uma aba: entra do lado para onde se clicou.
 * `direction`: 1 (aba à direita), -1 (aba à esquerda), 0 (sem deslize).
 */
export function TabTransition({ tabKey, direction = 0, children, className = '' }) {
  return (
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, x: direction * 6 }}
      animate={{ opacity: 1, x: 0, transitionEnd: { transform: 'none' } }}
      transition={{ duration: DURATION.moderate, ease: EASE.entry }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * Direção do deslize ao trocar de aba: 1 se a nova aba está à direita da
 * anterior, -1 se está à esquerda, 0 na primeira renderização.
 */
export function useTabDirection(active, keys) {
  const prev = useRef(active)
  const dir = useRef(0)
  if (prev.current !== active) {
    const a = keys.indexOf(prev.current), b = keys.indexOf(active)
    dir.current = a < 0 || b < 0 ? 0 : (b > a ? 1 : -1)
    prev.current = active
  }
  return dir.current
}
