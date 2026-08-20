/**
 * Histórico de Follow-ups por consultor.
 * Lista cronológica (mais recente primeiro) + formulário inline para registar nova
 * entrada. Ao registar pode anexar-se logo a gravação da conversa: o áudio é
 * transcrito (Whisper local) e analisado por Claude, e fica ligado à entrada de
 * follow-up. O registo estruturado de chamadas do SOP 2 (Cold/Discovery/Close
 * Call, Pivot para Parceria) vive à parte, no separador "Registo de Chamada"
 * (RegistoChamadasTab.jsx) — não aqui, para não misturar as duas coisas.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Trash2, CalendarClock, Mic, Upload, Loader2, X } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { GravacaoCard } from './GravacaoCard.jsx'
import { inputClass } from './RegistoManualFieldset.jsx'

const todayISO = () => new Date().toISOString().slice(0, 10)
const fmt = d => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d }
}

export function FollowUpsSection({ consultorId, onUpdate }) {
  const [items, setItems] = useState([])
  const [gravacoes, setGravacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ data: todayISO(), motivo: '', proximo_follow_up: '', imovel_id: '' })
  const [audioFile, setAudioFile] = useState(null)
  const [imoveis, setImoveis] = useState([])
  const [busy, setBusy] = useState({})       // { [gravacaoId]: 'analisar' | 'apagar' | 'retomar' }
  const fileRef = useRef(null)

  const loadGravacoes = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`)
      const data = await r.json()
      setGravacoes(Array.isArray(data) ? data : [])
    } catch { setGravacoes([]) }
  }, [consultorId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/followups`)
      const data = await r.json()
      setItems(Array.isArray(data) ? data : [])
    } catch { setItems([]) }
    await loadGravacoes()
    setLoading(false)
  }, [consultorId, loadGravacoes])

  useEffect(() => { if (consultorId) load() }, [consultorId, load])

  // Lista de imoveis para o seletor "Imovel relacionado".
  useEffect(() => {
    let activo = true
    apiFetch('/api/crm/imoveis')
      .then(r => r.json())
      .then(d => { if (activo) setImoveis(Array.isArray(d) ? d : []) })
      .catch(() => { if (activo) setImoveis([]) })
    return () => { activo = false }
  }, [])

  // Polling enquanto houver gravacoes em processamento.
  const temPendentes = gravacoes.some(g => ['pendente', 'a_transcrever', 'a_analisar'].includes(g.estado))
  useEffect(() => {
    if (!temPendentes) return
    const t = setInterval(loadGravacoes, 10000)
    return () => clearInterval(t)
  }, [temPendentes, loadGravacoes])

  function clearAudio() {
    setAudioFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

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
          imovel_id: form.imovel_id || null,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao registar')
      }
      const novo = await r.json().catch(() => ({}))

      // Anexar a gravacao da conversa, ligada a esta entrada de follow-up.
      if (audioFile && novo?.id) {
        try {
          const fd = new FormData()
          fd.append('audio', audioFile)
          fd.append('followup_id', novo.id)
          if (form.imovel_id) fd.append('imovel_id', form.imovel_id)
          fd.append('titulo', form.motivo?.trim() || `Follow-up ${fmt(form.data)}`)
          fd.append('data_chamada', form.data)
          const ru = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`, { method: 'POST', body: fd })
          if (!ru.ok) {
            const eu = await ru.json().catch(() => ({}))
            throw new Error(eu.error || 'Falha no upload da gravacao')
          }
        } catch (err) {
          alert(`Follow-up registado, mas a gravacao falhou: ${err.message || 'erro'}`)
        }
      }

      setForm({ data: todayISO(), motivo: '', proximo_follow_up: '', imovel_id: '' })
      clearAudio()
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

  async function analisarGravacao(id) {
    setBusy(p => ({ ...p, [id]: 'analisar' }))
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/analisar`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha na analise')
      setGravacoes(p => p.map(g => g.id === id ? data : g))
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

  // Guardar registo manual (edicao directa no card ou "Aceitar sugestao" da IA).
  async function salvarRegisto(id, payload, fonte) {
    try {
      const r = await apiFetch(`/api/crm/gravacoes/${id}/registo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, registo_fonte: fonte }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha ao guardar registo')
      setGravacoes(p => p.map(g => g.id === id ? data : g))
    } catch (err) { alert(err.message || 'Falha ao guardar registo') }
  }

  const itemIds = new Set(items.map(it => it.id))
  const gravacoesByFollowup = id => gravacoes.filter(g => g.followup_id === id)
  // As gravacoes do registo estruturado do SOP 2 (tipo_chamada preenchido) vivem
  // no separador "Registo de Chamada" — aqui so mostramos as ligadas a notas.
  const orfas = gravacoes.filter(g => (!g.followup_id || !itemIds.has(g.followup_id)) && !g.tipo_chamada)

  const gravProps = id => ({
    busy: busy[id], onAnalisar: analisarGravacao, onRetomar: retomarGravacao, onApagar: apagarGravacao,
    onRegistoSalvar: salvarRegisto,
  })

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

          <div>
            <label className="block text-xs text-gray-500 mb-1">Imóvel relacionado (opcional)</label>
            <select value={form.imovel_id}
              onChange={e => setForm(p => ({ ...p, imovel_id: e.target.value }))} className={inputClass}>
              <option value="">— Sem imóvel associado —</option>
              {imoveis.map(im => (
                <option key={im.id} value={im.id}>{im.nome || im.morada || im.titulo || im.id}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Se a conversa foi sobre um imóvel, escolhe-o: fica também registada na ficha desse imóvel.</p>
          </div>

          {/* Anexar gravacao da conversa */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Gravação da conversa (opcional)</label>
            <input ref={fileRef} type="file" id="followup-audio" className="hidden"
              accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac,.mp4,.webm"
              onChange={e => setAudioFile(e.target.files?.[0] || null)} />
            {audioFile ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-yellow-200 bg-yellow-50 text-xs text-yellow-800">
                <Mic className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1">{audioFile.name}</span>
                <button type="button" onClick={clearAudio} className="text-yellow-700 hover:text-red-600 shrink-0" title="Remover">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label htmlFor="followup-audio"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 cursor-pointer hover:border-yellow-300 hover:text-yellow-700 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Anexar gravação (mp3, m4a, wav…)
              </label>
            )}
            <p className="text-[11px] text-gray-400 mt-1">Transcrição automática (Whisper local) e análise comercial por IA.</p>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.data}
              className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'A registar...' : 'Registar'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); clearAudio() }}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-400 text-sm">A carregar...</div>
      ) : items.length === 0 && orfas.length === 0 ? (
        <div className="text-center py-4 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Sem follow-ups registados
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => {
            const gravs = gravacoesByFollowup(it.id)
            return (
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
                      {gravs.length > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-white border border-yellow-200 text-yellow-700 flex items-center gap-1">
                          <Mic className="w-3 h-3" /> {gravs.length}
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
                {gravs.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {gravs.map(g => <GravacaoCard key={g.id} g={g} {...gravProps(g.id)} />)}
                  </div>
                )}
              </div>
            )
          })}

          {orfas.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Mic className="w-3.5 h-3.5" /> Outras gravações ({orfas.length})
              </p>
              <div className="space-y-2">
                {orfas.map(g => <GravacaoCard key={g.id} g={g} {...gravProps(g.id)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
