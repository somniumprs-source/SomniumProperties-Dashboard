/**
 * KPIs integrados no topo de cada tab do CRM.
 *
 * Investidores não mostra TabKPIs — os KPIs específicos aparecem só depois
 * de seleccionar Passivos/Ativos, via InvestidoresKPICards em CRM.jsx.
 */
import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api.js'
import { EUR } from '../../constants.js'

export function TabKPIs({ tab, regiao }) {
  const [kpis, setKpis] = useState(null)
  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Negócios': 'negocios', 'Despesas': 'despesas' }[tab]

  useEffect(() => {
    if (tab === 'Investidores') return
    apiFetch(`/api/crm/kpis/${endpoint}`, { regiao }).then(r => r.json()).then(setKpis).catch(() => {})
  }, [endpoint, regiao, tab])

  if (tab === 'Investidores') return null
  if (!kpis) return null

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
      { label: 'Faturação Real', value: kpis.lucro_real > 0 ? EUR(kpis.lucro_real) : '—' },
      { label: 'Vendidos', value: kpis.vendidos },
    ],
    'Despesas': [
      { label: 'Total', value: kpis.total },
      { label: 'Burn Rate', value: EUR(kpis.burn_rate), color: 'text-danger' },
      { label: 'Anual', value: EUR(kpis.total_anual) },
    ],
  }[tab] ?? []

  return (
    <div className="flex flex-wrap md:flex-nowrap md:overflow-x-auto gap-2 pb-1">
      {items.map((item, i) => (
        <div key={i} className="bg-surface-raised rounded-xl border border-line px-3.5 py-2.5 min-w-fit flex-1 md:flex-none">
          <p className="text-overline uppercase text-ink-muted truncate">{item.label}</p>
          <p className={`text-base font-semibold num ${item.color ?? 'text-ink'}`}>{item.value ?? '—'}</p>
        </div>
      ))}
    </div>
  )
}
