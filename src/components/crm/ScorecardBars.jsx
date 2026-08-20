/**
 * Barras do Scorecard de Qualificação (SOP 2, Discovery Call): 6 critérios,
 * 0-2 pontos cada, total 0-12 com banda de decisão. Usado no GravacaoCard e
 * na aba "Qualidade de Chamadas" de Administração.
 */
import { DC_CRITERIOS, bandaScorecard } from '../../constants.js'

export function ScorecardBars({ g }) {
  const total = g?.dc_pontuacao_total ?? null
  const banda = bandaScorecard(total)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600">Scorecard de Qualificação</p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{total != null ? `${total}/12` : '— /12'}</span>
          {banda && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${banda.cls}`}>{banda.label}</span>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {DC_CRITERIOS.map(c => {
          const v = g?.[c.key]
          return (
            <div key={c.key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-32 shrink-0">{c.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${((v ?? 0) / 2) * 100}%`, backgroundColor: '#C9A84C' }} />
              </div>
              <span className="text-xs text-gray-400 w-8 text-right shrink-0">{v != null ? `${v}/2` : '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
