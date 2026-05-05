/**
 * Comparáveis de mercado — 1-3 tipologias × 5 comparáveis.
 * Schema persistido em JSONB: { _version:2, meta, tipologias }.
 * Compatível com formato antigo (array flat de tipologias).
 *
 * Ajustes automáticos: Negociação (-desconto_negocial%) e Área (proporcional à diferença de m²).
 * Ajustes manuais: Localização, Idade, Conservação, Outros + 4 desagregados (Estado, Piso, Elevador, Garagem).
 */
import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EUR } from '../../constants.js'

const PISO_OPCOES = ['Cave', 'R/C', '1.º Andar', '2.º Andar', '3.º Andar', '4.º Andar ou superior', 'Último Andar', 'Duplex', 'Outro']
const ESTADO_OPCOES = ['Novo / Excelente estado', 'Reabilitado / Remodelado', 'Bom estado (usado)', 'Estado razoável (precisa de pequenas obras)', 'Degradado (precisa de obras de fundo)', 'Ruína / Para demolir']
const TIPO_PRECO_OPCOES = ['Preço de Oferta (anúncio)', 'Preço de Transacção Efectiva (escritura)', 'Misto (oferta + transacção)']

const DEFAULT_META = {
  fonte_dados: 'Idealista / Imovirtual',
  tipo_preco: 'Preço de Oferta (anúncio)',
  desconto_negocial_pct: 5,
  data_recolha: '',
  raio_pesquisa_km: 5,
  metodologia: '',
  alvo_atributos: { estado: 'Reabilitado (após obra)', piso: 'R/C', elevador: false, garagem: false },
}

const EMPTY_COMP = {
  preco: 0, area: 0, notas: '', link: '',
  descricao: '', estado: '', piso: '',
  elevador: false, garagem: false, dias_mercado: null,
  ajustes: { neg: -5, area: 0, loc: 0, idade: 0, conserv: 0, outros: 0, estado_pct: 0, piso_pct: 0, elevador_pct: 0, garagem_pct: 0 },
}
const EMPTY_TIP = { tipologia: 'T2', area: 0, renda: 0, yield: 0, comparaveis: Array(5).fill(null).map(() => ({ ...EMPTY_COMP, ajustes: { ...EMPTY_COMP.ajustes } })) }

const AREA_FACTOR = 0.25
function calcAjusteArea(areaImovel, areaComp) {
  if (!areaImovel || !areaComp || areaComp === 0) return 0
  return Math.round((areaImovel - areaComp) / areaComp * 100 * AREA_FACTOR * 100) / 100
}

function normalizeComp(c) {
  return {
    ...EMPTY_COMP,
    ...c,
    ajustes: { ...EMPTY_COMP.ajustes, ...(c?.ajustes || {}) },
  }
}

function normalizeTip(t) {
  return {
    tipologia: t?.tipologia || 'T2',
    area: t?.area || 0,
    renda: t?.renda || 0,
    yield: t?.yield || 0,
    comparaveis: Array.isArray(t?.comparaveis)
      ? t.comparaveis.slice(0, 5).concat(Array(Math.max(0, 5 - t.comparaveis.length)).fill(null).map(() => ({ ...EMPTY_COMP, ajustes: { ...EMPTY_COMP.ajustes } }))).map(normalizeComp)
      : Array(5).fill(null).map(() => ({ ...EMPTY_COMP, ajustes: { ...EMPTY_COMP.ajustes } })),
  }
}

function parseAndMigrate(raw) {
  let parsed = []
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])
  } catch {
    parsed = []
  }
  // Migracao: array antigo -> objecto novo
  if (Array.isArray(parsed)) {
    return { _version: 2, meta: { ...DEFAULT_META }, tipologias: parsed.filter(t => t && Array.isArray(t.comparaveis)).map(normalizeTip) }
  }
  if (parsed && typeof parsed === 'object') {
    return {
      _version: 2,
      meta: { ...DEFAULT_META, ...(parsed.meta || {}), alvo_atributos: { ...DEFAULT_META.alvo_atributos, ...(parsed.meta?.alvo_atributos || {}) } },
      tipologias: Array.isArray(parsed.tipologias) ? parsed.tipologias.map(normalizeTip) : [],
    }
  }
  return { _version: 2, meta: { ...DEFAULT_META }, tipologias: [] }
}

export function Comparaveis({ analise, imovel, onUpdate }) {
  const [meta, setMeta] = useState(DEFAULT_META)
  const [tipologias, setTipologias] = useState([])
  const [tipCount, setTipCount] = useState(1)
  const [autoAjustes, setAutoAjustes] = useState(true)
  const [metaExpanded, setMetaExpanded] = useState(true)
  const [expandedAttrs, setExpandedAttrs] = useState(() => new Set())
  const [expandedAdj, setExpandedAdj] = useState(() => new Set())

  useEffect(() => {
    const obj = parseAndMigrate(analise?.comparaveis)
    setMeta(obj.meta)
    setTipologias(obj.tipologias)
    setTipCount(obj.tipologias.length)
  }, [analise?.id])

  const persist = (nextMeta, nextTipologias) => {
    setMeta(nextMeta)
    setTipologias(nextTipologias)
    onUpdate({ comparaveis: JSON.stringify({ _version: 2, meta: nextMeta, tipologias: nextTipologias }) })
  }

  const updateMeta = (field, value) => {
    if (field.startsWith('alvo_')) {
      const key = field.replace('alvo_', '')
      const nextMeta = { ...meta, alvo_atributos: { ...meta.alvo_atributos, [key]: value } }
      persist(nextMeta, tipologias)
      return
    }
    const nextMeta = { ...meta, [field]: value }
    // Propagacao do desconto negocial
    if (field === 'desconto_negocial_pct' && autoAjustes) {
      const negVal = -(parseFloat(value) || 0)
      const nextTipologias = tipologias.map(t => ({
        ...t,
        comparaveis: t.comparaveis.map(c => ({ ...c, ajustes: { ...c.ajustes, neg: negVal } })),
      }))
      persist(nextMeta, nextTipologias)
      return
    }
    persist(nextMeta, tipologias)
  }

  const addTipologia = () => {
    if (tipologias.length >= 3) return
    const newTip = normalizeTip({ ...EMPTY_TIP, tipologia: `T${tipologias.length + 1}` })
    // Aplicar desconto negocial actual aos novos comparaveis
    if (autoAjustes && meta.desconto_negocial_pct) {
      const neg = -meta.desconto_negocial_pct
      newTip.comparaveis = newTip.comparaveis.map(c => ({ ...c, ajustes: { ...c.ajustes, neg } }))
    }
    const next = [...tipologias, newTip]
    setTipCount(next.length)
    persist(meta, next)
  }

  const removeTipologia = (idx) => {
    if (!confirm(`Remover tipologia "${tipologias[idx]?.tipologia}"?`)) return
    const next = tipologias.filter((_, i) => i !== idx)
    setTipCount(next.length)
    persist(meta, next)
  }

  const updateTip = (tIdx, field, value) => {
    const next = tipologias.map((t, i) => {
      if (i !== tIdx) return t
      const updated = { ...t, [field]: value }
      if (field === 'area' && autoAjustes) {
        updated.comparaveis = updated.comparaveis.map(c => {
          if (!c.area || c.area === 0) return c
          return { ...c, ajustes: { ...c.ajustes, area: calcAjusteArea(value, c.area) } }
        })
      }
      return updated
    })
    persist(meta, next)
  }

  const updateComp = (tIdx, cIdx, field, value) => {
    const next = tipologias.map((t, i) => {
      if (i !== tIdx) return t
      const comps = t.comparaveis.map((c, j) => {
        if (j !== cIdx) return c
        if (field.startsWith('ajuste_')) {
          return { ...c, ajustes: { ...c.ajustes, [field.replace('ajuste_', '')]: value } }
        }
        const updated = { ...c, [field]: value }
        if (field === 'area' && autoAjustes && t.area > 0) {
          updated.ajustes = { ...updated.ajustes, area: calcAjusteArea(t.area, value) }
        }
        if (field === 'preco' && autoAjustes && value > 0 && (!c.ajustes?.neg || c.ajustes.neg === 0)) {
          updated.ajustes = { ...(updated.ajustes || EMPTY_COMP.ajustes), neg: -(meta.desconto_negocial_pct || 5) }
        }
        return updated
      })
      return { ...t, comparaveis: comps }
    })
    persist(meta, next)
  }

  const recalcAll = () => {
    const neg = -(meta.desconto_negocial_pct || 5)
    const next = tipologias.map(t => ({
      ...t,
      comparaveis: t.comparaveis.map(c => {
        if (!c.preco || c.preco === 0) return c
        return {
          ...c,
          ajustes: {
            ...c.ajustes,
            neg,
            area: t.area > 0 && c.area > 0 ? calcAjusteArea(t.area, c.area) : c.ajustes?.area || 0,
          },
        }
      }),
    }))
    persist(meta, next)
  }

  const calcTip = (tip) => {
    const valid = tip.comparaveis.filter(c => c.preco > 0 && c.area > 0)
    if (valid.length === 0) return { media: 0, mediaAjust: 0, count: 0 }
    const precos = valid.map(c => {
      const euro_m2 = c.preco / c.area
      const ajusteTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      return { euro_m2, ajustado: euro_m2 * (1 + ajusteTotal / 100) }
    })
    return {
      media: Math.round(precos.reduce((s, p) => s + p.euro_m2, 0) / precos.length),
      mediaAjust: Math.round(precos.reduce((s, p) => s + p.ajustado, 0) / precos.length),
      count: valid.length,
    }
  }

  // Resumo Estatistico (sobre VVRs estimados de todas as tipologias)
  const stats = useMemo(() => {
    const vvrs = []
    tipologias.forEach(t => {
      if (!t.area) return
      t.comparaveis.forEach(c => {
        if (c.preco > 0 && c.area > 0) {
          const euro_m2 = c.preco / c.area
          const ajusteTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
          const euro_m2_aj = euro_m2 * (1 + ajusteTotal / 100)
          vvrs.push(euro_m2_aj * t.area)
        }
      })
    })
    if (vvrs.length === 0) return null
    const sorted = [...vvrs].sort((a, b) => a - b)
    const n = sorted.length
    const media = vvrs.reduce((a, b) => a + b, 0) / n
    const mediana = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]
    const min = sorted[0]
    const max = sorted[n - 1]
    const vvrAdoptado = parseFloat(analise?.vvr) || 0
    const delta = mediana > 0 && vvrAdoptado > 0 ? ((vvrAdoptado / mediana) - 1) * 100 : null
    let posicionamento = null
    if (delta != null) {
      if (delta < -5) posicionamento = { texto: 'Conservador (abaixo da mediana)', cor: 'verde' }
      else if (delta <= 5) posicionamento = { texto: 'Alinhado com a mediana', cor: 'dourado' }
      else if (delta <= 15) posicionamento = { texto: 'Moderadamente acima da mediana', cor: 'dourado' }
      else posicionamento = { texto: 'Acima do intervalo de mercado', cor: 'vermelho' }
    }
    return { n, media, mediana, min, max, vvrAdoptado, delta, posicionamento }
  }, [tipologias, analise?.vvr])

  const AJUSTE_LABELS = { neg: 'Neg.', area: 'Área', loc: 'Loc.', idade: 'Idade', conserv: 'Conserv.', outros: 'Outros' }
  const AUTO_FIELDS = new Set(['neg', 'area'])

  const toggleAttrs = (key) => {
    const next = new Set(expandedAttrs)
    next.has(key) ? next.delete(key) : next.add(key)
    setExpandedAttrs(next)
  }
  const toggleAdj = (key) => {
    const next = new Set(expandedAdj)
    next.has(key) ? next.delete(key) : next.add(key)
    setExpandedAdj(next)
  }

  return (
    <div className="space-y-6">
      {/* Bloco Metadados do Estudo */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
        <button
          onClick={() => setMetaExpanded(!metaExpanded)}
          className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-100 transition-colors"
        >
          {metaExpanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
          <span className="text-sm font-semibold text-gray-700">Metadados do Estudo</span>
          <span className="text-xs text-gray-400">— Metodologia + Atributos do Imóvel Alvo</span>
        </button>
        {metaExpanded && (
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Coluna 1 - Metodologia */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Metodologia</h4>
              <label className="block text-xs">
                <span className="text-gray-500">Fonte dos Dados</span>
                <input type="text" value={meta.fonte_dados} onChange={e => updateMeta('fonte_dados', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm" />
              </label>
              <label className="block text-xs">
                <span className="text-gray-500">Tipo de Preço</span>
                <select value={meta.tipo_preco} onChange={e => updateMeta('tipo_preco', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white">
                  {TIPO_PRECO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="text-gray-500">Desconto Negocial (%)</span>
                  <input type="number" step="0.5" value={meta.desconto_negocial_pct} onChange={e => updateMeta('desconto_negocial_pct', parseFloat(e.target.value) || 0)}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm font-mono" />
                </label>
                <label className="block text-xs">
                  <span className="text-gray-500">Raio de Pesquisa (km)</span>
                  <input type="number" step="0.5" value={meta.raio_pesquisa_km} onChange={e => updateMeta('raio_pesquisa_km', parseFloat(e.target.value) || 0)}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm font-mono" />
                </label>
              </div>
              <label className="block text-xs">
                <span className="text-gray-500">Data de Recolha dos Dados</span>
                <input type="date" value={meta.data_recolha} onChange={e => updateMeta('data_recolha', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm font-mono" />
              </label>
              <label className="block text-xs">
                <span className="text-gray-500">Notas de Metodologia</span>
                <textarea value={meta.metodologia} onChange={e => updateMeta('metodologia', e.target.value)} rows={2}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm" placeholder="Observações sobre a recolha, critérios de selecção..." />
              </label>
            </div>

            {/* Coluna 2 - Atributos do Alvo */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Atributos do Imóvel Alvo</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-xs">
                  <span className="text-gray-500">Tipologia</span>
                  <input type="text" value={imovel?.tipologia || '—'} readOnly
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white text-gray-500 cursor-not-allowed" />
                </div>
                <div className="text-xs">
                  <span className="text-gray-500">Área Útil (m²)</span>
                  <input type="text" value={imovel?.area_bruta || '—'} readOnly
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white text-gray-500 cursor-not-allowed font-mono" />
                </div>
              </div>
              <div className="text-xs">
                <span className="text-gray-500">Estado Esperado após Obra</span>
                <input type="text" value="Reabilitado (após obra)" readOnly
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white text-gray-500 cursor-not-allowed" />
              </div>
              <label className="block text-xs">
                <span className="text-gray-500">Piso do Imóvel</span>
                <select value={meta.alvo_atributos.piso} onChange={e => updateMeta('alvo_piso', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white">
                  {PISO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="text-gray-500">Tem Elevador?</span>
                  <select value={meta.alvo_atributos.elevador ? 'Sim' : 'Não'} onChange={e => updateMeta('alvo_elevador', e.target.value === 'Sim')}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white">
                    <option>Não</option><option>Sim</option>
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="text-gray-500">Tem Garagem?</span>
                  <select value={meta.alvo_atributos.garagem ? 'Sim' : 'Não'} onChange={e => updateMeta('alvo_garagem', e.target.value === 'Sim')}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white">
                    <option>Não</option><option>Sim</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra de acções */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tipCount < 3 && (
            <button onClick={addTipologia}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors">
              + Tipologia
            </button>
          )}
          <span className="text-xs text-gray-400">{tipCount} de 3</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={autoAjustes} onChange={e => setAutoAjustes(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600" />
            <span className="text-xs text-gray-500">Ajustes automáticos</span>
          </label>
          {autoAjustes && (
            <button onClick={recalcAll}
              className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
              Recalcular
            </button>
          )}
        </div>
      </div>

      {/* Barra de resumo por tipologia */}
      <div className="flex gap-3">
        {tipologias.slice(0, tipCount).map((t, i) => {
          const { mediaAjust, count } = calcTip(t)
          const vvr = mediaAjust > 0 && t.area > 0 ? mediaAjust * t.area : 0
          return (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 flex-1 text-center">
              <p className="text-xs text-gray-400">{t.tipologia} ({count} comp.)</p>
              <p className="text-sm font-mono font-semibold">{vvr > 0 ? EUR(vvr) : '—'}</p>
              <p className="text-xs text-gray-400">{mediaAjust > 0 ? `${mediaAjust} €/m²` : '—'}</p>
            </div>
          )
        })}
        {tipCount > 1 && (() => {
          const totalVVR = tipologias.slice(0, tipCount).reduce((s, t) => {
            const { mediaAjust } = calcTip(t)
            return s + (mediaAjust > 0 && t.area > 0 ? mediaAjust * t.area : 0)
          }, 0)
          return totalVVR > 0 ? (
            <div className="bg-gray-900 rounded-lg px-3 py-2 text-center" style={{ minWidth: 100 }}>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-sm font-mono font-semibold text-white">{EUR(totalVVR)}</p>
            </div>
          ) : null
        })()}
      </div>

      {/* Tipologias */}
      {tipologias.slice(0, tipCount).map((tip, tIdx) => {
        const { media, mediaAjust } = calcTip(tip)
        return (
          <div key={tIdx} className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 flex items-center gap-3 flex-wrap">
              <input value={tip.tipologia} onChange={e => updateTip(tIdx, 'tipologia', e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none w-20" />
              <button onClick={() => removeTipologia(tIdx)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors">✕</button>
              <div className="flex gap-3 text-xs text-gray-400 items-center flex-wrap">
                <label>Área imóvel: <input type="number" value={tip.area || ''} onChange={e => updateTip(tIdx, 'area', parseFloat(e.target.value) || 0)}
                  className="w-16 bg-white border rounded px-1 py-0.5 font-mono" /> m²</label>
                <span className="hidden sm:inline">|</span>
                <span>Média: <strong className="text-gray-600">{media} €/m²</strong></span>
                <span>Ajustada: <strong className="text-gray-600">{mediaAjust} €/m²</strong></span>
                {mediaAjust > 0 && tip.area > 0 && (
                  <span className="font-semibold text-gray-700">VVR: {EUR(mediaAjust * tip.area)}</span>
                )}
              </div>
            </div>

            {/* Header da tabela */}
            <div className="px-4 pt-2 grid grid-cols-12 gap-2 text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1">
              <span className="col-span-1">#</span>
              <span className="col-span-2">Preço</span>
              <span className="col-span-1">Área</span>
              <div className="col-span-6 grid grid-cols-6 gap-1 text-center">
                {Object.entries(AJUSTE_LABELS).map(([k, label]) => (
                  <span key={k} className={AUTO_FIELDS.has(k) ? 'text-indigo-400' : ''}>{label}{AUTO_FIELDS.has(k) ? ' ⚡' : ''}</span>
                ))}
              </div>
              <span className="col-span-1 text-right">€/m²</span>
              <span className="col-span-1 text-right">Ajust.</span>
            </div>

            <div className="px-4 py-2 space-y-2">
              {tip.comparaveis.map((comp, cIdx) => {
                const ajusteTotal = Object.values(comp.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
                const euroM2 = comp.preco > 0 && comp.area > 0 ? Math.round(comp.preco / comp.area) : 0
                const euroM2Ajust = euroM2 > 0 ? Math.round(euroM2 * (1 + ajusteTotal / 100)) : 0
                const key = `${tIdx}-${cIdx}`
                const attrsOpen = expandedAttrs.has(key)
                const adjOpen = expandedAdj.has(key)

                return (
                  <div key={cIdx} className="border-b border-gray-50 pb-2 space-y-1">
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-1 text-gray-300 font-semibold">
                        {comp.link ? (
                          <a href={comp.link} target="_blank" rel="noopener noreferrer"
                            className="text-[#C9A84C] hover:underline cursor-pointer">{cIdx + 1}</a>
                        ) : (cIdx + 1)}
                      </span>
                      <div className="col-span-2">
                        <input type="number" value={comp.preco || ''} onChange={e => updateComp(tIdx, cIdx, 'preco', parseFloat(e.target.value) || 0)}
                          placeholder="€" className="w-full border rounded px-2 py-1 font-mono" />
                      </div>
                      <div className="col-span-1">
                        <input type="number" value={comp.area || ''} onChange={e => updateComp(tIdx, cIdx, 'area', parseFloat(e.target.value) || 0)}
                          placeholder="m²" className="w-full border rounded px-2 py-1 font-mono" />
                      </div>
                      <div className="col-span-6 grid grid-cols-6 gap-1">
                        {Object.keys(AJUSTE_LABELS).map(aj => {
                          const isAuto = AUTO_FIELDS.has(aj) && autoAjustes
                          return (
                            <div key={aj}>
                              <input type="number" step="0.5"
                                value={comp.ajustes?.[aj] ?? ''}
                                onChange={e => updateComp(tIdx, cIdx, `ajuste_${aj}`, parseFloat(e.target.value) || 0)}
                                readOnly={isAuto}
                                className={`w-full border rounded px-1 py-1 font-mono text-center ${
                                  isAuto ? 'bg-indigo-50 text-indigo-600 border-indigo-200 cursor-not-allowed' : ''
                                } ${(comp.ajustes?.[aj] || 0) > 0 ? 'text-green-600' : (comp.ajustes?.[aj] || 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}
                              />
                            </div>
                          )
                        })}
                      </div>
                      <div className="col-span-1 text-right">
                        <p className="font-mono text-gray-600">{euroM2 > 0 ? euroM2 : '—'}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <p className={`font-mono font-semibold ${ajusteTotal > 0 ? 'text-green-600' : ajusteTotal < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {euroM2Ajust > 0 ? euroM2Ajust : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Linha de chevrons + badge ajuste total */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-1" />
                      <div className="col-span-10 flex items-center gap-3">
                        <button onClick={() => toggleAttrs(key)} className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
                          {attrsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          Atributos detalhados
                        </button>
                        <button onClick={() => toggleAdj(key)} className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
                          {adjOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          Ajustes desagregados
                        </button>
                      </div>
                      <div className="col-span-1 text-right">
                        {ajusteTotal !== 0 && (
                          <span className={`text-[10px] font-mono ${ajusteTotal > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {ajusteTotal > 0 ? '+' : ''}{ajusteTotal.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Accordion: Atributos detalhados */}
                    {attrsOpen && (
                      <div className="ml-8 mr-2 mt-1 p-3 bg-gray-50 rounded-md grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <label className="md:col-span-2">
                          <span className="text-gray-500">Descrição breve</span>
                          <input type="text" value={comp.descricao || ''} onChange={e => updateComp(tIdx, cIdx, 'descricao', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1" placeholder="Ex: Apartamento remodelado, ar cond., garagem fechada" />
                        </label>
                        <label>
                          <span className="text-gray-500">Dias em Mercado</span>
                          <input type="number" value={comp.dias_mercado ?? ''} onChange={e => updateComp(tIdx, cIdx, 'dias_mercado', e.target.value === '' ? null : parseInt(e.target.value))}
                            className="w-full mt-0.5 border rounded px-2 py-1 font-mono" />
                        </label>
                        <label>
                          <span className="text-gray-500">Estado de Conservação</span>
                          <select value={comp.estado || ''} onChange={e => updateComp(tIdx, cIdx, 'estado', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1 bg-white">
                            <option value="">— Seleccionar —</option>
                            {ESTADO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <label>
                          <span className="text-gray-500">Piso</span>
                          <select value={comp.piso || ''} onChange={e => updateComp(tIdx, cIdx, 'piso', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1 bg-white">
                            <option value="">— Seleccionar —</option>
                            {PISO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label>
                            <span className="text-gray-500">Elevador?</span>
                            <select value={comp.elevador ? 'Sim' : 'Não'} onChange={e => updateComp(tIdx, cIdx, 'elevador', e.target.value === 'Sim')}
                              className="w-full mt-0.5 border rounded px-2 py-1 bg-white">
                              <option>Não</option><option>Sim</option>
                            </select>
                          </label>
                          <label>
                            <span className="text-gray-500">Garagem?</span>
                            <select value={comp.garagem ? 'Sim' : 'Não'} onChange={e => updateComp(tIdx, cIdx, 'garagem', e.target.value === 'Sim')}
                              className="w-full mt-0.5 border rounded px-2 py-1 bg-white">
                              <option>Não</option><option>Sim</option>
                            </select>
                          </label>
                        </div>
                        <label className="md:col-span-2">
                          <span className="text-gray-500">URL do Anúncio</span>
                          <input type="url" value={comp.link || ''} onChange={e => updateComp(tIdx, cIdx, 'link', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1 truncate" placeholder="https://..." />
                        </label>
                        <label className="md:col-span-3">
                          <span className="text-gray-500">Notas</span>
                          <textarea value={comp.notas || ''} onChange={e => updateComp(tIdx, cIdx, 'notas', e.target.value)} rows={2}
                            className="w-full mt-0.5 border rounded px-2 py-1" />
                        </label>
                      </div>
                    )}

                    {/* Accordion: Ajustes desagregados */}
                    {adjOpen && (
                      <div className="ml-8 mr-2 mt-1 p-3 bg-gray-50 rounded-md grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                        <label title="+ : comparável em pior estado que o alvo reabilitado → VVR sobe.&#10;− : comparável em melhor estado → VVR desce.&#10;Ex: comparável degradado vs. alvo reabilitado → +5% a +15%.">
                          <span className="text-gray-500">Ajuste Estado (%)</span>
                          <input type="number" step="0.5" value={comp.ajustes?.estado_pct ?? 0} onChange={e => updateComp(tIdx, cIdx, 'ajuste_estado_pct', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 border rounded px-2 py-1 font-mono" />
                        </label>
                        <label title="+ : comparável em piso menos valorizado e alvo em piso mais alto → VVR sobe.&#10;− : comparável em andar e alvo em cave → VVR desce.&#10;Ex: alvo em cave, comp. em 1.º andar → +3% a +8%.">
                          <span className="text-gray-500">Ajuste Piso (%)</span>
                          <input type="number" step="0.5" value={comp.ajustes?.piso_pct ?? 0} onChange={e => updateComp(tIdx, cIdx, 'ajuste_piso_pct', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 border rounded px-2 py-1 font-mono" />
                        </label>
                        <label title="− : comparável tem elevador e alvo não tem → remover prémio → VVR desce.&#10;0 : ambos com ou ambos sem.&#10;Ex: comp. com elevador, alvo sem → −3% a −5%.">
                          <span className="text-gray-500">Ajuste Elevador (%)</span>
                          <input type="number" step="0.5" value={comp.ajustes?.elevador_pct ?? 0} onChange={e => updateComp(tIdx, cIdx, 'ajuste_elevador_pct', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 border rounded px-2 py-1 font-mono" />
                        </label>
                        <label title="− : comparável tem garagem e alvo não tem → remover valor da garagem → VVR desce.&#10;0 : ambos com ou ambos sem.&#10;Ex: comp. com garagem, alvo sem → −5% a −8%.">
                          <span className="text-gray-500">Ajuste Garagem (%)</span>
                          <input type="number" step="0.5" value={comp.ajustes?.garagem_pct ?? 0} onChange={e => updateComp(tIdx, cIdx, 'ajuste_garagem_pct', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 border rounded px-2 py-1 font-mono" />
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Resumo Estatistico */}
      {stats && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-900 text-white">
            <h3 className="text-sm font-semibold">Resumo Estatístico do Estudo</h3>
            <p className="text-xs text-gray-400">Análise agregada de todos os comparáveis válidos</p>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-400 uppercase">Comparáveis</p>
              <p className="text-lg font-mono font-semibold">{stats.n}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Média VVR</p>
              <p className="text-lg font-mono font-semibold">{EUR(stats.media)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Mediana VVR</p>
              <p className="text-lg font-mono font-semibold">{EUR(stats.mediana)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Mín. VVR</p>
              <p className="text-lg font-mono font-semibold">{EUR(stats.min)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Máx. VVR</p>
              <p className="text-lg font-mono font-semibold">{EUR(stats.max)}</p>
            </div>
          </div>
          {stats.delta != null && stats.posicionamento && (
            <div className="px-4 pb-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="text-xs text-gray-500">
                VVR Adoptado <strong className="font-mono text-gray-700">{EUR(stats.vvrAdoptado)}</strong> vs. Mediana
                <span className={`ml-2 font-mono font-semibold ${stats.delta < 0 ? 'text-green-600' : stats.delta > 5 ? 'text-red-600' : 'text-[#C9A84C]'}`}>
                  {stats.delta >= 0 ? '+' : ''}{stats.delta.toFixed(1)}%
                </span>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                stats.posicionamento.cor === 'verde' ? 'bg-green-50 text-green-700 border border-green-200'
                : stats.posicionamento.cor === 'vermelho' ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>{stats.posicionamento.texto}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
