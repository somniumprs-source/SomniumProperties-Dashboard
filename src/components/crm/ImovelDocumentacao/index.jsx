import { useState } from 'react'
import { Files, FileBarChart2, ListChecks } from 'lucide-react'
import { useDocumentacao } from './useDocumentacao.js'
import { OutrosDocumentos } from './OutrosDocumentos.jsx'
import { Relatorio } from './Relatorio.jsx'
import { Checklist } from './Checklist.jsx'
import { getDocsChecklist, getDocsOutros } from './checklist.config.js'

/**
 * Módulo de gestão documental com interpretação por IA — Ficha do Imóvel.
 * 3 sub-secções — Checklist (slots canónicos com IA inline) · Outros Documentos (storage livre) · Relatório.
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

  const subs = [
    { key: 'checklist', label: 'Checklist', icon: ListChecks },
    { key: 'outros', label: 'Outros Documentos', icon: Files },
    { key: 'relatorio', label: 'Relatório', icon: FileBarChart2 },
  ]

  const docsChecklist = getDocsChecklist(d.docs)
  const docsOutros = getDocsOutros(d.docs)

  return (
    <div className="space-y-4">
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

      {sub === 'checklist' && (
        <Checklist
          docs={docsChecklist}
          uploading={d.uploading}
          analyzing={d.analyzing}
          erros={d.erros}
          onUpload={d.upload}
          onRemoverDoc={d.removerDoc}
          onAnalisar={d.analisar}
          onRemoverAnalise={d.removerAnalise}
          analiseDoFicheiro={d.analiseDoFicheiro}
        />
      )}
      {sub === 'outros' && (
        <OutrosDocumentos
          docs={docsOutros}
          uploading={d.uploading}
          uploadErro={d.uploadErro}
          onUpload={d.upload}
          onRemoverDoc={d.removerDoc}
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
