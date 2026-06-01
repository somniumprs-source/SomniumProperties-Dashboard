import { useEffect, useRef } from 'react'

/**
 * Re-corre `callback` sempre que algum apiFetch de mutacao (POST/PUT/PATCH/DELETE)
 * tem sucesso. apiFetch dispara o evento global `somnium:refresh` (debounced 500ms).
 *
 * Sem este hook, paginas com state local (useState + apiFetch) ficavam com o array
 * antigo apos um save, e o utilizador via valores stale ate fazer hard refresh.
 */
export function useRefreshOnMutation(callback) {
  const cbRef = useRef(callback)
  cbRef.current = callback
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => { try { cbRef.current?.() } catch {} }
    window.addEventListener('somnium:refresh', handler)
    return () => window.removeEventListener('somnium:refresh', handler)
  }, [])
}
