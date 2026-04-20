/**
 * Seccao de interaccoes com consultor na ficha do imovel.
 * Registar data + descricao de contactos. Grava em consultor_interacoes com imovel_id.
 */
import { useState, useEffect } from 'react'
import { MessageSquare, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'

export function ImovelInteracoesSection({ imovelId, consultores, onUpdate }) {
  const [interacoes, setInteracoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    consultor_id: consultores[0]?.id || '',
    data_hora: '',
    notas: '',
  })

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/interacoes`)
      const data = await r.json()
      setInteracoes(Array.isArray(data) ? data : [])
    } catch { setInteracoes([]) }
    setLoading(false)
  }

  useEffect(() => { if (imovelId) load() }, [imovelId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.notas?.trim() || !form.consultor_id) return
    setSaving(true)
    try {
      await apiFetch('/api/crm/consultor-interacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultor_id: form.consultor_id,
          imovel_id: imovelId,
          canal: 'Nota',
          direcao: 'Nota',
          notas: form.notas.trim(),
          data_hora: form.data_hora || new Date().toISOString(),
        }),
      })
      setForm(f => ({ ...f, notas: '', data_hora: '' }))
      setShowForm(false)
      await load()
      if (onUpdate) onUpdate()
    } catch (err) {
      alert(err.message || 'Erro ao registar')
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Apagar esta nota?')) return
    try {
      await apiFetch(`/api/crm/consultor-interacoes/${id}`, { method: 'DELETE' })
      await load()
      if (onUpdate) onUpdate()
    } catch {}
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30'

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-2"
      >
        <MessageSquare className="w-4 h-4 text-[#C9A84C]" />
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          Notas de Contacto ({interacoes.length})
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
      </button>

      {expanded && (
        <div className="space-y-2">
          {/* Botao adicionar */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#C9A84C] text-white hover:bg-[#b8973f] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Registar Contacto
          </button>

          {/* Formulario */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
              {consultores.length > 1 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Consultor</label>
                  <select
                    value={form.consultor_id}
                    onChange={e => setForm(f => ({ ...f, consultor_id: e.target.value }))}
                    className={inputClass}
                  >
                    {consultores.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Data do contacto</label>
                <input
                  type="datetime-local"
                  value={form.data_hora}
                  onChange={e => setForm(f => ({ ...f, data_hora: e.target.value }))}
                  className={inputClass}
                  placeholder="Agora (se vazio)"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">O que foi falado</label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={3}
                  className={inputClass}
                  placeholder="Descreva o assunto discutido com o consultor..."
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving || !form.notas?.trim()}
                  className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] transition-colors disabled:opacity-50">
                  {saving ? 'A gravar...' : 'Registar'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Lista de notas */}
          {loading ? (
            <div className="text-center py-4 text-gray-400 text-sm">A carregar...</div>
          ) : interacoes.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-sm">Sem notas de contacto registadas</div>
          ) : (
            <div className="space-y-2">
              {interacoes.map(i => {
                const dataHora = i.data_hora ? new Date(i.data_hora) : null
                const dataStr = dataHora
                  ? `${dataHora.toLocaleDateString('pt-PT')} ${dataHora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
                  : '—'
                return (
                  <div key={i.id} className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-amber-700">{dataStr}</span>
                          {i.consultor_nome && consultores.length > 1 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              {i.consultor_nome}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-line">{i.notas}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(i.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all shrink-0"
                        title="Apagar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
