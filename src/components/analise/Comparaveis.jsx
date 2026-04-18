/**
 * Comparáveis de mercado — 1-3 tipologias × 5 comparáveis.
 * Ajustes automáticos: Negociação (-5%) e Área (proporcional à diferença de m²).
 * Ajustes manuais: Localização, Idade, Conservação, Outros.
 */
import { useState, useEffect } from 'react'
import { EUR } from '../../constants.js'

const EMPTY_COMP = { preco: 0, area: 0, ajustes: { neg: -5, area: 0, loc: 0, idade: 0, conserv: 0, outros: 0 }, notas: '', link: '' }
const EMPTY_TIP = { tipologia: 'T2', area: 0, renda: 0, yield: 0, comparaveis: [EMPTY_COMP, EMPTY_COMP, EMPTY_COMP, EMPTY_COMP, EMPTY_COMP] }

// Calcula ajuste de área automático: diferença % entre área do imóvel e área do comparável
// Se imóvel tem 75m² e comparável tem 93.8m², ajuste = (75 - 93.8) / 93.8 * 100 ≈ -20%
// Multiplicado por factor 0.25 (cada 1% de diferença de área = 0.25% de ajuste no preço)
const AREA_FACTOR = 0.25
function calcAjusteArea(areaImovel, areaComp) {
  if (!areaImovel || !areaComp || areaComp === 0) return 0
  return Math.round((areaImovel - areaComp) / areaComp * 100 * AREA_FACTOR * 100) / 100
}

export function Comparaveis({ analise, onUpdate }) {
  const [tipologias, setTipologias] = useState([])
  const [tipCount, setTipCount] = useState(1)
  const [autoAjustes, setAutoAjustes] = useState(true)

  useEffect(() => {
    const raw = analise?.comparaveis
    let parsed = []
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])
      if (!Array.isArray(parsed)) parsed = []
      parsed = parsed.filter(t => t && Array.isArray(t.comparaveis))
    } catch {
      parsed = []
    }
    if (parsed.length > 0) {
      setTipologias(parsed)
      setTipCount(parsed.length)
    } else {
      setTipologias([])
      setTipCount(0)
    }
  }, [analise?.id])

  const save = (updated) => {
    setTipologias(updated)
    onUpdate({ comparaveis: JSON.stringify(updated) })
  }

  const addTipologia = () => {
    const next = [...tipologias, { ...EMPTY_TIP, tipologia: `T${tipologias.length + 1}`, comparaveis: Array(5).fill(null).map(() => ({ ...EMPTY_COMP, ajustes: { ...EMPTY_COMP.ajustes } })) }]
    setTipologias(next)
    setTipCount(next.length)
    save(next)
  }

  const removeTipologia = (idx) => {
    const next = tipologias.filter((_, i) => i !== idx)
    setTipologias(next)
    setTipCount(next.length)
    save(next)
  }

  const updateTip = (tIdx, field, value) => {
    const next = tipologias.map((t, i) => {
      if (i !== tIdx) return t
      const updated = { ...t, [field]: value }
      // Recalcular ajustes de área automáticos quando área do imóvel muda
      if (field === 'area' && autoAjustes) {
        updated.comparaveis = updated.comparaveis.map(c => {
          if (!c.area || c.area === 0) return c
          return { ...c, ajustes: { ...c.ajustes, area: calcAjusteArea(value, c.area) } }
        })
      }
      return updated
    })
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
        const updated = { ...c, [field]: value }
        // Recalcular ajuste de área quando área do comparável muda
        if (field === 'area' && autoAjustes && t.area > 0) {
          updated.ajustes = { ...updated.ajustes, area: calcAjusteArea(t.area, value) }
        }
        // Negociação automática: -5% quando preço é preenchido
        if (field === 'preco' && autoAjustes && value > 0 && (!c.ajustes?.neg || c.ajustes.neg === 0)) {
          updated.ajustes = { ...(updated.ajustes || EMPTY_COMP.ajustes), neg: -5 }
        }
        return updated
      })
      return { ...t, comparaveis: comps }
    })
    save(next)
  }

  // Recalcular todos os ajustes automáticos
  const recalcAll = () => {
    const next = tipologias.map(t => ({
      ...t,
      comparaveis: t.comparaveis.map(c => {
        if (!c.preco || c.preco === 0) return c
        return {
          ...c,
          ajustes: {
            ...c.ajustes,
            neg: -5,
            area: t.area > 0 && c.area > 0 ? calcAjusteArea(t.area, c.area) : c.ajustes?.area || 0,
          }
        }
      })
    }))
    save(next)
  }

  // Calcular médias
  const calcTip = (tip) => {
    const valid = tip.comparaveis.filter(c => c.preco > 0 && c.area > 0)
    if (valid.length === 0) return { media: 0, mediaAjust: 0, count: 0 }
    const precos = valid.map(c => {
      const euro_m2 = c.preco / c.area
      const ajusteTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      return { euro_m2, ajustado: euro_m2 * (1 + ajusteTotal / 100) }
    })
    return {
      media: Math.round(precos.reduce((s, p) => s + p.euro_m2, 0) / precos.length),
      mediaAjust: Math.round(precos.reduce((s, p) => s + p.ajustado, 0) / precos.length),
      count: valid.length,
    }
  }

  // Labels descritivos para ajustes
  const AJUSTE_LABELS = {
    neg: 'Neg.', area: 'Área', loc: 'Loc.', idade: 'Idade', conserv: 'Conserv.', outros: 'Outros'
  }
  const AUTO_FIELDS = new Set(['neg', 'area'])

  return (
    <div className="space-y-6">
      {/* Barra de acções */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tipCount < 3 && (
            <button onClick={addTipologia}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors">
              + Tipologia
            </button>
          )}
          <span className="text-xs text-gray-400">{tipCount} de 3</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={autoAjustes} onChange={e => setAutoAjustes(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600" />
            <span className="text-xs text-gray-500">Ajustes automáticos</span>
          </label>
          {autoAjustes && (
            <button onClick={recalcAll}
              className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
              Recalcular
            </button>
          )}
        </div>
      </div>

      {/* Barra de resumo */}
      <div className="flex gap-3">
        {tipologias.slice(0, tipCount).map((t, i) => {
          const { mediaAjust, count } = calcTip(t)
          const vvr = mediaAjust > 0 && t.area > 0 ? mediaAjust * t.area : 0
          return (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 flex-1 text-center">
              <p className="text-xs text-gray-400">{t.tipologia} ({count} comp.)</p>
              <p className="text-sm font-mono font-semibold">{vvr > 0 ? EUR(vvr) : '—'}</p>
              <p className="text-xs text-gray-400">{mediaAjust > 0 ? `${mediaAjust} €/m²` : '—'}</p>
            </div>
          )
        })}
        {/* VVR Total */}
        {tipCount > 1 && (() => {
          const totalVVR = tipologias.slice(0, tipCount).reduce((s, t) => {
            const { mediaAjust } = calcTip(t)
            return s + (mediaAjust > 0 && t.area > 0 ? mediaAjust * t.area : 0)
          }, 0)
          return totalVVR > 0 ? (
            <div className="bg-gray-900 rounded-lg px-3 py-2 text-center" style={{ minWidth: 100 }}>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-sm font-mono font-semibold text-white">{EUR(totalVVR)}</p>
            </div>
          ) : null
        })()}
      </div>

      {/* Tipologias */}
      {tipologias.slice(0, tipCount).map((tip, tIdx) => {
        const { media, mediaAjust } = calcTip(tip)
        return (
          <div key={tIdx} className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 flex items-center gap-3 flex-wrap">
              <input value={tip.tipologia} onChange={e => updateTip(tIdx, 'tipologia', e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none w-20" />
              <button onClick={() => { if (confirm(`Remover tipologia "${tip.tipologia}"?`)) removeTipologia(tIdx) }}
                className="text-xs text-red-400 hover:text-red-600 transition-colors">✕</button>
              <div className="flex gap-3 text-xs text-gray-400 items-center flex-wrap">
                <label>Área imóvel: <input type="number" value={tip.area || ''} onChange={e => updateTip(tIdx, 'area', parseFloat(e.target.value) || 0)}
                  className="w-16 bg-white border rounded px-1 py-0.5 font-mono" /> m²</label>
                <span className="hidden sm:inline">|</span>
                <span>Média: <strong className="text-gray-600">{media} €/m²</strong></span>
                <span>Ajustada: <strong className="text-gray-600">{mediaAjust} €/m²</strong></span>
                {mediaAjust > 0 && tip.area > 0 && (
                  <span className="font-semibold text-gray-700">VVR: {EUR(mediaAjust * tip.area)}</span>
                )}
              </div>
            </div>

            {/* Header da tabela */}
            <div className="px-4 pt-2 grid grid-cols-12 gap-2 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1">
              <span className="col-span-1">#</span>
              <span className="col-span-2">Preço</span>
              <span className="col-span-1">Área</span>
              <div className="col-span-6 grid grid-cols-6 gap-1 text-center">
                {Object.entries(AJUSTE_LABELS).map(([k, label]) => (
                  <span key={k} className={AUTO_FIELDS.has(k) ? 'text-indigo-400' : ''}>{label}{AUTO_FIELDS.has(k) ? ' ⚡' : ''}</span>
                ))}
              </div>
              <span className="col-span-1 text-right">€/m²</span>
              <span className="col-span-1 text-right">Ajust.</span>
            </div>

            <div className="px-4 py-2 space-y-2">
              {tip.comparaveis.map((comp, cIdx) => {
                const ajusteTotal = Object.values(comp.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
                const euroM2 = comp.preco > 0 && comp.area > 0 ? Math.round(comp.preco / comp.area) : 0
                const euroM2Ajust = euroM2 > 0 ? Math.round(euroM2 * (1 + ajusteTotal / 100)) : 0

                return (
                  <div key={cIdx} className="border-b border-gray-50 pb-2 space-y-1">
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-1 text-gray-300 font-semibold">
                        {comp.link ? (
                          <a href={comp.link} target="_blank" rel="noopener noreferrer"
                            className="text-[#C9A84C] hover:underline cursor-pointer">{cIdx + 1}</a>
                        ) : (cIdx + 1)}
                      </span>
                      <div className="col-span-2">
                        <input type="number" value={comp.preco || ''} onChange={e => updateComp(tIdx, cIdx, 'preco', parseFloat(e.target.value) || 0)}
                          placeholder="€" className="w-full border rounded px-2 py-1 font-mono" />
                      </div>
                      <div className="col-span-1">
                        <input type="number" value={comp.area || ''} onChange={e => updateComp(tIdx, cIdx, 'area', parseFloat(e.target.value) || 0)}
                          placeholder="m²" className="w-full border rounded px-2 py-1 font-mono" />
                      </div>
                      <div className="col-span-6 grid grid-cols-6 gap-1">
                        {Object.keys(AJUSTE_LABELS).map(aj => {
                          const isAuto = AUTO_FIELDS.has(aj) && autoAjustes
                          return (
                            <div key={aj}>
                              <input type="number" step="0.5"
                                value={comp.ajustes?.[aj] ?? ''}
                                onChange={e => updateComp(tIdx, cIdx, `ajuste_${aj}`, parseFloat(e.target.value) || 0)}
                                readOnly={isAuto}
                                className={`w-full border rounded px-1 py-1 font-mono text-center ${
                                  isAuto ? 'bg-indigo-50 text-indigo-600 border-indigo-200 cursor-not-allowed' : ''
                                } ${(comp.ajustes?.[aj] || 0) > 0 ? 'text-green-600' : (comp.ajustes?.[aj] || 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}
                              />
                            </div>
                          )
                        })}
                      </div>
                      <div className="col-span-1 text-right">
                        <p className="font-mono text-gray-600">{euroM2 > 0 ? euroM2 : '—'}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <p className={`font-mono font-semibold ${ajusteTotal > 0 ? 'text-green-600' : ajusteTotal < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {euroM2Ajust > 0 ? euroM2Ajust : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-1" />
                      <div className="col-span-7">
                        <input type="url" value={comp.link || ''} placeholder="Link do anúncio"
                          onChange={e => updateComp(tIdx, cIdx, 'link', e.target.value)}
                          className="w-full border border-gray-100 rounded px-2 py-1 text-gray-500 placeholder-gray-300 truncate" />
                      </div>
                      <div className="col-span-3">
                        <input type="text" value={comp.notas || ''} placeholder="Notas"
                          onChange={e => updateComp(tIdx, cIdx, 'notas', e.target.value)}
                          className="w-full border border-gray-100 rounded px-2 py-1 text-gray-500 placeholder-gray-300" />
                      </div>
                      <div className="col-span-1 text-right">
                        {ajusteTotal !== 0 && (
                          <span className={`text-[10px] font-mono ${ajusteTotal > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {ajusteTotal > 0 ? '+' : ''}{ajusteTotal.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
