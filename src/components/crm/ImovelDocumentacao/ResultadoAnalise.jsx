import { SEVERIDADE, TOM } from './documentacao.config.js'

export function ResultadoAnalise({ analise }) {
  const badge = analise.valido === true
    ? { txt: 'Válido', tom: 'sucesso' }
    : analise.valido === 'warning'
      ? { txt: 'Atenção', tom: 'aviso' }
      : { txt: 'Inválido', tom: 'perigo' }

  return (
    <div className="px-4 py-3 border-t border-line space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-caption font-semibold px-2 py-0.5 rounded-full ${TOM[badge.tom].pill}`}>{badge.txt}</span>
        {analise.tipo_documento && <span className="text-caption text-ink-muted">{analise.tipo_documento}</span>}
      </div>

      {analise.campos?.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {analise.campos.slice(0, 6).map((c, i) => (
            <div key={i} className="rounded-lg bg-surface px-2.5 py-1.5">
              <p className="text-overline uppercase text-ink-muted truncate">{c.label}</p>
              <p className="text-xs font-medium text-ink truncate">{c.valor}</p>
            </div>
          ))}
        </div>
      )}

      {analise.flags?.length > 0 && (
        <div className="space-y-1.5">
          {analise.flags.map((f, i) => {
            const sev = SEVERIDADE[f.severity] || SEVERIDADE.info
            return (
              <div key={i} className="flex gap-2 text-xs">
                <span className="shrink-0">{sev.icone}</span>
                <span><strong className={TOM[sev.tom].text}>{f.titulo}</strong>{f.descricao ? ` — ${f.descricao}` : ''}</span>
              </div>
            )
          })}
        </div>
      )}

      {analise.resumo && <p className="text-xs text-ink-muted leading-relaxed">{analise.resumo}</p>}
    </div>
  )
}

export default ResultadoAnalise
