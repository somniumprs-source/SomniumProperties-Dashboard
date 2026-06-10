/**
 * Tab de chamadas/interações para o painel de detalhe de Investidores.
 * Lista cronológica + formulário inline. Distingue Discovery Call (1.ª chamada
 * a nova lead) de Follow Up Call. Alimenta as métricas do Dashboard Comercial.
 */
import { useState, useEffect } from 'react'
import { Phone, MessageCircle, Mail, Users, ArrowUpRight, ArrowDownLeft, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'

const CANAL_ICON = { Chamada: Phone, WhatsApp: MessageCircle, Email: Mail, Reunião: Users }
const DIRECAO_ICON = { Enviado: ArrowUpRight, Recebido: ArrowDownLeft }
const FINALIDADE_LABEL = { discovery: 'Discovery', follow_up: 'Follow Up' }
const FINALIDADE_STYLE = {
  discovery: 'text-amber-700 bg-amber-50 border-amber-200',
  follow_up: 'text-indigo-700 bg-indigo-50 border-indigo-200',
}

const EMPTY = { canal: 'Chamada', direcao: 'Enviado', finalidade: 'follow_up', notas: '', data_hora: '' }

export function InteracoesInvestidorTab({ investidorId, onUpdate }) {
  const [interacoes, setInteracoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/interacoes`)
      const data = await r.json()
      setInteracoes(Array.isArray(data) ? data : [])
    } catch { setInteracoes([]) }
    setLoading(false)
  }

  useEffect(() => { if (investidorId) load() }, [investidorId])

  // Default inteligente: se ainda não há interações, a 1.ª é Discovery.
  useEffect(() => {
    if (showForm) setForm(f => ({ ...f, finalidade: interacoes.length === 0 ? 'discovery' : 'follow_up' }))
  }, [showForm, interacoes.length])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.notas?.trim() && !form.data_hora) { /* permitir registo só com data */ }
    setSaving(true)
    try {
      await apiFetch('/api/crm/investidor-interacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investidor_id: investidorId,
          canal: form.canal,
          direcao: form.direcao,
          finalidade: form.finalidade,
          notas: form.notas || null,
          data_hora: form.data_hora || new Date().toISOString(),
        }),
      })
      setForm(EMPTY)
      setShowForm(false)
      await load()
      onUpdate?.()
    } catch (err) {
      alert(err.message || 'Erro ao registar')
    }
    setSaving(false)
  }

  async function apagar(id) {
    if (!confirm('Apagar esta interação?')) return
    try {
      await apiFetch(`/api/crm/investidor-interacoes/${id}`, { method: 'DELETE' })
      await load()
      onUpdate?.()
    } catch (err) { alert(err.message || 'Erro ao apagar') }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Chamadas & Interações</p>
        <button onClick={() => setShowForm(s => !s)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: '#0d0d0d', color: '#C9A84C' }}>
          <Plus className="w-3.5 h-3.5" /> Registar
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Tipo</span>
              <select value={form.finalidade} onChange={e => set('finalidade', e.target.value)}
                className="text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white">
                <option value="discovery">Discovery Call</option>
                <option value="follow_up">Follow Up Call</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Canal</span>
              <select value={form.canal} onChange={e => set('canal', e.target.value)}
                className="text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white">
                <option value="Chamada">Chamada</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Email">Email</option>
                <option value="Reunião">Reunião</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Direção</span>
              <select value={form.direcao} onChange={e => set('direcao', e.target.value)}
                className="text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white">
                <option value="Enviado">Enviado por nós</option>
                <option value="Recebido">Recebido</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Data/hora (vazio = agora)</span>
            <input type="datetime-local" value={form.data_hora} onChange={e => set('data_hora', e.target.value)}
              className="text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white" />
          </label>
          <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2}
            placeholder="Notas livres..."
            className="text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY) }}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#C9A84C', color: '#0d0d0d' }}>
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-gray-400 py-4 text-center">A carregar…</p>
      ) : interacoes.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center">Sem interações registadas.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {interacoes.map(it => {
            const CIcon = CANAL_ICON[it.canal] || Phone
            const DIcon = DIRECAO_ICON[it.direcao] || ArrowUpRight
            return (
              <div key={it.id} className="group flex items-start gap-2.5 rounded-xl border border-gray-100 bg-white p-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <CIcon className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${FINALIDADE_STYLE[it.finalidade] || FINALIDADE_STYLE.follow_up}`}>
                      {FINALIDADE_LABEL[it.finalidade] || 'Follow Up'}
                    </span>
                    <span className="text-xs text-gray-700 font-medium">{it.canal}</span>
                    <DIcon className="w-3 h-3 text-gray-400" />
                    <span className="text-[11px] text-gray-400">{fmtDate(it.data_hora)}</span>
                  </div>
                  {it.notas && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap break-words">{it.notas}</p>}
                </div>
                <button onClick={() => apagar(it.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
