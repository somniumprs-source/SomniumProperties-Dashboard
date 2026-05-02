/**
 * CAEP — Distribuição de lucros entre Somnium e investidores.
 */
import { useState, useEffect } from 'react'
import { EUR, PCT } from '../../constants.js'

const EMPTY_INV = { nome: '', capital: 0, perc_lucro: 0, tipo: 'particular' }

export function CAEPParcerias({ analise, onUpdate }) {
  const [config, setConfig] = useState({ perc_somnium: 40, base_distribuicao: 'liquido', investidores: [] })

  useEffect(() => {
    const raw = analise?.caep
    const parsed = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw
    if (parsed && parsed.perc_somnium !== undefined) {
      setConfig({
        perc_somnium: parsed.perc_somnium ?? 40,
        base_distribuicao: parsed.base_distribuicao ?? 'liquido',
        investidores: parsed.investidores || [],
      })
    }
  }, [analise?.id])

  const save = (next) => {
    setConfig(next)
    onUpdate({ caep: JSON.stringify(next) })
  }

  const addInvestidor = () => {
    save({ ...config, investidores: [...config.investidores, { ...EMPTY_INV, nome: `Investidor ${config.investidores.length + 1}` }] })
  }

  const removeInvestidor = (idx) => {
    save({ ...config, investidores: config.investidores.filter((_, i) => i !== idx) })
  }

  const updateInvestidor = (idx, field, value) => {
    const next = config.investidores.map((inv, i) => i === idx ? { ...inv, [field]: value } : inv)
    save({ ...config, investidores: next })
  }

  // Resultados CAEP (vêm do backend, parseados)
  const caepResult = (() => {
    const raw = analise?.caep
    const parsed = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw
    return parsed?.quota_somnium !== undefined ? parsed : null
  })()

  const capitalTotal = config.investidores.reduce((s, inv) => s + (parseFloat(inv.capital) || 0), 0)
  const capitalNecessario = analise?.capital_necessario || 0
  const progresso = capitalNecessario > 0 ? Math.min((capitalTotal / capitalNecessario) * 100, 100) : 0

  return (
    <div className="space-y-6">
      {/* Configuração */}
      <div className="rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Estrutura da Parceria</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">% Somnium</label>
            <input type="number" value={config.perc_somnium}
              onChange={e => save({ ...config, perc_somnium: parseFloat(e.target.value) || 0 })}
              className="w-full border rounded-lg px-3 py-1.5 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Base de distribuição</label>
            <select value={config.base_distribuicao}
              onChange={e => save({ ...config, base_distribuicao: e.target.value })}
              className="w-full border rounded-lg px-3 py-1.5 text-sm">
              <option value="liquido">Lucro Líquido</option>
              <option value="bruto">Lucro Bruto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Info split */}
      <p className="text-xs text-gray-400">
        Somnium: <strong className="text-gray-600">{config.perc_somnium}%</strong> · Investidores: <strong className="text-gray-600">{100 - config.perc_somnium}%</strong> distribuído proporcionalmente ao capital de cada um
      </p>

      {/* Barra de capital */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500">Capital angariado</span>
          <span className="font-mono">{EUR(capitalTotal)} / {EUR(capitalNecessario)}</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-yellow-500 rounded-full transition-all" style={{ width: `${progresso}%` }} />
        </div>
      </div>

      {/* Investidores */}
      <div className="space-y-3">
        {config.investidores.map((inv, idx) => {
          const result = caepResult?.investidores?.[idx]
          return (
            <div key={idx} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <input value={inv.nome} onChange={e => updateInvestidor(idx, 'nome', e.target.value)}
                  className="text-sm font-semibold bg-transparent border-none outline-none" placeholder="Nome" />
                <button onClick={() => removeInvestidor(idx)} className="text-xs text-red-400 hover:text-red-600">&times;</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="text-gray-400">Capital</label>
                  <input type="number" value={inv.capital || ''} onChange={e => updateInvestidor(idx, 'capital', parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono" />
                </div>
                <div>
                  <label className="text-gray-400">% do pool</label>
                  <p className="w-full border rounded px-2 py-1 font-mono bg-gray-50 text-gray-600">
                    {capitalTotal > 0 ? ((parseFloat(inv.capital) || 0) / capitalTotal * 100).toFixed(1) : '0.0'}%
                  </p>
                </div>
                <div>
                  <label className="text-gray-400">Tipo</label>
                  <select value={inv.tipo} onChange={e => updateInvestidor(idx, 'tipo', e.target.value)}
                    className="w-full border rounded px-2 py-1">
                    <option value="particular">Particular</option>
                    <option value="empresa">Empresa</option>
                  </select>
                </div>
                {result && (
                  <div className="bg-gray-50 rounded p-2">
                    <p className="text-gray-400">Lucro Líq.</p>
                    <p className={`font-mono font-semibold ${result.lucro_liquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {EUR(result.lucro_liquido)}
                    </p>
                    <p className="text-gray-400 mt-1">ROI: {PCT(result.roi)} · CoC: {PCT(result.cash_on_cash)} · RA: {PCT(result.retorno_anualizado)}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={addInvestidor}
        className="w-full py-2 text-xs rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
        + Adicionar Investidor
      </button>

      {/* Resumo CAEP */}
      {caepResult && caepResult.quota_somnium !== undefined && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2">Distribuição</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Quota Somnium</span>
              <p className="font-mono font-semibold text-gray-800">{EUR(caepResult.quota_somnium)}</p>
            </div>
            <div>
              <span className="text-gray-500">Capital Total</span>
              <p className="font-mono font-semibold text-gray-800">{EUR(caepResult.capital_total)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
