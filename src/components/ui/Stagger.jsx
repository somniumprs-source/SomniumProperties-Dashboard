import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 1 },
  show:   { opacity: 1, transition: { staggerChildren: 0.045, delayChildren: 0.14 } },
}

const item = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

/**
 * Stagger — wrapper para listas/grids que faz fade-in dos filhos em cascata.
 * Uso:
 *   <Stagger className="grid grid-cols-3 gap-3">
 *     {items.map(it => <Stagger.Item key={it.id}>...</Stagger.Item>)}
 *   </Stagger>
 */
export function Stagger({ children, className = '', as = 'div', ...rest }) {
  const Component = motion[as] || motion.div
  return (
    <Component variants={container} initial="hidden" animate="show" className={className} {...rest}>
      {children}
    </Component>
  )
}

Stagger.Item = function StaggerItem({ children, className = '', as = 'div', ...rest }) {
  const Component = motion[as] || motion.div
  return (
    <Component variants={item} className={className} {...rest}>
      {children}
    </Component>
  )
}
