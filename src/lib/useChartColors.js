import { useEffect, useState } from 'react'

// Cores para gráficos (Recharts) a partir dos tokens CSS. Os atributos SVG
// não resolvem var(), por isso lêem-se os valores e acompanha-se a classe
// .dark no <html> (a troca de tema acontece depois do render).
function ler() {
  if (typeof document === 'undefined') return {}
  const cs = getComputedStyle(document.documentElement)
  const rgb = (n) => {
    const v = cs.getPropertyValue(n).trim()
    return v ? `rgb(${v.split(/\s+/).join(',')})` : undefined
  }
  return {
    grid: rgb('--line'), axis: rgb('--ink-muted'), ink: rgb('--ink'), muted: rgb('--ink-muted'),
    accent: rgb('--accent'), success: rgb('--success'), danger: rgb('--danger'), warning: rgb('--warning'),
    surface: rgb('--surface-raised'),
  }
}

export function useChartColors() {
  const [cores, setCores] = useState(ler)
  useEffect(() => {
    const obs = new MutationObserver(() => setCores(ler()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return cores
}

/** Props de <Tooltip> alinhados com os tokens. */
export const tooltipProps = (C) => ({
  contentStyle: { background: C.surface, border: `1px solid ${C.grid}`, borderRadius: 8, fontSize: 12, boxShadow: 'none' },
  labelStyle: { color: C.ink, fontWeight: 600 },
  itemStyle: { color: C.ink },
  cursor: { fill: C.grid, opacity: 0.4 },
})
