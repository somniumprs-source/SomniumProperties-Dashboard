/**
 * Container do separador "Obra" da ficha do imóvel.
 * Gere pisos + secções + notas globais + barra de totais sticky + PDF.
 */
import { useMemo } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { useOrcamentoObra } from './useOrcamentoObra.js'
import { PisosManager } from './PisosManager.jsx'
import { SeccaoCard } from './SeccaoCard.jsx'
import { SECCOES } from './seccoesConfig.js'
import { calcOrcamentoObra } from '../../db/orcamentoObraEngine.js'
import { getToken } from '../../lib/api.js'

const GOLD = '#C9A84C'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function ObraTab({ imovelId, imovelNome }) {
  const { orcamento, loading, saving, update } = useOrcamentoObra(imovelId)

  // Cálculo local em tempo real (mesmo motor que o backend)
  const calc = useMemo(() => calcOrcamentoObra(orcamento), [orcamento])

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-gray-400" />
        <p className="text-sm text-gray-400">A carregar orçamento...</p>
      </div>
    )
  }

  const { pisos, seccoes, notas, iva_perc } = orcamento
  const seccoesObra = SECCOES.filter(s => !s.isLicenciamento)
  const seccaoLic = SECCOES.find(s => s.isLicenciamento)

  const setPisos = (novos) => update({ pisos: novos })
  const setSeccao = (key, novosDados) => update(prev => ({ ...prev, seccoes: { ...prev.seccoes, [key]: novosDados } }))
  const setNotas = (v) => update({ notas: v })
  const setIva = (v) => update({ iva_perc: Number(v) || 0 })

  const abrirPDF = async () => {
    const token = await getToken()
    const url = `/api/crm/imoveis/${imovelId}/orcamento-obra/pdf${token ? `?token=${token}` : ''}`
    window.open(url, '_blank')
  }

  const empty = pisos.length === 0 && Object.keys(seccoes || {}).length === 0

  return (
    <div className="p-4 sm:p-6">
      {/* Topo: título + acções */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Orçamento de obra</h2>
          <p className="text-xs text-gray-500">
            {imovelNome ? `${imovelNome} · ` : ''}
            {saving ? 'A guardar...' : (orcamento.existe ? 'Guardado automaticamente' : 'Por preencher')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            IVA
            <input
              type="number"
              value={iva_perc ?? 23}
              onChange={(e) => setIva(e.target.value)}
              className="w-14 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
              step="any"
            />
            %
          </label>
          <button
            onClick={abrirPDF}
            disabled={!orcamento.existe}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#0d0d0d', color: GOLD, border: `1px solid ${GOLD}33` }}
            title={orcamento.existe ? 'Exportar PDF' : 'Guardar dados primeiro'}
          >
            <FileDown className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {empty && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
          Comece por adicionar os pisos do imóvel. Cada secção que dependa de áreas (eletricidade, pavimento, pintura...) replica os campos por piso definido.
        </div>
      )}

      <PisosManager pisos={pisos} onChange={setPisos} />

      {/* Notas globais */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Notas gerais do orçamento</h3>
        <textarea
          value={notas || ''}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Composição, legalidade do edificado, premissas globais..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 resize-none"
          rows={3}
        />
      </div>

      {/* Secções */}
      {seccoesObra.map(s => (
        <SeccaoCard
          key={s.key}
          seccao={s}
          dados={seccoes?.[s.key]}
          pisos={pisos}
          subtotal={calc.subtotais[s.key]}
          acumulado={calc.acumulado[s.key]}
          onChange={(novo) => setSeccao(s.key, novo)}
        />
      ))}

      {/* Total obra */}
      <div className="bg-white border-2 border-gray-300 rounded-xl p-4 my-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Total obra</span>
        <span className="text-xl font-bold text-gray-800">{EUR(calc.total_obra)}</span>
      </div>

      {/* Licenciamento */}
      {seccaoLic && (
        <SeccaoCard
          seccao={seccaoLic}
          dados={seccoes?.[seccaoLic.key]}
          pisos={pisos}
          subtotal={calc.total_licenciamento}
          acumulado={null}
          onChange={(novo) => setSeccao(seccaoLic.key, novo)}
        />
      )}

      {/* Total geral sticky */}
      <div
        className="sticky bottom-0 mt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 flex items-center justify-between border-t-2"
        style={{ backgroundColor: '#0d0d0d', borderColor: GOLD }}
      >
        <div>
          <span className="text-xs uppercase tracking-widest" style={{ color: GOLD }}>Total geral</span>
          <p className="text-xs text-gray-400 mt-0.5">Sincroniza com custo_estimado_obra ao guardar</p>
        </div>
        <span className="text-2xl font-bold" style={{ color: GOLD }}>{EUR(calc.total_geral)}</span>
      </div>
    </div>
  )
}
