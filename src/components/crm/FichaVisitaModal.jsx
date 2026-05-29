/**
 * Ficha de visita preenchivel, associada a uma visita do historico.
 * Replica a ficha PDF (renderFichaVisita): checklists B/R/M por elemento,
 * medicoes, estimativa de obra e relatorio com decisao. Grava em visitas.ficha.
 */
import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import {
  CHECKLIST_SECTIONS, RATINGS, MEDICAO_COMPARTIMENTOS, OBRA_TRABALHOS,
  GRAUS_OBRA, RELATORIO_OBRAS, DECISOES, normalizeFicha,
} from '../../constants/fichaVisitaSchema.js'

const fmtDateTime = d => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return d }
}

const RATING_STYLE = {
  B: { on: 'bg-green-600 text-white border-green-600', off: 'text-green-700 border-green-200 hover:bg-green-50' },
  R: { on: 'bg-amber-500 text-white border-amber-500', off: 'text-amber-700 border-amber-200 hover:bg-amber-50' },
  M: { on: 'bg-red-600 text-white border-red-600', off: 'text-red-700 border-red-200 hover:bg-red-50' },
  NA: { on: 'bg-gray-500 text-white border-gray-500', off: 'text-gray-500 border-gray-200 hover:bg-gray-50' },
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'
const labelClass = 'block text-xs text-gray-500 mb-1'
const sectionClass = 'border border-gray-200 rounded-xl p-4 mb-4'
const sectionTitle = 'text-sm font-semibold text-gray-900 mb-3'

function RatingPicker({ value, onChange }) {
  return (
    <div className="flex gap-1 shrink-0">
      {RATINGS.map(r => {
        const active = value === r.key
        const st = RATING_STYLE[r.key]
        return (
          <button
            key={r.key}
            type="button"
            title={r.label}
            onClick={() => onChange(active ? '' : r.key)}
            className={`w-9 h-8 text-xs font-semibold rounded-md border transition-colors ${active ? st.on : st.off}`}
          >
            {r.key === 'NA' ? 'N/A' : r.key}
          </button>
        )
      })}
    </div>
  )
}

export function FichaVisitaModal({ visita, imovelId, imovelNome, onClose, onSaved }) {
  const [ficha, setFicha] = useState(() => normalizeFicha(visita?.ficha))
  const [saving, setSaving] = useState(false)

  const clone = obj => (typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)))

  const setNotaCampo = (key, val) => setFicha(p => { const n = clone(p); n.preVisita.notasCampo[key] = val; return n })
  const setChecklist = (secKey, idx, field, val) => setFicha(p => { const n = clone(p); n.checklists[secKey][idx][field] = val; return n })
  const setMedicao = (idx, field, val) => setFicha(p => { const n = clone(p); n.medicoes[idx][field] = val; return n })
  const setObra = (idx, field, val) => setFicha(p => { const n = clone(p); n.estimativaObra[idx][field] = val; return n })
  const setRelatorio = (field, val) => setFicha(p => { const n = clone(p); n.relatorio[field] = val; return n })
  const setRelatorioObra = (idx, val) => setFicha(p => { const n = clone(p); n.relatorio.obras[idx].custo = val; return n })
  const setTop = (field, val) => setFicha(p => ({ ...p, [field]: val }))

  async function handleSave() {
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/visitas/${visita.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imovel_id: imovelId, ficha }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao gravar ficha')
      }
      onSaved?.()
    } catch (err) {
      alert(err.message || 'Erro ao gravar ficha')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Ficha de Visita</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {imovelNome ? `${imovelNome} · ` : ''}{fmtDateTime(visita?.dataHora)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 shrink-0" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {/* Notas de campo (pre-visita) */}
          <div className={sectionClass}>
            <div className={sectionTitle}>Notas de campo (pré-visita)</div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Impressão geral do contacto telefónico</label>
                <textarea rows={2} className={inputClass} value={ficha.preVisita.notasCampo.impressaoContacto}
                  onChange={e => setNotaCampo('impressaoContacto', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Pontos críticos a confirmar na visita</label>
                <textarea rows={2} className={inputClass} value={ficha.preVisita.notasCampo.pontosCriticos}
                  onChange={e => setNotaCampo('pontosCriticos', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Estratégia de negociação a adoptar</label>
                <textarea rows={2} className={inputClass} value={ficha.preVisita.notasCampo.estrategia}
                  onChange={e => setNotaCampo('estrategia', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Checklists B/R/M */}
          <p className="text-[11px] text-gray-400 mb-2">
            B = Bom (sem intervenção) · R = Razoável (intervenção ligeira) · M = Mau (intervenção profunda) · N/A = Não aplicável
          </p>
          {CHECKLIST_SECTIONS.map(sec => (
            <div key={sec.key} className={sectionClass}>
              <div className={sectionTitle}>{sec.label}</div>
              <div className="space-y-2">
                {sec.items.map((item, idx) => {
                  const row = ficha.checklists[sec.key][idx]
                  return (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-sm text-gray-700 flex-1 min-w-0">{item}</span>
                      <div className="flex items-center gap-2">
                        <RatingPicker value={row.rating} onChange={v => setChecklist(sec.key, idx, 'rating', v)} />
                        <input
                          type="text"
                          placeholder="Observações"
                          className="px-2 py-1.5 rounded-md border border-gray-200 text-xs w-full sm:w-44 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                          value={row.obs}
                          onChange={e => setChecklist(sec.key, idx, 'obs', e.target.value)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Medicoes */}
          <div className={sectionClass}>
            <div className={sectionTitle}>Confirmação de áreas e medições</div>
            <div className="space-y-2">
              {MEDICAO_COMPARTIMENTOS.map((comp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 w-32 shrink-0">{comp}</span>
                  <input type="text" placeholder="m²" className="px-2 py-1.5 rounded-md border border-gray-200 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    value={ficha.medicoes[idx].m2} onChange={e => setMedicao(idx, 'm2', e.target.value)} />
                  <input type="text" placeholder="Observações" className="px-2 py-1.5 rounded-md border border-gray-200 text-xs flex-1 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    value={ficha.medicoes[idx].obs} onChange={e => setMedicao(idx, 'obs', e.target.value)} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className={labelClass}>Área bruta medida / estimada (m²)</label>
                <input type="text" className={inputClass} value={ficha.areaMedida} onChange={e => setTop('areaMedida', e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 sm:mt-6">
                <input type="checkbox" className="w-4 h-4 accent-yellow-500" checked={ficha.discrepancia}
                  onChange={e => setTop('discrepancia', e.target.checked)} />
                Discrepância face ao anunciado
              </label>
            </div>
          </div>

          {/* Estimativa de obra */}
          <div className={sectionClass}>
            <div className={sectionTitle}>Estimativa preliminar de obra</div>
            <div className="space-y-2">
              {OBRA_TRABALHOS.map((trab, idx) => {
                const o = ficha.estimativaObra[idx]
                return (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-sm text-gray-700 flex-1 min-w-0">{trab}</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input type="checkbox" className="w-4 h-4 accent-yellow-500" checked={o.necessario}
                          onChange={e => setObra(idx, 'necessario', e.target.checked)} />
                        Necessário
                      </label>
                      <select className="px-2 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300"
                        value={o.grau} onChange={e => setObra(idx, 'grau', e.target.value)}>
                        <option value="">Grau</option>
                        {GRAUS_OBRA.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                      </select>
                      <input type="text" placeholder="€ custo" className="px-2 py-1.5 rounded-md border border-gray-200 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                        value={o.custo} onChange={e => setObra(idx, 'custo', e.target.value)} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3">
              <label className={labelClass}>Total estimado de obra (€)</label>
              <input type="text" className={inputClass} value={ficha.totalObra} onChange={e => setTop('totalObra', e.target.value)} />
            </div>
          </div>

          {/* Relatorio de visita */}
          <div className={sectionClass}>
            <div className={sectionTitle}>Relatório de visita</div>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Estado real do imóvel</label>
                <textarea rows={3} className={inputClass} value={ficha.relatorio.estadoReal} onChange={e => setRelatorio('estadoReal', e.target.value)} />
              </div>

              <div>
                <label className={labelClass}>Obras necessárias (custo estimado)</label>
                <div className="space-y-2">
                  {RELATORIO_OBRAS.map((trab, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 flex-1 min-w-0">{trab}</span>
                      <input type="text" placeholder="€ custo estimado" className="px-2 py-1.5 rounded-md border border-gray-200 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                        value={ficha.relatorio.obras[idx].custo} onChange={e => setRelatorioObra(idx, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>Pontos fortes do imóvel</label>
                <textarea rows={2} className={inputClass} value={ficha.relatorio.pontosFortes} onChange={e => setRelatorio('pontosFortes', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Pontos fracos / riscos identificados</label>
                <textarea rows={2} className={inputClass} value={ficha.relatorio.pontosFracos} onChange={e => setRelatorio('pontosFracos', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Potencial de valorização</label>
                <textarea rows={2} className={inputClass} value={ficha.relatorio.potencial} onChange={e => setRelatorio('potencial', e.target.value)} />
              </div>

              <div>
                <label className={labelClass}>Decisão</label>
                <div className="space-y-1.5">
                  {DECISOES.map(d => (
                    <label key={d.key} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="decisao" className="mt-0.5 w-4 h-4 accent-yellow-500"
                        checked={ficha.relatorio.decisao === d.key}
                        onChange={() => setRelatorio('decisao', d.key)} />
                      <span>{d.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>Justificação da decisão</label>
                <textarea rows={2} className={inputClass} value={ficha.relatorio.justificacao} onChange={e => setRelatorio('justificacao', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Próximos passos</label>
                <textarea rows={2} className={inputClass} value={ficha.relatorio.proximosPassos} onChange={e => setRelatorio('proximosPassos', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100">
            Fechar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-white text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'A gravar...' : 'Guardar ficha'}
          </button>
        </div>
      </div>
    </div>
  )
}
