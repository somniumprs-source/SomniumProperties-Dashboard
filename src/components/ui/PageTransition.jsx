import { Suspense, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrandLoader } from './BrandLoader.jsx'
import { useLocation, Outlet } from 'react-router-dom'

export const EASE_OUT = [0.22, 1, 0.36, 1]

// Entrada: sobe 14 px e ganha nitidez. Saída curta para não fazer esperar.
const variants = {
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  // No fim limpa filter/transform: senão os modais `fixed` dentro da página
  // ficariam presos a este contentor em vez do ecrã.
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.52, ease: EASE_OUT }, transitionEnd: { filter: 'none', transform: 'none' } },
  exit:    { opacity: 0, y: -4, filter: 'blur(2px)', transition: { duration: 0.14, ease: 'easeIn' } },
}

// Secções com abas próprias por rota (ex.: /administracao/agenda) animam só o
// conteúdo da aba; a página-mãe (cabeçalho + abas) fica fixa.
const SECCOES_COM_ABAS = ['/administracao']

// Nome mostrado no carregamento, pela secção do endereço.
const NOMES = {
  '': 'Dashboard', crm: 'Departamento Comercial', projectos: 'Departamento de Obras',
  financeiro: 'Departamento Financeiro', marketing: 'Marketing e Marca Pessoal',
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
 * Envolve o <Outlet/> com a transição entre páginas e a linha dourada de
 * progresso que percorre o topo a cada mudança.
 */
export function PageTransition() {
  const location = useLocation()
  const key = chaveDaPagina(location.pathname)
  return (
    <>
      <div className="sticky top-0 z-40 h-0 pointer-events-none" aria-hidden="true">
        <motion.div
          key={key}
          className="absolute top-0 left-0 right-0 h-0.5 origin-left"
          style={{
            background: 'linear-gradient(90deg, rgba(201,168,76,0) 0%, #C9A84C 40%, #f1dc9b 100%)',
            boxShadow: '0 0 12px rgba(201,168,76,0.55)',
          }}
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 1, opacity: [1, 1, 0] }}
          transition={{ scaleX: { duration: 0.42, ease: EASE_OUT }, opacity: { duration: 0.6, times: [0, 0.7, 1] } }}
        />
      </div>
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
      initial={{ opacity: 0, x: direction * 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: EASE_OUT }}
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
