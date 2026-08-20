/**
 * Histórico de Follow-ups por consultor.
 * Lista cronológica (mais recente primeiro) + formulário inline para registar nova
 * entrada. Ao registar, pode indicar-se o tipo de chamada (SOP 2: Cold/Discovery/
 * Close Call ou Pivot para Parceria) com os respectivos campos manuais — sempre
 * a fonte de verdade — e opcionalmente anexar a gravação da conversa, que é
 * transcrita (Whisper local) e analisada por Claude para sugerir o preenchimento.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Trash2, CalendarClock, Mic, Upload, Loader2, X } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { GravacaoCard } from './GravacaoCard.jsx'
import { RegistoManualFieldset, inputClass } from './RegistoManualFieldset.jsx'
import { TIPOS_CHAMADA, TIPO_CHAMADA_LABEL, DC_CRITERIOS } from '../../constants.js'

const todayISO = () => new Date().toISOString().slice(0, 10)
const fmt = d => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d }
}

const REGISTO_MANUAL_KEYS = [
  'cc_resultado', 'cc_aceita_negociar',
  ...DC_CRITERIOS.map(c => c.key), 'dc_onus_verificado', 'dc_direito_preferencia_esclarecido',
  'cl_resultado', 'cl_valor_ancora', 'cl_valor_contraproposta', 'cl_deadline', 'cl_formalizado_escrito_mesmo_dia',
  'pp_compromisso_confirmado', 'pp_criterios_pesquisa_enviados', 'pp_negocios_fechados',
]

function appendRegisto(fd, registo) {
  for (const k of REGISTO_MANUAL_KEYS) {
    const v = registo[k]
    if (v === undefined || v === null || v === '') continue
    fd.append(k, String(v))
  }
}

export function FollowUpsSection({ consultorId, onUpdate }) {
  const [items, setItems] = useState([])
  const [gravacoes, setGravacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ data: todayISO(), motivo: '', proximo_follow_up: '', imovel_id: '', tipo_chamada: '' })
  const [registo, setRegisto] = useState({})
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

      // Registar a chamada (SOP 2) ligada a esta entrada de follow-up — com ou
      // sem audio: uma Cold Call "nao atendeu", p.ex., nao tem nada para gravar.
      if ((audioFile || form.tipo_chamada) && novo?.id) {
        try {
          const fd = new FormData()
          if (audioFile) fd.append('audio', audioFile)
          fd.append('followup_id', novo.id)
          if (form.imovel_id) fd.append('imovel_id', form.imovel_id)
          fd.append('titulo', form.motivo?.trim() || `Follow-up ${fmt(form.data)}`)
          fd.append('data_chamada', form.data)
          if (form.tipo_chamada) {
            fd.append('tipo_chamada', form.tipo_chamada)
            appendRegisto(fd, registo)
          }
          const ru = await apiFetch(`/api/crm/consultores/${consultorId}/gravacoes`, { method: 'POST', body: fd })
          if (!ru.ok) {
            const eu = await ru.json().catch(() => ({}))
            throw new Error(eu.error || 'Falha no registo da chamada')
          }
        } catch (err) {
          alert(`Follow-up registado, mas o registo da chamada falhou: ${err.message || 'erro'}`)
        }
      }

      setForm({ data: todayISO(), motivo: '', proximo_follow_up: '', imovel_id: '', tipo_chamada: '' })
      setRegisto({})
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
  const orfas = gravacoes.filter(g => !g.followup_id || !itemIds.has(g.followup_id))

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

          {/* Tipo de chamada (SOP 2) + campos manuais por tipo */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo de chamada (SOP 2)</label>
            <select value={form.tipo_chamada}
              onChange={e => { setForm(p => ({ ...p, tipo_chamada: e.target.value })); setRegisto({}) }} className={inputClass}>
              <option value="">— Sem registo SOP 2 (só follow-up) —</option>
              {TIPOS_CHAMADA.map(t => <option key={t} value={t}>{TIPO_CHAMADA_LABEL[t]}</option>)}
            </select>
          </div>

          <RegistoManualFieldset tipoChamada={form.tipo_chamada} registo={registo}
            onChange={(k, v) => setRegisto(p => ({ ...p, [k]: v }))} />

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
            <p className="text-[11px] text-gray-400 mt-1">Opcional — se anexares, é transcrita (Whisper local) e a IA sugere um preenchimento para o registo acima (nunca o substitui sem confirmares).</p>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.data}
              className="px-4 py-2 text-white text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'A registar...' : 'Registar'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); clearAudio(); setRegisto({}) }}
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
