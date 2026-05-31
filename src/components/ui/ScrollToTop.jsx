import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Scroll restoration por pathname.
 * - PUSH (navegação normal): scroll para o topo.
 * - POP (voltar atrás no histórico): restaura a posição guardada em sessionStorage.
 *
 * Guarda a posição actual em sessionStorage no unload e antes de cada navegação.
 */
const KEY_PREFIX = 'somnium:scroll:'

export function ScrollToTop() {
  const { pathname } = useLocation()
  const navType = useNavigationType()

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return

    const saveScroll = () => {
      try { sessionStorage.setItem(KEY_PREFIX + pathname, String(main.scrollTop)) } catch {}
    }
    const onUnload = () => saveScroll()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      saveScroll()
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [pathname])

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    if (navType === 'POP') {
      try {
        const saved = Number(sessionStorage.getItem(KEY_PREFIX + pathname) || 0)
        // Pequeno delay para o conteúdo montar antes do scroll
        requestAnimationFrame(() => { main.scrollTop = saved })
      } catch {
        main.scrollTop = 0
      }
    } else {
      main.scrollTop = 0
    }
  }, [pathname, navType])

  return null
}
