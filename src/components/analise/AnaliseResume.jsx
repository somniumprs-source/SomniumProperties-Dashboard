/**
 * Sidebar de resumo da análise — KPIs, lucro, retorno, avisos.
 */
import { EUR, PCT } from '../../constants.js'


export function AnaliseResume({ analise }) {
  if (!analise) return null
  const a = analise
  const ra = a.retorno_anualizado || 0

  const raConfig = ra >= 15
    ? { cls: 'text-success', caixa: 'bg-success/10 border-success/30', label: 'Negócio atrativo' }
    : ra >= 8
    ? { cls: 'text-warning', caixa: 'bg-warning/10 border-warning/30', label: 'Analisar com cuidado' }
    : { cls: 'text-danger', caixa: 'bg-danger/10 border-danger/30', label: 'Não recomendado' }

  // Avisos
  const avisos = []
  if (a.vpt > a.compra && a.compra > 0) avisos.push('VPT superior à compra — IMT sobre VPT')
  if (a.finalidade === 'Empresa_isencao' && a.meses > 12) avisos.push('Isenção IMT caduca aos 12 meses')
  if (a.lucro_liquido < 0) avisos.push('Prejuízo líquido neste cenário')
  const st = typeof a.stress_tests === 'string' ? JSON.parse(a.stress_tests || 'null') : a.stress_tests
  if (st?.pior?.lucro_liquido < 0) avisos.push('Pior cenário com prejuízo')

  return (
    <div className="space-y-4">
      {/* Veredicto */}
      <div className={`rounded-xl p-5 text-center border ${raConfig.caixa}`}>
        <p className="text-xs text-ink-muted uppercase tracking-wider mb-1">Retorno Anualizado</p>
        <p className={`font-display text-4xl num ${raConfig.cls}`}>{PCT(ra)}</p>
        <p className={`text-xs mt-1.5 ${raConfig.cls}`}>{raConfig.label}</p>
      </div>

      {/* KPIs compactos */}
      <div className="grid grid-cols-2 gap-2">
        <KPI label="Compra" value={EUR(a.compra)} />
        {Number(a.fee_cedencia) > 0 && (
          <>
            <KPI label="Cedência de Posição" value={EUR(a.fee_cedencia)} />
            <KPI label="Compra apresentada" value={EUR((Number(a.compra) || 0) + (Number(a.fee_cedencia) || 0))} highlight />
          </>
        )}
        <KPI label="VVR" value={EUR(a.vvr)} highlight />
        <KPI label="Obra c/ IVA" value={EUR(a.obra_com_iva)} />
        <KPI label="Capital" value={EUR(a.capital_necessario)} />
        <KPI label="Break-even" value={EUR(a.break_even)} />
        <KPI label="Meses" value={a.meses || 6} />
      </div>

      {/* Lucro */}
      <div className="rounded-xl border border-line p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-ink-muted">Lucro Bruto</span>
          <span className="text-sm num font-semibold text-ink">{EUR(a.lucro_bruto)}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-ink-muted">Impostos</span>
          <span className="text-sm num text-danger">−{EUR(a.impostos)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between items-center">
          <span className="text-xs font-bold text-ink">Lucro Líquido</span>
          <span className={`text-base num font-black ${a.lucro_liquido >= 0 ? 'text-success' : 'text-danger'}`}>
            {EUR(a.lucro_liquido)}
          </span>
        </div>
      </div>

      {/* KPI bars */}
      <div className="space-y-2.5">
        <KPIBar label="Retorno Total" value={a.retorno_total} />
        <KPIBar label="Retorno Anualizado" value={a.retorno_anualizado} />
        <KPIBar label="Cash-on-Cash" value={a.cash_on_cash} />
      </div>

      {/* Avisos */}
      {avisos.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
          <p className="text-xs font-bold text-warning mb-1.5">Avisos</p>
          {avisos.map((aviso, i) => (
            <p key={i} className="text-xs text-warning leading-relaxed">• {aviso}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function KPI({ label, value, highlight }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-accent/10' : 'bg-surface'}`}>
      <p className="text-xs text-ink-muted mb-0.5">{label}</p>
      <p className="text-sm num font-semibold text-ink">{value}</p>
    </div>
  )
}

function KPIBar({ label, value }) {
  const v = value || 0
  const width = Math.min(Math.max(v, 0), 100)
  const tom = v >= 15 ? 'success' : v >= 8 ? 'warning' : 'danger'
  const texto = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tom]
  const barra = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tom]
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-muted">{label}</span>
        <span className={`num font-semibold ${texto}`}>{PCT(v)}</span>
      </div>
      <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-[width] duration-moderate ease-entry ${barra}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
