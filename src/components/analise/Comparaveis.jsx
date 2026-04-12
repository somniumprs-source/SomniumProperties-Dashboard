/**
 * Comparáveis de mercado — 1-3 tipologias × 5 comparáveis.
 */
import { useState, useEffect } from 'react'
import { EUR } from '../../constants.js'

const EMPTY_COMP = { preco: 0, area: 0, ajustes: { neg: 0, area: 0, loc: 0, idade: 0, conserv: 0, outros: 0 }, notas: '', link: '' }
const EMPTY_TIP = { tipologia: 'T2', area: 0, renda: 0, yield: 0, comparaveis: [EMPTY_COMP, EMPTY_COMP, EMPTY_COMP, EMPTY_COMP, EMPTY_COMP] }

export function Comparaveis({ analise, onUpdate }) {
  const [tipologias, setTipologias] = useState([])
  const [tipCount, setTipCount] = useState(1)

  useEffect(() => {
    const raw = analise?.comparaveis
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])
    if (parsed.length > 0) {
      setTipologias(parsed)
      setTipCount(parsed.length)
    } else {
      setTipologias([{ ...EMPTY_TIP }])
      setTipCount(1)
    }
  }, [analise?.id])

  const save = (updated) => {
    setTipologias(updated)
    onUpdate({ comparaveis: JSON.stringify(updated) })
  }

  const changeTipCount = (n) => {
    const next = [...tipologias]
    while (next.length < n) next.push({ ...EMPTY_TIP, tipologia: `T${next.length + 1}`, comparaveis: Array(5).fill(null).map(() => ({ ...EMPTY_COMP, ajustes: { ...EMPTY_COMP.ajustes } })) })
    setTipCount(n)
    setTipologias(next.slice(0, n))
  }

  const updateTip = (tIdx, field, value) => {
    const next = tipologias.map((t, i) => i === tIdx ? { ...t, [field]: value } : t)
    save(next)
  }

  const updateComp = (tIdx, cIdx, field, value) => {
    const next = tipologias.map((t, i) => {
      if (i !== tIdx) return t
      const comps = t.comparaveis.map((c, j) => {
        if (j !== cIdx) return c
        if (field.startsWith('ajuste_')) {
          return { ...c, ajustes: { ...c.ajustes, [field.replace('ajuste_', '')]: value } }
        }
        return { ...c, [field]: value }
      })
      return { ...t, comparaveis: comps }
    })
    save(next)
  }

  // Calcular médias
  const calcTip = (tip) => {
    const valid = tip.comparaveis.filter(c => c.preco > 0 && c.area > 0)
    if (valid.length === 0) return { media: 0, mediaAjust: 0 }
    const precos = valid.map(c => {
      const euro_m2 = c.preco / c.area
      const ajusteTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      return { euro_m2, ajustado: euro_m2 * (1 + ajusteTotal / 100) }
    })
    return {
      media: Math.round(precos.reduce((s, p) => s + p.euro_m2, 0) / precos.length),
      mediaAjust: Math.round(precos.reduce((s, p) => s + p.ajustado, 0) / precos.length),
    }
  }

  return (
    <div className="space-y-6">
      {/* Selector de tipologias */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Tipologias:</span>
        {[1, 2, 3].map(n => (
          <button key={n} onClick={() => changeTipCount(n)}
            className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
              tipCount >= n ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}>
            {n}
          </button>
        ))}
      </div>

      {/* Barra de resumo */}
      <div className="flex gap-3">
        {tipologias.slice(0, tipCount).map((t, i) => {
          const { mediaAjust } = calcTip(t)
          const vvr = mediaAjust > 0 && t.area > 0 ? mediaAjust * t.area : 0
          return (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 flex-1 text-center">
              <p className="text-xs text-gray-400">{t.tipologia}</p>
              <p className="text-sm font-mono font-semibold">{vvr > 0 ? EUR(vvr) : '—'}</p>
              <p className="text-xs text-gray-400">{mediaAjust > 0 ? `${mediaAjust} €/m²` : '—'}</p>
            </div>
          )
        })}
      </div>

      {/* Tipologias */}
      {tipologias.slice(0, tipCount).map((tip, tIdx) => {
        const { media, mediaAjust } = calcTip(tip)
        return (
          <div key={tIdx} className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 flex items-center gap-3">
              <input value={tip.tipologia} onChange={e => updateTip(tIdx, 'tipologia', e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none w-20" />
              <div className="flex gap-3 text-xs text-gray-400">
                <label>Área: <input type="number" value={tip.area || ''} onChange={e => updateTip(tIdx, 'area', parseFloat(e.target.value) || 0)}
                  className="w-16 bg-white border rounded px-1 py-0.5 font-mono" /> m²</label>
                <span>Média: {media} €/m²</span>
                <span>Ajustada: {mediaAjust} €/m²</span>
                {mediaAjust > 0 && tip.area > 0 && (
                  <span className="font-semibold text-gray-700">VVR: {EUR(mediaAjust * tip.area)}</span>
                )}
              </div>
            </div>

            <div className="px-4 py-3 space-y-3">
              {tip.comparaveis.map((comp, cIdx) => (
                <div key={cIdx} className="grid grid-cols-12 gap-2 items-center text-xs border-b border-gray-50 pb-2">
                  <span className="col-span-1 text-gray-300 font-semibold">{cIdx + 1}</span>
                  <div className="col-span-2">
                    <label className="text-gray-400">Preço</label>
                    <input type="number" value={comp.preco || ''} onChange={e => updateComp(tIdx, cIdx, 'preco', parseFloat(e.target.value) || 0)}
                      className="w-full border rounded px-2 py-1 font-mono" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-gray-400">Área</label>
                    <input type="number" value={comp.area || ''} onChange={e => updateComp(tIdx, cIdx, 'area', parseFloat(e.target.value) || 0)}
                      className="w-full border rounded px-2 py-1 font-mono" />
                  </div>
                  <div className="col-span-6 grid grid-cols-6 gap-1">
                    {['neg', 'area', 'loc', 'idade', 'conserv', 'outros'].map(aj => (
                      <div key={aj}>
                        <label className="text-gray-300 capitalize">{aj}</label>
                        <input type="number" step="1" value={comp.ajustes?.[aj] || ''}
                          onChange={e => updateComp(tIdx, cIdx, `ajuste_${aj}`, parseFloat(e.target.value) || 0)}
                          className="w-full border rounded px-1 py-1 font-mono text-center" />
                      </div>
                    ))}
                  </div>
                  <div className="col-span-2">
                    <label className="text-gray-400">€/m²</label>
                    <p className="font-mono text-gray-600">
                      {comp.preco > 0 && comp.area > 0 ? Math.round(comp.preco / comp.area) : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
