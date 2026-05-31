import { useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Upload, ExternalLink, RefreshCw, Trash2, Sparkles } from 'lucide-react'
import { CHECKLIST_DOCUMENTACAO, getDocBySlot, resumoChecklist } from './checklist.config.js'
import { ResultadoAnalise } from './ResultadoAnalise.jsx'

/**
 * Checklist canónica de documentação do imóvel. Cada slot tem botões
 * para importar/substituir o ficheiro e analisar com IA (depois de importado).
 * O resultado da análise expande inline na linha do slot.
 */
export function Checklist({
  docs,
  uploading,
  analyzing,
  erros,
  onUpload,
  onRemoverDoc,
  onAnalisar,
  onRemoverAnalise,
  analiseDoFicheiro,
}) {
  const resumo = resumoChecklist(docs)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-100 bg-white px-4 py-3">
        <p className="text-[10px] uppercase tracking-wide text-neutral-400">Importados</p>
        <p className="text-2xl font-bold text-neutral-700">
          {resumo.importados}<span className="text-neutral-400 text-base font-normal">/{resumo.total}</span>
        </p>
      </div>

      <p className="text-[11px] text-neutral-400">
        Os documentos importados aqui ficam anexados ao Dossier de Investimento entregue ao investidor.
      </p>

      <div className="space-y-2">
        {CHECKLIST_DOCUMENTACAO.map(item => {
          const doc = getDocBySlot(docs, item.slot)
          return (
            <SlotRow
              key={item.slot}
              item={item}
              doc={doc}
              uploading={uploading}
              analyzing={analyzing}
              erro={doc ? erros?.[doc.id] : null}
              analise={doc ? analiseDoFicheiro?.(doc.id) : null}
              onUpload={(files) => onUpload(files, { slot: item.slot })}
              onRemove={onRemoverDoc}
              onAnalisar={onAnalisar}
              onRemoverAnalise={onRemoverAnalise}
            />
          )
        })}
      </div>
    </div>
  )
}

function SlotRow({ item, doc, uploading, analyzing, erro, analise, onUpload, onRemove, onAnalisar, onRemoverAnalise }) {
  const inputRef = useRef(null)
  const [removing, setRemoving] = useState(false)

  const importado = !!doc
  const aAnalisar = doc ? analyzing?.has?.(doc.id) : false

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
    <div className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
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

          {importado && !analise && (
            <button onClick={() => onAnalisar(doc)} disabled={aAnalisar}
              title="Analisar com IA"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#C9A84C' }}>
              {aAnalisar
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {aAnalisar ? 'A analisar…' : 'Analisar IA'}
            </button>
          )}

          {importado && analise && (
            <button onClick={() => onRemoverAnalise(doc.id)} title="Limpar análise / reanalisar"
              className="p-1.5 rounded-lg text-neutral-300 hover:text-neutral-700 hover:bg-neutral-50">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          {importado && (
            <button onClick={handleRemove} disabled={removing} title="Remover documento"
              className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="px-4 py-3 border-t border-red-100 bg-red-50 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">{erro}</p>
          <button onClick={() => onAnalisar(doc)} className="text-xs font-semibold text-red-700 underline shrink-0">
            Tentar novamente
          </button>
        </div>
      )}

      {analise && <ResultadoAnalise analise={analise} />}

      <input ref={inputRef} type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => { handlePick(e.target.files); e.target.value = '' }} />
    </div>
  )
}
