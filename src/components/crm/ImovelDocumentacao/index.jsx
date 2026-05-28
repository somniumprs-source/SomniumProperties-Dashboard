import { useState } from 'react'
import { ListChecks, UploadCloud, FileBarChart2 } from 'lucide-react'
import { useDocumentacao } from './useDocumentacao.js'
import { Checklist } from './Checklist.jsx'
import { UploadAnalise } from './UploadAnalise.jsx'
import { Relatorio } from './Relatorio.jsx'

/**
 * Módulo de gestão documental com análise por IA — Ficha do Imóvel.
 * 3 sub-secções: Checklist · Upload & Análise · Relatório.
 */
export function ImovelDocumentacao({ imovelId, tipoImovel }) {
  const [sub, setSub] = useState('checklist')
  const d = useDocumentacao(imovelId, tipoImovel)

  if (d.loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-neutral-100 rounded-lg animate-pulse" />
        <div className="h-32 bg-neutral-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  // Tipo de imóvel indefinido/ambíguo → selector (a checklist depende dele).
  if (!d.tipo) {
    return (
      <div className="flex flex-col items-center justify-center py-14 rounded-xl bg-neutral-50 border border-dashed border-neutral-200">
        <p className="text-sm font-medium text-neutral-600 mb-1">Tipo de imóvel não definido</p>
        <p className="text-xs text-neutral-400 mb-4">Escolhe o tipo para gerar a checklist documental correcta.</p>
        <div className="flex gap-2">
          {['apartamento', 'moradia'].map(t => (
            <button key={t} onClick={() => d.setTipoOverride(t)}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white capitalize"
              style={{ backgroundColor: '#C9A84C' }}>
              {t}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const subs = [
    { key: 'checklist', label: 'Checklist', icon: ListChecks },
    { key: 'upload', label: 'Upload & Análise', icon: UploadCloud },
    { key: 'relatorio', label: 'Relatório', icon: FileBarChart2 },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tabs internas */}
      <div className="flex bg-neutral-100 rounded-lg p-0.5 w-fit">
        {subs.map(s => {
          const Icon = s.icon
          const active = sub === s.key
          return (
            <button key={s.key} onClick={() => setSub(s.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                active ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          )
        })}
      </div>

      {sub === 'checklist' && <Checklist checklist={d.checklist} score={d.score} />}
      {sub === 'upload' && (
        <UploadAnalise
          docs={d.docs}
          uploading={d.uploading}
          analyzing={d.analyzing}
          erros={d.erros}
          onUpload={d.upload}
          onAnalisar={d.analisar}
          onAnalisarTodos={d.analisarTodos}
          onRemoverAnalise={d.removerAnalise}
          analiseDoFicheiro={d.analiseDoFicheiro}
        />
      )}
      {sub === 'relatorio' && (
        <Relatorio imovelId={imovelId} checklist={d.checklist} score={d.score} flags={d.flags} />
      )}
    </div>
  )
}

export default ImovelDocumentacao
