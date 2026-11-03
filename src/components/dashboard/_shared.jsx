// Componentes e formatadores partilhados pelos departamentos do Dashboard.
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Tabs } from '../ui/Tabs.jsx'

export const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-PT').format(n))
export const fmtPct = (n) => (n == null ? '—' : `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(n)}%`)
export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-PT') : '—')
// null = sem base de cálculo; nunca aparece como 0.
export const pctOuNulo = (v) => (v == null ? null : fmtPct(v))
export const numOuNulo = (v) => (v == null ? null : fmtNum(v))

// Subdivisões de um departamento: nunca há uma vista com tudo misturado.
export function Subdivisoes({ items, value, onChange }) {
  return <Tabs variant="segmented" size="sm" items={items} value={value} onChange={onChange} className="self-start max-w-full overflow-x-auto" />
}

export function Bloco({ titulo, nota, acao, children }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-ui font-semibold text-ink">{titulo}</h3>
          {nota && <p className="text-caption text-ink-muted">{nota}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

// Máximo de 6 números por bloco.
export function Numeros({ children }) {
  return <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">{children}</div>
}

// `itens` = [{ valor, texto, para }]; só entram situações que pedem ação.
export function PrecisaAcao({ itens }) {
  const ativos = itens.filter(i => i.valor > 0)
  return (
    <Bloco titulo="A precisar de ação">
      {ativos.length === 0
        ? <p className="text-sm text-ink-muted rounded-xl border border-line bg-surface-raised px-4 py-3">Nada a precisar de ação.</p>
        : (
          <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
            {ativos.map(i => (
              <li key={i.texto}>
                <Link to={i.para} className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                  <span className="font-semibold num w-8 text-right">{fmtNum(i.valor)}</span>
                  <span className="flex-1">{i.texto}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
    </Bloco>
  )
}

export function RankList({ rows, valueFmt }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface-raised px-4 py-2">
      {rows.map((r, i) => (
        <div key={r.nome || r.origem} className="flex items-center gap-2 text-sm py-1 border-b border-line last:border-0">
          <span className="w-5 text-xs font-bold text-ink-muted">{i + 1}.</span>
          <span className="flex-1 truncate text-ink">{r.nome || r.origem}</span>
          {r.imoveis != null && <span className="text-xs text-ink-muted">{r.imoveis} imóveis</span>}
          <span className="font-semibold text-ink num w-24 text-right">{valueFmt(r.lucroGerado ?? r.lucro)}</span>
        </div>
      ))}
    </div>
  )
}
