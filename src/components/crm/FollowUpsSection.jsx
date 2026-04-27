/**
 * Histórico de Follow-ups por consultor.
 * Lista cronológica (mais recente primeiro) + formulário inline para registar nova entrada.
 */
import { useState, useEffect } from 'react'
import { Plus, Trash2, CalendarClock } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

const todayISO = () => new Date().toISOString().slice(0, 10)
const fmt = d => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d }
}

export function FollowUpsSection({ consultorId, onUpdate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ data: todayISO(), motivo: '', proximo_follow_up: '' })

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/followups`)
      const data = await r.json()
      setItems(Array.isArray(data) ? data : [])
    } catch { setItems([]) }
    setLoading(false)
  }

  useEffect(() => { if (consultorId) load() }, [consultorId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.data) return
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: form.data,
          motivo: form.motivo?.trim() || null,
          proximo_follow_up: form.proximo_follow_up || null,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao registar')
      }
      setForm({ data: todayISO(), motivo: '', proximo_follow_up: '' })
      setShowForm(false)
      await load()
      onUpdate?.()
    } catch (err) {
      alert(err.message || 'Erro ao registar follow-up')
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Apagar este follow-up?')) return
    try {
      await apiFetch(`/api/crm/consultores/${consultorId}/followups/${id}`, { method: 'DELETE' })
      await load()
      onUpdate?.()
    } catch (err) {
      alert(err.message || 'Erro ao apagar')
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          Histórico Follow-ups ({items.length})
        </p>
        <button
          type="button"
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Novo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-3 space-y-3 border border-gray-200 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data Follow-up</label>
              <input type="date" required value={form.data}
                onChange={e => setForm(p => ({ ...p, data: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Próximo Follow-up</label>
              <input type="date" value={form.proximo_follow_up}
                onChange={e => setForm(p => ({ ...p, proximo_follow_up: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Motivo / Notas</label>
            <textarea value={form.motivo} rows={2}
              onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))} className={inputClass}
              placeholder="O que se falou, próximos passos..." />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.data}
              className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50">
              {saving ? 'A registar...' : 'Registar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-400 text-sm">A carregar...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-4 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Sem follow-ups registados
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <div key={it.id} className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-yellow-800">{fmt(it.data)}</span>
                    {it.proximo_follow_up && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white border border-yellow-200 text-yellow-700">
                        Próximo: {fmt(it.proximo_follow_up)}
                      </span>
                    )}
                  </div>
                  {it.motivo && (
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{it.motivo}</p>
                  )}
                </div>
                <button onClick={() => handleDelete(it.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors shrink-0"
                  title="Apagar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
