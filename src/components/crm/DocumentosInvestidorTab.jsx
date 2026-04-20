/**
 * Tab de documentos enviados a investidores.
 * Lista cronologica + formulario inline para registar novos envios.
 */
import { useState } from 'react'
import { FileText, Plus, Trash2, ExternalLink } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'

const TIPO_LABELS = {
  dossier_investidor: 'Dossier de Investimento',
  proposta_investimento: 'Proposta de Investimento',
  proposta_investimento_anonima: 'Proposta de Investimento (Anonima)',
  relatorio_reuniao: 'Relatorio de Reuniao',
  nda: 'NDA',
  outro: 'Outro',
}

const TIPO_OPTIONS = Object.entries(TIPO_LABELS)

export function DocumentosInvestidorTab({ investidorId, documentos: initialDocs, onUpdate }) {
  const [documentos, setDocumentos] = useState(initialDocs || [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tipo: 'dossier_investidor', nome: '', imovel_id: '', notas: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/documentos`)
      const data = await r.json()
      setDocumentos(Array.isArray(data) ? data : [])
    } catch { setDocumentos([]) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome?.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/api/crm/investidores/${investidorId}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo,
          nome: form.nome.trim(),
          imovel_id: form.imovel_id || null,
          notas: form.notas?.trim() || null,
        }),
      })
      setForm({ tipo: 'dossier_investidor', nome: '', imovel_id: '', notas: '' })
      setShowForm(false)
      await load()
      if (onUpdate) onUpdate()
    } catch (err) {
      alert(err.message || 'Erro ao registar documento')
    }
    setSaving(false)
  }

  async function handleDelete(docId) {
    if (!confirm('Remover este registo?')) return
    try {
      await apiFetch(`/api/crm/investidores/${investidorId}/documentos/${docId}`, { method: 'DELETE' })
      await load()
      if (onUpdate) onUpdate()
    } catch {}
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Documentos enviados ({documentos.length})</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Registar Documento
        </button>
      </div>

      {/* Form inline */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inputClass}>
                {TIPO_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome / descricao</label>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Proposta Rua do Clube" className={inputClass} required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
            <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observacoes..." className={inputClass} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {documentos.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Nenhum documento registado.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {documentos.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 py-3 group">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.nome}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{TIPO_LABELS[doc.tipo] || doc.tipo}</span>
                  {doc.imovel_nome && <span>/ {doc.imovel_nome}</span>}
                  <span>{fmtDate(doc.created_at)}</span>
                </div>
                {doc.notas && <p className="text-xs text-gray-400 mt-0.5 truncate">{doc.notas}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {doc.imovel_id && (
                  <a
                    href={`/api/crm/imoveis/${doc.imovel_id}/relatorio-investidor`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600"
                    title="Abrir PDF"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
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
