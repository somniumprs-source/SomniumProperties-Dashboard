import { useState } from 'react'
import { FileDown, FileText } from 'lucide-react'
import { getToken, resolveApiUrl } from '../../../lib/api.js'
import { ESTADOS, SEVERIDADE, estadoFromValido, DADOS_CHAVE_LABELS } from './documentacao.config.js'

/**
 * Relatório consolidado da documentação importada: contagens, conclusão,
 * inconsistências entre documentos, red flags, análise por documento e export PDF.
 */
export function Relatorio({ imovelId, analises, flags, inconsistencias, resumoEstado: r }) {
  const [exporting, setExporting] = useState(false)

  const temBloqueio = r.nCriticas > 0 || r.problemas > 0 || r.nInconsistencias > 0
  const temAlerta = r.alertas > 0 || flags.some(f => f.severity === 'warning')

  const conclusao = r.analisados === 0
    ? { txt: 'Ainda não analisou nenhum documento. Importe e analise para gerar o relatório.', cor: '#6b7280', bg: '#f3f4f6' }
    : temBloqueio
      ? { txt: 'Existem problemas a resolver: flags críticas, documentos inválidos ou inconsistências entre documentos.', cor: '#c0392b', bg: '#fdecea' }
      : temAlerta
        ? { txt: 'Há alertas a verificar na documentação antes de avançar.', cor: '#e67e22', bg: '#fdf2e8' }
        : { txt: 'Documentação analisada sem problemas detectados.', cor: '#27ae60', bg: '#eafaf0' }

  async function exportarPdf() {
    setExporting(true)
    try {
      const token = await getToken()
      const qs = token ? `&token=${token}` : ''
      window.open(resolveApiUrl(`/api/crm/imoveis/${imovelId}/documento/relatorio_documental?refresh=1`) + qs, '_blank')
    } finally {
      setExporting(false)
    }
  }

  const stats = [
    { label: 'Documentos', valor: r.totalDocs, cor: '#0a0a0a' },
    { label: 'Analisados', valor: r.analisados, cor: '#C9A84C' },
    { label: 'Alertas', valor: r.alertas, cor: r.alertas ? '#e67e22' : '#27ae60' },
    { label: 'Inconsistências', valor: r.nInconsistencias, cor: r.nInconsistencias ? '#c0392b' : '#27ae60' },
  ]

  return (
    <div className="space-y-5">
      {/* Contagens + export */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-100 bg-white px-5 py-4">
        <div className="grid grid-cols-4 gap-5">
          {stats.map(s => (
            <div key={s.label}>
              <p className="text-[10px] uppercase tracking-wide text-neutral-400">{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.cor }}>{s.valor}</p>
            </div>
          ))}
        </div>
        <button onClick={exportarPdf} disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50 shrink-0"
          style={{ backgroundColor: '#0a0a0a' }}>
          <FileDown className="w-4 h-4" style={{ color: '#C9A84C' }} />
          {exporting ? 'A gerar…' : 'Exportar PDF'}
        </button>
      </div>

      {/* Conclusão */}
      <div className="rounded-xl px-4 py-3" style={{ backgroundColor: conclusao.bg }}>
        <p className="text-sm font-semibold" style={{ color: conclusao.cor }}>{conclusao.txt}</p>
      </div>

      {/* Inconsistências entre documentos */}
      {inconsistencias.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-600 mb-2">Inconsistências entre documentos ({inconsistencias.length})</p>
          <div className="space-y-2">
            {inconsistencias.map((inc, i) => (
              <div key={i} className="rounded-lg border px-3 py-2.5 bg-white" style={{ borderColor: '#f3d6d2' }}>
                <p className="text-xs font-semibold" style={{ color: '#c0392b' }}>
                  {inc.label} divergente entre documentos
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {inc.valores.map((v, j) => (
                    <p key={j} className="text-xs text-neutral-600">
                      <span className="font-medium">{v.valor}</span>
                      <span className="text-neutral-400"> · {v.origem}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Documentos analisados */}
      <div>
        <p className="text-xs font-semibold text-neutral-600 mb-2">Documentos analisados</p>
        {analises.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center">
            <p className="text-xs text-neutral-400">Sem documentos analisados.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {analises.map((a, i) => {
              const est = ESTADOS[estadoFromValido(a.valido)]
              const chaves = a.dados_chave
                ? Object.entries(a.dados_chave).filter(([, v]) => v != null && String(v).trim() !== '')
                : []
              return (
                <div key={a.fotoId || i} className="rounded-xl border border-neutral-100 bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#fef2f2' }}>
                      <FileText className="w-4 h-4" style={{ color: '#c0392b' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-700 truncate">{a.tipo_documento || a.nome_ficheiro || 'Documento'}</p>
                      {a.nome_ficheiro && a.tipo_documento && (
                        <p className="text-[10px] text-neutral-400 truncate">{a.nome_ficheiro}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0"
                      style={{ backgroundColor: est.bg, color: est.cor }}>
                      {est.label}
                    </span>
                  </div>
                  {chaves.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                      {chaves.map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-neutral-50 px-2.5 py-1.5">
                          <p className="text-[9px] uppercase tracking-wide text-neutral-400 truncate">{DADOS_CHAVE_LABELS[k] || k}</p>
                          <p className="text-xs font-medium text-neutral-700 truncate">{String(v)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {a.resumo && <p className="text-xs text-neutral-500 leading-relaxed mt-2">{a.resumo}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
