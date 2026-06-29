/**
 * CAEP — Distribuição de lucros entre Somnium e investidores.
 */
import { useState, useEffect } from 'react'
import { EUR, PCT } from '../../constants.js'

const EMPTY_INV = { nome: '', capital: 0, perc_lucro: 0, tipo: 'particular' }

const EMPTY_MEDIACAO = { ativo: false, perc_somnium: 50, investidores: [] }

export function CAEPParcerias({ analise, onUpdate }) {
  const [config, setConfig] = useState({ perc_somnium: 40, base_distribuicao: 'liquido', investidores: [], mediacao: { ...EMPTY_MEDIACAO } })

  useEffect(() => {
    const raw = analise?.caep
    const parsed = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw
    if (parsed && parsed.perc_somnium !== undefined) {
      setConfig({
        perc_somnium: parsed.perc_somnium ?? 40,
        base_distribuicao: parsed.base_distribuicao ?? 'liquido',
        investidores: parsed.investidores || [],
        mediacao: parsed.mediacao
          ? { ativo: !!parsed.mediacao.ativo, perc_somnium: parsed.mediacao.perc_somnium ?? 50, investidores: parsed.mediacao.investidores || [] }
          : { ...EMPTY_MEDIACAO },
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

  // ── Mediação própria ──────────────────────────────────────
  const med = config.mediacao || EMPTY_MEDIACAO
  // Comissão de mediação = VVR × comissão% (líquida de IVA). Reutiliza o campo da Secção E.
  const comissaoPerc = isNaN(parseFloat(analise?.comissao_perc)) ? 2.5 : parseFloat(analise.comissao_perc)
  const mediacaoTotal = Math.round((parseFloat(analise?.vvr) || 0) * comissaoPerc / 100 * 100) / 100
  // Linhas de distribuição: um por investidor CAEP, com a % guardada (default reparte igual).
  const medDefaultPerc = config.investidores.length > 0
    ? Math.round((100 - (parseFloat(med.perc_somnium) || 0)) / config.investidores.length * 100) / 100
    : 0
  const medRows = config.investidores.map(inv => {
    const saved = (med.investidores || []).find(m => m.nome === inv.nome)
    const perc = saved ? (parseFloat(saved.perc) || 0) : medDefaultPerc
    return { nome: inv.nome, perc }
  })
  const medSomaPerc = Math.round(((parseFloat(med.perc_somnium) || 0) + medRows.reduce((s, r) => s + r.perc, 0)) * 100) / 100

  const saveMediacao = (next) => save({ ...config, mediacao: next })

  const toggleMediacao = (ativo) => {
    // Ao ligar, popula os investidores da mediação a partir dos investidores CAEP (split igual).
    const investidores = ativo
      ? config.investidores.map(inv => {
          const saved = (med.investidores || []).find(m => m.nome === inv.nome)
          return { nome: inv.nome, perc: saved ? (parseFloat(saved.perc) || 0) : medDefaultPerc }
        })
      : (med.investidores || [])
    saveMediacao({ ...med, ativo, investidores })
  }

  const updateMedPercSomnium = (value) => saveMediacao({ ...med, perc_somnium: parseFloat(value) || 0, investidores: medRows })
  const updateMedInvestidor = (nome, perc) => {
    const investidores = medRows.map(r => r.nome === nome ? { nome, perc: parseFloat(perc) || 0 } : { nome: r.nome, perc: r.perc })
    saveMediacao({ ...med, investidores })
  }

  const medResult = caepResult?.mediacao || null

  return (
    <div className="space-y-6">
      {/* Aviso fiscal — caminho CAEP precisa de validação contabilística */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold mb-1">⚠ Cálculo fiscal CAEP — validação pendente</p>
        <p>
          A tributação do investidor pode estar sobrestimada (cenário conservador): com base
          <strong> Líquido</strong>, a SPV já paga IRC + retenção de dividendos (28%), e cada investidor leva
          mais 28% (particular) ou novo IRC (empresa) sobre o seu quinhão. Em estrutura
          "CAEP em participação" puro, essa segunda camada pode não se aplicar.
          Validar com contabilista antes de comprometer números com investidores.
        </p>
      </div>

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
                {result && (() => {
                  const isBruto = config.base_distribuicao === 'bruto'
                  const label = isBruto ? 'Lucro Bruto' : 'Lucro Líq.'
                  const valor = isBruto ? result.lucro_bruto : result.lucro_liquido
                  return (
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-gray-400">{label}</p>
                      <p className={`font-mono font-semibold ${valor >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {EUR(valor)}
                      </p>
                      <p className="text-gray-400 mt-1">ROI: {PCT(result.roi)} · CoC: {PCT(result.cash_on_cash)} · RA: {PCT(result.retorno_anualizado)}</p>
                    </div>
                  )
                })()}
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

      {/* ── Mediação própria ────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mediação própria</span>
            <span className="block text-xs text-gray-400 mt-0.5">A Somnium é a mediadora: comissão {PCT(comissaoPerc)} (líquida de IVA) distribuída à parte, em bruto.</span>
          </span>
          <input type="checkbox" checked={!!med.ativo} onChange={e => toggleMediacao(e.target.checked)} className="h-4 w-4 accent-yellow-500" />
        </label>

        {med.ativo && (
          <>
            <p className="text-xs text-gray-400">
              Comissão a distribuir: <strong className="text-gray-700 font-mono">{EUR(mediacaoTotal)}</strong> (VVR × {PCT(comissaoPerc)})
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">% Somnium</label>
                <input type="number" value={med.perc_somnium}
                  onChange={e => updateMedPercSomnium(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm font-mono" />
              </div>
            </div>

            <div className="space-y-2">
              {medRows.map(r => {
                const resultado = medResult?.investidores?.find(mi => mi.nome === r.nome)
                return (
                  <div key={r.nome} className="grid grid-cols-3 gap-3 items-end text-xs">
                    <div>
                      <label className="text-gray-400">{r.nome || 'Investidor'}</label>
                      <p className="text-gray-400">% da comissão</p>
                    </div>
                    <div>
                      <input type="number" value={r.perc}
                        onChange={e => updateMedInvestidor(r.nome, e.target.value)}
                        className="w-full border rounded px-2 py-1 font-mono" />
                    </div>
                    <div className="text-right font-mono font-semibold text-gray-700">
                      {EUR(resultado ? resultado.valor : mediacaoTotal * r.perc / 100)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Validação da soma */}
            <p className={`text-xs ${medSomaPerc === 100 ? 'text-gray-400' : 'text-red-600 font-semibold'}`}>
              Soma: Somnium {PCT(med.perc_somnium)} + investidores = <strong>{PCT(medSomaPerc)}</strong>
              {medSomaPerc !== 100 && ' — deve totalizar 100%'}
            </p>

            {/* Resultado da distribuição */}
            {medResult && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Quota Somnium ({PCT(medResult.perc_somnium)})</span>
                  <p className="font-mono font-semibold text-gray-800">{EUR(medResult.quota_somnium)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Total mediação</span>
                  <p className="font-mono font-semibold text-gray-800">{EUR(medResult.total)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
