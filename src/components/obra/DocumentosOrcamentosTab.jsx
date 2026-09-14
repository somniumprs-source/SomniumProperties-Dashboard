/**
 * Sub-aba "Documentos Orçamentos" da aba Obra.
 * Lista cronologica + formulario inline para importar orçamentos recebidos
 * de fornecedores/empreiteiros (fornecedor, valor, ficheiro).
 */
import { useEffect, useState } from 'react'
import { FileText, Plus, Trash2, ExternalLink, FileDown } from 'lucide-react'
import { apiFetch, openDocument } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v))) return null
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)
}

export function DocumentosOrcamentosTab({ imovelId }) {
  const [documentos, setDocumentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ empreiteiro_id: '', fornecedor: '', valor: '', notas: '', file: null })
  const [saving, setSaving] = useState(false)
  const [construtores, setConstrutores] = useState([])

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'

  async function load() {
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/orcamentos-obra`)
      const data = await r.json()
      setDocumentos(Array.isArray(data) ? data : [])
    } catch { setDocumentos([]) }
    setLoading(false)
  }

  async function loadConstrutores() {
    try {
      const r = await apiFetch('/api/crm/empreiteiros?limit=200')
      const { data } = await r.json()
      setConstrutores(Array.isArray(data) ? data : [])
    } catch { setConstrutores([]) }
  }

  useEffect(() => { load(); loadConstrutores() }, [imovelId])

  // Selecionar um Construtor do pipeline pré-preenche o fornecedor com o nome
  // dele — mantém-se editável para o caso de o orçamento vir de outra pessoa
  // da mesma empresa, mas garante a ligação (empreiteiro_id) para análises futuras.
  function handleConstrutorChange(id) {
    const c = construtores.find(x => x.id === id)
    setForm(f => ({ ...f, empreiteiro_id: id, fornecedor: c ? (c.empresa || c.nome) : f.fornecedor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.fornecedor?.trim()) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('fornecedor', form.fornecedor.trim())
      if (form.empreiteiro_id) fd.append('empreiteiro_id', form.empreiteiro_id)
      if (form.valor) fd.append('valor', form.valor)
      if (form.notas?.trim()) fd.append('notas', form.notas.trim())
      if (form.file) fd.append('file', form.file)
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/orcamentos-obra`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao importar orçamento')
      setForm({ empreiteiro_id: '', fornecedor: '', valor: '', notas: '', file: null })
      setShowForm(false)
      await load()
    } catch (err) {
      alert(err.message || 'Erro ao importar orçamento')
    }
    setSaving(false)
  }

  async function handleDelete(docId) {
    if (!confirm('Remover este orçamento?')) return
    try {
      await apiFetch(`/api/crm/imoveis/${imovelId}/orcamentos-obra/${docId}`, { method: 'DELETE' })
      await load()
    } catch {}
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">A carregar...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Orçamentos recebidos ({documentos.length})</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Importar Orçamento
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Construtor (pipeline) — opcional</label>
            <select value={form.empreiteiro_id} onChange={e => handleConstrutorChange(e.target.value)} className={inputClass}>
              <option value="">— Não listado / outro fornecedor —</option>
              {construtores.map(c => (
                <option key={c.id} value={c.id}>{c.empresa || c.nome}{c.empresa && c.nome ? ` (${c.nome})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fornecedor</label>
              <input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Ex: Construções Silva & Filhos" className={inputClass} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Valor (€) — opcional</label>
              <input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
            <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observações..." className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ficheiro (PDF, DOCX, XLSX...)</label>
            <input type="file" onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
              className="w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-xs file:font-medium hover:file:bg-indigo-100" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {documentos.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Nenhum orçamento importado.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {documentos.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 py-3 group">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.fornecedor}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {doc.empreiteiro_id && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600" title="Ligado ao Construtor no pipeline">
                      {doc.empreiteiro_empresa || doc.empreiteiro_nome}
                    </span>
                  )}
                  {EUR(doc.valor) && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{EUR(doc.valor)}</span>}
                  <span>{fmtDate(doc.created_at)}</span>
                </div>
                {doc.notas && <p className="text-xs text-gray-400 mt-0.5 truncate">{doc.notas}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {doc.storage_path && (
                  <>
                    <button
                      type="button"
                      onClick={() => openDocument(`/api/crm/imoveis/${imovelId}/orcamentos-obra/${doc.id}/ficheiro`).catch(() => {})}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600"
                      title="Abrir o ficheiro"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openDocument(`/api/crm/imoveis/${imovelId}/orcamentos-obra/${doc.id}/ficheiro`, { download: true, filename: doc.fornecedor }).catch(() => {})}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600"
                      title="Descarregar o ficheiro"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  title="Remover"
                >
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
