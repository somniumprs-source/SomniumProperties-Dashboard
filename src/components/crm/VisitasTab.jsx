/**
 * Histórico e gestão de visitas a um imóvel.
 * Substitui o campo único `data_visita`. Permite múltiplas visitas com
 * estado (agendada/realizada/cancelada), investidor opcional e notas.
 */
import { useState, useEffect } from 'react'
import { Plus, Trash2, MapPin, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

const ESTADOS = [
  { key: 'agendada',  label: 'Agendada',  color: '#C9A84C', bg: '#FEF3C7', icon: Clock },
  { key: 'realizada', label: 'Realizada', color: '#16a34a', bg: '#DCFCE7', icon: CheckCircle2 },
  { key: 'cancelada', label: 'Cancelada', color: '#dc2626', bg: '#FEE2E2', icon: XCircle },
]
const estadoMeta = (k) => ESTADOS.find(e => e.key === k) || ESTADOS[0]

const RESULTADOS = ['', 'positivo', 'neutro', 'negativo']

const todayISO = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const fmtDateTime = d => {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    return dt.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return d }
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

export function VisitasTab({ imovelId, onUpdate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [investidores, setInvestidores] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ data_hora: todayISO(), estado: 'agendada', investidor_id: '', resultado: '', notas: '' })

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/visitas`)
      const data = await r.json()
      setItems(Array.isArray(data) ? data : [])
    } catch { setItems([]) }
    setLoading(false)
  }

  async function loadInvestidores() {
    try {
      const r = await apiFetch('/api/crm/investidores?limit=500&sort=nome')
      const j = await r.json()
      setInvestidores(j.data || [])
    } catch { setInvestidores([]) }
  }

  useEffect(() => { if (imovelId) { load(); loadInvestidores() } }, [imovelId])

  function resetForm() {
    setForm({ data_hora: todayISO(), estado: 'agendada', investidor_id: '', resultado: '', notas: '' })
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(it) {
    const dt = it.dataHora ? new Date(it.dataHora) : new Date()
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset())
    setForm({
      data_hora: dt.toISOString().slice(0, 16),
      estado: it.estado || 'agendada',
      investidor_id: it.investidorId || '',
      resultado: it.resultado || '',
      notas: it.notas || '',
    })
    setEditingId(it.id)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.data_hora) return
    setSaving(true)
    try {
      const url = editingId ? `/api/crm/visitas/${editingId}` : '/api/crm/visitas'
      const method = editingId ? 'PUT' : 'POST'
      const body = {
        imovel_id: imovelId,
        data_hora: new Date(form.data_hora).toISOString(),
        estado: form.estado,
        investidor_id: form.investidor_id || null,
        resultado: form.resultado || null,
        notas: form.notas?.trim() || null,
      }
      const r = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao gravar')
      }
      resetForm()
      await load()
      onUpdate?.()
    } catch (err) {
      alert(err.message || 'Erro ao gravar visita')
    }
    setSaving(false)
  }

  async function handleEstadoChange(it, novoEstado) {
    try {
      const r = await apiFetch(`/api/crm/visitas/${it.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...it, imovel_id: imovelId, data_hora: it.dataHora, investidor_id: it.investidorId, estado: novoEstado }),
      })
      if (!r.ok) throw new Error('Erro ao atualizar estado')
      await load()
      onUpdate?.()
    } catch (err) {
      alert(err.message || 'Erro')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Apagar esta visita do histórico?')) return
    try {
      await apiFetch(`/api/crm/visitas/${id}`, { method: 'DELETE' })
      await load()
      onUpdate?.()
    } catch (err) {
      alert(err.message || 'Erro ao apagar')
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Histórico de Visitas ({items.length})
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Marcar visita
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data e hora *</label>
              <input type="datetime-local" required value={form.data_hora}
                onChange={e => setForm(p => ({ ...p, data_hora: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Estado</label>
              <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} className={inputClass}>
                {ESTADOS.map(es => <option key={es.key} value={es.key}>{es.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Investidor (opcional)</label>
              <select value={form.investidor_id} onChange={e => setForm(p => ({ ...p, investidor_id: e.target.value }))} className={inputClass}>
                <option value="">— sem investidor (visita interna) —</option>
                {investidores.map(inv => <option key={inv.id} value={inv.id}>{inv.nome}</option>)}
              </select>
            </div>
            {form.estado === 'realizada' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Resultado</label>
                <select value={form.resultado} onChange={e => setForm(p => ({ ...p, resultado: e.target.value }))} className={inputClass}>
                  {RESULTADOS.map(r => <option key={r} value={r}>{r ? r[0].toUpperCase() + r.slice(1) : '— por avaliar —'}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas</label>
            <textarea value={form.notas} rows={3}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} className={inputClass}
              placeholder="O que se observou, feedback do investidor, próximos passos..." />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.data_hora}
              className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50">
              {saving ? 'A gravar...' : (editingId ? 'Atualizar' : 'Registar')}
            </button>
            <button type="button" onClick={resetForm}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">A carregar...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Ainda não há visitas registadas para este imóvel.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => {
            const meta = estadoMeta(it.estado)
            const Icon = meta.icon
            return (
              <div key={it.id} className="rounded-lg border border-gray-200 px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{fmtDateTime(it.dataHora)}</span>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: meta.bg, color: meta.color }}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {it.investidorNome && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700">
                          c/ {it.investidorNome}
                        </span>
                      )}
                      {it.resultado && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-600 capitalize">
                          {it.resultado}
                        </span>
                      )}
                    </div>
                    {it.notas && (
                      <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-line">{it.notas}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {it.estado === 'agendada' && (
                      <button onClick={() => handleEstadoChange(it, 'realizada')}
                        className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                        title="Marcar como realizada">
                        <CheckCircle2 className="w-3.5 h-3.5 inline" /> Realizada
                      </button>
                    )}
                    <button onClick={() => startEdit(it)}
                      className="text-xs px-2 py-1 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                      title="Editar">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(it.id)}
                      className="text-gray-400 hover:text-red-600 transition-colors p-1"
                      title="Apagar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
