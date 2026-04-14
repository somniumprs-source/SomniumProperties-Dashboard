/**
 * Sidebar de resumo da análise — KPIs, lucro, retorno, avisos.
 */
import { EUR, PCT } from '../../constants.js'

const GOLD = '#C9A84C'

export function AnaliseResume({ analise }) {
  if (!analise) return null
  const a = analise
  const ra = a.retorno_anualizado || 0

  const raConfig = ra >= 15
    ? { color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0', label: 'Negócio atractivo' }
    : ra >= 8
    ? { color: '#d97706', bg: '#fef3c7', border: '#fde68a', label: 'Analisar com cuidado' }
    : { color: '#dc2626', bg: '#fee2e2', border: '#fecaca', label: 'Não recomendado' }

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
      <div className="rounded-xl p-5 text-center" style={{ backgroundColor: raConfig.bg, border: `1px solid ${raConfig.border}` }}>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Retorno Anualizado</p>
        <p className="text-4xl font-black" style={{ color: raConfig.color }}>{PCT(ra)}</p>
        <p className="text-xs mt-1.5" style={{ color: raConfig.color }}>{raConfig.label}</p>
      </div>

      {/* KPIs compactos */}
      <div className="grid grid-cols-2 gap-2">
        <KPI label="Compra" value={EUR(a.compra)} />
        <KPI label="VVR" value={EUR(a.vvr)} highlight />
        <KPI label="Obra c/ IVA" value={EUR(a.obra_com_iva)} />
        <KPI label="Capital" value={EUR(a.capital_necessario)} />
        <KPI label="Break-even" value={EUR(a.break_even)} />
        <KPI label="Meses" value={a.meses || 6} />
      </div>

      {/* Lucro */}
      <div className="rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">Lucro Bruto</span>
          <span className="text-sm font-mono font-semibold text-gray-700">{EUR(a.lucro_bruto)}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">Impostos</span>
          <span className="text-sm font-mono text-red-500">−{EUR(a.impostos)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-700">Lucro Líquido</span>
          <span className={`text-base font-mono font-black ${a.lucro_liquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-700 mb-1.5">Avisos</p>
          {avisos.map((aviso, i) => (
            <p key={i} className="text-xs text-amber-600 leading-relaxed">• {aviso}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function KPI({ label, value, highlight }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: highlight ? GOLD + '12' : '#f9fafb' }}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-mono font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function KPIBar({ label, value }) {
  const v = value || 0
  const width = Math.min(Math.max(v, 0), 100)
  const color = v >= 15 ? '#16a34a' : v >= 8 ? '#d97706' : '#dc2626'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-mono font-semibold" style={{ color }}>{PCT(v)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}
