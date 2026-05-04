/**
 * Container do separador "Obra" — layout profissional, navegação por chips,
 * KPIs no topo, secções com tabela de linhas livres editáveis e tabela
 * fiscal final. Tudo guardado automaticamente.
 */
import { useMemo, useState } from 'react'
import { FileDown, Loader2, AlertTriangle, Settings2, ChevronRight } from 'lucide-react'
import { useOrcamentoObra } from './useOrcamentoObra.js'
import { PisosManager } from './PisosManager.jsx'
import { SeccaoCard } from './SeccaoCard.jsx'
import { SECCOES, REGIMES_FISCAIS } from './seccoesConfig.js'
import { calcOrcamentoObra, validarOrcamento } from '../../db/orcamentoObraEngine.js'
import { getToken } from '../../lib/api.js'

const GOLD = '#C9A84C'
const BLACK = '#0d0d0d'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

const PCT = v => {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${Math.round(v * 10) / 10}%`
}

export function ObraTab({ imovelId, imovelNome }) {
  const { orcamento, loading, saving, update } = useOrcamentoObra(imovelId)

  const calc = useMemo(() => calcOrcamentoObra(orcamento), [orcamento])
  const avisos = useMemo(() => validarOrcamento(orcamento), [orcamento])

  const [showSettings, setShowSettings] = useState(false)

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

  const t = calc.totais

  // Atalho: scroll suave para uma secção
  const scrollTo = (key) => {
    const el = document.getElementById(`seccao-${key}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Conta secções preenchidas
  const seccoesPreenchidas = seccoesObra.filter(s => (calc.seccoes[s.key]?.linhas?.length || 0) > 0).length

  return (
    <div className="bg-gray-50 min-h-full">
      {/* ── Header profissional ─────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-gray-400 mb-0.5">
              <span>Orçamento de obra</span>
              {saving ? (
                <span className="flex items-center gap-1 text-amber-600">
                  <Loader2 className="w-3 h-3 animate-spin" /> A guardar
                </span>
              ) : orcamento.existe ? (
                <span className="text-green-600">● Guardado</span>
              ) : (
                <span className="text-gray-400">Por preencher</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 truncate">{imovelNome || 'Sem imóvel'}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: GOLD + '22', color: BLACK }}>
                {regimeMeta.label}
              </span>
              <span className="text-[11px] text-gray-500">
                {pisos.length} piso{pisos.length !== 1 ? 's' : ''} · {seccoesPreenchidas}/{seccoesObra.length} secções preenchidas
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" /> Definições
            </button>
            <button
              onClick={abrirPDF}
              disabled={!orcamento.existe}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: BLACK, color: GOLD, border: `1px solid ${GOLD}33` }}
            >
              <FileDown className="w-3.5 h-3.5" /> Exportar PDF
            </button>
          </div>
        </div>

        {/* KPIs em barras */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Base"         valor={EUR(t.base_geral)} />
          <Kpi label="IVA liquidado" valor={EUR(t.iva_geral)} />
          <Kpi label="A pagar"      valor={EUR(t.a_pagar)} />
          <Kpi label="Total bruto"  valor={EUR(calc.total_geral)} destaque />
        </div>

        {/* Chips de navegação */}
        <div className="flex items-center gap-1.5 overflow-x-auto mt-3 -mx-1 px-1 pb-1">
          {seccoesObra.map(s => {
            const tem = (calc.seccoes[s.key]?.linhas?.length || 0) > 0
            return (
              <button
                key={s.key}
                onClick={() => scrollTo(s.key)}
                className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md whitespace-nowrap transition-colors shrink-0 ${
                  tem ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.label.split(' ')[0]}</span>
                {tem && <span className="text-[9px] opacity-70">●</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Definições colapsáveis */}
        {showSettings && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Regime fiscal</label>
              <select
                value={regime}
                onChange={(e) => setRegime(e.target.value)}
                className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 bg-white"
              >
                {REGIMES_FISCAIS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Define o IVA por defeito da MO. Materiais ficam a 23% por defeito mas podem ser editados linha a linha.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">BDI — Imprevistos e margem</label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={bdi?.imprevistos_perc ?? ''}
                    onChange={(e) => setBdi({ imprevistos_perc: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                    placeholder="0"
                    step="any"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">% imprev.</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={bdi?.margem_perc ?? ''}
                    onChange={(e) => setBdi({ margem_perc: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                    placeholder="0"
                    step="any"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">% margem</span>
                </div>
              </div>
              {(calc.bdi.imprevistos_base > 0 || calc.bdi.margem_base > 0) && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Imprev. {EUR(calc.bdi.imprevistos_base)} · Margem {EUR(calc.bdi.margem_base)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Avisos fiscais */}
        {avisos.length > 0 && (
          <div className="space-y-2">
            {avisos.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs rounded-lg p-3 border ${
                a.tipo === 'fiscal_critico' ? 'bg-red-50 border-red-200 text-red-800'
                : a.tipo === 'aritmetica' ? 'bg-orange-50 border-orange-200 text-orange-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{a.msg}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pisos */}
        <PisosManager pisos={pisos} onChange={setPisos} />

        {/* Notas globais */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Notas gerais</label>
          <textarea
            value={notas || ''}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Composição, premissas globais, legalidade do edificado..."
            className="w-full mt-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 resize-none"
            rows={2}
          />
        </div>

        {/* Secções de obra */}
        {seccoesObra.map(s => (
          <div id={`seccao-${s.key}`} key={s.key}>
            <SeccaoCard
              seccao={s}
              dados={seccoes?.[s.key]}
              pisos={pisos}
              calc={calc.seccoes[s.key]}
              regimeIvaDefault={regimeMeta.iva_default}
              onChange={(novo) => setSeccao(s.key, novo)}
            />
          </div>
        ))}

        {/* Licenciamento */}
        {seccoesExtra.map(s => (
          <div id={`seccao-${s.key}`} key={s.key}>
            <SeccaoCard
              seccao={s}
              dados={seccoes?.[s.key]}
              pisos={pisos}
              calc={calc.seccoes[s.key]}
              regimeIvaDefault={regimeMeta.iva_default}
              onChange={(novo) => setSeccao(s.key, novo)}
            />
          </div>
        ))}

        {/* Decomposição por tipo */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Decomposição por tipo fiscal</h3>
          <div className="space-y-1.5">
            {t.por_tipo.material.base > 0  && <LinhaTipo cor="blue"   label="Material" tipo={t.por_tipo.material} />}
            {t.por_tipo.mo.base > 0        && <LinhaTipo cor="green"  label="Mão-de-obra" tipo={t.por_tipo.mo} mostraAutoliq />}
            {t.por_tipo.servicos.base > 0  && <LinhaTipo cor="amber"  label="Serviços" tipo={t.por_tipo.servicos} mostraAutoliq />}
            {t.por_tipo.honorarios.base > 0 && <LinhaTipo cor="purple" label="Honorários (23%)" tipo={t.por_tipo.honorarios} mostraRetencoes />}
            {t.por_tipo.taxas.base > 0     && <LinhaTipo cor="gray"   label="Taxas (sem IVA)" tipo={t.por_tipo.taxas} />}
            {t.por_tipo.isento.base > 0    && <LinhaTipo cor="gray"   label="Isento (seguros)" tipo={t.por_tipo.isento} />}
            {t.por_tipo.misto.base > 0     && <LinhaTipo cor="gray"   label="Misto (não decomposto)" tipo={t.por_tipo.misto} />}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-600">Rácio material / empreitada</span>
            <span className={`font-semibold ${
              t.beneficio_perdido ? 'text-red-600' :
              (regime === 'habitacao' && t.racio_material > 15) ? 'text-amber-600' :
              'text-gray-800'
            }`}>{PCT(t.racio_material)}{regime === 'habitacao' ? ' / 20%' : ''}</span>
          </div>
        </div>

        {/* Resumo fiscal */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Resumo fiscal</h3>
          <div className="space-y-1 text-sm">
            <Linha label="Base obra (com BDI)"             valor={t.base_obra_com_bdi} />
            <Linha label="Base licenciamento"              valor={t.base_licenciamento} />
            <Linha label="Base total"                      valor={t.base_geral} destaque />
            <Linha label="IVA liquidado"                   valor={t.iva_geral} />
            <Linha label="Bruto fiscal"                    valor={t.bruto_geral} destaque />
            {t.iva_autoliquidado > 0 && <Linha label="(-) IVA autoliquidado p/ adquirente" valor={-t.iva_autoliquidado} />}
            {t.retencoes_irs > 0 && <Linha label="(-) Retenções IRS a entregar AT" valor={-t.retencoes_irs} />}
            <Linha label="= Total a pagar a prestadores" valor={t.a_pagar} destaque />
          </div>
        </div>
      </div>

      {/* Total geral sticky */}
      <div
        className="sticky bottom-0 left-0 right-0 px-4 sm:px-6 py-3 flex items-center justify-between border-t-2 z-10"
        style={{ backgroundColor: BLACK, borderColor: GOLD }}
      >
        <div>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: GOLD }}>Total bruto fiscal</span>
          <p className="text-[10px] text-gray-400">Sincroniza com custo_estimado_obra</p>
        </div>
        <span className="text-2xl font-bold" style={{ color: GOLD }}>{EUR(calc.total_geral)}</span>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────
function Kpi({ label, valor, destaque }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${destaque ? 'text-white' : 'bg-gray-50 border border-gray-200'}`}
         style={destaque ? { backgroundColor: BLACK } : {}}>
      <p className={`text-[10px] uppercase tracking-wide ${destaque ? 'opacity-70' : 'text-gray-500'}`} style={destaque ? { color: GOLD } : {}}>{label}</p>
      <p className={`text-base font-bold mt-0.5 ${destaque ? '' : 'text-gray-900'}`} style={destaque ? { color: GOLD } : {}}>{valor}</p>
    </div>
  )
}

function Linha({ label, valor, destaque }) {
  return (
    <div className={`flex items-center justify-between ${destaque ? 'bg-gray-50 px-2 py-1.5 rounded font-semibold text-gray-900' : 'text-gray-700 px-2'}`}>
      <span>{label}</span>
      <span>{EUR(valor)}</span>
    </div>
  )
}

function LinhaTipo({ label, tipo, cor = 'gray', mostraAutoliq, mostraRetencoes }) {
  const corMap = {
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    green:  'bg-green-50 text-green-700 border-green-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray:   'bg-gray-50 text-gray-600 border-gray-200',
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border whitespace-nowrap ${corMap[cor]}`}>{label}</span>
      <div className="flex-1 text-right text-xs text-gray-500">
        Base <span className="text-gray-800 font-medium">{EUR(tipo.base)}</span>
        {tipo.iva > 0 && <> · IVA <span className="text-gray-800 font-medium">{EUR(tipo.iva)}</span></>}
        {mostraAutoliq && tipo.autoliq > 0 && <> · autoliq. <span className="text-amber-700 font-medium">{EUR(tipo.autoliq)}</span></>}
        {mostraRetencoes && tipo.retencoes > 0 && <> · ret. <span className="text-red-700 font-medium">-{EUR(tipo.retencoes)}</span></>}
      </div>
    </div>
  )
}
