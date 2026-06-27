/**
 * Seccao de interaccoes com consultor na ficha do imovel.
 * Registar data + descricao de contactos. Grava em consultor_interacoes com imovel_id.
 */
import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Plus, ChevronDown, ChevronUp, Trash2, Mic } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'
import { GravacaoCard } from './GravacaoCard.jsx'

const fmtDia = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d } }

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
  const [followups, setFollowups] = useState([])
  const [gravacoes, setGravacoes] = useState([])
  const [busy, setBusy] = useState({})

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/interacoes`)
      const data = await r.json()
      setInteracoes(Array.isArray(data) ? data : [])
    } catch { setInteracoes([]) }
    setLoading(false)
  }

  const loadGravacoes = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/gravacoes`)
      const d = await r.json()
      setGravacoes(Array.isArray(d) ? d : [])
    } catch { setGravacoes([]) }
  }, [imovelId])

  const loadConversas = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/followups`)
      const d = await r.json()
      setFollowups(Array.isArray(d) ? d : [])
    } catch { setFollowups([]) }
    await loadGravacoes()
  }, [imovelId, loadGravacoes])

  useEffect(() => { if (imovelId) { load(); loadConversas() } }, [imovelId, loadConversas])

  // Polling enquanto houver gravacoes em processamento.
  const temPendentes = gravacoes.some(g => ['pendente', 'a_transcrever', 'a_analisar'].includes(g.estado))
  useEffect(() => {
    if (!temPendentes) return
    const t = setInterval(loadGravacoes, 10000)
    return () => clearInterval(t)
  }, [temPendentes, loadGravacoes])

  async function analisarGravacao(id) {
    setBusy(p => ({ ...p, [id]: 'analisar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/analisar`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha na analise')
      setGravacoes(p => p.map(g => g.id === id ? d : g))
    } catch (err) { alert(err.message || 'Falha na analise') }
    setBusy(p => ({ ...p, [id]: null }))
  }
  async function retomarGravacao(id) {
    setBusy(p => ({ ...p, [id]: 'retomar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/retomar`, { method: 'POST' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha') }
      await loadGravacoes()
    } catch (err) { alert(err.message || 'Falha') }
    setBusy(p => ({ ...p, [id]: null }))
  }
  async function apagarGravacao(id) {
    if (!confirm('Apagar esta gravacao e a respectiva analise?')) return
    setBusy(p => ({ ...p, [id]: 'apagar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}`, { method: 'DELETE' })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Falha ao apagar') }
      setGravacoes(p => p.filter(g => g.id !== id))
    } catch (err) { alert(err.message || 'Falha ao apagar'); setBusy(p => ({ ...p, [id]: null })) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.notas?.trim() || !form.consultor_id) return
    setSaving(true)
    try {
      const res = await apiFetch('/api/crm/consultor-interacoes', {
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${res.status} ao registar`)
      }
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

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30'

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-2"
      >
        <MessageSquare className="w-4 h-4 text-brand-gold" />
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-gold text-white hover:bg-[#b8973f] transition-colors"
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
                  className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-brand-gold hover:bg-[#b8973f] transition-colors disabled:opacity-50">
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

          {/* Historico de conversas (follow-ups + gravacoes ligados a este imovel) */}
          {(() => {
            const fuIds = new Set(followups.map(f => f.id))
            const gravByFu = id => gravacoes.filter(g => g.followup_id === id)
            const orfas = gravacoes.filter(g => !g.followup_id || !fuIds.has(g.followup_id))
            const gravProps = id => ({ busy: busy[id], onAnalisar: analisarGravacao, onRetomar: retomarGravacao, onApagar: apagarGravacao })
            if (followups.length === 0 && orfas.length === 0) return null
            return (
              <div className="pt-3 mt-1 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Mic className="w-3.5 h-3.5" /> Histórico de conversas ({followups.length + orfas.length})
                </p>
                <div className="space-y-2">
                  {followups.map(f => {
                    const gravs = gravByFu(f.id)
                    return (
                      <div key={f.id} className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-medium text-amber-700">{fmtDia(f.data)}</span>
                          {f.consultor_nome && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{f.consultor_nome}</span>
                          )}
                          {gravs.length > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-700 flex items-center gap-1">
                              <Mic className="w-3 h-3" /> {gravs.length}
                            </span>
                          )}
                        </div>
                        {f.motivo && <p className="text-sm text-gray-800 whitespace-pre-line">{f.motivo}</p>}
                        {gravs.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {gravs.map(g => <GravacaoCard key={g.id} g={g} {...gravProps(g.id)} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {orfas.map(g => <GravacaoCard key={g.id} g={g} {...gravProps(g.id)} />)}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
