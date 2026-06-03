import { useState, useEffect } from 'react'

/**
 * Reage a uma media query CSS. Devolve boolean.
 *   const isMobile = useMediaQuery('(max-width: 767px)')
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Atalho: true abaixo de 768px (breakpoint md do Tailwind). */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)')
}
