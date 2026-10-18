/**
 * Tab de documentos enviados a investidores.
 * Lista cronologica + formulario inline para registar novos envios.
 */
import { useState } from 'react'
import { FileText, Plus, Trash2, ExternalLink, FileDown } from 'lucide-react'
import { apiFetch, openDocument } from '../../lib/api.js'
import { fmtDate } from '../../constants.js'

const TIPO_LABELS_ENVIADO = {
  dossier_investidor: 'Dossier de Investimento',
  proposta_investimento: 'Proposta de Investimento',
  proposta_investimento_anonima: 'Proposta de Investimento (Anonima)',
  proposta_cedencia_posicao: 'Proposta de Cedencia de Posicao',
  relatorio_reuniao: 'Relatorio de Reuniao',
  nda: 'NDA',
  outro: 'Outro',
}

const TIPO_LABELS_RECEBIDO = {
  identificacao: 'Identificacao (CC/Passaporte)',
  comprovativo_morada: 'Comprovativo de Morada',
  comprovativo_fundos: 'Comprovativo de Fundos',
  procuracao: 'Procuracao',
  nda_assinado: 'NDA Assinado',
  contrato_assinado: 'Contrato Assinado',
  certidao_permanente: 'Certidao Permanente / Registo Comercial',
  outro: 'Outro',
}

const TIPO_LABELS_POR_DIRECAO = { enviado: TIPO_LABELS_ENVIADO, recebido: TIPO_LABELS_RECEBIDO }

const SUBTABS = [
  { key: 'enviado', label: 'Enviados' },
  { key: 'recebido', label: 'Recebidos' },
]

export function DocumentosInvestidorTab({ investidorId, documentos: initialDocs, onUpdate, readOnly = false }) {
  const [documentos, setDocumentos] = useState(initialDocs || [])
  const [direcao, setDirecao] = useState('enviado')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tipo: 'dossier_investidor', nome: '', imovel_id: '', notas: '', file: null })
  const [saving, setSaving] = useState(false)

  const TIPO_LABELS = TIPO_LABELS_POR_DIRECAO[direcao]
  const TIPO_OPTIONS = Object.entries(TIPO_LABELS)
  const documentosFiltrados = documentos.filter(d => (d.direcao || 'enviado') === direcao)

  function trocarDirecao(novaDirecao) {
    setDirecao(novaDirecao)
    setShowForm(false)
    setForm(f => ({ ...f, tipo: Object.keys(TIPO_LABELS_POR_DIRECAO[novaDirecao])[0] }))
  }

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
      if (form.file) {
        const fd = new FormData()
        fd.append('file', form.file)
        fd.append('tipo', form.tipo)
        fd.append('nome', form.nome.trim())
        fd.append('direcao', direcao)
        if (form.imovel_id) fd.append('imovel_id', form.imovel_id)
        if (form.notas?.trim()) fd.append('notas', form.notas.trim())
        const r = await apiFetch(`/api/crm/investidores/${investidorId}/documentos`, { method: 'POST', body: fd })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao enviar ficheiro')
      } else {
        await apiFetch(`/api/crm/investidores/${investidorId}/documentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: form.tipo,
            nome: form.nome.trim(),
            direcao,
            imovel_id: form.imovel_id || null,
            notas: form.notas?.trim() || null,
          }),
        })
      }
      setForm({ tipo: Object.keys(TIPO_LABELS)[0], nome: '', imovel_id: '', notas: '', file: null })
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

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'

  return (
    <div className="space-y-4">
      {/* Sub-abas: Enviados / Recebidos */}
      <div className="flex items-center gap-1 border-b border-line">
        {SUBTABS.map(t => {
          const count = documentos.filter(d => (d.direcao || 'enviado') === t.key).length
          return (
            <button
              key={t.key}
              onClick={() => trocarDirecao(t.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                direcao === t.key
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink-muted'
              }`}
            >
              {t.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          Documentos {direcao === 'enviado' ? 'enviados' : 'recebidos'} ({documentosFiltrados.length})
        </h3>
        {!readOnly && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Registar Documento
          </button>
        )}
      </div>

      {/* Form inline */}
      {!readOnly && showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-4 space-y-3 border border-line">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inputClass}>
                {TIPO_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Nome / descricao</label>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Proposta Rua do Clube" className={inputClass} required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Notas (opcional)</label>
            <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observacoes..." className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Ficheiro (opcional — PDF, DOCX, XLSX...)</label>
            <input type="file" onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
              className="w-full text-sm text-ink-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-surface-muted file:text-ink file:text-xs file:font-medium hover:file:bg-surface-muted" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line text-ink-muted hover:bg-surface-muted">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
              {saving ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {documentosFiltrados.length === 0 ? (
        <div className="text-center py-8 text-ink-muted text-sm">
          Nenhum documento {direcao === 'enviado' ? 'enviado' : 'recebido'} registado.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {documentosFiltrados.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 py-3 group">
              <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-ink-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{doc.nome}</p>
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="px-1.5 py-0.5 rounded bg-surface-muted text-ink-muted">{TIPO_LABELS[doc.tipo] || doc.tipo}</span>
                  {doc.imovel_nome && <span>/ {doc.imovel_nome}</span>}
                  <span>{fmtDate(doc.created_at)}</span>
                </div>
                {doc.notas && <p className="text-xs text-ink-muted mt-0.5 truncate">{doc.notas}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {doc.storage_path ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openDocument(`/api/crm/investidores/${investidorId}/documentos/${doc.id}/ficheiro`).catch(() => {})}
                      className="p-1.5 rounded-lg hover:bg-surface-muted text-ink-muted hover:text-ink"
                      title="Abrir o ficheiro enviado"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openDocument(`/api/crm/investidores/${investidorId}/documentos/${doc.id}/ficheiro`, { download: true, filename: doc.nome }).catch(() => {})}
                      className="p-1.5 rounded-lg hover:bg-surface-muted text-ink-muted hover:text-ink"
                      title="Descarregar o ficheiro enviado"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : doc.imovel_id && (
                  <>
                    <button
                      type="button"
                      onClick={() => openDocument(`/api/crm/imoveis/${doc.imovel_id}/relatorio-investidor`).catch(() => {})}
                      className="p-1.5 rounded-lg hover:bg-surface-muted text-ink-muted hover:text-ink"
                      title="Registo sem ficheiro anexado — abrir o dossier atual do imóvel"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openDocument(`/api/crm/imoveis/${doc.imovel_id}/relatorio-investidor`, { download: true }).catch(() => {})}
                      className="p-1.5 rounded-lg hover:bg-surface-muted text-ink-muted hover:text-ink"
                      title="Registo sem ficheiro anexado — descarregar o dossier atual do imóvel"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {!readOnly && (
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-danger/10 text-ink-muted hover:text-danger"
                    title="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
