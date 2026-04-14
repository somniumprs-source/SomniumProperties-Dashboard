/**
 * KPIs integrados no topo de cada tab do CRM.
 */
import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api.js'
import { EUR } from '../../constants.js'

export function TabKPIs({ tab }) {
  const [kpis, setKpis] = useState(null)
  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Negócios': 'negocios', 'Despesas': 'despesas' }[tab]

  useEffect(() => {
    apiFetch(`/api/crm/kpis/${endpoint}`).then(r => r.json()).then(setKpis).catch(() => {})
  }, [endpoint])

  if (!kpis) return null

  const items = {
    'Imóveis': [
      { label: 'Total', value: kpis.total },
      { label: 'ROI Médio', value: kpis.roiMedio > 0 ? `${kpis.roiMedio}%` : '—' },
      ...(kpis.byEstado?.slice(0, 4).map(e => ({ label: e.estado?.replace(/^\d+-/, ''), value: e.count })) ?? []),
    ],
    'Investidores': [
      { label: 'Total', value: kpis.total },
      { label: 'A/B', value: kpis.classAB, color: 'text-green-600' },
      { label: 'Capital', value: EUR(kpis.capitalTotal) },
      ...(kpis.byStatus?.slice(0, 3).map(s => ({ label: s.status, value: s.count })) ?? []),
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
        <div key={i} className="bg-white rounded-lg border border-gray-200 px-3 py-2 min-w-fit shadow-sm">
          <p className={`text-sm font-bold ${item.color ?? 'text-gray-900'}`}>{item.value}</p>
          <p className="text-xs text-gray-400 truncate">{item.label}</p>
        </div>
      ))}
    </div>
  )
}
