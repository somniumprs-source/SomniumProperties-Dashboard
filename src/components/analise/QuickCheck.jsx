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
    ENTRA: { label: 'ENTRA', bg: 'bg-success', border: 'border-green-400', text: 'text-white' },
    ANALISAR: { label: 'ANALISAR', bg: 'bg-warning', border: 'border-yellow-400', text: 'text-white' },
    NAO_ENTRA: { label: 'NÃO ENTRA', bg: 'bg-danger', border: 'border-red-400', text: 'text-white' },
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <p className="text-xs text-ink-muted text-center">Decisão rápida em 30 segundos</p>

      {/* 4 inputs */}
      <div className="grid grid-cols-2 gap-4">
        <QInput label="Compra" value={form.compra} onChange={v => setForm(p => ({ ...p, compra: v }))} />
        <QInput label="Obra estimada" value={form.obra} onChange={v => setForm(p => ({ ...p, obra: v }))} />
        <QInput label="VVR alvo" value={form.vvr} onChange={v => setForm(p => ({ ...p, vvr: v }))} />
        <QInput label="Meses" value={form.meses} onChange={v => setForm(p => ({ ...p, meses: v }))} step={1} />
      </div>

      <button onClick={calcular} disabled={loading}
        className="w-full py-3 rounded-xl bg-ink text-surface font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-colors">
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
          <div className="rounded-xl border border-line p-4 space-y-1 text-xs">
            <p className="font-semibold text-ink-muted uppercase tracking-wide mb-2">Decomposição</p>
            <Row label="Imposto de Selo" value={result.decomposicao.is} />
            <Row label="Escritura" value={result.decomposicao.escritura} />
            <Row label="Obra c/ IVA" value={result.decomposicao.obra} />
            <Row label="IMI proporcional" value={result.decomposicao.imi} />
            <Row label="Comissão c/ IVA" value={result.decomposicao.comissao} />
            <Row label="IRC estimado" value={result.decomposicao.irc} />
            <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
              <span>Lucro Líquido</span>
              <span className={result.lucro_liquido >= 0 ? 'text-success' : 'text-danger'}>{EUR(result.lucro_liquido)}</span>
            </div>
          </div>

          {/* Transferir */}
          {onTransfer && (
            <button onClick={transferir}
              className="w-full py-2 text-xs rounded-lg border border-yellow-500 text-warning hover:bg-warning/10 transition-colors">
              Abrir na Calculadora Completa
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function QInput({ label, value, onChange, step = 100 }) {
  return (
    <div>
      <label className="text-xs text-ink-muted block mb-1">{label}</label>
      <input type="number" step={step} value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-xl border border-line px-4 py-3 text-lg num focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none" />
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="bg-surface rounded-xl p-3 text-center">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg num font-bold text-ink">{value}</p>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-ink-muted">
      <span>{label}</span>
      <span className="num">{EUR(value)}</span>
    </div>
  )
}
