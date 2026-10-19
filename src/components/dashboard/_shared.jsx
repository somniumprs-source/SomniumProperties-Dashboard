// Componentes e formatadores partilhados pelos blocos de departamento do Dashboard.
import { KpiCard } from '../ui/KpiCard.jsx'

export const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-PT').format(n))
export const fmtPct = (n) => (n == null ? '—' : `${n}%`)
export const fmtX = (n) => (n == null ? '—' : `${n}×`)

// Card de métrica de fluxo: valor + variação vs período anterior.
// `metric` = { valor, delta }; `melhor` diz se subir é boa ou má notícia.
export function MetricCard({ label, metric, format = fmtNum, tone = 'gold', melhor = 'subir', sub }) {
  return <KpiCard label={label} value={format(metric?.valor)} delta={metric?.delta} melhor={melhor} sub={sub} tone={tone} size="md" />
}

export function Pillar({ icon: Icon, title, hint, children }) {
  return (
    <div className="bg-surface-raised rounded-xl overflow-hidden border border-line shadow-xs">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-muted">
          <Icon className="w-4 h-4 text-ink-muted" />
        </div>
        <div>
          <h3 className="text-ui font-semibold text-ink">{title}</h3>
          {hint && <p className="text-caption text-ink-muted">{hint}</p>}
        </div>
      </div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

export function Group({ label, children }) {
  return (
    <div>
      {label && <p className="text-overline uppercase text-ink-muted mb-2">{label}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">{children}</div>
    </div>
  )
}

export function RankList({ rows, valueFmt }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={r.nome || r.origem} className="flex items-center gap-2 text-sm py-1 border-b border-line  last:border-0">
          <span className="w-5 text-xs font-bold text-ink-muted">{i + 1}.</span>
          <span className="flex-1 truncate text-ink ">{r.nome || r.origem}</span>
          {r.imoveis != null && <span className="text-xs text-ink-muted">{r.imoveis} imóveis</span>}
          <span className="font-semibold text-ink num w-24 text-right">{valueFmt(r.lucroGerado ?? r.lucro)}</span>
        </div>
      ))}
    </div>
  )
}
