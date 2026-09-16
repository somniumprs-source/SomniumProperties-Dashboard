/**
 * Campos do registo manual de uma chamada (SOP 2) — reutilizado no formulário
 * de criação (RegistoChamadasTab) e na edição inline (GravacaoCard). Mostra
 * sempre os quatro blocos juntos (Cold/Discovery/Close/Pivot), sem obrigar a
 * escolher um tipo primeiro: na prática a mesma chamada cobre várias fases
 * seguidas (cold call que passa logo a discovery, por exemplo), por isso o
 * utilizador só preenche os campos que se aplicaram a esta chamada em
 * concreto e deixa os restantes em branco. O registo manual é sempre a fonte
 * de verdade: estes campos nunca são escritos automaticamente pela IA, só
 * confirmados pelo utilizador.
 */
import {
  CC_RESULTADOS, CC_RESULTADO_LABEL, SIM_NAO_NP, SIM_NAO_NP_LABEL,
  CC_DISPONIBILIDADE, CC_DISPONIBILIDADE_LABEL, CC_DOCUMENTACAO, CC_DOCUMENTACAO_LABEL,
  DC_CRITERIOS, bandaScorecard, CL_RESULTADOS, CL_RESULTADO_LABEL,
} from '../../constants.js'

export const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

export function PillField({ label, value, onChange, options, labels }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="flex gap-1 flex-wrap justify-end">
        {options.map(o => {
          const active = value === o
          return (
            <button key={o} type="button"
              onClick={() => onChange(active ? '' : o)}
              className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${active ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-yellow-300'}`}
              style={active ? { backgroundColor: '#C9A84C' } : undefined}>
              {labels[o] || o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function NumberField({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-gray-500 shrink-0">{label}</label>
      <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-28 px-2 py-1 rounded-md border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-yellow-300"
        onWheel={e => e.target.blur()} />
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

function Bloco({ titulo, legenda, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
      <p className={`text-xs font-semibold text-gray-700 ${legenda ? 'mb-0.5' : 'mb-1.5'}`}>{titulo}</p>
      {legenda && <p className="text-[10px] text-gray-400 mb-1.5">{legenda}</p>}
      {children}
    </div>
  )
}

// Os quatro blocos de campos do SOP 2, sempre juntos — `registo` = objecto
// com as colunas manuais actuais; `onChange(key, value)` actualiza uma so
// chave. Cada bloco fica vazio/em branco se essa fase nao se aplicou.
export function RegistoManualFieldset({ registo, onChange }) {
  const scoresPresentes = DC_CRITERIOS.some(c => registo[c.key] != null)
  const total = scoresPresentes ? DC_CRITERIOS.reduce((s, c) => s + (registo[c.key] ?? 0), 0) : null
  const banda = bandaScorecard(total)

  return (
    <div className="space-y-2">
      <Bloco titulo="Cold Call">
        <div className="space-y-1.5">
          <PillField label="Disponibilidade confirmada" value={registo.cc_disponibilidade} options={CC_DISPONIBILIDADE} labels={CC_DISPONIBILIDADE_LABEL}
            onChange={v => onChange('cc_disponibilidade', v)} />
          <PillField label="Documentação (caderneta e planta)" value={registo.cc_documentacao} options={CC_DOCUMENTACAO} labels={CC_DOCUMENTACAO_LABEL}
            onChange={v => onChange('cc_documentacao', v)} />
          <PillField label="Resultado" value={registo.cc_resultado} options={CC_RESULTADOS} labels={CC_RESULTADO_LABEL}
            onChange={v => onChange('cc_resultado', v)} />
          <PillField label="Aceita negociar" value={registo.cc_aceita_negociar} options={SIM_NAO_NP} labels={SIM_NAO_NP_LABEL}
            onChange={v => onChange('cc_aceita_negociar', v)} />
        </div>
      </Bloco>

      <Bloco titulo="Discovery Call — Scorecard de Qualificação"
        legenda="0 = não abordado · 1 = superficial · 2 = aprofundado (detalhe concreto e quantificado)">
        <div className="space-y-1">
          {DC_CRITERIOS.map(c => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-28 shrink-0">{c.label}</span>
              <div className="flex gap-1 shrink-0">
                {[0, 1, 2].map(n => {
                  const active = registo[c.key] === n
                  return (
                    <button key={n} type="button"
                      onClick={() => onChange(c.key, active ? null : n)}
                      className={`w-6 h-6 rounded-md text-xs font-semibold border transition-colors ${active ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-yellow-300'}`}
                      style={active ? { backgroundColor: '#C9A84C' } : undefined}>
                      {n}
                    </button>
                  )
                })}
              </div>
              <input type="text" value={registo[c.notaKey] || ''} onChange={e => onChange(c.notaKey, e.target.value)}
                placeholder="Justificação (opcional)"
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-gray-200 focus:outline-none focus:ring-1 focus:ring-yellow-300" />
            </div>
          ))}
          <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-700">Total</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">{total != null ? `${total}/12` : '— /12'}</span>
              {banda && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${banda.cls}`}>{banda.label}</span>}
            </div>
          </div>
          <div className="pt-1.5 space-y-0.5">
            <CheckboxField label="Ónus/hipotecas verificado (Certidão Permanente)" checked={registo.dc_onus_verificado === true}
              onChange={v => onChange('dc_onus_verificado', v)} />
            <CheckboxField label="Direito de preferência esclarecido" checked={registo.dc_direito_preferencia_esclarecido === true}
              onChange={v => onChange('dc_direito_preferencia_esclarecido', v)} />
          </div>
        </div>
      </Bloco>

      <Bloco titulo="Close Call">
        <div className="space-y-1.5">
          <PillField label="Resultado" value={registo.cl_resultado} options={CL_RESULTADOS} labels={CL_RESULTADO_LABEL}
            onChange={v => onChange('cl_resultado', v)} />
          <div className="space-y-1.5">
            <NumberField label="Valor de âncora (€)" value={registo.cl_valor_ancora} onChange={v => onChange('cl_valor_ancora', v)} />
            <NumberField label="Contra-proposta (€)" value={registo.cl_valor_contraproposta} onChange={v => onChange('cl_valor_contraproposta', v)} />
          </div>
          {registo.cl_resultado === 'vou_pensar_com_data' && (
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-gray-500 shrink-0">Deadline da resposta</label>
              <input type="date" value={registo.cl_deadline || ''} onChange={e => onChange('cl_deadline', e.target.value)}
                className="w-36 px-2 py-1 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
            </div>
          )}
          <CheckboxField label="Formalizado por escrito no mesmo dia" checked={registo.cl_formalizado_escrito_mesmo_dia === true}
            onChange={v => onChange('cl_formalizado_escrito_mesmo_dia', v)} />
        </div>
      </Bloco>

      <Bloco titulo="Pivot para Parceria (se o interlocutor for consultor/agente)">
        <div className="space-y-1">
          <CheckboxField label="Critérios de pesquisa enviados" checked={registo.pp_criterios_pesquisa_enviados === true}
            onChange={v => onChange('pp_criterios_pesquisa_enviados', v)} />
          <CheckboxField label="Compromisso de contacto futuro confirmado" checked={registo.pp_compromisso_confirmado === true}
            onChange={v => onChange('pp_compromisso_confirmado', v)} />
          <div className="pt-1">
            <NumberField label="Negócios já fechados com este consultor" value={registo.pp_negocios_fechados}
              onChange={v => onChange('pp_negocios_fechados', v)} />
          </div>
        </div>
      </Bloco>
    </div>
  )
}
