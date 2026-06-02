import { useRef, useState } from 'react'
import { Upload, FileText, ExternalLink, Trash2 } from 'lucide-react'

/**
 * Aba de armazenamento livre — documentos avulsos relevantes ao imóvel
 * (orçamentos, comunicações de condomínio, fotos de medidores, etc.)
 * que não fazem parte dos slots canónicos da checklist.
 *
 * Sem análise IA: a IA está reservada à checklist canónica.
 */
export function OutrosDocumentos({ docs, uploading, uploadErro, onUpload, onRemoverDoc }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files, { slot: 'outros' })
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
        style={{ borderColor: dragOver ? '#C9A84C' : '#e5e7eb', backgroundColor: dragOver ? '#FCF8EC' : '#fafafa' }}>
        <Upload className="w-7 h-7 mb-2" style={{ color: '#C9A84C' }} />
        <p className="text-sm font-medium text-neutral-600">Arrasta documentos para aqui ou clica para escolher</p>
        <p className="text-xs text-neutral-400 mt-1">Qualquer formato · vários ficheiros em simultâneo</p>
        {uploading && <p className="text-xs mt-2" style={{ color: '#C9A84C' }}>A carregar…</p>}
        <input ref={inputRef} type="file" multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) onUpload(e.target.files, { slot: 'outros' }); e.target.value = '' }} />
      </div>

      <p className="text-[11px] text-neutral-400">
        Documentos adicionais relevantes que não entram na checklist canónica (orçamentos, comunicações de condomínio, fotos de medidores, etc.).
      </p>

      {uploadErro && (
        <div className="px-4 py-3 rounded-xl border border-red-100 bg-red-50">
          <p className="text-xs text-red-700"><strong>Não foi possível guardar:</strong> {uploadErro}</p>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="rounded-xl border border-neutral-100 bg-white px-4 py-6 text-center">
          <p className="text-xs text-neutral-400">Sem documentos adicionais.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <OutroRow key={doc.id} doc={doc} onRemove={onRemoverDoc} />
          ))}
        </div>
      )}
    </div>
  )
}

function OutroRow({ doc, onRemove }) {
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!window.confirm(`Remover "${doc.name}"?`)) return
    setRemoving(true)
    try { await onRemove(doc.id) } finally { setRemoving(false) }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#fef2f2' }}>
        <FileText className="w-4 h-4" style={{ color: '#c0392b' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-neutral-700 truncate">{doc.name}</p>
          {doc.source === 'drive' && (
            <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Drive</span>
          )}
        </div>
      </div>
      {doc.path && (
        <a href={doc.path} target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-neutral-300 hover:text-neutral-600 hover:bg-neutral-50">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      <button onClick={handleRemove} disabled={removing} title="Remover"
        className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export default OutrosDocumentos
