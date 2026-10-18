/**
 * SummaryStat — número de resumo dentro de um cartão (sem moldura própria).
 * Valor sempre em ink; só `red` (atenção) muda a cor do valor.
 */
export function SummaryStat({ label, value, sub, red = false }) {
  return (
    <div className="min-w-0">
      <p className="text-overline uppercase text-ink-muted truncate">{label}</p>
      <p className={`font-display text-2xl num mt-1 truncate ${red ? 'text-danger' : 'text-ink'}`}>{value}</p>
      {sub && <p className="text-caption text-ink-muted mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
