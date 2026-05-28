import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { getToken } from '../../../lib/api.js'
import { ESTADOS, SEVERIDADE } from './documentacao.config.js'

/**
 * Relatório consolidado: score, tabela de estados, red flags, conclusão e export PDF.
 */
export function Relatorio({ imovelId, checklist, score, flags }) {
  const [exporting, setExporting] = useState(false)

  const temCritica = flags.some(f => f.severity === 'critical')
  const temErro = checklist.some(c => c.estado === 'erro')
  const temAlerta = flags.some(f => f.severity === 'warning') || checklist.some(c => c.estado === 'warning')
  const pendentes = checklist.filter(c => c.estado === 'pendente').length

  const conclusao = (temCritica || temErro)
    ? { txt: 'Processo NÃO pode avançar para escritura — existem flags críticas ou documentos inválidos.', cor: '#c0392b', bg: '#fdecea' }
    : (temAlerta || pendentes > 0)
      ? { txt: 'Verificar alertas e documentos pendentes antes de agendar a escritura.', cor: '#e67e22', bg: '#fdf2e8' }
      : { txt: 'Dossiê documental completo. Pode avançar para escritura.', cor: '#27ae60', bg: '#eafaf0' }

  async function exportarPdf() {
    setExporting(true)
    try {
      const token = await getToken()
      const qs = token ? `&token=${token}` : ''
      window.open(`/api/crm/imoveis/${imovelId}/documento/relatorio_documental?refresh=1${qs}`, '_blank')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Score + export */}
      <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-5 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-400">Score documental</p>
          <p className="text-3xl font-bold" style={{ color: score === 100 ? '#27ae60' : '#C9A84C' }}>{score}%</p>
        </div>
        <button onClick={exportarPdf} disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
          style={{ backgroundColor: '#0a0a0a' }}>
          <FileDown className="w-4 h-4" style={{ color: '#C9A84C' }} />
          {exporting ? 'A gerar…' : 'Exportar PDF'}
        </button>
      </div>

      {/* Conclusão */}
      <div className="rounded-xl px-4 py-3" style={{ backgroundColor: conclusao.bg }}>
        <p className="text-sm font-semibold" style={{ color: conclusao.cor }}>{conclusao.txt}</p>
      </div>

      {/* Tabela de estado */}
      <div>
        <p className="text-xs font-semibold text-neutral-600 mb-2">Estado dos documentos</p>
        <div className="rounded-xl border border-neutral-100 overflow-hidden divide-y divide-neutral-50">
          {checklist.map(item => {
            const est = ESTADOS[item.estado]
            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 bg-white">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: est.cor }} />
                <span className="flex-1 text-sm text-neutral-700">{item.label}</span>
                <span className="text-[11px] font-semibold" style={{ color: est.cor }}>{est.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Red flags ordenadas */}
      {flags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-600 mb-2">Red flags ({flags.length})</p>
          <div className="space-y-2">
            {flags.map((f, i) => {
              const sev = SEVERIDADE[f.severity] || SEVERIDADE.info
              return (
                <div key={i} className="flex gap-2.5 rounded-lg border border-neutral-100 px-3 py-2.5 bg-white">
                  <span className="shrink-0">{sev.icone}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: sev.cor }}>
                      {f.titulo} <span className="font-normal text-neutral-400">· {f.origem}</span>
                    </p>
                    {f.descricao && <p className="text-xs text-neutral-500 mt-0.5">{f.descricao}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
