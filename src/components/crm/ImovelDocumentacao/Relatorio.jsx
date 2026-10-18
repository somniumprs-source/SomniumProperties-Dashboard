import { useState } from 'react'
import { FileDown, FileText, Eye } from 'lucide-react'
import { openDocument } from '../../../lib/api.js'
import { ESTADOS, SEVERIDADE, TOM, estadoFromValido, DADOS_CHAVE_LABELS } from './documentacao.config.js'

/**
 * Relatório consolidado da documentação importada: contagens, conclusão,
 * inconsistências entre documentos, red flags, análise por documento e export PDF.
 */
export function Relatorio({ imovelId, analises, flags, inconsistencias, resumoEstado: r }) {
  const [exporting, setExporting] = useState(false)

  const temBloqueio = r.nCriticas > 0 || r.problemas > 0 || r.nInconsistencias > 0
  const temAlerta = r.alertas > 0 || flags.some(f => f.severity === 'warning')

  const conclusao = r.analisados === 0
    ? { txt: 'Ainda não analisou nenhum documento. Importe e analise para gerar o relatório.', tom: 'neutro' }
    : temBloqueio
      ? { txt: 'Existem problemas a resolver: flags críticas, documentos inválidos ou inconsistências entre documentos.', tom: 'perigo' }
      : temAlerta
        ? { txt: 'Há alertas a verificar na documentação antes de avançar.', tom: 'aviso' }
        : { txt: 'Documentação analisada sem problemas detectados.', tom: 'sucesso' }

  async function exportarPdf({ download = false } = {}) {
    setExporting(true)
    try {
      await openDocument(`/api/crm/imoveis/${imovelId}/documento/relatorio_documental`, { download, refresh: true })
    } catch { /* openDocument já notificou por toast */ } finally {
      setExporting(false)
    }
  }

  const stats = [
    { label: 'Documentos', valor: r.totalDocs, cls: 'text-ink' },
    { label: 'Analisados', valor: r.analisados, cls: 'text-ink' },
    { label: 'Alertas', valor: r.alertas, cls: r.alertas ? 'text-warning' : 'text-ink' },
    { label: 'Inconsistências', valor: r.nInconsistencias, cls: r.nInconsistencias ? 'text-danger' : 'text-ink' },
  ]

  return (
    <div className="space-y-5">
      {/* Contagens + export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-line bg-surface-raised px-5 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          {stats.map(s => (
            <div key={s.label}>
              <p className="text-overline uppercase text-ink-muted">{s.label}</p>
              <p className={`font-display text-2xl num ${s.cls}`}>{s.valor}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => exportarPdf({ download: false })} disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-line text-ink hover:bg-surface-muted transition-colors duration-fast disabled:opacity-50"
            title="Abrir o PDF numa nova aba">
            <Eye className="w-4 h-4 text-ink-muted" />
            Ver
          </button>
          <button onClick={() => exportarPdf({ download: true })} disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors duration-fast disabled:opacity-50"
            title="Descarregar o PDF para enviar a investidores">
            <FileDown className="w-4 h-4" />
            {exporting ? 'A gerar…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Conclusão */}
      <div className={`rounded-xl px-4 py-3 ${TOM[conclusao.tom].box}`}>
        <p className="text-sm font-medium">{conclusao.txt}</p>
      </div>

      {/* Inconsistências entre documentos */}
      {inconsistencias.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-2">Inconsistências entre documentos ({inconsistencias.length})</p>
          <div className="space-y-2">
            {inconsistencias.map((inc, i) => (
              <div key={i} className="rounded-lg border border-danger/30 px-3 py-2.5 bg-surface-raised">
                <p className="text-xs font-semibold text-danger">
                  {inc.label} divergente entre documentos
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {inc.valores.map((v, j) => (
                    <p key={j} className="text-xs text-ink-muted">
                      <span className="font-medium">{v.valor}</span>
                      <span className="text-ink-muted"> · {v.origem}</span>
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
          <p className="text-xs font-semibold text-ink-muted mb-2">Red flags ({flags.length})</p>
          <div className="space-y-2">
            {flags.map((f, i) => {
              const sev = SEVERIDADE[f.severity] || SEVERIDADE.info
              return (
                <div key={i} className="flex gap-2.5 rounded-lg border border-line px-3 py-2.5 bg-surface-raised">
                  <span className="shrink-0">{sev.icone}</span>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${TOM[sev.tom].text}`}>
                      {f.titulo} <span className="font-normal text-ink-muted">· {f.origem}</span>
                    </p>
                    {f.descricao && <p className="text-xs text-ink-muted mt-0.5">{f.descricao}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Documentos analisados */}
      <div>
        <p className="text-xs font-semibold text-ink-muted mb-2">Documentos analisados</p>
        {analises.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center">
            <p className="text-xs text-ink-muted">Sem documentos analisados.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {analises.map((a, i) => {
              const est = ESTADOS[estadoFromValido(a.valido)]
              const chaves = a.dados_chave
                ? Object.entries(a.dados_chave).filter(([, v]) => v != null && String(v).trim() !== '')
                : []
              return (
                <div key={a.fotoId || i} className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-muted">
                      <FileText className="w-4 h-4 text-ink-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{a.tipo_documento || a.nome_ficheiro || 'Documento'}</p>
                      {a.nome_ficheiro && a.tipo_documento && (
                        <p className="text-caption text-ink-muted truncate">{a.nome_ficheiro}</p>
                      )}
                    </div>
                    <span className={`text-caption font-semibold px-2 py-0.5 rounded-full shrink-0 ${TOM[est.tom].pill}`}>
                      {est.label}
                    </span>
                  </div>
                  {chaves.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                      {chaves.map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-surface px-2.5 py-1.5">
                          <p className="text-overline uppercase text-ink-muted truncate">{DADOS_CHAVE_LABELS[k] || k}</p>
                          <p className="text-xs font-medium text-ink truncate">{String(v)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {a.resumo && <p className="text-xs text-ink-muted leading-relaxed mt-2">{a.resumo}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
