/**
 * Sistema de movimento — fonte única de durações, curvas e variantes.
 *
 * Regras:
 *  - Entrada com EASE.entry, saída com EASE.exit (mais curta).
 *  - Translações pequenas (≤ 6 px), sem blur nem brilho.
 *  - Cascata só em listas curtas e grelhas de KPIs (30 ms, máx. 6 itens).
 *  - prefers-reduced-motion: o <MotionConfig reducedMotion="user"> (App.jsx)
 *    e a regra global em index.css anulam deslocações e durações.
 */

/** Durações em segundos (framer-motion). Em CSS: duration-fast/base/moderate/slow. */
export const DURATION = { fast: 0.12, base: 0.18, moderate: 0.26, slow: 0.38 }

export const EASE = {
  entry: [0.22, 1, 0.36, 1],
  exit: [0.4, 0, 0.2, 1],
}

export const STAGGER_STEP = 0.03
export const STAGGER_MAX = 6

/** Atraso de cascata limitado: do 7.º item em diante entra junto com o 6.º. */
export const staggerDelay = (i = 0) => Math.min(Math.max(i, 0), STAGGER_MAX - 1) * STAGGER_STEP

export const pageVariants = {
  initial: { opacity: 0, y: 6 },
  // transitionEnd limpa o transform: senão os elementos `fixed` dentro da
  // página ficariam presos a este contentor em vez do ecrã.
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.moderate, ease: EASE.entry }, transitionEnd: { transform: 'none' } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.exit } },
}

export const tabIndicatorTransition = { type: 'tween', duration: 0.22, ease: EASE.entry }

export const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.entry } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.exit } },
}

export const dialogVariants = {
  initial: { opacity: 0, y: 6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.moderate, ease: EASE.entry } },
  exit: { opacity: 0, y: 4, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE.exit } },
}

/** Gaveta lateral à direita. */
export const drawerVariants = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { duration: DURATION.slow, ease: EASE.entry } },
  exit: { x: '100%', transition: { duration: DURATION.base, ease: EASE.exit } },
}

export const toastVariants = {
  initial: { opacity: 0, y: 6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE.entry } },
  exit: { opacity: 0, x: 12, transition: { duration: DURATION.fast, ease: EASE.exit } },
}

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: DURATION.moderate, ease: EASE.entry, delay: staggerDelay(i) } }),
}
