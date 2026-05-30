import { useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Upload, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { CHECKLIST_DOCUMENTACAO, getDocBySlot, resumoChecklist } from './checklist.config.js'

/**
 * Checklist canónica de documentação do imóvel. Cada slot tem o seu botão
 * "Importar" — o ficheiro escolhido é enviado já marcado com o slot, ficando
 * explicitamente ligado àquela linha. Os documentos com slot são depois
 * anexados ao Dossier de Investimento.
 */
export function Checklist({ docs, uploading, onUpload, onRemoverDoc }) {
  const resumo = resumoChecklist(docs)

  return (
    <div className="space-y-4">
      {/* Sumário */}
      <div className="rounded-xl border border-neutral-100 bg-white px-4 py-3">
        <p className="text-[10px] uppercase tracking-wide text-neutral-400">Importados</p>
        <p className="text-2xl font-bold text-neutral-700">
          {resumo.importados}<span className="text-neutral-400 text-base font-normal">/{resumo.total}</span>
        </p>
      </div>

      <p className="text-[11px] text-neutral-400">
        Os documentos importados aqui ficam anexados ao Dossier de Investimento entregue ao investidor.
      </p>

      {/* Lista */}
      <div className="space-y-2">
        {CHECKLIST_DOCUMENTACAO.map(item => (
          <SlotRow
            key={item.slot}
            item={item}
            doc={getDocBySlot(docs, item.slot)}
            uploading={uploading}
            onUpload={(files) => onUpload(files, { slot: item.slot })}
            onRemove={onRemoverDoc}
          />
        ))}
      </div>
    </div>
  )
}

function SlotRow({ item, doc, uploading, onUpload, onRemove }) {
  const inputRef = useRef(null)
  const [removing, setRemoving] = useState(false)

  const importado = !!doc

  const badge = importado
    ? { txt: 'Importado', cor: '#27ae60', bg: '#eafaf0', icon: CheckCircle2 }
    : { txt: 'Em falta', cor: '#9ca3af', bg: '#f3f4f6', icon: AlertCircle }
  const BadgeIcon = badge.icon

  async function handleRemove() {
    if (!doc) return
    if (!window.confirm(`Remover "${doc.name}" do slot "${item.titulo}"?`)) return
    setRemoving(true)
    try { await onRemove(doc.id) } finally { setRemoving(false) }
  }

  function handlePick(files) {
    if (!files?.length) return
    onUpload(files)
  }

  return (
    <div className="rounded-xl border border-neutral-100 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-700 truncate">{item.titulo}</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">{item.descricao}</p>
          {doc && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-[11px] text-neutral-500 truncate">
                <span className="font-medium text-neutral-600">{doc.name}</span>
              </p>
              {doc.path && (
                <a href={doc.path} target="_blank" rel="noopener noreferrer"
                  className="p-1 rounded text-neutral-300 hover:text-neutral-600 hover:bg-neutral-50">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0"
          style={{ backgroundColor: badge.bg, color: badge.cor }}>
          <BadgeIcon className="w-3 h-3" /> {badge.txt}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            title={importado ? 'Substituir' : 'Importar'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: importado ? '#0a0a0a' : '#C9A84C' }}>
            {importado ? <RefreshCw className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
            {importado ? 'Substituir' : 'Importar'}
          </button>
          {importado && (
            <button onClick={handleRemove} disabled={removing} title="Remover"
              className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <input ref={inputRef} type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => { handlePick(e.target.files); e.target.value = '' }} />
    </div>
  )
}
