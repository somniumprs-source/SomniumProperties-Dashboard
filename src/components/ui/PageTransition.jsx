import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, Outlet } from 'react-router-dom'

const variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
}

const transition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] }

/**
 * Envolve o <Outlet/> com transição fade + slide entre rotas.
 * Usa pathname como key para AnimatePresence detectar troca de página.
 */
export function PageTransition() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        className="flex-1 flex flex-col min-w-0"
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
}
