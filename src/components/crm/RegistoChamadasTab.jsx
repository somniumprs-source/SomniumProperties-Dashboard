/**
 * Registo de Chamada (SOP 2) — separador próprio na ficha do consultor, ao
 * lado de "Ficha do consultor". Tabela para preenchimento rápido: uma linha
 * por chamada, com data + todas as métricas disponíveis (Cold Call, Discovery
 * Call, Close Call, Pivot para Parceria) juntas no mesmo formulário — a mesma
 * chamada cobre muitas vezes várias fases seguidas (cold call que passa logo
 * a discovery, por exemplo), por isso não se obriga a escolher um tipo à
 * partida: o utilizador preenche só os campos que se aplicaram. Não depende
 * de follow-ups nem de gravação de áudio — é um registo directo. A leitura
 * agregada destes dados fica na aba "Avaliação de Calls" dentro de
 * Administração.
 */
import { useState, useEffect, useCallback, Fragment } from 'react'
import { Plus, Trash2, Pencil, Check, Loader2, Phone } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'
import { RegistoManualFieldset, inputClass } from './RegistoManualFieldset.jsx'
import { ScorecardBars } from './ScorecardBars.jsx'
import {
  TIPO_CHAMADA_LABEL, TIPO_CHAMADA_COLOR, REGISTO_FIELD_LABEL, CAMPOS_POR_TIPO,
  fmtRegistoValor, resultadoResumo, estagiosCobertos, temDiscovery, fmtDate,
} from '../../constants.js'

const todayISO = () => new Date().toISOString().slice(0, 10)
const REGISTO_KEYS = Object.keys(REGISTO_FIELD_LABEL)
const registoPreenchido = r => REGISTO_KEYS.some(k => r[k] !== undefined && r[k] !== null && r[k] !== '')

function EstagiosBadges({ g }) {
  const estagios = estagiosCobertos(g)
  if (estagios.length === 0) return <span className="text-xs text-ink-muted">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {estagios.map(e => (
        <span key={e} className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${TIPO_CHAMADA_COLOR[e] || 'bg-surface-muted text-ink-muted'}`}>
          {TIPO_CHAMADA_LABEL[e]}
        </span>
      ))}
    </div>
  )
}

function DetalheChamada({ g }) {
  const estagios = estagiosCobertos(g)
  if (estagios.length === 0) return <p className="text-xs text-ink-muted">Sem campos preenchidos.</p>
  return (
    <div className="space-y-3">
      {temDiscovery(g) && <ScorecardBars g={g} />}
      {estagios.filter(e => e !== 'discovery_call').map(e => (
        <div key={e}>
          <p className="text-xs font-semibold text-ink-muted mb-1">{TIPO_CHAMADA_LABEL[e]}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {(CAMPOS_POR_TIPO[e] || []).filter(k => g[k] != null).map(k => (
              <div key={k} className="text-xs text-ink-muted">
                <span className="text-ink-muted">{REGISTO_FIELD_LABEL[k]}:</span> {fmtRegistoValor(k, g[k])}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function RegistoChamadasTab({ consultorId, onUpdate }) {
  const toast = useToast()
  const [chamadas, setChamadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [novaData, setNovaData] = useState(todayISO())
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
    if (!novaData || !registoPreenchido(novoRegisto)) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('data_chamada', novaData)
      fd.append('titulo', `Chamada — ${novaData}`)
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
      setNovoRegisto({})
      setAdding(false)
      onUpdate?.()
    } catch (err) { toast(friendlyError(err.message || 'Falha ao registar chamada'), 'error') }
    setSaving(false)
  }

  function iniciarEdicao(g) {
    setEditId(g.id)
    setEditRegisto(Object.fromEntries(REGISTO_KEYS.map(k => [k, g[k]])))
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
    } catch (err) { toast(friendlyError(err.message || 'Falha ao guardar registo'), 'error') }
    setSaving(false)
  }

  async function apagar(id) {
    if (!confirm('Apagar este registo de chamada?')) return
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}`, { method: 'DELETE' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha ao apagar') }
      setChamadas(p => p.filter(g => g.id !== id))
      onUpdate?.()
    } catch (err) { toast(friendlyError(err.message || 'Falha ao apagar'), 'error') }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-ink-muted" />
          <div>
            <p className="text-sm font-semibold text-ink">Registo de Chamada</p>
            <p className="text-xs text-ink-muted">Um só formulário com todas as métricas — preenche só as fases que se aplicaram a esta chamada</p>
          </div>
        </div>
        <button type="button" onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-warning text-white hover:bg-warning transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nova chamada
        </button>
      </div>

      {adding && (
        <div className="bg-surface rounded-xl p-3 space-y-3 border border-line">
          <div className="sm:w-1/2">
            <label className="block text-xs text-ink-muted mb-1">Data da chamada</label>
            <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} className={inputClass} />
          </div>

          <RegistoManualFieldset registo={novoRegisto} onChange={(k, v) => setNovoRegisto(p => ({ ...p, [k]: v }))} />

          <div className="flex gap-2">
            <button type="button" onClick={adicionar} disabled={saving || !novaData || !registoPreenchido(novoRegisto)}
              className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-warning hover:bg-warning disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'A registar...' : 'Registar'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setNovoRegisto({}) }}
              className="px-4 py-2 bg-surface-muted text-ink-muted text-xs font-medium rounded-lg hover:bg-line">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-ink-muted text-sm">A carregar...</div>
      ) : chamadas.length === 0 ? (
        <div className="text-center py-4 text-ink-muted text-sm bg-surface rounded-xl border border-dashed border-line">
          Sem chamadas registadas
        </div>
      ) : (
        <div className="border border-line rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">Fases cobertas</th>
                <th className="px-3 py-2 font-semibold">Resultado</th>
                <th className="px-3 py-2 font-semibold w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {chamadas.map(g => (
                <Fragment key={g.id}>
                  <tr className="border-t border-line hover:bg-surface cursor-pointer transition-colors"
                    onClick={() => setExpandedId(p => p === g.id ? null : g.id)}>
                    <td className="px-3 py-2.5 text-ink-muted whitespace-nowrap">{fmtDate(g.data_chamada)}</td>
                    <td className="px-3 py-2.5"><EstagiosBadges g={g} /></td>
                    <td className="px-3 py-2.5 text-ink">{resultadoResumo(g)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={e => { e.stopPropagation(); iniciarEdicao(g) }}
                          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-muted" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); apagar(g.id) }}
                          className="p-1 rounded text-red-400 hover:text-danger hover:bg-danger/10" title="Apagar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === g.id && (
                    <tr className="border-t border-line bg-surface/60">
                      <td colSpan={4} className="px-3 py-3">
                        {editId === g.id ? (
                          <div className="space-y-2">
                            <RegistoManualFieldset registo={editRegisto}
                              onChange={(k, v) => setEditRegisto(p => ({ ...p, [k]: v }))} />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => guardarEdicao(g.id)} disabled={saving}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] flex items-center gap-1.5 disabled:opacity-50">
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
                              </button>
                              <button type="button" onClick={() => setEditId(null)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-muted text-ink-muted hover:bg-line">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <DetalheChamada g={g} />
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
