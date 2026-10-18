import { useEffect, useRef, useState } from 'react'
import './brandLoader.css'

/**
 * Carregamento Somnium ("Revelação"): palco preto com moldura dourada e o
 * logo a desenhar-se da esquerda para a direita, em ciclo de 2,8 s.
 *
 * Só aparece se a espera passar de `delay` ms (por defeito 400), para não
 * piscar nas cargas rápidas.
 *
 * Props:
 *  - label:   texto por baixo do logo (ex.: "Departamento de Obras")
 *  - variant: 'cover'  → ocupa o contentor posicionado mais próximo (página)
 *             'inline' → bloco com altura própria (abas, cartões)
 *             'screen' → ecrã inteiro (arranque da sessão)
 */
export function BrandLoader({ label = 'A carregar', variant = 'cover', delay = 400 }) {
  const [visible, setVisible] = useState(delay <= 0)
  useEffect(() => {
    if (delay <= 0) return
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  if (!visible) return null
  return (
    <div className={`brand-loader brand-loader--${variant}`} role="status" aria-label={`A carregar: ${label}`}>
      <span className="brand-loader__corner tl" /><span className="brand-loader__corner tr" />
      <span className="brand-loader__corner bl" /><span className="brand-loader__corner br" />
      <div className="brand-loader__box">
        <div className="brand-loader__mark">
          <span className="ghost" /><span className="solid" /><span className="edge" />
        </div>
        <div className="brand-loader__rule" />
        <div className="brand-loader__label">{label}<b /></div>
      </div>
    </div>
  )
}

/**
 * Mantém o estado de carregamento pelo menos `min` ms depois de o carregamento
 * aparecer, para o logo não piscar quando os dados chegam logo a seguir aos 400 ms.
 */
export function useMinLoading(loading, { delay = 400, min = 600 } = {}) {
  const [hold, setHold] = useState(false)
  const shownAt = useRef(null)
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => { shownAt.current = Date.now() }, delay)
      return () => clearTimeout(t)
    }
    if (shownAt.current == null) return
    const rest = min - (Date.now() - shownAt.current)
    shownAt.current = null
    if (rest <= 0) return
    setHold(true)
    const t = setTimeout(() => setHold(false), rest)
    return () => clearTimeout(t)
  }, [loading, delay, min])
  return loading || hold
}
