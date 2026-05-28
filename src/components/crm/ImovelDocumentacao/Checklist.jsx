import { ESTADOS } from './documentacao.config.js'

/**
 * Checklist documental: lista de documentos com estado visual + barra de progresso.
 */
export function Checklist({ checklist, score }) {
  if (!checklist.length) return null
  const validados = checklist.filter(c => c.estado === 'validado').length

  return (
    <div className="space-y-4">
      {/* Barra de progresso */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-neutral-600">Progresso documental</span>
          <span className="text-xs font-bold" style={{ color: score === 100 ? '#27ae60' : '#C9A84C' }}>
            {validados}/{checklist.length} · {score}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-neutral-100 overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${score}%`, backgroundColor: score === 100 ? '#27ae60' : '#C9A84C' }} />
        </div>
      </div>

      {/* Lista de documentos */}
      <div className="rounded-xl border border-neutral-100 overflow-hidden divide-y divide-neutral-50">
        {checklist.map(item => {
          const est = ESTADOS[item.estado]
          const nFlags = item.analise?.flags?.length || 0
          return (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-white">
              <span className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white shadow-sm" style={{ backgroundColor: est.cor }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-700 truncate">{item.label}</p>
                {item.analise?.tipo_documento && item.analise.tipo_documento !== item.label && (
                  <p className="text-[10px] text-neutral-400 truncate">Detectado: {item.analise.tipo_documento}</p>
                )}
              </div>
              {nFlags > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#fdecea', color: '#c0392b' }}>
                  {nFlags} flag{nFlags > 1 ? 's' : ''}
                </span>
              )}
              <span className="text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0"
                style={{ backgroundColor: est.bg, color: est.cor }}>
                {est.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
