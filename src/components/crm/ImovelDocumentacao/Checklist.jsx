import { useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Upload, ExternalLink, RefreshCw, Trash2, Sparkles, Plus } from 'lucide-react'
import { CHECKLIST_DOCUMENTACAO, getDocsBySlot, resumoChecklist } from './checklist.config.js'
import { ResultadoAnalise } from './ResultadoAnalise.jsx'

/**
 * Checklist canónica de documentação do imóvel. Cada slot pode ter N ficheiros
 * importados, cada um analisável e removível de forma independente.
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
          const docsSlot = getDocsBySlot(docs, item.slot)
          return (
            <SlotRow
              key={item.slot}
              item={item}
              docs={docsSlot}
              uploading={uploading}
              analyzing={analyzing}
              erros={erros}
              onUpload={(files) => onUpload(files, { slot: item.slot })}
              onRemove={onRemoverDoc}
              onAnalisar={onAnalisar}
              onRemoverAnalise={onRemoverAnalise}
              analiseDoFicheiro={analiseDoFicheiro}
            />
          )
        })}
      </div>
    </div>
  )
}

function SlotRow({ item, docs, uploading, analyzing, erros, onUpload, onRemove, onAnalisar, onRemoverAnalise, analiseDoFicheiro }) {
  const inputRef = useRef(null)

  const count = docs?.length || 0
  const importado = count > 0

  const badge = importado
    ? { txt: count === 1 ? '1 importado' : `${count} importados`, cor: '#27ae60', bg: '#eafaf0', icon: CheckCircle2 }
    : { txt: 'Em falta', cor: '#9ca3af', bg: '#f3f4f6', icon: AlertCircle }
  const BadgeIcon = badge.icon

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
        </div>

        <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0"
          style={{ backgroundColor: badge.bg, color: badge.cor }}>
          <BadgeIcon className="w-3 h-3" /> {badge.txt}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            title="Importar"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#C9A84C' }}>
            {importado ? <Plus className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
            Importar
          </button>
        </div>
      </div>

      {importado && (
        <div className="border-t border-neutral-100 divide-y divide-neutral-100 bg-neutral-50/30">
          {docs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              erro={erros?.[doc.id]}
              aAnalisar={analyzing?.has?.(doc.id)}
              analise={analiseDoFicheiro?.(doc.id)}
              onRemove={onRemove}
              onAnalisar={onAnalisar}
              onRemoverAnalise={onRemoverAnalise}
            />
          ))}
        </div>
      )}

      <input ref={inputRef} type="file" multiple
        className="hidden"
        onChange={e => { handlePick(e.target.files); e.target.value = '' }} />
    </div>
  )
}

function DocRow({ doc, erro, aAnalisar, analise, onRemove, onAnalisar, onRemoverAnalise }) {
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!window.confirm(`Remover "${doc.name}"?`)) return
    setRemoving(true)
    try { await onRemove(doc.id) } finally { setRemoving(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <p className="text-[12px] text-neutral-700 truncate font-medium">{doc.name}</p>
          {doc.path && (
            <a href={doc.path} target="_blank" rel="noopener noreferrer"
              className="p-1 rounded text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 shrink-0">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!analise && (
            <button onClick={() => onAnalisar(doc)} disabled={aAnalisar}
              title="Analisar com IA"
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#C9A84C' }}>
              {aAnalisar
                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Sparkles className="w-3 h-3" />}
              {aAnalisar ? 'A analisar…' : 'Analisar IA'}
            </button>
          )}

          {analise && (
            <button onClick={() => onRemoverAnalise(doc.id)} title="Limpar análise / reanalisar"
              className="p-1.5 rounded-lg text-neutral-300 hover:text-neutral-700 hover:bg-neutral-100">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button onClick={handleRemove} disabled={removing} title="Remover documento"
            className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {erro && (
        <div className="px-4 py-2 border-t border-red-100 bg-red-50 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">{erro}</p>
          <button onClick={() => onAnalisar(doc)} className="text-xs font-semibold text-red-700 underline shrink-0">
            Tentar novamente
          </button>
        </div>
      )}

      {analise && <ResultadoAnalise analise={analise} />}
    </div>
  )
}
