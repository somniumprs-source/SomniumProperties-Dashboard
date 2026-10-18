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
      <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
        <p className="text-overline uppercase text-ink-muted">Importados</p>
        <p className="font-display text-2xl text-ink num">
          {resumo.importados}<span className="text-ink-muted text-base font-normal">/{resumo.total}</span>
        </p>
      </div>

      <p className="text-caption text-ink-muted">
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
    ? { txt: count === 1 ? '1 importado' : `${count} importados`, cls: 'bg-success/10 text-success', icon: CheckCircle2 }
    : { txt: 'Em falta', cls: 'bg-surface-muted text-ink-muted', icon: AlertCircle }
  const BadgeIcon = badge.icon

  function handlePick(files) {
    if (!files?.length) return
    onUpload(files)
  }

  return (
    <div className="rounded-xl border border-line bg-surface-raised overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{item.titulo}</p>
          <p className="text-caption text-ink-muted mt-0.5">{item.descricao}</p>
        </div>

        <span className={`flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
          <BadgeIcon className="w-3 h-3" /> {badge.txt}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            title="Importar"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-line text-ink hover:bg-surface-muted transition-colors duration-fast disabled:opacity-50">
            {importado ? <Plus className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
            Importar
          </button>
        </div>
      </div>

      {importado && (
        <div className="border-t border-line divide-y divide-line bg-surface">
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
          <p className="text-caption text-ink truncate font-medium">{doc.name}</p>
          {doc.path && (
            <a href={doc.path} target="_blank" rel="noopener noreferrer"
              className="p-1 rounded text-ink-muted/70 hover:text-ink-muted hover:bg-surface-muted shrink-0">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!analise && (
            <button onClick={() => onAnalisar(doc)} disabled={aAnalisar}
              title="Analisar com IA"
              className="flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium rounded-lg border border-line text-ink hover:bg-surface-muted transition-colors duration-fast disabled:opacity-50">
              {aAnalisar
                ? <div className="w-3 h-3 border-2 border-ink-muted border-t-transparent rounded-full animate-spin" />
                : <Sparkles className="w-3 h-3 text-accent-ink" />}
              {aAnalisar ? 'A analisar…' : 'Analisar IA'}
            </button>
          )}

          {analise && (
            <button onClick={() => onRemoverAnalise(doc.id)} title="Limpar análise / reanalisar"
              className="p-1.5 rounded-lg text-ink-muted/70 hover:text-ink hover:bg-surface-muted">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button onClick={handleRemove} disabled={removing} title="Remover documento"
            className="p-1.5 rounded-lg text-ink-muted/70 hover:text-danger hover:bg-danger/10 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {erro && (
        <div className="px-4 py-2 border-t border-danger/30 bg-danger/10 flex items-center justify-between gap-3">
          <p className="text-xs text-danger">{erro}</p>
          <button onClick={() => onAnalisar(doc)} className="text-xs font-semibold text-danger underline shrink-0">
            Tentar novamente
          </button>
        </div>
      )}

      {analise && <ResultadoAnalise analise={analise} />}
    </div>
  )
}
