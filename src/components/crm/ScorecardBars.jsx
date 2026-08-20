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
      <div className="space-y-2">
        {DC_CRITERIOS.map(c => {
          const v = g?.[c.key]
          const nota = g?.[c.notaKey]
          return (
            <div key={c.key} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-32 shrink-0">{c.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${((v ?? 0) / 2) * 100}%`, backgroundColor: '#C9A84C' }} />
                </div>
                <span className="text-xs text-gray-400 w-8 text-right shrink-0">{v != null ? `${v}/2` : '—'}</span>
              </div>
              {nota && <p className="text-[11px] text-gray-400 pl-1">{nota}</p>}
            </div>
          )
        })}
      </div>
      {(g?.dc_onus_verificado != null || g?.dc_direito_preferencia_esclarecido != null) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">Ónus/hipotecas verificado: <b className="text-gray-700">{g.dc_onus_verificado ? 'Sim' : 'Não'}</b></span>
          <span className="text-xs text-gray-500">Direito de preferência esclarecido: <b className="text-gray-700">{g.dc_direito_preferencia_esclarecido ? 'Sim' : 'Não'}</b></span>
        </div>
      )}
    </div>
  )
}
