import { StatusBadge } from './StatusBadge.jsx'

export function KPITable({ rows }) {
  return (
    <>
    {/* Cartões em telemóvel */}
    <div className="md:hidden divide-y divide-line ">
      {rows.map((row, i) => (
        <div key={i} className="py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink  truncate">{row.label}</p>
            <p className="text-xs text-ink-muted num">
              {row.value !== null && row.value !== undefined ? `${row.value}${row.unit ?? ''}` : '—'}
              {row.meta !== undefined && <span className="text-ink-muted/70"> / {row.meta}{row.unit ?? ''}</span>}
            </p>
          </div>
          <StatusBadge status={row.status ?? 'yellow'} />
        </div>
      ))}
    </div>
    {/* Tabela em desktop */}
    <div className="hidden md:block overflow-x-auto">
      <table className="min-w-[500px] w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="text-left py-2 px-3 text-ink-muted font-medium">KPI</th>
            <th className="text-right py-2 px-3 text-ink-muted font-medium">Atual</th>
            <th className="text-right py-2 px-3 text-ink-muted font-medium">Meta</th>
            <th className="text-center py-2 px-3 text-ink-muted font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line hover:bg-surface">
              <td className="py-2 px-3 font-medium text-ink">{row.label}</td>
              <td className="py-2 px-3 text-right num text-ink">
                {row.value !== null && row.value !== undefined ? `${row.value}${row.unit ?? ''}` : '—'}
              </td>
              <td className="py-2 px-3 text-right num text-ink-muted">
                {row.meta !== undefined ? `${row.meta}${row.unit ?? ''}` : '—'}
              </td>
              <td className="py-2 px-3 text-center">
                <StatusBadge status={row.status ?? 'yellow'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}
