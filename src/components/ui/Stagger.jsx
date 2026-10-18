import { Children, cloneElement, isValidElement } from 'react'
import { motion } from 'framer-motion'
import { staggerItemVariants } from '../../lib/motion.js'

/**
 * Stagger — entrada em cascata para listas curtas e grelhas de KPIs.
 * Passos de 30 ms; a partir do 6.º item entram todos juntos.
 * Uso:
 *   <Stagger className="grid grid-cols-3 gap-3">
 *     {items.map(it => <Stagger.Item key={it.id}>...</Stagger.Item>)}
 *   </Stagger>
 */
export function Stagger({ children, className = '', as = 'div', ...rest }) {
  const Component = motion[as] || motion.div
  let i = 0
  const items = Children.map(children, c =>
    isValidElement(c) && c.type === StaggerItem && c.props.index == null ? cloneElement(c, { index: i++ }) : c)
  return (
    <Component initial="hidden" animate="show" className={className} {...rest}>
      {items}
    </Component>
  )
}

function StaggerItem({ children, className = '', as = 'div', index = 0, ...rest }) {
  const Component = motion[as] || motion.div
  return (
    <Component variants={staggerItemVariants} custom={index} className={className} {...rest}>
      {children}
    </Component>
  )
}

Stagger.Item = StaggerItem
