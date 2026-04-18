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

  if (!st) return <p className="text-sm text-gray-400 py-8 text-center">Preenche a calculadora para ver stress tests</p>

  const verdColor = st.veredicto === 'resiliente' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
  const verdText = st.veredicto === 'resiliente' ? 'text-green-700' : 'text-red-700'

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
        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Cenários de Risco</p>
        <Table rows={st.downside} baseLucro={st.base.lucro_liquido} />
      </div>

      {/* Tabela Upside */}
      <div>
        <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Cenários Favoráveis</p>
        <Table rows={st.upside} baseLucro={st.base.lucro_liquido} good />
      </div>
    </div>
  )
}

function Card({ label, lucro, ra, bad, good }) {
  const border = bad ? 'border-red-200' : good ? 'border-green-200' : 'border-gray-200'
  const bg = bad ? 'bg-red-50' : good ? 'bg-green-50' : 'bg-gray-50'
  const color = lucro >= 0 ? 'text-green-700' : 'text-red-700'

  return (
    <div className={`rounded-xl border ${border} ${bg} p-3 text-center`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>{EUR(lucro)}</p>
      <p className="text-xs text-gray-400">RA: {PCT(ra)}</p>
    </div>
  )
}

function Table({ rows, baseLucro, good }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b">
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
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-1.5 pr-4 font-medium text-gray-700">{r.label}</td>
              <td className="py-1.5 pr-4 text-gray-400">{r.descricao}</td>
              <td className={`py-1.5 pr-4 text-right font-mono ${r.lucro_liquido >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                {EUR(r.lucro_liquido)}
              </td>
              <td className={`py-1.5 pr-4 text-right font-mono ${r.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {r.delta >= 0 ? '+' : ''}{EUR(r.delta)}
              </td>
              <td className="py-1.5 pr-4 text-right font-mono text-gray-600">{PCT(r.retorno_total)}</td>
              <td className="py-1.5 text-right font-mono text-gray-600">{PCT(r.retorno_anualizado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
