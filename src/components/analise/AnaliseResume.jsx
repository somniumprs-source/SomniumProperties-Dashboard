/**
 * Sidebar de resumo da análise — KPIs, lucro, retorno, avisos.
 * Inspirada na sidebar sticky da calculadora standalone.
 */
import { EUR, PCT } from '../../constants.js'

export function AnaliseResume({ analise }) {
  if (!analise) return null

  const a = analise
  const ra = a.retorno_anualizado || 0
  const raColor = ra >= 15 ? 'text-green-600' : ra >= 8 ? 'text-yellow-600' : 'text-red-600'
  const raBg = ra >= 15 ? 'bg-green-50 border-green-200' : ra >= 8 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'

  // Avisos
  const avisos = []
  if (a.vpt > a.compra) avisos.push('VPT superior ao preço de compra — IMT calculado sobre VPT')
  if (a.finalidade === 'Empresa_isencao' && a.meses > 12) avisos.push('Isenção IMT caduca após 12 meses (Lei 56/2023)')
  if (a.lucro_liquido < 0) avisos.push('Prejuízo líquido neste cenário')
  const st = typeof a.stress_tests === 'string' ? JSON.parse(a.stress_tests || 'null') : a.stress_tests
  if (st?.pior?.lucro_liquido < 0) avisos.push('Pior cenário resulta em prejuízo')

  return (
    <div className="space-y-4">
      {/* Veredicto */}
      <div className={`rounded-xl border p-4 text-center ${raBg}`}>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Retorno Anualizado</p>
        <p className={`text-3xl font-bold ${raColor}`}>{PCT(ra)}</p>
        <p className="text-xs mt-1 text-gray-500">
          {ra >= 15 ? 'Negócio atractivo' : ra >= 8 ? 'Analisar com cuidado' : 'Não recomendado'}
        </p>
      </div>

      {/* KPIs grid */}
      <div className="grid grid-cols-2 gap-2">
        <KPI label="Compra" value={EUR(a.compra)} />
        <KPI label="VPT" value={EUR(a.vpt || a.compra)} />
        <KPI label="IMT" value={EUR(a.imt)} />
        <KPI label="Obra c/ IVA" value={EUR(a.obra_com_iva)} />
        <KPI label="Meses" value={a.meses || 6} />
        <KPI label="Capital" value={EUR(a.capital_necessario)} />
        <KPI label="VVR" value={EUR(a.vvr)} />
        <KPI label="Break-even" value={EUR(a.break_even)} />
      </div>

      {/* Lucro */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Lucro Bruto</span>
          <span className="text-sm font-mono font-semibold">{EUR(a.lucro_bruto)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Impostos</span>
          <span className="text-sm font-mono text-red-600">−{EUR(a.impostos)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between">
          <span className="text-xs font-semibold text-gray-700">Lucro Líquido</span>
          <span className={`text-sm font-mono font-bold ${a.lucro_liquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {EUR(a.lucro_liquido)}
          </span>
        </div>
      </div>

      {/* KPI bars */}
      <div className="space-y-2">
        <KPIBar label="RT" value={a.retorno_total} />
        <KPIBar label="RA" value={a.retorno_anualizado} />
        <KPIBar label="CoC" value={a.cash_on_cash} />
      </div>

      {/* Avisos */}
      {avisos.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-yellow-700 uppercase">Avisos</p>
          {avisos.map((a, i) => (
            <p key={i} className="text-xs text-yellow-600">• {a}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function KPI({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-mono font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function KPIBar({ label, value }) {
  const v = value || 0
  const width = Math.min(Math.max(v, 0), 100)
  const color = v >= 15 ? 'bg-green-500' : v >= 8 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="font-mono font-semibold">{PCT(v)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
