/**
 * Registo de Chamada (SOP 2) — separador próprio na ficha do consultor, ao
 * lado de "Ficha do consultor". Tabela para preenchimento rápido: uma linha
 * por chamada (Cold/Discovery/Close Call ou Pivot para Parceria), com data +
 * métricas do tipo. Não depende de follow-ups nem de gravação de áudio — é
 * um registo directo. A leitura agregada destes dados fica na aba
 * "Avaliação de Calls" dentro de Administração.
 */
import { useState, useEffect, useCallback, Fragment } from 'react'
import { Plus, Trash2, Pencil, Check, Loader2, Phone } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { RegistoManualFieldset, inputClass } from './RegistoManualFieldset.jsx'
import { ScorecardBars } from './ScorecardBars.jsx'
import {
  TIPOS_CHAMADA, TIPO_CHAMADA_LABEL, TIPO_CHAMADA_COLOR, REGISTO_FIELD_LABEL,
  CAMPOS_POR_TIPO, fmtRegistoValor, resultadoResumo, fmtDate,
} from '../../constants.js'

const todayISO = () => new Date().toISOString().slice(0, 10)
const REGISTO_KEYS = Object.keys(REGISTO_FIELD_LABEL)

export function RegistoChamadasTab({ consultorId, onUpdate }) {
  const [chamadas, setChamadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [novaData, setNovaData] = useState(todayISO())
  const [novoTipo, setNovoTipo] = useState('')
  const [novoRegisto, setNovoRegisto] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editRegisto, setEditRegisto] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`)
      const data = await r.json()
      setChamadas(Array.isArray(data) ? data.filter(g => g.tipo_chamada) : [])
    } catch { setChamadas([]) }
    setLoading(false)
  }, [consultorId])

  useEffect(() => { if (consultorId) load() }, [consultorId, load])

  async function adicionar() {
    if (!novaData || !novoTipo) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('data_chamada', novaData)
      fd.append('tipo_chamada', novoTipo)
      fd.append('titulo', `${TIPO_CHAMADA_LABEL[novoTipo]} — ${novaData}`)
      for (const k of REGISTO_KEYS) {
        const v = novoRegisto[k]
        if (v === undefined || v === null || v === '') continue
        fd.append(k, String(v))
      }
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`, { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao registar chamada')
      setChamadas(p => [data, ...p])
      setNovaData(todayISO())
      setNovoTipo('')
      setNovoRegisto({})
      setAdding(false)
      onUpdate?.()
    } catch (err) { alert(err.message || 'Falha ao registar chamada') }
    setSaving(false)
  }

  function iniciarEdicao(g) {
    setEditId(g.id)
    setEditRegisto({ tipo_chamada: g.tipo_chamada, ...Object.fromEntries(REGISTO_KEYS.map(k => [k, g[k]])) })
    setExpandedId(g.id)
  }

  async function guardarEdicao(id) {
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/registo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editRegisto, registo_fonte: 'manual' }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao guardar registo')
      setChamadas(p => p.map(g => g.id === id ? data : g))
      setEditId(null)
    } catch (err) { alert(err.message || 'Falha ao guardar registo') }
    setSaving(false)
  }

  async function apagar(id) {
    if (!confirm('Apagar este registo de chamada?')) return
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}`, { method: 'DELETE' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha ao apagar') }
      setChamadas(p => p.filter(g => g.id !== id))
      onUpdate?.()
    } catch (err) { alert(err.message || 'Falha ao apagar') }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Registo de Chamada</p>
            <p className="text-xs text-gray-400">Cold Call, Discovery Call, Close Call e Pivot para Parceria — registo directo, sem áudio</p>
          </div>
        </div>
        <button type="button" onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nova chamada
        </button>
      </div>

      {adding && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-3 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data da chamada</label>
              <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo de chamada</label>
              <select value={novoTipo} onChange={e => { setNovoTipo(e.target.value); setNovoRegisto({}) }} className={inputClass}>
                <option value="">— Escolher —</option>
                {TIPOS_CHAMADA.map(t => <option key={t} value={t}>{TIPO_CHAMADA_LABEL[t]}</option>)}
              </select>
            </div>
          </div>

          <RegistoManualFieldset tipoChamada={novoTipo} registo={novoRegisto}
            onChange={(k, v) => setNovoRegisto(p => ({ ...p, [k]: v }))} />

          <div className="flex gap-2">
            <button type="button" onClick={adicionar} disabled={saving || !novoTipo}
              className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'A registar...' : 'Registar'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setNovoTipo(''); setNovoRegisto({}) }}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-400 text-sm">A carregar...</div>
      ) : chamadas.length === 0 ? (
        <div className="text-center py-4 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Sem chamadas registadas
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Resultado</th>
                <th className="px-3 py-2 font-semibold w-20">Acções</th>
              </tr>
            </thead>
            <tbody>
              {chamadas.map(g => (
                <Fragment key={g.id}>
                  <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(p => p === g.id ? null : g.id)}>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(g.data_chamada)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${TIPO_CHAMADA_COLOR[g.tipo_chamada] || 'bg-gray-100 text-gray-600'}`}>
                        {TIPO_CHAMADA_LABEL[g.tipo_chamada] || g.tipo_chamada}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{resultadoResumo(g)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={e => { e.stopPropagation(); iniciarEdicao(g) }}
                          className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); apagar(g.id) }}
                          className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50" title="Apagar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === g.id && (
                    <tr className="border-t border-gray-100 bg-gray-50/60">
                      <td colSpan={4} className="px-3 py-3">
                        {editId === g.id ? (
                          <div className="space-y-2">
                            <RegistoManualFieldset tipoChamada={editRegisto.tipo_chamada} registo={editRegisto}
                              onChange={(k, v) => setEditRegisto(p => ({ ...p, [k]: v }))} />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => guardarEdicao(g.id)} disabled={saving}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
                              </button>
                              <button type="button" onClick={() => setEditId(null)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : g.tipo_chamada === 'discovery_call' ? (
                          <ScorecardBars g={g} />
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {(CAMPOS_POR_TIPO[g.tipo_chamada] || []).map(k => (
                              <div key={k} className="text-xs text-gray-600">
                                <span className="text-gray-400">{REGISTO_FIELD_LABEL[k]}:</span> {fmtRegistoValor(k, g[k])}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
