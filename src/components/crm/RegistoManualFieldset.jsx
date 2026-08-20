/**
 * Campos do registo manual de uma chamada (SOP 2), por tipo — reutilizado no
 * formulário de criação (FollowUpsSection) e na edição inline (GravacaoCard).
 * O registo manual é sempre a fonte de verdade: estes campos nunca são
 * escritos automaticamente pela IA, só confirmados pelo utilizador.
 */
import {
  CC_RESULTADOS, CC_RESULTADO_LABEL, SIM_NAO_NP, SIM_NAO_NP_LABEL,
  DC_CRITERIOS, bandaScorecard, CL_RESULTADOS, CL_RESULTADO_LABEL,
} from '../../constants.js'

export const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

export function SelectField({ label, value, onChange, options, labels }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)} className={inputClass}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{labels[o] || o}</option>)}
      </select>
    </div>
  )
}

export function NumberField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)} className={inputClass} />
    </div>
  )
}

export function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer py-1">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="rounded border-gray-300 text-yellow-500 focus:ring-yellow-300" />
      {label}
    </label>
  )
}

// Bloco dos campos condicionais por tipo de chamada. `registo` = objecto com
// as colunas manuais actuais; `onChange(key, value)` actualiza uma so chave.
export function RegistoManualFieldset({ tipoChamada, registo, onChange }) {
  if (tipoChamada === 'cold_call') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white rounded-lg border border-gray-200 p-3">
        <SelectField label="Resultado" value={registo.cc_resultado} options={CC_RESULTADOS} labels={CC_RESULTADO_LABEL}
          onChange={v => onChange('cc_resultado', v)} />
        <SelectField label="Aceita negociar" value={registo.cc_aceita_negociar} options={SIM_NAO_NP} labels={SIM_NAO_NP_LABEL}
          onChange={v => onChange('cc_aceita_negociar', v)} />
      </div>
    )
  }

  if (tipoChamada === 'discovery_call') {
    const scoresPresentes = DC_CRITERIOS.some(c => registo[c.key] != null)
    const total = scoresPresentes ? DC_CRITERIOS.reduce((s, c) => s + (registo[c.key] ?? 0), 0) : null
    const banda = bandaScorecard(total)
    return (
      <div className="space-y-2 bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-semibold text-gray-600">Scorecard de Qualificação</p>
        {DC_CRITERIOS.map(c => (
          <div key={c.key} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600">{c.label}</span>
            <div className="flex gap-1">
              {[0, 1, 2].map(n => {
                const active = registo[c.key] === n
                return (
                  <button key={n} type="button"
                    onClick={() => onChange(c.key, n)}
                    className={`w-7 h-7 rounded-md text-xs font-semibold border transition-colors ${active ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-yellow-300'}`}
                    style={active ? { backgroundColor: '#C9A84C' } : undefined}>
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-700">Total</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{total != null ? `${total}/12` : '— /12'}</span>
            {banda && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${banda.cls}`}>{banda.label}</span>}
          </div>
        </div>
        <div className="pt-2 space-y-0.5">
          <CheckboxField label="Ónus/hipotecas verificado (Certidão Permanente)" checked={registo.dc_onus_verificado === true}
            onChange={v => onChange('dc_onus_verificado', v)} />
          <CheckboxField label="Direito de preferência esclarecido" checked={registo.dc_direito_preferencia_esclarecido === true}
            onChange={v => onChange('dc_direito_preferencia_esclarecido', v)} />
        </div>
      </div>
    )
  }

  if (tipoChamada === 'close_call') {
    return (
      <div className="space-y-3 bg-white rounded-lg border border-gray-200 p-3">
        <SelectField label="Resultado" value={registo.cl_resultado} options={CL_RESULTADOS} labels={CL_RESULTADO_LABEL}
          onChange={v => onChange('cl_resultado', v)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField label="Valor de âncora (€)" value={registo.cl_valor_ancora} onChange={v => onChange('cl_valor_ancora', v)} />
          <NumberField label="Contra-proposta (€)" value={registo.cl_valor_contraproposta} onChange={v => onChange('cl_valor_contraproposta', v)} />
        </div>
        {registo.cl_resultado === 'vou_pensar_com_data' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deadline da resposta</label>
            <input type="date" value={registo.cl_deadline || ''} onChange={e => onChange('cl_deadline', e.target.value)} className={inputClass} />
          </div>
        )}
        <CheckboxField label="Formalizado por escrito no mesmo dia" checked={registo.cl_formalizado_escrito_mesmo_dia === true}
          onChange={v => onChange('cl_formalizado_escrito_mesmo_dia', v)} />
      </div>
    )
  }

  if (tipoChamada === 'pivot_parceria') {
    return (
      <div className="space-y-1 bg-white rounded-lg border border-gray-200 p-3">
        <CheckboxField label="Critérios de pesquisa enviados" checked={registo.pp_criterios_pesquisa_enviados === true}
          onChange={v => onChange('pp_criterios_pesquisa_enviados', v)} />
        <CheckboxField label="Compromisso de contacto futuro confirmado" checked={registo.pp_compromisso_confirmado === true}
          onChange={v => onChange('pp_compromisso_confirmado', v)} />
        <div className="pt-1">
          <NumberField label="Negócios já fechados com este consultor" value={registo.pp_negocios_fechados}
            onChange={v => onChange('pp_negocios_fechados', v)} />
        </div>
      </div>
    )
  }

  return null
}
