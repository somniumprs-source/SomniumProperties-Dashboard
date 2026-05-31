/**
 * KPIs integrados no topo de cada tab do CRM.
 *
 * Investidores tem layout próprio: 4 quadros grandes (Total, A, B, Capital)
 * em vez da fila de mini-cards usada nas outras tabs.
 */
import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api.js'
import { EUR } from '../../constants.js'

export function TabKPIs({ tab, regiao }) {
  const [kpis, setKpis] = useState(null)
  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Negócios': 'negocios', 'Despesas': 'despesas' }[tab]

  useEffect(() => {
    apiFetch(`/api/crm/kpis/${endpoint}`, { regiao }).then(r => r.json()).then(setKpis).catch(() => {})
  }, [endpoint, regiao])

  if (!kpis) return null

  // Investidores: 4 quadros destacados (Total, A, B, Capital). Substitui a antiga fila com status.
  if (tab === 'Investidores') {
    const cards = [
      { label: 'Total Investidores', value: kpis.total ?? 0, tone: 'slate' },
      { label: 'Investidores A',     value: kpis.classA ?? 0, tone: 'emerald' },
      { label: 'Investidores B',     value: kpis.classB ?? 0, tone: 'sky' },
      { label: 'Capital Angariado',  value: EUR(kpis.capitalTotal ?? 0), tone: 'amber' },
    ]
    const tones = {
      slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-700',   label: 'text-slate-500' },
      emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'text-emerald-600' },
      sky:     { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     label: 'text-sky-600' },
      amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'text-amber-600' },
    }
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => {
          const t = tones[c.tone]
          return (
            <div key={i} className={`rounded-2xl border ${t.border} ${t.bg} px-4 py-3 shadow-xs`}>
              <p className={`text-[11px] uppercase tracking-wider font-semibold ${t.label}`}>{c.label}</p>
              <p className={`text-2xl sm:text-3xl font-bold mt-1 ${t.text}`}>{c.value}</p>
            </div>
          )
        })}
      </div>
    )
  }

  const items = {
    'Imóveis': [
      { label: 'Total', value: kpis.total },
      { label: 'ROI Médio', value: kpis.roiMedio > 0 ? `${kpis.roiMedio}%` : '—' },
      ...(kpis.byEstado?.slice(0, 4).map(e => ({ label: e.estado?.replace(/^\d+-/, ''), value: e.count })) ?? []),
    ],
    'Consultores': [
      { label: 'Total', value: kpis.total },
      ...(kpis.byEstatuto?.slice(0, 5).map(e => ({ label: e.estatuto, value: e.count })) ?? []),
    ],
    'Negócios': [
      { label: 'Total', value: kpis.total },
      { label: 'Lucro Est.', value: EUR(kpis.lucro_est) },
      { label: 'Lucro Real', value: kpis.lucro_real > 0 ? EUR(kpis.lucro_real) : '—' },
      { label: 'Vendidos', value: kpis.vendidos },
    ],
    'Despesas': [
      { label: 'Total', value: kpis.total },
      { label: 'Burn Rate', value: EUR(kpis.burn_rate), color: 'text-red-500' },
      { label: 'Anual', value: EUR(kpis.total_anual) },
    ],
  }[tab] ?? []

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 px-3.5 py-2.5 min-w-fit">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold truncate">{item.label}</p>
          <p className={`text-base font-bold ${item.color ?? 'text-gray-900'}`}>{item.value}</p>
        </div>
      ))}
    </div>
  )
}
