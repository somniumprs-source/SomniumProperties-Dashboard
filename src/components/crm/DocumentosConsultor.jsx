/**
 * Documentos da ficha do consultor (apresentações de parceria, propostas…).
 * Cada documento pode ficar associado a uma tarefa da Agenda: aparece então
 * também ao abrir essa tarefa (ver DocumentosTarefa, usado em Agenda.jsx).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { FileDown, FileText, Trash2, Upload, Plus } from 'lucide-react'
import { apiFetch, openDocument } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'

const ACEITES = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx'
const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'
const fmtQuando = v => (v ? `${fmtDate(String(v).slice(0, 10))}${String(v).length > 10 ? ` · ${String(v).slice(11, 16)}` : ''}` : '')
const descarregar = d => openDocument(`/api/crm/consultores/${d.consultor_id}/documentos/${d.id}/ficheiro`, { download: true, filename: d.ficheiro_nome })
  .catch(err => console.error('[documento consultor]', err.message))

export function DocumentosConsultor({ consultorId }) {
  const [docs, setDocs] = useState([])
  const [tarefas, setTarefas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ titulo: '', tarefa_id: '' })
  const [ficheiro, setFicheiro] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/documentos`)
      const d = await r.json()
      setDocs(Array.isArray(d) ? d : [])
    } catch { setDocs([]) }
    setLoading(false)
  }, [consultorId])
  useEffect(() => { if (consultorId) load() }, [consultorId, load])

  // Tarefas por concluir, para associar o documento (mais próximas primeiro).
  useEffect(() => {
    if (!showForm || tarefas.length) return
    apiFetch('/api/tarefas?limit=1000').then(r => r.json()).then(d => {
      const lista = (Array.isArray(d) ? d : d?.data || [])
        .filter(t => !['Concluída', 'Concluida'].includes(t.status) && !t.arquivada)
        .sort((a, b) => String(a.inicio || a.data_limite || '9').localeCompare(String(b.inicio || b.data_limite || '9')))
      setTarefas(lista)
    }).catch(() => {})
  }, [showForm, tarefas.length])

  async function guardar(e) {
    e.preventDefault()
    if (!ficheiro) return setErro('Escolhe o ficheiro.')
    setErro(''); setSaving(true)
    try {
      const fd = new FormData()
      fd.append('ficheiro', ficheiro)
      fd.append('titulo', form.titulo.trim())
      if (form.tarefa_id) fd.append('tarefa_id', form.tarefa_id)
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/documentos`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha ao carregar o documento')
      setForm({ titulo: '', tarefa_id: '' }); setFicheiro(null); if (fileRef.current) fileRef.current.value = ''
      setShowForm(false)
      await load()
    } catch (err) { setErro(err.message) }
    setSaving(false)
  }

  async function apagar(d) {
    if (!window.confirm(`Apagar o documento «${d.titulo}»?`)) return
    const r = await apiFetch(`/api/crm/consultores/${consultorId}/documentos/${d.id}`, { method: 'DELETE' })
    if (r.ok) setDocs(p => p.filter(x => x.id !== d.id))
    else alert((await r.json().catch(() => ({}))).error || 'Falha ao apagar')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Documentos ({docs.length})</h3>
        <button type="button" onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo documento
        </button>
      </div>

      {showForm && (
        <form onSubmit={guardar} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          <div>
            <label htmlFor="doc-cons-ficheiro" className="block text-xs text-gray-500 mb-1">Ficheiro (PDF, PowerPoint, Word ou Excel, até 15 MB)</label>
            <input ref={fileRef} id="doc-cons-ficheiro" type="file" accept={ACEITES} className={inputClass}
              onChange={e => setFicheiro(e.target.files?.[0] || null)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="doc-cons-titulo" className="block text-xs text-gray-500 mb-1">Título (opcional)</label>
              <input id="doc-cons-titulo" type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex.: Apresentação de parceria" className={inputClass} />
            </div>
            <div>
              <label htmlFor="doc-cons-tarefa" className="block text-xs text-gray-500 mb-1">Tarefa da Agenda (opcional)</label>
              <select id="doc-cons-tarefa" value={form.tarefa_id} onChange={e => setForm(p => ({ ...p, tarefa_id: e.target.value }))} className={inputClass}>
                <option value="">— Sem tarefa associada —</option>
                {tarefas.map(t => <option key={t.id} value={t.id}>{fmtQuando(t.inicio || t.data_limite) || 'Sem data'} · {t.tarefa}</option>)}
              </select>
            </div>
          </div>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-white text-xs font-medium rounded-lg bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" /> {saving ? 'A carregar…' : 'Carregar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">Cancelar</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">A carregar...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Sem documentos nesta ficha</div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3 bg-white">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{d.titulo}</p>
                <p className="text-xs text-gray-500 truncate">
                  {d.ficheiro_nome} · {fmtDate(String(d.created_at).slice(0, 10))}
                  {d.tarefa_nome && <> · Tarefa: {d.tarefa_nome}{d.tarefa_quando ? ` (${fmtQuando(d.tarefa_quando)})` : ''}</>}
                </p>
              </div>
              <button type="button" onClick={() => descarregar(d)} title="Descarregar"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-300">
                <FileDown className="w-3 h-3" /> Descarregar
              </button>
              <button type="button" onClick={() => apagar(d)} title="Apagar documento"
                className="flex items-center px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200">
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Documentos associados a uma tarefa (modal de tarefa da Agenda). Sem
// documentos, ou sem acesso ao módulo de consultores, não mostra nada.
export function DocumentosTarefa({ tarefaId }) {
  const [docs, setDocs] = useState([])
  useEffect(() => {
    if (!tarefaId) return
    apiFetch(`/api/crm/consultores/documentos-tarefa/${tarefaId}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
  }, [tarefaId])
  if (!docs.length) return null
  return (
    <div className="sm:col-span-2">
      <p className="text-xs text-gray-500 mb-1">Documentos da reunião</p>
      <ul className="border border-gray-200 dark:border-neutral-700 rounded-lg divide-y divide-gray-100 dark:divide-neutral-800">
        {docs.map(d => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2">
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{d.titulo}</p>
              <p className="text-xs text-gray-500 truncate">{d.consultor_nome ? `Ficha de ${d.consultor_nome} · ` : ''}{d.ficheiro_nome}</p>
            </div>
            <button type="button" onClick={() => descarregar(d)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-300 hover:border-gray-300">
              <FileDown className="w-3 h-3" /> Descarregar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
