import { StatusBadge } from './StatusBadge.jsx'

export function KPITable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-gray-500 font-medium">KPI</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Atual</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Meta</th>
            <th className="text-center py-2 px-3 text-gray-500 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-3 font-medium text-gray-700">{row.label}</td>
              <td className="py-2 px-3 text-right font-mono text-gray-900">
                {row.value !== null && row.value !== undefined ? `${row.value}${row.unit ?? ''}` : '—'}
              </td>
              <td className="py-2 px-3 text-right font-mono text-gray-400">
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
  )
}
