// Componentes e formatadores partilhados pelos blocos de departamento do Dashboard.
import { KpiCard } from '../ui/KpiCard.jsx'

export const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-PT').format(n))
export const fmtPct = (n) => (n == null ? '—' : `${n}%`)
export const fmtX = (n) => (n == null ? '—' : `${n}×`)

// Card de métrica de fluxo: valor + comparação ▲▼ vs período anterior.
export function MetricCard({ label, metric, format = fmtNum, tone = 'gold' }) {
  const delta = metric?.delta
  const sub = delta == null ? null : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} ${Math.abs(delta)}% vs anterior`
  return <KpiCard label={label} value={format(metric?.valor)} sub={sub} tone={tone} size="md" />
}

export function Pillar({ icon: Icon, title, hint, children }) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: '#0d0d0d', borderBottom: '1px solid #1a1a1a' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <Icon className="w-4 h-4" style={{ color: '#C9A84C' }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {hint && <p className="text-[10px] text-neutral-500">{hint}</p>}
        </div>
      </div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

export function Group({ label, children }) {
  return (
    <div>
      {label && <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">{label}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">{children}</div>
    </div>
  )
}

export function RankList({ rows, valueFmt }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={r.nome || r.origem} className="flex items-center gap-2 text-sm py-1 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
          <span className="w-5 text-xs font-bold text-neutral-400">{i + 1}.</span>
          <span className="flex-1 truncate text-neutral-800 dark:text-neutral-200">{r.nome || r.origem}</span>
          {r.imoveis != null && <span className="text-xs text-neutral-400">{r.imoveis} imóveis</span>}
          <span className="font-semibold text-neutral-900 dark:text-white w-24 text-right">{valueFmt(r.lucroGerado ?? r.lucro)}</span>
        </div>
      ))}
    </div>
  )
}
