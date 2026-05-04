/**
 * Container do separador "Obra" da ficha do imóvel (v2 — fiscalmente auditável).
 * Topo: regime fiscal + pisos + notas. Meio: 13 secções colapsáveis.
 * Fim: BDI + quadro fiscal + total bruto sticky.
 */
import { useMemo } from 'react'
import { FileDown, Loader2, AlertTriangle } from 'lucide-react'
import { useOrcamentoObra } from './useOrcamentoObra.js'
import { PisosManager } from './PisosManager.jsx'
import { SeccaoCard } from './SeccaoCard.jsx'
import { SECCOES, REGIMES_FISCAIS } from './seccoesConfig.js'
import { calcOrcamentoObra, validarOrcamento } from '../../db/orcamentoObraEngine.js'
import { getToken } from '../../lib/api.js'

const GOLD = '#C9A84C'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function ObraTab({ imovelId, imovelNome }) {
  const { orcamento, loading, saving, update } = useOrcamentoObra(imovelId)

  const calc = useMemo(() => calcOrcamentoObra(orcamento), [orcamento])
  const avisos = useMemo(() => validarOrcamento(orcamento), [orcamento])

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-gray-400" />
        <p className="text-sm text-gray-400">A carregar orçamento...</p>
      </div>
    )
  }

  const { pisos, seccoes, notas, regime_fiscal, bdi } = orcamento
  const regime = regime_fiscal || 'normal'
  const regimeMeta = REGIMES_FISCAIS.find(r => r.key === regime) || REGIMES_FISCAIS[0]
  const seccoesObra = SECCOES.filter(s => s.grupo === 'obra')
  const seccoesExtra = SECCOES.filter(s => s.grupo === 'extra')

  const setPisos = (novos) => update({ pisos: novos })
  const setSeccao = (key, novosDados) => update(prev => ({ ...prev, seccoes: { ...prev.seccoes, [key]: novosDados } }))
  const setNotas = (v) => update({ notas: v })
  const setRegime = (v) => update({ regime_fiscal: v })
  const setBdi = (patch) => update(prev => ({ ...prev, bdi: { ...(prev.bdi || {}), ...patch } }))

  const abrirPDF = async () => {
    const token = await getToken()
    const url = `/api/crm/imoveis/${imovelId}/orcamento-obra/pdf${token ? `?token=${token}` : ''}`
    window.open(url, '_blank')
  }

  const empty = pisos.length === 0 && Object.keys(seccoes || {}).length === 0
  const t = calc.totais

  return (
    <div className="p-4 sm:p-6">
      {/* Topo: título + acções */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Orçamento de obra</h2>
          <p className="text-xs text-gray-500">
            {imovelNome ? `${imovelNome} · ` : ''}
            {saving ? 'A guardar...' : (orcamento.existe ? 'Guardado automaticamente' : 'Por preencher')}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Regime fiscal */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Regime fiscal</h3>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
            className="flex-1 min-w-[260px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
          >
            {REGIMES_FISCAIS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <span className="text-xs text-gray-500">
            IVA por defeito: <strong>{regimeMeta.iva_default}%</strong>
          </span>
        </div>
        {(regime === 'aru' || regime === 'habitacao') && (
          <p className="text-xs text-amber-700 mt-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Confirme documentação obrigatória para a taxa reduzida (declaração do dono da obra, certificação ARU/IHRU, comprovativo morada). Verba 2.32 (habitação) tem regra dos 20% de materiais.
          </p>
        )}
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

      {/* Avisos */}
      {avisos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 space-y-1">
          {avisos.map((a, i) => (
            <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {a.msg}
            </p>
          ))}
        </div>
      )}

      {/* Secções de obra */}
      {seccoesObra.map(s => (
        <SeccaoCard
          key={s.key}
          seccao={s}
          dados={seccoes?.[s.key]}
          pisos={pisos}
          calc={calc.seccoes[s.key]}
          regimeIvaDefault={regimeMeta.iva_default}
          onChange={(novo) => setSeccao(s.key, novo)}
        />
      ))}

      {/* BDI */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">BDI — Imprevistos e margem</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-2 text-sm text-gray-700">
            Imprevistos
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={bdi?.imprevistos_perc ?? ''}
                onChange={(e) => setBdi({ imprevistos_perc: e.target.value === '' ? 0 : Number(e.target.value) })}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                placeholder="0"
                step="any"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-gray-700">
            Margem empreiteiro
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={bdi?.margem_perc ?? ''}
                onChange={(e) => setBdi({ margem_perc: e.target.value === '' ? 0 : Number(e.target.value) })}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                placeholder="0"
                step="any"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          </label>
        </div>
        {(calc.bdi.imprevistos_base > 0 || calc.bdi.margem_base > 0) && (
          <p className="text-xs text-gray-500 mt-2">
            Base obra: {EUR(t.base_obra)} → Imprevistos: {EUR(calc.bdi.imprevistos_base)} · Margem: {EUR(calc.bdi.margem_base)}
          </p>
        )}
      </div>

      {/* Licenciamento */}
      {seccoesExtra.map(s => (
        <SeccaoCard
          key={s.key}
          seccao={s}
          dados={seccoes?.[s.key]}
          pisos={pisos}
          calc={calc.seccoes[s.key]}
          regimeIvaDefault={regimeMeta.iva_default}
          onChange={(novo) => setSeccao(s.key, novo)}
        />
      ))}

      {/* Quadro fiscal */}
      <div className="bg-white border-2 border-gray-300 rounded-xl p-4 my-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Resumo fiscal</h3>
        <div className="space-y-1.5 text-sm">
          <Linha label="Base tributável (obra + BDI)"     valor={t.base_obra_com_bdi} />
          <Linha label="Base tributável (licenciamento)"  valor={t.base_licenciamento} />
          <Linha label="Base total"                       valor={t.base_geral} destaque />
          <Linha label="IVA liquidado"                    valor={t.iva_geral} />
          <Linha label="Bruto fiscal"                     valor={t.bruto_geral} destaque />
          {t.iva_autoliquidado > 0 && <Linha label="(-) IVA autoliquidado p/ adquirente" valor={-t.iva_autoliquidado} />}
          {t.retencoes_irs > 0 && <Linha label="(-) Retenções IRS a entregar AT" valor={-t.retencoes_irs} />}
          <Linha label="= Total a pagar a prestadores"    valor={t.a_pagar} destaque />
        </div>
      </div>

      {/* Total geral sticky */}
      <div
        className="sticky bottom-0 mt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 flex items-center justify-between border-t-2"
        style={{ backgroundColor: '#0d0d0d', borderColor: GOLD }}
      >
        <div>
          <span className="text-xs uppercase tracking-widest" style={{ color: GOLD }}>Total bruto fiscal</span>
          <p className="text-xs text-gray-400 mt-0.5">Sincroniza com custo_estimado_obra ao guardar</p>
        </div>
        <span className="text-2xl font-bold" style={{ color: GOLD }}>{EUR(calc.total_geral)}</span>
      </div>
    </div>
  )
}

function Linha({ label, valor, destaque }) {
  return (
    <div className={`flex items-center justify-between ${destaque ? 'bg-gray-50 px-2 py-1 rounded font-semibold text-gray-900' : 'text-gray-700'}`}>
      <span>{label}</span>
      <span>{EUR(valor)}</span>
    </div>
  )
}
