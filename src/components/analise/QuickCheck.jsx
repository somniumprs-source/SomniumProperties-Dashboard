/**
 * Quick Check — 4 inputs + veredicto rápido.
 * Decisão em 30 segundos, pensada para telemóvel.
 */
import { useState } from 'react'
import { EUR, PCT } from '../../constants.js'
import { apiFetch } from '../../lib/api.js'

export function QuickCheck({ analise, onTransfer }) {
  const [form, setForm] = useState({
    compra: analise?.compra || 0,
    obra: analise?.obra || 0,
    vvr: analise?.vvr || 0,
    meses: analise?.meses || 6,
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const calcular = async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/crm/analises/quick-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (r.ok) setResult(await r.json())
    } catch {}
    setLoading(false)
  }

  const transferir = () => {
    onTransfer({ compra: form.compra, obra: form.obra, vvr: form.vvr, meses: form.meses })
  }

  const VEREDICTO = {
    ENTRA: { label: 'ENTRA', bg: 'bg-green-500', border: 'border-green-400', text: 'text-white' },
    ANALISAR: { label: 'ANALISAR', bg: 'bg-yellow-500', border: 'border-yellow-400', text: 'text-white' },
    NAO_ENTRA: { label: 'NÃO ENTRA', bg: 'bg-red-500', border: 'border-red-400', text: 'text-white' },
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <p className="text-xs text-gray-400 text-center">Decisão rápida em 30 segundos</p>

      {/* 4 inputs */}
      <div className="grid grid-cols-2 gap-4">
        <QInput label="Compra" value={form.compra} onChange={v => setForm(p => ({ ...p, compra: v }))} />
        <QInput label="Obra estimada" value={form.obra} onChange={v => setForm(p => ({ ...p, obra: v }))} />
        <QInput label="VVR alvo" value={form.vvr} onChange={v => setForm(p => ({ ...p, vvr: v }))} />
        <QInput label="Meses" value={form.meses} onChange={v => setForm(p => ({ ...p, meses: v }))} step={1} />
      </div>

      <button onClick={calcular} disabled={loading}
        className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors">
        {loading ? 'A calcular...' : 'Verificar'}
      </button>

      {/* Resultado */}
      {result && (
        <div className="space-y-4">
          {/* Veredicto grande */}
          <div className={`rounded-2xl ${VEREDICTO[result.veredicto].bg} p-8 text-center`}>
            <p className={`text-4xl font-black ${VEREDICTO[result.veredicto].text}`}>
              {VEREDICTO[result.veredicto].label}
            </p>
            <p className="text-white/80 text-sm mt-2">
              RA: {PCT(result.retorno_anualizado)}
            </p>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Capital necessário" value={EUR(result.capital)} />
            <Metric label="Lucro bruto" value={EUR(result.lucro_bruto)} />
            <Metric label="Retorno total" value={PCT(result.retorno_total)} />
            <Metric label="Retorno anualizado" value={PCT(result.retorno_anualizado)} />
          </div>

          {/* Decomposição */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-1 text-xs">
            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-2">Decomposição</p>
            <Row label="Imposto de Selo" value={result.decomposicao.is} />
            <Row label="Escritura" value={result.decomposicao.escritura} />
            <Row label="Obra c/ IVA" value={result.decomposicao.obra} />
            <Row label="IMI proporcional" value={result.decomposicao.imi} />
            <Row label="Comissão c/ IVA" value={result.decomposicao.comissao} />
            <Row label="IRC estimado" value={result.decomposicao.irc} />
            <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
              <span>Lucro Líquido</span>
              <span className={result.lucro_liquido >= 0 ? 'text-green-700' : 'text-red-600'}>{EUR(result.lucro_liquido)}</span>
            </div>
          </div>

          {/* Transferir */}
          <button onClick={transferir}
            className="w-full py-2 text-xs rounded-lg border border-yellow-500 text-yellow-700 hover:bg-yellow-50 transition-colors">
            Abrir na Calculadora Completa
          </button>
        </div>
      )}
    </div>
  )
}

function QInput({ label, value, onChange, step = 100 }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input type="number" step={step} value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-mono focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none" />
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-mono font-bold text-gray-800">{value}</p>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-gray-600">
      <span>{label}</span>
      <span className="font-mono">{EUR(value)}</span>
    </div>
  )
}
