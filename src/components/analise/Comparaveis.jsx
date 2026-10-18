/**
 * Comparáveis de mercado — 1-3 tipologias × 5 comparáveis.
 * Schema persistido em JSONB: { _version:2, meta, tipologias }.
 * Compatível com formato antigo (array flat de tipologias).
 *
 * Ajustes automáticos: Negociação (-desconto_negocial%) e Área (proporcional à diferença de m²).
 * Ajustes manuais: Localização, Idade, Conservação, Outros + 3 desagregados (Piso, Elevador, Garagem).
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, Upload, Trash2, Save, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { EUR } from '../../constants.js'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'

function formatTime(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

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
  conclusao_estudo: '',
  alvo_atributos: { estado: 'Reabilitado (após obra)', piso: 'R/C', elevador: false, garagem: false },
}

const EMPTY_COMP = {
  preco: 0, area: 0, notas: '', link: '',
  descricao: '', estado: '', piso: '',
  elevador: false, garagem: false, dias_mercado: null,
  ajustes: { neg: -5, area: 0, loc: 0, idade: 0, conserv: 0, outros: 0, piso_pct: 0, elevador_pct: 0, garagem_pct: 0 },
}
const EMPTY_TIP = { tipologia: 'T2', area: 0, vvr: 0, renda: 0, yield: 0, comparaveis: Array(5).fill(null).map(() => ({ ...EMPTY_COMP, ajustes: { ...EMPTY_COMP.ajustes } })) }

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
    vvr: t?.vvr || 0,
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

export function Comparaveis({ analise, imovel, onUpdate, flush, guardarAgora, lastSaveStatus }) {
  const toast = useToast()
  const [meta, setMeta] = useState(DEFAULT_META)
  const [tipologias, setTipologias] = useState([])
  const [tipCount, setTipCount] = useState(1)
  const [autoAjustes, setAutoAjustes] = useState(true)
  const [metaExpanded, setMetaExpanded] = useState(true)
  const [expandedAttrs, setExpandedAttrs] = useState(() => new Set())
  const [expandedAdj, setExpandedAdj] = useState(() => new Set())
  const [uploadingAlfredo, setUploadingAlfredo] = useState(false)
  const alfredoInputRef = useRef(null)
  // Snapshot do conteúdo já enviado (evita writes no-op em re-mounts / loads)
  const lastSentRef = useRef(null)

  useEffect(() => {
    const raw = analise?.comparaveis
    const wasLegacy = (typeof raw === 'string' ? (() => {
      try { return Array.isArray(JSON.parse(raw || '[]')) } catch { return false }
    })() : Array.isArray(raw))
    const obj = parseAndMigrate(raw)
    setMeta(obj.meta)
    setTipologias(obj.tipologias)
    setTipCount(obj.tipologias.length)
    const normalized = JSON.stringify({ _version: 2, meta: obj.meta, tipologias: obj.tipologias })
    lastSentRef.current = normalized
    // Auto-persistir se a estrutura veio do formato legacy (array) - garante que o
    // backend PDF passa a ler como objecto novo com meta na proxima geracao.
    if (wasLegacy && analise?.id) {
      onUpdate?.({ comparaveis: normalized })
    }
  }, [analise?.id])

  const persist = (nextMeta, nextTipologias) => {
    setMeta(nextMeta)
    setTipologias(nextTipologias)
    const serialized = JSON.stringify({ _version: 2, meta: nextMeta, tipologias: nextTipologias })
    if (serialized === lastSentRef.current) return // no-op, nao reescrever
    lastSentRef.current = serialized
    onUpdate?.({ comparaveis: serialized })
  }

  // Auto-flush ao sair da aba (subTab muda, painel fecha, troca de imóvel) ou ao esconder o separador do browser.
  useEffect(() => {
    if (typeof flush !== 'function') return undefined
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  const guardarManual = async () => {
    // Força sempre um save explícito do snapshot actual — assim o user tem
    // sempre feedback visual ("Guardado às HH:MM"), mesmo que o debounced
    // já tenha disparado e não haja pendentes no buffer.
    const snapshot = JSON.stringify({ _version: 2, meta, tipologias })
    lastSentRef.current = snapshot
    if (typeof guardarAgora === 'function') await guardarAgora({ comparaveis: snapshot })
    else if (typeof flush === 'function') await flush()
  }

  const removeComp = (tIdx, cIdx) => {
    const tip = tipologias[tIdx]
    const target = tip?.comparaveis?.[cIdx]
    const tag = (target?.descricao || target?.link || `#${cIdx + 1}`).toString().slice(0, 60)
    if (!confirm(`Eliminar este comparável (${tag})?`)) return
    const next = tipologias.map((t, i) => {
      if (i !== tIdx) return t
      const remaining = t.comparaveis.filter((_, j) => j !== cIdx)
      // Mantém sempre 5 slots (preenche com vazios à direita), para a UI continuar uniforme.
      const padded = remaining.concat(
        Array(Math.max(0, 5 - remaining.length))
          .fill(null)
          .map(() => ({ ...EMPTY_COMP, ajustes: { ...EMPTY_COMP.ajustes } }))
      )
      return { ...t, comparaveis: padded }
    })
    persist(meta, next)
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

  const uploadAlfredo = async (file) => {
    if (!file || !analise?.id) return
    setUploadingAlfredo(true)
    try {
      const fd = new FormData()
      fd.append('imagem', file)
      const r = await apiFetch(`/api/crm/analises/${analise.id}/alfredo-imagem`, { method: 'POST', body: fd })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        toast(friendlyError(err.error || { status: r.status }), 'error')
        return
      }
      const { alfredo_imagem } = await r.json()
      const nextMeta = { ...meta, alfredo_imagem }
      setMeta(nextMeta)
    } finally {
      setUploadingAlfredo(false)
      if (alfredoInputRef.current) alfredoInputRef.current.value = ''
    }
  }

  const removeAlfredo = async () => {
    if (!analise?.id) return
    if (!confirm('Remover captura do estudo de mercado?')) return
    setUploadingAlfredo(true)
    try {
      const r = await apiFetch(`/api/crm/analises/${analise.id}/alfredo-imagem`, { method: 'DELETE' })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        toast(friendlyError(err.error || { status: r.status }), 'error')
        return
      }
      const nextMeta = { ...meta }
      delete nextMeta.alfredo_imagem
      setMeta(nextMeta)
    } finally {
      setUploadingAlfredo(false)
    }
  }

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

  const status = lastSaveStatus?.status || 'idle'
  const statusAt = lastSaveStatus?.at
  const statusErr = lastSaveStatus?.error

  return (
    <div className="space-y-6">
      {/* Barra fixa: Guardar manual + Indicador de estado */}
      <div className="sticky top-0 z-10 -mx-1 px-1">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised border border-line shadow-sm px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            {status === 'saving' && (
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <Loader2 size={12} className="animate-spin" /> A guardar...
              </span>
            )}
            {status === 'saved' && (
              <span className="inline-flex items-center gap-1.5 text-success">
                <Check size={12} /> Guardado{statusAt ? ` às ${formatTime(statusAt)}` : ''}
              </span>
            )}
            {status === 'error' && (
              <span className="inline-flex items-center gap-1.5 text-danger" title={statusErr || ''}>
                <AlertTriangle size={12} /> Erro a guardar — clique em "Guardar" para tentar de novo
              </span>
            )}
            {status === 'idle' && (
              <span className="text-ink-muted">Alterações guardam automaticamente ao sair da aba</span>
            )}
          </div>
          <button
            type="button"
            onClick={guardarManual}
            disabled={status === 'saving'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-ink text-surface hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            <Save size={12} /> Guardar
          </button>
        </div>
      </div>

      {/* Bloco Metadados do Estudo */}
      <div className="rounded-xl border border-line overflow-hidden bg-surface">
        <button
          onClick={() => setMetaExpanded(!metaExpanded)}
          className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-surface-muted transition-colors"
        >
          {metaExpanded ? <ChevronDown size={16} className="text-ink-muted" /> : <ChevronRight size={16} className="text-ink-muted" />}
          <span className="text-sm font-semibold text-ink">Metadados do Estudo</span>
          <span className="text-xs text-ink-muted">— Metodologia + Atributos do Imóvel Alvo</span>
        </button>
        {metaExpanded && (
          <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Coluna 1 - Metodologia */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Metodologia</h4>
              <label className="block text-xs">
                <span className="text-ink-muted">Fonte dos Dados</span>
                <input type="text" value={meta.fonte_dados} onChange={e => updateMeta('fonte_dados', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm" />
              </label>
              <label className="block text-xs">
                <span className="text-ink-muted">Tipo de Preço</span>
                <select value={meta.tipo_preco} onChange={e => updateMeta('tipo_preco', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-surface-raised">
                  {TIPO_PRECO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="text-ink-muted">Desconto Negocial (%)</span>
                  <input type="number" step="0.5" value={meta.desconto_negocial_pct} onChange={e => updateMeta('desconto_negocial_pct', parseFloat(e.target.value) || 0)}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm num" />
                </label>
                <label className="block text-xs">
                  <span className="text-ink-muted">Raio de Pesquisa (km)</span>
                  <input type="number" step="0.5" value={meta.raio_pesquisa_km} onChange={e => updateMeta('raio_pesquisa_km', parseFloat(e.target.value) || 0)}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm num" />
                </label>
              </div>
              <label className="block text-xs">
                <span className="text-ink-muted">Data de Recolha dos Dados</span>
                <input type="date" value={meta.data_recolha} onChange={e => updateMeta('data_recolha', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm num" />
              </label>
              <label className="block text-xs">
                <span className="text-ink-muted">Notas de Metodologia</span>
                <textarea value={meta.metodologia} onChange={e => updateMeta('metodologia', e.target.value)} rows={2}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm" placeholder="Observações sobre a recolha, critérios de seleção..." />
              </label>
              <label className="block text-xs">
                <span className="text-ink-muted">Conclusão do Estudo</span>
                <textarea value={meta.conclusao_estudo} onChange={e => updateMeta('conclusao_estudo', e.target.value)} rows={3}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm"
                  placeholder="Deixe vazio para gerar automaticamente a partir dos dados (mediana, intervalo, posicionamento, desconto negocial)." />
                <span className="text-[10px] text-ink-muted italic">Aparece em destaque no topo do PDF (caixa preta).</span>
              </label>
            </div>

            {/* Coluna 2 - Atributos do Alvo */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Atributos do Imóvel Alvo</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-xs">
                  <span className="text-ink-muted">Tipologia</span>
                  <input type="text" value={imovel?.tipologia || '—'} readOnly
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-surface-raised text-ink-muted cursor-not-allowed" />
                </div>
                <div className="text-xs">
                  <span className="text-ink-muted">Área Útil (m²)</span>
                  <input type="text" value={imovel?.area_bruta || '—'} readOnly
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-surface-raised text-ink-muted cursor-not-allowed num" />
                </div>
              </div>
              <div className="text-xs">
                <span className="text-ink-muted">Estado Esperado após Obra</span>
                <input type="text" value="Reabilitado (após obra)" readOnly
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-surface-raised text-ink-muted cursor-not-allowed" />
              </div>
              <label className="block text-xs">
                <span className="text-ink-muted">Piso do Imóvel</span>
                <select value={meta.alvo_atributos.piso} onChange={e => updateMeta('alvo_piso', e.target.value)}
                  className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-surface-raised">
                  {PISO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="text-ink-muted">Tem Elevador?</span>
                  <select value={meta.alvo_atributos.elevador ? 'Sim' : 'Não'} onChange={e => updateMeta('alvo_elevador', e.target.value === 'Sim')}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-surface-raised">
                    <option>Não</option><option>Sim</option>
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="text-ink-muted">Tem Garagem?</span>
                  <select value={meta.alvo_atributos.garagem ? 'Sim' : 'Não'} onChange={e => updateMeta('alvo_garagem', e.target.value === 'Sim')}
                    className="w-full mt-0.5 border rounded px-2 py-1 text-sm bg-surface-raised">
                    <option>Não</option><option>Sim</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          </div>
        )}
      </div>

      {/* Cartao Captura do Estudo de Mercado (Alfredo) — sempre visivel */}
      <div className="rounded-xl border-2 border-brand-gold/40 bg-[#FAF7EE] p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Estudo de Mercado de Referência (Alfredo)</h3>
            <p className="text-[11px] text-ink-muted mt-0.5">Captura de ecrã do estudo externo. Aparece no PDF antes da tabela de comparáveis ajustados.</p>
          </div>
        </div>
        {meta.alfredo_imagem ? (
          <div className="flex items-start gap-3">
            <img src={meta.alfredo_imagem} alt="Estudo Alfredo" loading="lazy" decoding="async"
              className="rounded border border-line max-h-56 object-contain bg-surface-raised" />
            <div className="flex flex-col gap-2">
              <button type="button" disabled={uploadingAlfredo}
                onClick={() => alfredoInputRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded bg-surface-muted hover:bg-line text-ink disabled:opacity-50 inline-flex items-center gap-1.5">
                <Upload size={12} /> Substituir
              </button>
              <button type="button" disabled={uploadingAlfredo}
                onClick={removeAlfredo}
                className="text-xs px-3 py-1.5 rounded bg-danger/10 hover:bg-danger/15 text-danger disabled:opacity-50 inline-flex items-center gap-1.5">
                <Trash2 size={12} /> Remover
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={uploadingAlfredo || !analise?.id}
            onClick={() => alfredoInputRef.current?.click()}
            className="w-full text-xs px-4 py-4 rounded border-2 border-dashed border-brand-gold/60 hover:border-brand-gold hover:bg-surface-raised text-ink-muted disabled:opacity-50 inline-flex items-center justify-center gap-2 font-semibold">
            <Upload size={16} /> {uploadingAlfredo ? 'A carregar...' : (analise?.id ? 'Carregar captura do estudo (JPG, PNG, WEBP — máx. 15MB)' : 'Guarde a análise primeiro para ativar este upload')}
          </button>
        )}
        <input ref={alfredoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadAlfredo(f) }} />
      </div>

      {/* Barra de acções */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tipCount < 3 && (
            <button onClick={addTipologia}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-ink text-surface hover:opacity-90 transition-colors">
              + Tipologia
            </button>
          )}
          <span className="text-xs text-ink-muted">{tipCount} de 3</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={autoAjustes} onChange={e => setAutoAjustes(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-line text-ink" />
            <span className="text-xs text-ink-muted">Ajustes automáticos</span>
          </label>
          {autoAjustes && (
            <button onClick={recalcAll}
              className="text-xs px-2 py-1 rounded bg-surface-muted text-ink hover:bg-surface-muted">
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
            <div key={i} className="bg-surface rounded-lg px-3 py-2 flex-1 text-center">
              <p className="text-xs text-ink-muted">{t.tipologia} ({count} comp.)</p>
              <p className="text-sm num font-semibold">{vvr > 0 ? EUR(vvr) : '—'}</p>
              <p className="text-xs text-ink-muted">{mediaAjust > 0 ? `${mediaAjust} €/m²` : '—'}</p>
            </div>
          )
        })}
        {tipCount > 1 && (() => {
          const totalVVR = tipologias.slice(0, tipCount).reduce((s, t) => {
            const { mediaAjust } = calcTip(t)
            return s + (mediaAjust > 0 && t.area > 0 ? mediaAjust * t.area : 0)
          }, 0)
          return totalVVR > 0 ? (
            <div className="bg-brand-dark rounded-lg px-3 py-2 text-center" style={{ minWidth: 100 }}>
              <p className="text-xs text-ink-muted">Total</p>
              <p className="text-sm num font-semibold text-white">{EUR(totalVVR)}</p>
            </div>
          ) : null
        })()}
      </div>

      {/* Tipologias */}
      {tipologias.slice(0, tipCount).map((tip, tIdx) => {
        const { media, mediaAjust } = calcTip(tip)
        return (
          <div key={tIdx} className="rounded-xl border border-line overflow-hidden">
            <div className="px-4 py-3 bg-surface flex items-center gap-3 flex-wrap">
              <input value={tip.tipologia} onChange={e => updateTip(tIdx, 'tipologia', e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none w-20" />
              <button onClick={() => removeTipologia(tIdx)}
                className="text-xs text-red-400 hover:text-danger transition-colors">✕</button>
              <div className="flex gap-3 text-xs text-ink-muted items-center flex-wrap">
                <label>Área imóvel: <input type="number" step="any" value={tip.area || ''} onChange={e => updateTip(tIdx, 'area', parseFloat(e.target.value) || 0)}
                  className="w-16 bg-surface-raised border rounded px-1 py-0.5 num" onWheel={e => e.target.blur()} /> m²</label>
                <label title="VVR adotado para esta tipologia (deixar vazio usa o VVR da análise)">VVR adotado: <input type="number" step="any" value={tip.vvr || ''} placeholder={mediaAjust > 0 && tip.area > 0 ? Math.round(mediaAjust * tip.area) : ''} onChange={e => updateTip(tIdx, 'vvr', parseFloat(e.target.value) || 0)}
                  className="w-24 bg-surface-raised border rounded px-1 py-0.5 num" onWheel={e => e.target.blur()} /> €</label>
                <span className="hidden sm:inline">|</span>
                <span>Média: <strong className="text-ink-muted">{media} €/m²</strong></span>
                <span>Ajustada: <strong className="text-ink-muted">{mediaAjust} €/m²</strong></span>
                {mediaAjust > 0 && tip.area > 0 && (
                  <span className="font-semibold text-ink">VVR sugerido: {EUR(mediaAjust * tip.area)}</span>
                )}
              </div>
            </div>

            {/* Header da tabela */}
            <div className="px-4 pt-2 grid grid-cols-12 gap-2 text-[10px] text-ink-muted uppercase tracking-wide border-b border-line pb-1">
              <span className="col-span-1">#</span>
              <span className="col-span-2">Preço</span>
              <span className="col-span-1">Área</span>
              <div className="col-span-6 grid grid-cols-6 gap-1 text-center">
                {Object.entries(AJUSTE_LABELS).map(([k, label]) => (
                  <span key={k} className={AUTO_FIELDS.has(k) ? 'text-ink-muted' : ''}>{label}{AUTO_FIELDS.has(k) ? ' ⚡' : ''}</span>
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
                  <div key={cIdx} className="border-b border-line pb-2 space-y-1">
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-1 text-ink-muted/70 font-semibold">
                        {comp.link ? (
                          <a href={comp.link} target="_blank" rel="noopener noreferrer"
                            className="text-brand-gold hover:underline cursor-pointer">{cIdx + 1}</a>
                        ) : (cIdx + 1)}
                      </span>
                      <div className="col-span-2">
                        <input type="number" step="any" value={comp.preco || ''} onChange={e => updateComp(tIdx, cIdx, 'preco', parseFloat(e.target.value) || 0)}
                          placeholder="€" className="w-full border rounded px-2 py-1 num" onWheel={e => e.target.blur()} />
                      </div>
                      <div className="col-span-1">
                        <input type="number" step="any" value={comp.area || ''} onChange={e => updateComp(tIdx, cIdx, 'area', parseFloat(e.target.value) || 0)}
                          placeholder="m²" className="w-full border rounded px-2 py-1 num" onWheel={e => e.target.blur()} />
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
                                className={`w-full border rounded px-1 py-1 num text-center ${
                                  isAuto ? 'bg-surface-muted text-ink border-line cursor-not-allowed' : ''
                                } ${(comp.ajustes?.[aj] || 0) > 0 ? 'text-success' : (comp.ajustes?.[aj] || 0) < 0 ? 'text-danger' : 'text-ink-muted'}`}
                              />
                            </div>
                          )
                        })}
                      </div>
                      <div className="col-span-1 text-right">
                        <p className="num text-ink-muted">{euroM2 > 0 ? euroM2 : '—'}</p>
                      </div>
                      <div className="col-span-1 text-right">
                        <p className={`num font-semibold ${ajusteTotal > 0 ? 'text-success' : ajusteTotal < 0 ? 'text-danger' : 'text-ink-muted'}`}>
                          {euroM2Ajust > 0 ? euroM2Ajust : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Linha de chevrons + badge ajuste total + eliminar */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-1" />
                      <div className="col-span-9 flex items-center gap-3">
                        <button onClick={() => toggleAttrs(key)} className="text-[11px] text-ink-muted hover:text-ink flex items-center gap-1">
                          {attrsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          Atributos detalhados
                        </button>
                        <button onClick={() => toggleAdj(key)} className="text-[11px] text-ink-muted hover:text-ink flex items-center gap-1">
                          {adjOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          Ajustes desagregados
                        </button>
                        <button
                          type="button"
                          onClick={() => removeComp(tIdx, cIdx)}
                          className="text-[11px] text-red-400 hover:text-danger inline-flex items-center gap-1"
                          title="Eliminar este comparável"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                      <div className="col-span-2 text-right">
                        {ajusteTotal !== 0 && (
                          <span className={`text-[10px] num ${ajusteTotal > 0 ? 'text-success' : 'text-danger'}`}>
                            {ajusteTotal > 0 ? '+' : ''}{ajusteTotal.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Accordion: Atributos detalhados */}
                    {attrsOpen && (
                      <div className="ml-8 mr-2 mt-1 p-3 bg-surface rounded-md grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <label className="md:col-span-2">
                          <span className="text-ink-muted">Descrição breve</span>
                          <input type="text" value={comp.descricao || ''} onChange={e => updateComp(tIdx, cIdx, 'descricao', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1" placeholder="Ex: Apartamento remodelado, ar cond., garagem fechada" />
                        </label>
                        <label>
                          <span className="text-ink-muted">Dias em Mercado</span>
                          <input type="number" value={comp.dias_mercado ?? ''} onChange={e => updateComp(tIdx, cIdx, 'dias_mercado', e.target.value === '' ? null : parseInt(e.target.value))}
                            className="w-full mt-0.5 border rounded px-2 py-1 num" />
                        </label>
                        <label>
                          <span className="text-ink-muted">Estado de Conservação</span>
                          <select value={comp.estado || ''} onChange={e => updateComp(tIdx, cIdx, 'estado', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1 bg-surface-raised">
                            <option value="">— Selecionar —</option>
                            {ESTADO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <label>
                          <span className="text-ink-muted">Piso</span>
                          <select value={comp.piso || ''} onChange={e => updateComp(tIdx, cIdx, 'piso', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1 bg-surface-raised">
                            <option value="">— Selecionar —</option>
                            {PISO_OPCOES.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label>
                            <span className="text-ink-muted">Elevador?</span>
                            <select value={comp.elevador ? 'Sim' : 'Não'} onChange={e => updateComp(tIdx, cIdx, 'elevador', e.target.value === 'Sim')}
                              className="w-full mt-0.5 border rounded px-2 py-1 bg-surface-raised">
                              <option>Não</option><option>Sim</option>
                            </select>
                          </label>
                          <label>
                            <span className="text-ink-muted">Garagem?</span>
                            <select value={comp.garagem ? 'Sim' : 'Não'} onChange={e => updateComp(tIdx, cIdx, 'garagem', e.target.value === 'Sim')}
                              className="w-full mt-0.5 border rounded px-2 py-1 bg-surface-raised">
                              <option>Não</option><option>Sim</option>
                            </select>
                          </label>
                        </div>
                        <label className="md:col-span-2">
                          <span className="text-ink-muted">URL do Anúncio</span>
                          <input type="url" value={comp.link || ''} onChange={e => updateComp(tIdx, cIdx, 'link', e.target.value)}
                            className="w-full mt-0.5 border rounded px-2 py-1 truncate" placeholder="https://..." />
                        </label>
                        <label className="md:col-span-3">
                          <span className="text-ink-muted">Notas</span>
                          <textarea value={comp.notas || ''} onChange={e => updateComp(tIdx, cIdx, 'notas', e.target.value)} rows={2}
                            className="w-full mt-0.5 border rounded px-2 py-1" />
                        </label>
                      </div>
                    )}

                    {/* Accordion: Ajustes desagregados */}
                    {adjOpen && (
                      <div className="ml-8 mr-2 mt-1 p-3 bg-surface rounded-md grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <label title="+ : comparável em piso menos valorizado e alvo em piso mais alto → VVR sobe.&#10;− : comparável em andar e alvo em cave → VVR desce.&#10;Ex: alvo em cave, comp. em 1.º andar → +3% a +8%.">
                          <span className="text-ink-muted">Ajuste Piso (%)</span>
                          <input type="number" step="0.5" value={comp.ajustes?.piso_pct ?? 0} onChange={e => updateComp(tIdx, cIdx, 'ajuste_piso_pct', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 border rounded px-2 py-1 num" />
                        </label>
                        <label title="− : comparável tem elevador e alvo não tem → remover prémio → VVR desce.&#10;0 : ambos com ou ambos sem.&#10;Ex: comp. com elevador, alvo sem → −3% a −5%.">
                          <span className="text-ink-muted">Ajuste Elevador (%)</span>
                          <input type="number" step="0.5" value={comp.ajustes?.elevador_pct ?? 0} onChange={e => updateComp(tIdx, cIdx, 'ajuste_elevador_pct', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 border rounded px-2 py-1 num" />
                        </label>
                        <label title="− : comparável tem garagem e alvo não tem → remover valor da garagem → VVR desce.&#10;0 : ambos com ou ambos sem.&#10;Ex: comp. com garagem, alvo sem → −5% a −8%.">
                          <span className="text-ink-muted">Ajuste Garagem (%)</span>
                          <input type="number" step="0.5" value={comp.ajustes?.garagem_pct ?? 0} onChange={e => updateComp(tIdx, cIdx, 'ajuste_garagem_pct', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 border rounded px-2 py-1 num" />
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
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-3 bg-brand-dark text-white">
            <h3 className="text-sm font-semibold">Resumo Estatístico do Estudo</h3>
            <p className="text-xs text-ink-muted">Análise agregada de todos os comparáveis válidos</p>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div>
              <p className="text-xs text-ink-muted uppercase">Comparáveis</p>
              <p className="text-lg num font-semibold">{stats.n}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase">Média VVR</p>
              <p className="text-lg num font-semibold">{EUR(stats.media)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase">Mediana VVR</p>
              <p className="text-lg num font-semibold">{EUR(stats.mediana)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase">Mín. VVR</p>
              <p className="text-lg num font-semibold">{EUR(stats.min)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted uppercase">Máx. VVR</p>
              <p className="text-lg num font-semibold">{EUR(stats.max)}</p>
            </div>
          </div>
          {stats.delta != null && stats.posicionamento && (
            <div className="px-4 pb-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="text-xs text-ink-muted">
                VVR Adotado <strong className="num text-ink">{EUR(stats.vvrAdoptado)}</strong> vs. Mediana
                <span className={`ml-2 num font-semibold ${stats.delta < 0 ? 'text-success' : stats.delta > 5 ? 'text-danger' : 'text-brand-gold'}`}>
                  {stats.delta >= 0 ? '+' : ''}{stats.delta.toFixed(1)}%
                </span>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                stats.posicionamento.cor === 'verde' ? 'bg-success/10 text-success border border-success/30'
                : stats.posicionamento.cor === 'vermelho' ? 'bg-danger/10 text-danger border border-danger/30'
                : 'bg-warning/10 text-warning border border-warning/30'
              }`}>{stats.posicionamento.texto}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
