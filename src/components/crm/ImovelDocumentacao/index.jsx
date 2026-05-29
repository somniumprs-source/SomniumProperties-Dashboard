import { useState } from 'react'
import { UploadCloud, FileBarChart2 } from 'lucide-react'
import { useDocumentacao } from './useDocumentacao.js'
import { UploadAnalise } from './UploadAnalise.jsx'
import { Relatorio } from './Relatorio.jsx'

/**
 * Módulo de gestão documental com interpretação por IA — Ficha do Imóvel.
 * Importação livre: 2 sub-secções — Upload & Análise · Relatório.
 */
export function ImovelDocumentacao({ imovelId, tipoImovel }) {
  const [sub, setSub] = useState('upload')
  const d = useDocumentacao(imovelId, tipoImovel)

  if (d.loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-neutral-100 rounded-lg animate-pulse" />
        <div className="h-32 bg-neutral-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  const subs = [
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

      {sub === 'upload' && (
        <UploadAnalise
          docs={d.docs}
          uploading={d.uploading}
          uploadErro={d.uploadErro}
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
        <Relatorio
          imovelId={imovelId}
          analises={d.analises}
          flags={d.flags}
          inconsistencias={d.inconsistencias}
          resumoEstado={d.resumoEstado}
        />
      )}
    </div>
  )
}

export default ImovelDocumentacao
