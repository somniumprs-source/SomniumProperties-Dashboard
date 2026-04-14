/**
 * Skeleton loading components for perceived performance.
 */

function Pulse({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200 rounded ${className}`} />
}

/** Grid de KPI cards skeleton */
export function KPISkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white rounded-xl p-5 border border-neutral-100">
          <Pulse className="h-3 w-24 mb-3" />
          <Pulse className="h-7 w-20 mb-2" />
          <Pulse className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Tabela skeleton */
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-5 py-3 border-b border-neutral-100">
        {Array.from({ length: cols }, (_, i) => (
          <Pulse key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 px-5 py-3 border-b border-neutral-50">
          {Array.from({ length: cols }, (_, c) => (
            <Pulse key={c} className={`h-3 flex-1 ${c === 0 ? 'max-w-[160px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Kanban board skeleton */
export function KanbanSkeleton({ columns = 4 }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="flex-shrink-0 w-64 bg-neutral-50 rounded-xl p-3">
          <Pulse className="h-4 w-28 mb-3" />
          {Array.from({ length: 2 + (i % 2) }, (_, j) => (
            <div key={j} className="bg-white rounded-lg p-3 mb-2 border border-neutral-100">
              <Pulse className="h-3 w-32 mb-2" />
              <Pulse className="h-3 w-20 mb-2" />
              <Pulse className="h-3 w-24" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Chart placeholder skeleton */
export function ChartSkeleton({ height = 'h-64' }) {
  return (
    <div className={`bg-white rounded-xl border border-neutral-100 p-5 ${height}`}>
      <Pulse className="h-4 w-32 mb-4" />
      <div className="flex items-end gap-2 h-[calc(100%-2rem)]">
        {Array.from({ length: 8 }, (_, i) => (
          <Pulse
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  )
}

/** Page-level loading skeleton combinando KPIs + tabela */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <KPISkeleton />
      <TableSkeleton />
    </div>
  )
}
