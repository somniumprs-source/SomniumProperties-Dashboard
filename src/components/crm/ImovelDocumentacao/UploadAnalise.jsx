import { useState, useRef } from 'react'
import { Upload, FileText, Sparkles, Trash2, RefreshCw, ExternalLink } from 'lucide-react'
import { SEVERIDADE } from './documentacao.config.js'

/**
 * Upload (drag & drop) + análise por IA de cada documento.
 */
export function UploadAnalise({ docs, uploading, uploadErro, analyzing, erros, onUpload, onAnalisar, onAnalisarTodos, onRemoverAnalise, analiseDoFicheiro }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files)
  }

  const porAnalisar = docs.filter(d => !analiseDoFicheiro(d.id)).length

  return (
    <div className="space-y-4">
      {/* Drag & drop */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
        style={{ borderColor: dragOver ? '#C9A84C' : '#e5e7eb', backgroundColor: dragOver ? '#FCF8EC' : '#fafafa' }}>
        <Upload className="w-7 h-7 mb-2" style={{ color: '#C9A84C' }} />
        <p className="text-sm font-medium text-neutral-600">Arrasta documentos para aqui ou clica para escolher</p>
        <p className="text-xs text-neutral-400 mt-1">PDF, JPG/JPEG, PNG ou WEBP · vários ficheiros em simultâneo</p>
        <p className="text-[11px] text-neutral-400 mt-1">A análise por IA é opcional e feita só nos documentos que escolheres.</p>
        {uploading && <p className="text-xs mt-2" style={{ color: '#C9A84C' }}>A carregar…</p>}
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => { if (e.target.files?.length) onUpload(e.target.files); e.target.value = '' }} />
      </div>

      {/* Erro de upload — antes era engolido em silêncio (utilizador via "nada guardado"). */}
      {uploadErro && (
        <div className="px-4 py-3 rounded-xl border border-red-100 bg-red-50">
          <p className="text-xs text-red-700"><strong>Não foi possível guardar:</strong> {uploadErro}</p>
        </div>
      )}

      {docs.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">{docs.length} documento{docs.length > 1 ? 's' : ''} · {porAnalisar} por analisar</span>
          <button onClick={onAnalisarTodos} disabled={porAnalisar === 0 || analyzing.size > 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-white disabled:opacity-40"
            style={{ backgroundColor: '#0a0a0a' }}>
            <Sparkles className="w-3.5 h-3.5" /> Analisar Todos
          </button>
        </div>
      )}

      {/* Lista de documentos + resultado da análise */}
      <div className="space-y-3">
        {docs.map(doc => {
          const analise = analiseDoFicheiro(doc.id)
          const aAnalisar = analyzing.has(doc.id)
          const erro = erros[doc.id]
          return (
            <div key={doc.id} className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
              {/* Cabeçalho do ficheiro */}
              <div className="flex items-center gap-3 px-4 py-3">
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
                  {analise && <p className="text-[11px]" style={{ color: '#888' }}>{analise.tipo_documento}</p>}
                </div>
                {doc.path && (
                  <a href={doc.path} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-neutral-300 hover:text-neutral-600 hover:bg-neutral-50">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {analise ? (
                  <button onClick={() => { onRemoverAnalise(doc.id); }} title="Reanalisar / limpar"
                    className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button onClick={() => onAnalisar(doc)} disabled={aAnalisar}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-50"
                    style={{ backgroundColor: '#C9A84C' }}>
                    {aAnalisar
                      ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />}
                    {aAnalisar ? 'A analisar…' : 'Analisar com IA'}
                  </button>
                )}
              </div>

              {/* Erro */}
              {erro && (
                <div className="px-4 py-3 border-t border-red-100 bg-red-50 flex items-center justify-between gap-3">
                  <p className="text-xs text-red-700">{erro}</p>
                  <button onClick={() => onAnalisar(doc)} className="text-xs font-semibold text-red-700 underline shrink-0">Tentar novamente</button>
                </div>
              )}

              {/* Resultado */}
              {analise && <ResultadoAnalise analise={analise} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultadoAnalise({ analise }) {
  const badge = analise.valido === true
    ? { txt: 'Válido', cor: '#27ae60', bg: '#eafaf0' }
    : analise.valido === 'warning'
      ? { txt: 'Atenção', cor: '#e67e22', bg: '#fdf2e8' }
      : { txt: 'Inválido', cor: '#c0392b', bg: '#fdecea' }

  return (
    <div className="px-4 py-3 border-t border-neutral-100 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: badge.bg, color: badge.cor }}>{badge.txt}</span>
      </div>

      {/* Campos extraídos (máx. 6) */}
      {analise.campos?.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {analise.campos.slice(0, 6).map((c, i) => (
            <div key={i} className="rounded-lg bg-neutral-50 px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-neutral-400 truncate">{c.label}</p>
              <p className="text-xs font-medium text-neutral-700 truncate">{c.valor}</p>
            </div>
          ))}
        </div>
      )}

      {/* Red flags */}
      {analise.flags?.length > 0 && (
        <div className="space-y-1.5">
          {analise.flags.map((f, i) => {
            const sev = SEVERIDADE[f.severity] || SEVERIDADE.info
            return (
              <div key={i} className="flex gap-2 text-xs">
                <span className="shrink-0">{sev.icone}</span>
                <span><strong style={{ color: sev.cor }}>{f.titulo}</strong>{f.descricao ? ` — ${f.descricao}` : ''}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Resumo */}
      {analise.resumo && <p className="text-xs text-neutral-500 leading-relaxed">{analise.resumo}</p>}
    </div>
  )
}
