import { SEVERIDADE } from './documentacao.config.js'

export function ResultadoAnalise({ analise }) {
  const badge = analise.valido === true
    ? { txt: 'Válido', cor: '#27ae60', bg: '#eafaf0' }
    : analise.valido === 'warning'
      ? { txt: 'Atenção', cor: '#e67e22', bg: '#fdf2e8' }
      : { txt: 'Inválido', cor: '#c0392b', bg: '#fdecea' }

  return (
    <div className="px-4 py-3 border-t border-neutral-100 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: badge.bg, color: badge.cor }}>{badge.txt}</span>
        {analise.tipo_documento && <span className="text-[11px] text-neutral-500">{analise.tipo_documento}</span>}
      </div>

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

      {analise.resumo && <p className="text-xs text-neutral-500 leading-relaxed">{analise.resumo}</p>}
    </div>
  )
}

export default ResultadoAnalise
