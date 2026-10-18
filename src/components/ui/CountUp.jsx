import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

// Encontra o primeiro número num valor já formatado ("186 400 €", "18%", "1.234,5").
const NUM = /-?\d{1,3}(?:[ .\u00a0\u202f]\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/

function analisar(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const dec = Number.isInteger(valor) ? 0 : String(valor).split('.')[1]?.length ?? 0
    return { alvo: valor, formatar: n => n.toFixed(dec) }
  }
  if (typeof valor !== 'string') return null
  const m = valor.match(NUM)
  if (!m) return null
  const token = m[0]
  const grupo = (token.match(/[ .\u00a0\u202f]/) || [null])[0]
  const [int, dec] = token.replace(/[ .\u00a0\u202f]/g, '').split(',')
  const casas = dec?.length ?? 0
  const alvo = parseFloat(`${int}.${dec ?? 0}`)
  const antes = valor.slice(0, m.index), depois = valor.slice(m.index + token.length)
  const formatar = n => {
    const [i, d] = Math.abs(n).toFixed(casas).split('.')
    const inteiro = grupo ? i.replace(/\B(?=(\d{3})+(?!\d))/g, grupo) : i
    return `${antes}${n < 0 ? '-' : ''}${inteiro}${d ? ',' + d : ''}${depois}`
  }
  return { alvo, formatar }
}

/**
 * Mostra um valor de KPI a contar até ao número final (800 ms) quando aparece
 * ou muda. Valores sem número (ex.: "—") aparecem tal como estão.
 */
export function CountUp({ value }) {
  const reduzir = useReducedMotion()
  const info = analisar(value)
  const [texto, setTexto] = useState(() => (info && !reduzir ? info.formatar(0) : value))
  const anterior = useRef(0)
  const alvo = info?.alvo

  useEffect(() => {
    if (!info || reduzir) { setTexto(value); return }
    const ctrl = animate(anterior.current, info.alvo, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: v => setTexto(info.formatar(v)),
      onComplete: () => setTexto(value),
    })
    anterior.current = info.alvo
    return () => ctrl.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo, value, reduzir])

  if (!info) return value
  return texto
}
