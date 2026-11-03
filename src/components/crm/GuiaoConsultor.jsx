/**
 * Guiões da cold call e da discovery com consultores (spec v1, secção 2).
 * Durante a chamada o associado marca as perguntas à mão; depois da
 * transcrição, as perguntas que a IA detetou aparecem já marcadas
 * (perguntas_cobertas da última análise: índices das perguntas do guião).
 * Os textos vivem em classificacaoConsultorCalc (a IA recebe os mesmos).
 */
import { useState } from 'react'
import { ListChecks, ChevronDown, ChevronRight } from 'lucide-react'
import { GUIOES } from '../../db/classificacaoConsultorCalc.js'

export function GuiaoConsultor({ etapa = 'cold_call', cobertas = [] }) {
  const g = GUIOES[etapa === 'acompanhamento' ? 'discovery' : etapa] || GUIOES.cold_call
  const [aberto, setAberto] = useState(false)
  const [marcadas, setMarcadas] = useState({})
  const coberta = (i) => Array.isArray(cobertas) && cobertas.map(Number).includes(i)
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink">
        <ListChecks className="w-4 h-4 text-ink-muted" /> Guião · {g.titulo}
        <span className="ml-auto text-ink-muted">{aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
      </button>
      {aberto && (
        <div className="border-t border-line px-3 py-2.5 space-y-2.5 text-xs">
          <p className="text-ink-muted italic">{g.abertura}</p>
          <ol className="space-y-1.5">
            {g.perguntas.map((p, i) => {
              const feita = marcadas[i] ?? coberta(i)
              return (
                <li key={i}>
                  <label className="flex items-start gap-2 text-ink">
                    <input type="checkbox" checked={!!feita} onChange={e => setMarcadas(m => ({ ...m, [i]: e.target.checked }))} className="mt-0.5" />
                    <span className={feita ? 'text-ink-muted line-through' : ''}>{p}</span>
                  </label>
                </li>
              )
            })}
          </ol>
          {g.decisao.length > 0 && (
            <div className="grid gap-1">
              {g.decisao.map(([d, s]) => <p key={d} className="text-ink-muted"><span className="font-semibold text-ink">{d}:</span> {s}</p>)}
            </div>
          )}
          <p className="text-ink-muted"><span className="font-semibold text-ink">Fecho:</span> {g.fecho}</p>
        </div>
      )}
    </div>
  )
}
