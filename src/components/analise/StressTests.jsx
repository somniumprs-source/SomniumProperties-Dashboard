/**
 * Stress Tests — tabelas downside/upside + veredicto executivo.
 * Captura automatica de screenshot para inclusao nos PDFs.
 */
import { useRef, useEffect, useCallback } from 'react'
import { EUR, PCT } from '../../constants.js'
import { apiFetch } from '../../lib/api.js'

export function StressTests({ analise }) {
  const raw = analise?.stress_tests
  const st = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw
  const containerRef = useRef(null)
  const capturedRef = useRef(null) // evitar capturas duplicadas

  const captureScreenshot = useCallback(async () => {
    if (!containerRef.current || !analise?.id || !st) return
    // Evitar captura duplicada para os mesmos dados
    const key = `${analise.id}_${JSON.stringify(st.base?.lucro_liquido)}`
    if (capturedRef.current === key) return
    capturedRef.current = key

    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(containerRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png', 0.95))
      const form = new FormData()
      form.append('screenshot', blob, `stress_tests_${analise.id}.png`)
      await apiFetch(`/api/crm/analises/${analise.id}/stress-screenshot`, { method: 'POST', body: form })
    } catch (e) {
      console.warn('[StressTests] Screenshot falhou:', e.message)
    }
  }, [analise?.id, st])

  useEffect(() => {
    if (!st) return
    // Aguardar render completo antes de capturar
    const timer = setTimeout(captureScreenshot, 500)
    return () => clearTimeout(timer)
  }, [captureScreenshot, st])

  if (!st) return <p className="text-sm text-ink-muted py-8 text-center">Preenche a calculadora para ver stress tests</p>

  const verdColor = st.veredicto === 'resiliente' ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10'
  const verdText = st.veredicto === 'resiliente' ? 'text-success' : 'text-danger'

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Veredicto executivo */}
      <div className={`rounded-xl border p-4 ${verdColor}`}>
        <p className={`text-sm font-semibold ${verdText}`}>
          {st.veredicto === 'resiliente' ? 'Negócio resiliente — lucro positivo em todos os cenários' : 'Atenção — prejuízo no pior cenário'}
        </p>
      </div>

      {/* 3 cards: pior / base / melhor */}
      <div className="grid grid-cols-3 gap-3">
        <Card label="Pior Cenário" lucro={st.pior.lucro_liquido} ra={st.pior.retorno_anualizado} bad />
        <Card label="Base" lucro={st.base.lucro_liquido} ra={st.base.retorno_anualizado} />
        <Card label="Melhor Cenário" lucro={st.melhor.lucro_liquido} ra={st.melhor.retorno_anualizado} good />
      </div>

      {/* Tabela Downside */}
      <div>
        <p className="text-xs font-semibold text-danger uppercase tracking-wide mb-2">Cenários de Risco</p>
        <Table rows={st.downside} baseLucro={st.base.lucro_liquido} />
      </div>

      {/* Tabela Upside */}
      <div>
        <p className="text-xs font-semibold text-success uppercase tracking-wide mb-2">Cenários Favoráveis</p>
        <Table rows={st.upside} baseLucro={st.base.lucro_liquido} good />
      </div>
    </div>
  )
}

function Card({ label, lucro, ra, bad, good }) {
  const border = bad ? 'border-danger/30' : good ? 'border-success/30' : 'border-line'
  const bg = bad ? 'bg-danger/10' : good ? 'bg-success/10' : 'bg-surface'
  const color = lucro >= 0 ? 'text-success' : 'text-danger'

  return (
    <div className={`rounded-xl border ${border} ${bg} p-3 text-center`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-lg font-bold num ${color}`}>{EUR(lucro)}</p>
      <p className="text-xs text-ink-muted">RA: {PCT(ra)}</p>
    </div>
  )
}

function Table({ rows, baseLucro, good }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b">
            <th className="text-left py-1.5 pr-4">Cenário</th>
            <th className="text-left py-1.5 pr-4">Descrição</th>
            <th className="text-right py-1.5 pr-4">Lucro Líquido</th>
            <th className="text-right py-1.5 pr-4">Delta</th>
            <th className="text-right py-1.5 pr-4">RT</th>
            <th className="text-right py-1.5">RA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line hover:bg-surface">
              <td className="py-1.5 pr-4 font-medium text-ink">{r.label}</td>
              <td className="py-1.5 pr-4 text-ink-muted">{r.descricao}</td>
              <td className={`py-1.5 pr-4 text-right num ${r.lucro_liquido >= 0 ? 'text-ink' : 'text-danger'}`}>
                {EUR(r.lucro_liquido)}
              </td>
              <td className={`py-1.5 pr-4 text-right num ${r.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                {r.delta >= 0 ? '+' : ''}{EUR(r.delta)}
              </td>
              <td className="py-1.5 pr-4 text-right num text-ink-muted">{PCT(r.retorno_total)}</td>
              <td className="py-1.5 text-right num text-ink-muted">{PCT(r.retorno_anualizado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
