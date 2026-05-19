/**
 * Painel de detalhe para Imóveis, Investidores, Consultores.
 * Mostra: campos editáveis + relações + timeline + tarefas + reuniões.
 */
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { FileDown, ChevronDown, ChevronUp, Phone, Clock, FileText, Pencil, Save, X, ArrowLeft, Link2, Check, PhoneCall, Mail, MessageCircle, Calendar, CheckCircle2, RefreshCw, MoreVertical, TrendingUp, Wallet, Target, Hourglass, AlertTriangle, Users } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { PartilharAcesso } from '../PartilharAcesso.jsx'
import { FollowUpsSection } from './FollowUpsSection.jsx'
import { ImovelInteracoesSection } from './ImovelInteracoesSection.jsx'

const AnaliseTab = lazy(() => import('../analise/AnaliseTab.jsx').then(m => ({ default: m.AnaliseTab })))
const ObraTab = lazy(() => import('../obra/ObraTab.jsx').then(m => ({ default: m.ObraTab })))
const InteracoesTab = lazy(() => import('./InteracoesTab.jsx').then(m => ({ default: m.InteracoesTab })))
const MatchingInvestidoresTab = lazy(() => import('./MatchingInvestidoresTab.jsx').then(m => ({ default: m.MatchingInvestidoresTab })))
const WhatsAppTab = lazy(() => import('./WhatsAppTab.jsx').then(m => ({ default: m.WhatsAppTab })))
const FicheirosTab = lazy(() => import('./FicheirosTab.jsx').then(m => ({ default: m.FicheirosTab })))
const ChecklistTab = lazy(() => import('./ChecklistTab.jsx').then(m => ({ default: m.ChecklistTab })))
const VisitasTab = lazy(() => import('./VisitasTab.jsx').then(m => ({ default: m.VisitasTab })))
const DocumentosInvestidorTab = lazy(() => import('./DocumentosInvestidorTab.jsx').then(m => ({ default: m.DocumentosInvestidorTab })))

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
    </div>
  )
}
import { Combobox } from '../ui/Combobox.jsx'
import coimbraFreguesiasData from '../../constants/coimbra-freguesias.json'
import ampFreguesiasData from '../../constants/amp-freguesias.json'
import { supabase } from '../../lib/supabase.js'
import { CLASS_COLOR, INV_STATUS, INV_STATUS_COLOR, INV_STATUS_PASSIVO, INV_STATUS_ATIVO, invStatusFor, ORIGENS_INVESTIDORES, fmtDate, fmtDateRelative } from '../../constants.js'

// Hook simples — carrega lookups uma vez e mantém em memória
const __lookupsCache = { data: null, promise: null }
function useLookups() {
  const [data, setData] = useState(__lookupsCache.data)
  useEffect(() => {
    if (__lookupsCache.data) return
    if (!__lookupsCache.promise) {
      __lookupsCache.promise = apiFetch('/api/crm/lookups').then(r => r.json()).then(d => { __lookupsCache.data = d; return d })
    }
    __lookupsCache.promise.then(setData)
  }, [])
  return data || {}
}

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)

const ACAO_LABEL = { INSERT: 'Criado', UPDATE: 'Atualizado', DELETE: 'Apagado' }
const ACAO_COLOR = { INSERT: 'text-green-600', UPDATE: 'text-blue-600', DELETE: 'text-red-600' }

export const MOTIVOS_NAO_INTERESSA_PADRAO = [
  'Preço elevado',
  'Produto final não vendável',
  'Sem interesse do investidor',
  'Zona fraca',
  'ROI insuficiente',
  'Já vendido',
  'Estado de conservação',
  'Discrepância em áreas/documentos',
  'Proprietário difícil',
  'Imóvel com ónus / problemas legais',
]

function PontosRiscosTab({ imovel, endpoint, id, onUpdate, toast }) {
  const CAMPOS = [
    { key: 'tese_investimento', label: 'Tese de investimento', color: 'indigo', icon: '🎯' },
    { key: 'pontos_fortes', label: 'Pontos fortes', color: 'emerald', icon: '✅' },
    { key: 'pontos_fracos', label: 'Pontos fracos', color: 'amber', icon: '⚠️' },
    { key: 'riscos', label: 'Riscos', color: 'rose', icon: '🚨' },
    { key: 'mitigacao_riscos', label: 'Mitigação de riscos', color: 'sky', icon: '🛡️' },
  ]
  const [valores, setValores] = useState({
    tese_investimento: imovel.tese_investimento || '',
    pontos_fortes: imovel.pontos_fortes || '',
    pontos_fracos: imovel.pontos_fracos || '',
    riscos: imovel.riscos || '',
    mitigacao_riscos: imovel.mitigacao_riscos || '',
  })

  async function saveCampo(key) {
    const v = valores[key]
    if ((v || '') === (imovel[key] || '')) return
    try {
      const r = await apiFetch(`/api/crm/${endpoint}/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: v }),
      })
      if (!r.ok) throw new Error(await r.text())
      await onUpdate()
      toast('Guardado', 'success')
    } catch (err) { toast('Erro: ' + err.message, 'error') }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-neutral-800">Pontos & Riscos do imóvel</h3>
        <p className="text-xs text-neutral-400 mt-0.5">
          Um por linha. Aparece no relatório enviado ao investidor. Auto-guarda ao sair do campo.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {CAMPOS.map(c => {
          const hint = c.key === 'riscos' || c.key === 'mitigacao_riscos'
            ? 'Uma linha por risco. Os Riscos e a Mitigação emparelham-se na mesma ordem para a tabela do PDF.'
            : null
          return (
            <div key={c.key} className="rounded-xl border border-gray-200 p-4 bg-white">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-2">
                <span>{c.icon}</span>{c.label}
              </label>
              <textarea
                value={valores[c.key]}
                onChange={e => setValores(prev => ({ ...prev, [c.key]: e.target.value }))}
                onBlur={() => saveCampo(c.key)}
                rows={8}
                placeholder={`Um ${c.label.toLowerCase()} por linha…`}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
              />
              {hint && <p className="text-[11px] text-neutral-500 mt-1.5">{hint}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LocalizacaoTab({ imovel, onUpdate, toast }) {
  const [origem, setOrigem] = useState(imovel.morada || imovel.zona || '')
  const [destinos, setDestinos] = useState(() => {
    const guardados = imovel.pois_distancias?.resultados
    if (Array.isArray(guardados) && guardados.length > 0) {
      return guardados.map(r => ({ categoria: r.categoria || '', icone: r.icone || '📍', endereco: r.endereco || '' }))
    }
    return [
      { categoria: 'Mercearia/Supermercado', icone: '🛒', endereco: '' },
      { categoria: 'Hospital', icone: '🏥', endereco: '' },
      { categoria: 'Farmácia', icone: '💊', endereco: '' },
      { categoria: 'Escola Básica', icone: '🏫', endereco: '' },
    ]
  })
  const [mode, setMode] = useState(imovel.pois_distancias?.mode || 'driving')
  const [calculando, setCalculando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState(imovel.pois_distancias || null)
  const [destaque, setDestaque] = useState(imovel.pois_distancias?.destaque || '')
  const [hl1Titulo, setHl1Titulo] = useState(imovel.pois_distancias?.highlights?.[0]?.titulo || '')
  const [hl1Desc, setHl1Desc] = useState(imovel.pois_distancias?.highlights?.[0]?.descricao || '')
  const [hl1Badge, setHl1Badge] = useState(imovel.pois_distancias?.highlights?.[0]?.badge || '')
  const [hl1Sub, setHl1Sub] = useState(imovel.pois_distancias?.highlights?.[0]?.subtitulo || '')
  const [hl2Titulo, setHl2Titulo] = useState(imovel.pois_distancias?.highlights?.[1]?.titulo || '')
  const [hl2Desc, setHl2Desc] = useState(imovel.pois_distancias?.highlights?.[1]?.descricao || '')
  const [hl2Sub, setHl2Sub] = useState(imovel.pois_distancias?.highlights?.[1]?.subtitulo || '')
  const [imagemUrl, setImagemUrl] = useState(imovel.localizacao_imagem || null)
  const [uploading, setUploading] = useState(false)

  async function uploadManual(file) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('imagem', file)
      const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/localizacao`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setImagemUrl(j.localizacao_imagem)
      await onUpdate()
      toast('Imagem substituída', 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setUploading(false)
  }

  async function removerImagem() {
    if (!confirm('Remover imagem de localização?')) return
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/localizacao`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await r.text())
      setImagemUrl(null)
      await onUpdate()
      toast('Imagem removida', 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
  }

  function setDestino(i, patch) {
    setDestinos(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  }
  function adicionar() {
    setDestinos(prev => [...prev, { categoria: '', icone: '📍', endereco: '' }])
  }
  function remover(i) {
    setDestinos(prev => prev.filter((_, idx) => idx !== i))
  }

  async function calcular() {
    if (!origem.trim()) { toast('Indica a morada/origem do imóvel', 'error'); return }
    const validos = destinos.filter(d => d.endereco?.trim())
    if (validos.length === 0) { toast('Adiciona pelo menos um destino com morada', 'error'); return }
    setCalculando(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/distancias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem, destinos: validos, mode }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || j.detalhe || 'Erro ao calcular distâncias')
      setResultado(j)
      await onUpdate()
      toast(`${j.resultados.length} distâncias calculadas`, 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setCalculando(false)
  }

  async function gerarImagem() {
    const validos = destinos.filter(d => d.endereco?.trim())
    if (validos.length === 0 && !resultado?.resultados?.length) {
      toast('Adiciona destinos ou corre "Calcular distâncias" antes', 'error'); return
    }
    setGerando(true)
    try {
      const highlights = []
      if (hl1Titulo.trim()) highlights.push({ titulo: hl1Titulo, descricao: hl1Desc, badge: hl1Badge || null, subtitulo: hl1Sub, accent: 'gold' })
      if (hl2Titulo.trim()) highlights.push({ titulo: hl2Titulo, descricao: hl2Desc, subtitulo: hl2Sub, accent: 'red' })
      const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/estudo-localizacao`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem, mode, destinos: validos.length > 0 ? validos : undefined, highlights, destaque: destaque || null }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro ao gerar imagem')
      setImagemUrl(j.localizacao_imagem ? `${j.localizacao_imagem}?t=${Date.now()}` : null)
      await onUpdate()
      toast('Imagem gerada — vê em cima', 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setGerando(false)
  }

  const MODES = [
    { v: 'driving', l: '🚗 Carro' },
    { v: 'walking', l: '🚶 A pé' },
    { v: 'bicycling', l: '🚴 Bicicleta' },
    { v: 'transit', l: '🚌 Transp. público' },
  ]

  return (
    <div className="space-y-5">
      {/* Imagem do estudo no topo */}
      {imagemUrl ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-yellow-50 to-white flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">🗺️ Estudo de Localização</span>
            <div className="flex gap-1.5">
              <a href={imagemUrl} target="_blank" rel="noreferrer"
                className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
                Abrir em nova aba
              </a>
              <label className={`text-[11px] px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? 'A carregar…' : 'Substituir'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => uploadManual(e.target.files?.[0])} />
              </label>
              <button type="button" onClick={removerImagem}
                className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-red-200 text-red-700 hover:bg-red-50">
                Remover
              </button>
            </div>
          </div>
          <div className="p-3 bg-gray-50 flex justify-center">
            <img src={imagemUrl} alt="Estudo de Localização" className="w-full max-w-3xl rounded-md border border-gray-200 bg-white" loading="lazy" decoding="async" />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 bg-white text-center">
          <p className="text-sm text-gray-500">🗺️ Sem imagem de localização ainda. Preenche os destinos e clica em <strong>"🎨 Gerar imagem do estudo"</strong> em baixo.</p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-neutral-800">Estudo de Localização</h3>
        <p className="text-xs text-neutral-400 mt-0.5">
          Distâncias e tempo do imóvel a vários pontos de interesse via Google Distance Matrix.
        </p>
      </div>

      {/* Origem + modo */}
      <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1">📍 Morada do imóvel (origem)</label>
          <input type="text" value={origem} onChange={e => setOrigem(e.target.value)}
            placeholder="Ex: Rua das Flores 12, Coimbra"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1">Modo de transporte</label>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map(m => (
              <button key={m.v} type="button" onClick={() => setMode(m.v)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  mode === m.v ? 'border-transparent text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                style={mode === m.v ? { backgroundColor: '#C9A84C' } : undefined}>
                {m.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Destinos */}
      <div className="rounded-xl border border-gray-200 p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-700">Pontos de interesse</h4>
          <button type="button" onClick={adicionar}
            className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            + Adicionar
          </button>
        </div>
        <div className="space-y-2">
          {destinos.map((d, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input type="text" value={d.icone || ''} onChange={e => setDestino(i, { icone: e.target.value })}
                className="w-12 text-center px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={d.categoria || ''} onChange={e => setDestino(i, { categoria: e.target.value })}
                placeholder="Categoria (ex: Hospital)"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={d.endereco || ''} onChange={e => setDestino(i, { endereco: e.target.value })}
                placeholder="Morada do ponto (ex: Hospital Geral, Coimbra)"
                className="flex-[2] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <button type="button" onClick={() => remover(i)}
                className="px-2 py-2 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100">×</button>
            </div>
          ))}
          {destinos.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Sem pontos de interesse — clica em "Adicionar"</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={calcular} disabled={calculando || gerando}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {calculando ? 'A calcular…' : 'Calcular distâncias'}
          </button>
          <button type="button" onClick={gerarImagem} disabled={calculando || gerando}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#C9A84C' }}>
            {gerando ? 'A gerar imagem…' : '🎨 Gerar imagem do estudo'}
          </button>
        </div>
      </div>

      {/* Opções da imagem (destaque + highlights) */}
      <details className="rounded-xl border border-gray-200 bg-white">
        <summary className="px-4 py-3 text-xs font-semibold text-gray-700 cursor-pointer select-none">
          ✨ Opções da imagem (destaque + highlights)
        </summary>
        <div className="p-4 pt-0 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">★ Destacar ponto (gold)</label>
            <select value={destaque} onChange={e => setDestaque(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
              <option value="">— sem destaque —</option>
              {destinos.filter(d => d.categoria?.trim()).map((d, i) => (
                <option key={i} value={d.categoria}>{d.icone} {d.categoria}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-yellow-200 rounded-lg p-3 space-y-2 bg-yellow-50/30">
              <p className="text-[11px] font-bold text-yellow-800 uppercase tracking-wide">Highlight 1 (gold)</p>
              <input type="text" value={hl1Titulo} onChange={e => setHl1Titulo(e.target.value)} placeholder="Título (ex: 🚌 SMTUC à porta)"
                className="w-full px-3 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={hl1Desc} onChange={e => setHl1Desc(e.target.value)} placeholder="Descrição"
                className="w-full px-3 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={hl1Badge} onChange={e => setHl1Badge(e.target.value)} placeholder="Badge curto (ex: 5)"
                className="w-full px-3 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={hl1Sub} onChange={e => setHl1Sub(e.target.value)} placeholder="Sub-texto"
                className="w-full px-3 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
            </div>
            <div className="border border-red-200 rounded-lg p-3 space-y-2 bg-red-50/30">
              <p className="text-[11px] font-bold text-red-800 uppercase tracking-wide">Highlight 2 (red)</p>
              <input type="text" value={hl2Titulo} onChange={e => setHl2Titulo(e.target.value)} placeholder="Título (ex: 🛡️ GNR em frente)"
                className="w-full px-3 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-300" />
              <input type="text" value={hl2Desc} onChange={e => setHl2Desc(e.target.value)} placeholder="Descrição"
                className="w-full px-3 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-300" />
              <input type="text" value={hl2Sub} onChange={e => setHl2Sub(e.target.value)} placeholder="Sub-texto"
                className="w-full px-3 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
          </div>
        </div>
      </details>

      {/* Resultados */}
      {resultado?.resultados?.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">Resultados — {resultado.mode}</span>
            <span className="text-[10px] text-gray-400">
              {resultado.atualizado_em ? new Date(resultado.atualizado_em).toLocaleString('pt-PT') : ''}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] text-gray-400 uppercase tracking-wide">
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2">Ponto</th>
                <th className="text-left px-4 py-2">Endereço</th>
                <th className="text-right px-4 py-2">Distância</th>
                <th className="text-right px-4 py-2">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {resultado.resultados.map((r, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2"><span className="mr-1">{r.icone || '📍'}</span>{r.categoria || '—'}</td>
                  <td className="px-4 py-2 text-gray-500 truncate max-w-xs">{r.endereco}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.distancia_texto || (r.status !== 'OK' ? r.status : '—')}</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-700">{r.duracao_texto || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function MotivoNaoInteressaChips({ value, onChange }) {
  const partes = (value || '').split(/;\s*/).map(s => s.trim()).filter(Boolean)
  const padraoSet = new Set(MOTIVOS_NAO_INTERESSA_PADRAO)
  const selected = new Set(partes.filter(p => padraoSet.has(p)))
  const notasIniciais = partes.filter(p => !padraoSet.has(p)).join('; ')
  const [notas, setNotas] = useState(notasIniciais)

  function build(novosSel, novasNotas) {
    return [...novosSel, (novasNotas || '').trim()].filter(Boolean).join('; ')
  }

  function toggle(m) {
    const novos = new Set(selected)
    if (novos.has(m)) novos.delete(m)
    else novos.add(m)
    onChange(build(novos, notas))
  }

  function onNotasChange(e) {
    setNotas(e.target.value)
    onChange(build(selected, e.target.value))
  }

  return (
    <>
      <label className="text-xs text-gray-400 block mb-1">Motivo Não Interessa</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {MOTIVOS_NAO_INTERESSA_PADRAO.map(m => {
          const on = selected.has(m)
          return (
            <button key={m} type="button" onClick={() => toggle(m)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                on
                  ? 'border-transparent text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
              style={on ? { backgroundColor: '#C9A84C' } : undefined}>
              {on && <span className="mr-1">✓</span>}{m}
            </button>
          )
        })}
      </div>
      <textarea
        value={notas}
        onChange={onNotasChange}
        rows={2}
        placeholder="Outras notas (opcional)…"
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
      />
    </>
  )
}

export function MotivoNaoInteressaInline({ motivoActual, onSave }) {
  const [valor, setValor] = useState(motivoActual || '')
  return (
    <MotivoNaoInteressaChips
      value={valor}
      onChange={(v) => {
        setValor(v)
        onSave(v)
      }}
    />
  )
}

async function getToken() {
  try {
    const { data: { session } } = await supabase?.auth?.getSession() || { data: {} }
    return session?.access_token || ''
  } catch { return '' }
}

// ── Tab Documentos para Imóveis ─────────────────────────────
const DOC_LABELS = {
  ficha_imovel: 'Ficha do Imóvel',
  ficha_visita: 'Ficha de Visita',
  analise_rentabilidade: 'Análise de Rentabilidade',
  estudo_comparaveis: 'Estudo Comparáveis',
  proposta_formal: 'Proposta Formal',
  dossier_investidor: 'Dossier de Investimento',
  proposta_investimento_anonima: 'Proposta de Investimento (Anónima)',
  resumo_negociacao: 'Resumo Negociação',
  ficha_follow_up: 'Ficha Follow-Up',
  ficha_descarte: 'Ficha de Descarte',
}
const ESTADO_DOCS = {
  'Adicionado': ['ficha_imovel'], 'Pré-aprovação': ['ficha_imovel'],
  'Necessidade de Visita': ['ficha_visita'],
  'Estudo de VVR': ['analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário': ['proposta_formal'], 'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Em negociação': ['resumo_negociacao'],
  'Enviar proposta ao investidor': ['dossier_investidor', 'proposta_investimento_anonima'],
  'Follow Up após proposta': ['ficha_follow_up'], 'Follow UP': ['ficha_follow_up'],
  'Descartado': ['ficha_descarte'],
}

// ── Sub-abas por fase da pipeline (estados com mesmos docs agrupados) ──
const FASE_TABS = [
  { key: 'adicionado',   label: 'Adicionado',         estados: ['Adicionado', 'Pré-aprovação'],
    docs: [{ tipo: 'ficha_imovel', label: 'Ficha do Imóvel', compilavel: 'ficha_imovel' }] },
  { key: 'visita',       label: 'Visita',              estados: ['Necessidade de Visita', 'Visita Marcada'],
    docs: [{ tipo: 'ficha_visita', label: 'Ficha de Visita', compilavel: 'ficha_visita' }] },
  { key: 'vvr',          label: 'Estudo de VVR',       estados: ['Estudo de VVR'],
    docs: [
      { tipo: 'analise_rentabilidade', label: 'Análise de Rentabilidade', compilavel: 'analise_rentabilidade' },
      { tipo: 'estudo_comparaveis',    label: 'Estudo de Comparáveis',    compilavel: 'estudo_comparaveis' },
    ] },
  { key: 'proposta',     label: 'Proposta',            estados: ['Criar Proposta ao Proprietário', 'Enviar proposta ao Proprietário'],
    docs: [{ tipo: 'proposta_formal', label: 'Proposta ao Proprietário', compilavel: 'proposta_formal' }] },
  { key: 'negociacao',   label: 'Negociação',          estados: ['Em negociação'],
    docs: [{ tipo: 'resumo_negociacao', label: 'Resumo de Negociação', compilavel: 'resumo_negociacao' }] },
  { key: 'investidor',   label: 'Investidor',          estados: ['Enviar proposta ao investidor'],
    docs: [
      { tipo: 'dossier_investidor',            label: 'Dossier de Investimento',            compilavel: 'dossier_investidor' },
      { tipo: 'proposta_investimento_anonima', label: 'Proposta de Investimento (Anónima)', compilavel: 'proposta_investimento_anonima' },
    ] },
  { key: 'followup',     label: 'Follow Up',           estados: ['Follow Up após proposta', 'Follow UP'],
    docs: [{ tipo: 'ficha_follow_up', label: 'Ficha de Follow Up', compilavel: 'ficha_follow_up' }] },
  { key: 'descarte',     label: 'Descartado',          estados: ['Descartado'],
    docs: [{ tipo: 'ficha_descarte', label: 'Ficha de Descarte', compilavel: 'ficha_descarte' }] },
]

const ALL_DOCS = FASE_TABS.flatMap(f => f.docs)

function RelatoriosImovelTab({ imovelId, estado, driveFolderId }) {
  const estadoClean = (estado || '').replace(/^\d+-\s*/, '').trim()
  const faseActual = FASE_TABS.find(f => f.estados.includes(estadoClean))

  const [subTab, setSubTab] = useState(faseActual?.key || 'adicionado')
  const [selected, setSelected] = useState(new Set())

  const activeTab = FASE_TABS.find(f => f.key === subTab)
  const visibleDocs = activeTab?.docs || []

  function toggle(key) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function selectAll() { setSelected(new Set(ALL_DOCS.map(d => d.compilavel))) }
  function selectNone() { setSelected(new Set()) }

  const selectedDocs = ALL_DOCS.filter(d => selected.has(d.compilavel))
  const compilarUrl = selectedDocs.length > 0
    ? `/api/crm/imoveis/${imovelId}/relatorio-investidor?seccoes=${selectedDocs.map(d => d.compilavel).join(',')}`
    : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-neutral-800">Documentos do Imóvel</h3>
          <p className="text-xs text-neutral-400 mt-0.5">Selecciona os documentos para gerar o dossier para investidor</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="px-2.5 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors">Todos</button>
          <button onClick={selectNone} className="px-2.5 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors">Nenhum</button>
        </div>
      </div>

      {/* Sub-abas — fases da pipeline */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {FASE_TABS.map(f => {
          const isActive = subTab === f.key
          const isCurrent = faseActual?.key === f.key
          return (
            <button key={f.key} onClick={() => setSubTab(f.key)}
              className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                isActive ? 'text-white shadow-sm' : isCurrent ? 'text-emerald-700 bg-emerald-50' : 'text-gray-500 hover:bg-gray-100'
              }`}
              style={isActive ? { backgroundColor: '#1A1A1A' } : undefined}>
              {f.label}
              {isCurrent && !isActive && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
            </button>
          )
        })}
      </div>

      {/* Lista de documentos da fase seleccionada */}
      <div className="rounded-xl border border-neutral-100 overflow-hidden divide-y divide-neutral-50">
        {visibleDocs.map(d => {
          const isSelected = selected.has(d.compilavel)
          return (
            <div key={d.tipo}
              className={`flex items-center gap-3 px-4 py-3 transition-colors group cursor-pointer ${
                isSelected ? 'bg-amber-50/70' : 'bg-white hover:bg-neutral-50/50'
              }`}
              onClick={() => toggle(d.compilavel)}>
              <input type="checkbox" checked={isSelected} readOnly
                className="w-4 h-4 rounded border-neutral-300 shrink-0 pointer-events-none" style={{ accentColor: '#C9A84C' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-700">{d.label}</p>
              </div>
              <button type="button"
                onClick={async e => {
                  e.stopPropagation()
                  const token = await getToken()
                  const url = `/api/crm/imoveis/${imovelId}/documento/${d.tipo}${token ? `?token=${token}` : ''}`
                  window.open(url, '_blank')
                }}
                className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors shrink-0 opacity-50 group-hover:opacity-100">
                Abrir
              </button>
            </div>
          )
        })}
      </div>

      {/* Barra fixa em baixo — gerar dossier */}
      <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
        selectedDocs.length > 0 ? 'border-brand-gold bg-[#faf8f2]' : 'border-neutral-200 bg-neutral-50'
      }`}>
        <div>
          <p className="text-sm font-bold text-neutral-800">
            {selectedDocs.length > 0 ? `${selectedDocs.length} documento${selectedDocs.length > 1 ? 's' : ''} seleccionado${selectedDocs.length > 1 ? 's' : ''}` : 'Nenhum documento seleccionado'}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">O dossier compilado inclui capa profissional e índice</p>
        </div>
        {compilarUrl ? (
          <button type="button"
            onClick={async () => {
              const token = await getToken()
              const url = `${compilarUrl}${token ? `&token=${token}` : ''}`
              window.open(url, '_blank')
            }}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white shadow-sm hover:shadow transition-all"
            style={{ backgroundColor: '#C9A84C' }}>
            <FileDown className="w-4 h-4" /> Gerar Dossier
          </button>
        ) : (
          <span className="px-5 py-2.5 text-sm text-neutral-400 rounded-xl bg-neutral-200/50">Gerar Dossier</span>
        )}
      </div>
    </div>
  )
}

export function DetailPanel({ type, id, onClose, onSave, onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('detalhe')
  const [reunioes, setReunioes] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [openContactoForm, setOpenContactoForm] = useState(false)
  const toast = useToast()

  async function attemptClose() {
    if (saving) return
    if (editing && JSON.stringify(form) !== JSON.stringify(data)) {
      const ok = await saveEdit()
      if (!ok) return
    }
    onClose?.()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      toast('Não foi possível copiar', 'error')
    }
  }

  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores' }[type]
  const prevTab = useRef(activeTab)

  // Mark-seen: quando o utilizador abre o tab WhatsApp, marca como lido
  useEffect(() => {
    if (activeTab === 'whatsapp' && id && type === 'Consultores') {
      apiFetch(`/api/crm/whatsapp/mark-seen/${id}`, { method: 'POST' }).catch(() => {})
    }
  }, [activeTab, id, type])

  function startEdit() {
    setForm({ ...data })
    setEditing(true)
  }

  function loadData() {
    return apiFetch(`/api/crm/${endpoint}/${id}/full`).then(r => r.json()).then(setData).catch(() => {})
  }

  // Recarregar dados quando sai da tab analise (para reflectir alterações da calculadora)
  useEffect(() => {
    if (prevTab.current === 'analise' && activeTab !== 'analise') {
      loadData()
    }
    prevTab.current = activeTab
  }, [activeTab])

  async function saveEdit() {
    // Validação: Follow Up e Não Interessa exigem motivo antes de guardar
    if (type === 'Imóveis') {
      const est = (form.estado || '').replace(/^\d+-\s*/, '').trim()
      if (/follow ?up/i.test(est) && !(form.motivo_follow_up || '').trim()) {
        toast('Indica o "Motivo Follow Up" antes de guardar', 'error')
        return false
      }
      if (/n[ãa]o interessa/i.test(est) && !(form.motivo_nao_interessa || '').trim()) {
        toast('Indica o "Motivo Não Interessa" antes de guardar', 'error')
        return false
      }
    }
    setSaving(true)
    try {
      // Limpar campos do form que são relações (não enviar ao PUT)
      const { negocios, consultores, imoveis, tarefas, timeline, analises, documentos, checklist, interacoes, ...rest } = form
      // Remover campos virtuais (prefixo _) que vêm da lista enriquecida e não existem na BD
      const cleanForm = Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith('_')))
      const r = await apiFetch(`/api/crm/${endpoint}/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleanForm),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao guardar')
      }
      await loadData()
      setEditing(false)
      if (onSave) onSave()
      toast('Alterações guardadas', 'success')
      setSaving(false)
      return true
    } catch (e) {
      console.error('Erro ao guardar:', e)
      toast(e.message, 'error')
      setSaving(false)
      return false
    }
  }

  function cancelEdit() { setEditing(false); setForm({}) }
  function setField(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  useEffect(() => {
    if (!id || !endpoint) return
    setLoading(true)
    setActiveTab('detalhe')
    setEditing(false)
    loadData()
      .finally(() => setLoading(false))

    // Carregar reuniões para investidores e consultores
    if (type === 'Investidores' || type === 'Consultores') {
      apiFetch(`/api/crm/reunioes?entidade_tipo=${endpoint}&entidade_id=${id}`)
        .then(r => r.json())
        .then(setReunioes)
        .catch(() => {})
    }
  }, [id, endpoint])

  if (loading) return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">A carregar...</div>
  if (!data) return null

  // Tabs dinâmicos por tipo
  const tabs = [
    { key: 'detalhe', label: type === 'Imóveis' ? 'Imóvel' : type === 'Investidores' ? 'Ficha do investidor' : type === 'Consultores' ? 'Ficha do consultor' : 'Detalhe', icon: '📋', show: true },
    { key: 'ficheiros', label: 'Ficheiros', icon: '📷', show: type === 'Imóveis' },
    { key: 'analise', label: 'Análise Financeira', icon: '📊', show: type === 'Imóveis' },
    { key: 'obra', label: 'Obra', icon: '🏗️', show: type === 'Imóveis' },
    { key: 'localizacao', label: 'Localização', icon: '📍', show: type === 'Imóveis' },
    { key: 'pontos_riscos', label: 'Pontos & Riscos', icon: '⚖️', show: type === 'Imóveis' },
    { key: 'visitas', label: 'Visitas', icon: '🚪', show: type === 'Imóveis' },
    { key: 'matching', label: 'Matching investidores', icon: '🎯', show: type === 'Imóveis' },
    { key: 'relatorios_imovel', label: 'Documentos', icon: '📄', show: type === 'Imóveis' },
    { key: 'checklist', label: 'Checklist', icon: '📋', show: type === 'Imóveis' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '📱', show: type === 'Consultores' },
    { key: 'interacoes', label: `Interacções (${data?.interacoes?.length ?? 0})`, icon: '💬', show: type === 'Consultores' },
    { key: 'documentos', label: `Documentos (${data?.documentos?.length ?? 0})`, icon: '📎', show: type === 'Investidores' },
    { key: 'relatorios', label: `Reuniões (${reunioes.length})`, icon: '📄', show: (type === 'Investidores' || type === 'Consultores') },
    { key: 'avaliacao', label: 'Avaliação', icon: '🎯', show: type === 'Investidores' },
  ].filter(t => t.show)

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3" style={{ backgroundColor: '#0d0d0d' }}>
        <button onClick={attemptClose} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#1a1a1a', color: '#C9A84C', border: '1px solid #C9A84C33' }}
          title={editing ? 'Guardar e voltar' : 'Voltar à lista (Esc)'}>
          <ArrowLeft className="w-3.5 h-3.5" /> {editing ? 'Guardar e voltar' : 'Voltar'}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest" style={{ color: '#C9A84C' }}>{type}</p>
          <h2 className="text-lg font-bold text-white truncate">{data.nome ?? data.movimento}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
            style={{ backgroundColor: '#1a1a1a', color: '#C9A84C', border: '1px solid #C9A84C33' }}
            title="Copiar link partilhável">
            {linkCopied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Link2 className="w-3.5 h-3.5" /> Link</>}
          </button>
          {type === 'Imóveis' && (
            <PartilharAcesso entidade="imovel" entidadeId={data.id} nome={data.nome} />
          )}
          {editing ? (
            <>
              <button onClick={saveEdit} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: '#22c55e', color: '#fff' }}>
                <Save className="w-3.5 h-3.5" /> {saving ? 'A guardar...' : 'Guardar'}
              </button>
              <button onClick={cancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                style={{ backgroundColor: '#333', color: '#999' }}>
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </>
          ) : (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={{ backgroundColor: '#1a1a1a', color: '#C9A84C', border: '1px solid #C9A84C33' }}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
          {type === 'Consultores' && !editing && (
            <button onClick={() => { setActiveTab('interacoes'); setOpenContactoForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={{ backgroundColor: '#22c55e', color: '#fff' }}
              title="Registar contacto efectuado">
              <PhoneCall className="w-3.5 h-3.5" /> Registar Contacto
            </button>
          )}
          {type === 'Imóveis' && !editing && (
            <button onClick={async () => {
              const token = await getToken()
              window.open(`/api/crm/imoveis/${id}/relatorio?token=${token}`, '_blank')
            }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              style={{ backgroundColor: '#1a1a1a', color: '#C9A84C', border: '1px solid #C9A84C33' }}>
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
          )}
          <button onClick={attemptClose} disabled={saving} className="text-gray-400 hover:text-white text-xl leading-none disabled:opacity-50 disabled:cursor-not-allowed" title={editing ? 'Guardar e fechar' : 'Fechar'}>&times;</button>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex border-b border-gray-200 overflow-x-auto" style={{ backgroundColor: '#F5F4F0' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="relative px-4 sm:px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                color: activeTab === t.key ? '#1A1A1A' : '#9ca3af',
                backgroundColor: activeTab === t.key ? 'white' : 'transparent',
              }}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
              {activeTab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: '#C9A84C' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Análise Financeira tab */}
      {/* Interacções (Consultores) */}
      <Suspense fallback={<TabFallback />}>
      {type === 'Consultores' && activeTab === 'whatsapp' ? (
        <WhatsAppTab consultorId={data.id} consultorNome={data.nome} controloManual={data.controlo_manual} onUpdate={loadData} />

      ) : type === 'Consultores' && activeTab === 'interacoes' ? (
        <div className="p-4 sm:p-6">
          <InteracoesTab consultorId={data.id} onUpdate={loadData} controloManual={data.controlo_manual}
            autoOpenForm={openContactoForm} onAutoOpenConsumed={() => setOpenContactoForm(false)} />
        </div>

      ) : type === 'Imóveis' && activeTab === 'checklist' ? (
        <ChecklistTab imovel={data} onUpdate={loadData} />

      ) : type === 'Imóveis' && activeTab === 'visitas' ? (
        <VisitasTab imovelId={data.id} onUpdate={loadData} />

      ) : type === 'Imóveis' && activeTab === 'matching' ? (
        <div className="p-4 sm:p-6">
          <MatchingInvestidoresTab imovelId={data.id} imovelNome={data.nome} />
        </div>

      ) : type === 'Imóveis' && activeTab === 'pontos_riscos' ? (
        <div className="p-4 sm:p-6">
          <PontosRiscosTab imovel={data} endpoint={endpoint} id={id} onUpdate={loadData} toast={toast} />
        </div>

      ) : type === 'Imóveis' && activeTab === 'localizacao' ? (
        <div className="p-4 sm:p-6">
          <LocalizacaoTab imovel={data} onUpdate={loadData} toast={toast} />
        </div>

      ) : type === 'Imóveis' && activeTab === 'obra' ? (
        <ObraTab imovelId={data.id} imovelNome={data.nome} />

      ) : type === 'Imóveis' && activeTab === 'analise' ? (
        <div className="p-4 sm:p-6">
          <AnaliseTab imovelId={data.id} imovelNome={data.nome} imovel={data} />
        </div>

      /* Ficheiros do imóvel (fotos + documentos + Drive) */
      ) : type === 'Imóveis' && activeTab === 'ficheiros' ? (
        <div className="p-4 sm:p-6">
          <FicheirosTab imovelId={data.id} driveFolderId={data.drive_folder_id} />
        </div>

      /* Relatórios do imóvel (documentos de fase) */
      ) : type === 'Imóveis' && activeTab === 'relatorios_imovel' ? (
        <div className="p-4 sm:p-6">
          <RelatoriosImovelTab imovelId={data.id} estado={data.estado} driveFolderId={data.drive_folder_id} imovelNome={data.nome} />
        </div>

      /* Documentos enviados a investidor */
      ) : type === 'Investidores' && activeTab === 'documentos' ? (
        <div className="p-4 sm:p-6">
          <DocumentosInvestidorTab investidorId={data.id} documentos={data.documentos || []} onUpdate={loadData} />
        </div>

      /* Relatórios reuniões (investidores/consultores) */
      ) : activeTab === 'relatorios' ? (
        <div className="p-4 sm:p-6">
          <RelatoriosTab reunioes={reunioes} investidorNome={data.nome} />
        </div>

      /* Avaliação (Investidores) — fundir Scorecard + Histórico de Classificação */
      ) : type === 'Investidores' && activeTab === 'avaliacao' ? (
        <AvaliacaoTab data={data} onUpdate={loadData} />

      ) : (
      /* Detalhe tab */
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Barra de progresso checklist — só imóveis */}
        {type === 'Imóveis' && data.checklist?.length > 0 && (() => {
          const cl = data.checklist
          const estadoAtual = data.estado
          const obrigTotal = cl.filter(c => c.obrigatoria)
          const doneTotal = obrigTotal.filter(c => c.concluida).length
          const totalTotal = obrigTotal.length
          const pctTotal = totalTotal > 0 ? Math.round((doneTotal / totalTotal) * 100) : 0
          const obrigEstado = cl.filter(c => c.obrigatoria && c.estado === estadoAtual)
          const doneEstado = obrigEstado.filter(c => c.concluida).length
          const totalEstado = obrigEstado.length
          const pctEstado = totalEstado > 0 ? Math.round((doneEstado / totalEstado) * 100) : 0
          const isComplete = doneTotal === totalTotal && totalTotal > 0
          return (
            <div className="rounded-xl border border-gray-200 p-4" style={{ backgroundColor: '#FAFAF8' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">Checklist do imóvel</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {doneTotal}/{totalTotal} concluídas ({pctTotal}%)
                </span>
              </div>
              {/* Barra global */}
              <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pctTotal}%`, backgroundColor: isComplete ? '#22c55e' : '#C9A84C' }} />
              </div>
              {/* Estado actual */}
              {totalEstado > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-500 shrink-0">{estadoAtual}:</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pctEstado}%`, backgroundColor: doneEstado === totalEstado ? '#22c55e' : '#C9A84C' }} />
                  </div>
                  <span className={`text-[11px] font-medium shrink-0 ${doneEstado === totalEstado ? 'text-green-600' : 'text-gray-500'}`}>
                    {doneEstado}/{totalEstado}
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Main info */}
        <div className="xl:col-span-2 space-y-6">
          {/* Key fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {type === 'Imóveis' && <>
              {editing ? <>
                {(/n[ãa]o interessa/i.test(form.estado || '')) && (
                  <div className="col-span-2 md:col-span-3 -mt-1 mb-1 rounded-xl border border-red-200 bg-red-50/40 p-3">
                    <MotivoNaoInteressaChips
                      value={form.motivo_nao_interessa || ''}
                      onChange={v => setField('motivo_nao_interessa', v)}
                    />
                    <p className="text-[11px] text-red-500 mt-1">⚠ Selecciona pelo menos um motivo (ou escreve nas notas) antes de guardar.</p>
                  </div>
                )}
                <ImovelEditSections data={data} form={form} setField={setField} />
              </> : (() => {
                const analise = data.analises?.find(a => a.activa) || null
                return <>
                {(/n[ãa]o interessa/i.test(data.estado || '')) && (
                  <div className="col-span-2 md:col-span-3">
                    <MotivoNaoInteressaInline
                      key={`mni-${data.id}-${data.motivo_nao_interessa || ''}`}
                      motivoActual={data.motivo_nao_interessa || ''}
                      onSave={async (novo) => {
                        try {
                          const r = await apiFetch(`/api/crm/${endpoint}/${id}`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ motivo_nao_interessa: novo }),
                          })
                          if (!r.ok) throw new Error(await r.text())
                          await loadData()
                          toast('Motivo guardado', 'success')
                        } catch (err) { toast('Erro: ' + err.message, 'error') }
                      }}
                    />
                  </div>
                )}
                <ImovelReadSections data={data} />

                {/* ── Dados da Calculadora de Rentabilidade ── */}
                {analise && (
                  <div className="col-span-2 md:col-span-3 mt-2">
                    <div className="rounded-xl border border-[#C9A84C33] p-4" style={{ backgroundColor: '#faf8f2' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm">📊</span>
                        <h4 className="text-sm font-bold text-neutral-800">Análise de Rentabilidade</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Activa</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {analise.vvr > 0 && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">VVR</p>
                          <p className="text-sm font-bold text-neutral-800">{EUR(analise.vvr)}</p>
                        </div>}
                        {analise.custo_obra > 0 && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Custo Obra</p>
                          <p className="text-sm font-bold text-neutral-800">{EUR(analise.custo_obra)}</p>
                        </div>}
                        {analise.capital_necessario > 0 && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Capital Necessário</p>
                          <p className="text-sm font-bold text-neutral-800">{EUR(analise.capital_necessario)}</p>
                        </div>}
                        {analise.lucro_liquido != null && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Lucro Líquido</p>
                          <p className={`text-sm font-bold ${analise.lucro_liquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{EUR(analise.lucro_liquido)}</p>
                        </div>}
                        {analise.retorno_total != null && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">ROI Total</p>
                          <p className={`text-sm font-bold ${analise.retorno_total >= 0 ? 'text-green-700' : 'text-red-600'}`}>{analise.retorno_total}%</p>
                        </div>}
                        {analise.retorno_anualizado != null && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">ROI Anualizado</p>
                          <p className={`text-sm font-bold ${analise.retorno_anualizado >= 0 ? 'text-green-700' : 'text-red-600'}`}>{analise.retorno_anualizado}%</p>
                        </div>}
                        {analise.payback_meses > 0 && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Payback</p>
                          <p className="text-sm font-bold text-neutral-800">{analise.payback_meses} meses</p>
                        </div>}
                        {analise.risco && <div>
                          <p className="text-[10px] uppercase text-neutral-400 tracking-wide">Risco</p>
                          <p className={`text-sm font-bold ${analise.risco === 'Baixo' ? 'text-green-700' : analise.risco === 'Médio' ? 'text-yellow-600' : 'text-red-600'}`}>{analise.risco}</p>
                        </div>}
                      </div>
                    </div>
                  </div>
                )}
                {!analise && (
                  <div className="col-span-2 md:col-span-3 mt-2">
                    <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center">
                      <p className="text-xs text-neutral-400">Sem análise de rentabilidade — usa a tab "Análise Financeira" para calcular</p>
                    </div>
                  </div>
                )}
              </>
              })()}
            </>}
            {type === 'Investidores' && <>
              {!editing && <InvestidorHero data={data} onCriarPerfilDuplo={async (outroTipo) => {
                if (!confirm(`Criar perfil ${outroTipo} para ${data.nome}?`)) return
                try {
                  const r = await apiFetch(`/api/crm/investidores/${data.id}/duplicar`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo_principal: outroTipo }),
                  })
                  const result = await r.json()
                  if (result.ok) { alert(`Perfil ${outroTipo} criado: ${result.nome}`) }
                  else { alert(result.error || 'Erro ao duplicar') }
                } catch (e) { alert('Erro: ' + e.message) }
              }} />}
              {!editing && <InvestidorProximoPasso data={data} onUpdate={loadData} />}
              {editing
                ? <InvestidorEditSections data={data} form={form} setField={setField} />
                : <InvestidorReadSections data={data} />}
            </>}
            {type === 'Consultores' && <>
              {editing ? <>
                <EF label="Nome" field="nome" form={form} set={setField} />
                <EF label="Região" field="regiao" form={form} set={setField} type="select" options={['Coimbra','AMP']} />
                <EF label="Estatuto" field="estatuto" form={form} set={setField} type="select" options={['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria']} />
                <EF label="Estado Avaliação" field="estado_avaliacao" form={form} set={setField} type="select" options={['Em avaliação','Ativo','Inativo']} />
                <EF label="Classificação" field="classificacao" form={form} set={setField} type="select" options={['A','B','C','D']} />
                <EF label="Contacto" field="contacto" form={form} set={setField} />
                <EF label="Email" field="email" form={form} set={setField} />
                <EF label="Comissão %" field="comissao" form={form} set={setField} type="number" />
                <EF label="Leads Enviados" field="imoveis_enviados" form={form} set={setField} type="number" />
                <EF label="Off-Market" field="imoveis_off_market" form={form} set={setField} type="number" />
                <div className="col-span-1 sm:col-span-2 md:col-span-3">
                  <ChipsEditor label="Imobiliárias" jsonField={form.imobiliaria} onChange={v => setField('imobiliaria', JSON.stringify(v))} placeholder="Ex: Remax, Century 21…" />
                </div>
                <div className="col-span-1 sm:col-span-2 md:col-span-3">
                  <ChipsEditor label="Zonas de Atuação" jsonField={form.zonas} onChange={v => setField('zonas', JSON.stringify(v))} placeholder={form.regiao === 'AMP' ? 'Ex: Porto, Vila Nova de Gaia, Bonfim…' : 'Ex: Coimbra, Lousã, Penacova…'} /></div>
                <EF label="Meta Mensal Leads" field="meta_mensal_leads" form={form} set={setField} type="number" />
                <EF label="Data Início Parceria" field="data_inicio" form={form} set={setField} type="date" />
                <EF label="1º Contacto" field="data_primeira_call" form={form} set={setField} type="date" />
                <EF label="Motivo Descontinuação" field="motivo_descontinuacao" form={form} set={setField} />
              </> : <>
                <Field label="Estatuto" value={data.estatuto} />
                <Field label="Classificação" value={data.classificacao} />
                <Field label="Contacto" value={data.contacto} />
                <Field label="Email" value={data.email} />
                <Field label="Imobiliária" value={(() => { try { return JSON.parse(data.imobiliaria || '[]').join(', ') } catch { return '—' } })()} />
                <Field label="Leads Enviados" value={data.imoveis_enviados} />
                <Field label="Off-Market" value={data.imoveis_off_market} />
                <Field label="Comissão" value={data.comissao > 0 ? `${data.comissao}%` : '—'} />
                <Field label="1º Contacto" value={data.data_primeira_call} />
              </>}
            </>}
          </div>

          {editing && type === 'Consultores' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Notas</label>
              <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={4}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
            </div>
          )}
          {!editing && data.notas && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notas</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-line">{data.notas}</p>
            </div>
          )}

          {type === 'Consultores' && data.id && (
            <FollowUpsSection consultorId={data.id} onUpdate={loadData} />
          )}

          {/* Relações — Negócios Associados (resumo) */}
          {data.negocios?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Negócios Associados</p>
              <div className="space-y-2">
                {data.negocios.map(n => {
                  let pags = []
                  try { pags = typeof n.pagamentos_faseados === 'string' ? JSON.parse(n.pagamentos_faseados || '[]') : (n.pagamentos_faseados || []) } catch {}
                  const totalPags = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                  const recebido = pags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                  return (
                    <div key={n.id} className="bg-indigo-50 rounded-lg px-3 py-2 border border-indigo-100">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-indigo-800">{n.movimento}</span>
                        <div className="flex gap-3 text-xs items-center">
                          <span className="text-indigo-600">{n.categoria}</span>
                          <span className="font-mono font-semibold">{EUR(n.lucro_estimado)}</span>
                        </div>
                      </div>
                      {pags.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {pags.map((p, i) => {
                            const atrasado = !p.recebido && p.data && new Date(p.data) < new Date()
                            return (
                              <div key={i} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                                p.recebido ? 'bg-green-50 text-green-700' : atrasado ? 'bg-red-50 text-red-700' : 'bg-white text-gray-600'
                              }`}>
                                <span>{p.recebido ? '✓' : atrasado ? '!' : '○'} {p.descricao || 'Pagamento'}</span>
                                <span className="font-mono">{EUR(p.valor)} — {p.data || 'sem data'}</span>
                              </div>
                            )
                          })}
                          <p className="text-[10px] text-gray-400 mt-0.5">{EUR(recebido)} de {EUR(totalPags)} recebido — editar no Financeiro</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {data.consultores?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Consultores</p>
              <div className="space-y-2">
                {data.consultores.map(c => (
                  <div key={c.id}
                    onClick={() => onNavigate?.('Consultores', c.id)}
                    className={`flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2 ${onNavigate ? 'cursor-pointer hover:bg-blue-100 transition-colors' : ''}`}>
                    <span className="text-sm font-medium text-blue-800">{c.nome}</span>
                    <span className="text-xs text-blue-600">{c.estatuto} · {c.contacto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {type === 'Imóveis' && data.consultores?.length > 0 && (
            <ImovelInteracoesSection
              imovelId={data.id}
              consultores={data.consultores}
              onUpdate={loadData}
            />
          )}

          {data.imoveis?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Imóveis</p>
              <div className="space-y-2">
                {data.imoveis.map(i => (
                  <div key={i.id}
                    onClick={() => onNavigate?.('Imóveis', i.id)}
                    className={`flex items-center justify-between bg-green-50 rounded-lg px-3 py-2 ${onNavigate ? 'cursor-pointer hover:bg-green-100 transition-colors' : ''}`}>
                    <span className="text-sm font-medium text-green-800">{i.nome}</span>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-600">{i.estado?.replace(/^\d+-/, '')}</span>
                      <span className="font-mono">{EUR(i.ask_price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Tarefas + Timeline */}
        <div className="space-y-6">
          {/* Tarefas */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Tarefas</p>
            {data.tarefas?.length > 0 ? (
              <div className="space-y-1.5">
                {data.tarefas.slice(0, 10).map(t => (
                  <div key={t.id} className={`text-xs px-2 py-1.5 rounded ${t.status === 'Concluida' ? 'bg-green-50 text-green-700 line-through' : t.status === 'Atrasada' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                    {t.tarefa}
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-300">Sem tarefas</p>}
          </div>

          {/* Mini-resumo reuniões na sidebar */}
          {reunioes.length > 0 && activeTab === 'detalhe' && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Relatórios de Reunião</p>
              <div className="space-y-1.5">
                {reunioes.slice(0, 3).map(r => (
                  <div key={r.id} className="text-xs px-2 py-1.5 rounded bg-purple-50 text-purple-700 flex items-center gap-2">
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="truncate">{r.titulo?.replace(/\s+e\s+alexandre\s+mendes/i, '')}</span>
                    <span className="text-purple-400 shrink-0">{r.data?.slice(5, 10)}</span>
                  </div>
                ))}
                <button onClick={() => setActiveTab('relatorios')} className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 w-full text-center">
                  Ver todos os relatórios →
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Timeline</p>
            {data.timeline?.length > 0 ? (
              <div className="space-y-2">
                {data.timeline.slice(0, 15).map(t => (
                  <div key={t.id} className="flex gap-2 text-xs">
                    <span className="text-gray-300 w-16 shrink-0">{t.created_at?.slice(5, 10)}</span>
                    <span className={`font-medium ${ACAO_COLOR[t.acao] ?? 'text-gray-500'}`}>{ACAO_LABEL[t.acao] ?? t.acao}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-300">Sem histórico</p>}
          </div>
        </div>
      </div>
      </div>
      )}
      </Suspense>
    </div>
  )
}

// ── Relatórios Tab ────────────────────────────────────────────
function RelatoriosTab({ reunioes, investidorNome }) {
  const [expanded, setExpanded] = useState(null)
  const [transcricao, setTranscricao] = useState({})
  const [analises, setAnalises] = useState({})
  const [analyzing, setAnalyzing] = useState(null)

  async function loadTranscricao(id) {
    if (transcricao[id]) return
    const r = await apiFetch(`/api/crm/reunioes/${id}/transcricao`)
    const d = await r.json()
    setTranscricao(prev => ({ ...prev, [id]: d.transcricao }))
  }

  async function runAnalise(id) {
    setAnalyzing(id)
    try {
      const r = await apiFetch(`/api/crm/reunioes/${id}/analisar`, { method: 'POST' })
      const d = await r.json()
      setAnalises(prev => ({ ...prev, [id]: d }))
    } catch {}
    setAnalyzing(null)
  }

  function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    loadTranscricao(id)
    if (!analises[id]) runAnalise(id)
    apiFetch(`/api/crm/reunioes/${id}/marcar-vista`, { method: 'POST' }).catch(() => {})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Histórico de Reuniões</h3>
        <span className="text-xs text-gray-400">{reunioes.length} reunião(ões)</span>
      </div>

      {reunioes.map(r => {
        const isOpen = expanded === r.id
        const ana = analises[r.id]
        const dataStr = r.data ? new Date(r.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

        return (
          <div key={r.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            {/* Header da reunião */}
            <button onClick={() => toggleExpand(r.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#0d0d0d' }}>
                  <Phone className="w-4 h-4" style={{ color: '#C9A84C' }} />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.titulo}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{dataStr}</span>
                    {r.duracao_min > 0 && <><span>·</span><span>{r.duracao_min} min</span></>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async (e) => {
                  e.stopPropagation()
                  const token = await getToken()
                  window.open(`/api/crm/reunioes/${r.id}/relatorio?token=${token}`, '_blank')
                }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-300">
                  <FileDown className="w-3 h-3" /> PDF
                </button>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {/* Conteúdo expandido */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-200">
                {/* Resumo */}
                {r.resumo && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Resumo</p>
                    <p className="text-sm text-gray-700 bg-white rounded-lg p-3 border border-gray-100">{r.resumo}</p>
                  </div>
                )}

                {/* Keywords */}
                {r.keywords && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.keywords.split(',').filter(Boolean).map((k, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-600">{k.trim()}</span>
                    ))}
                  </div>
                )}

                {/* Análise AI */}
                {analyzing === r.id && (
                  <div className="text-center py-4">
                    <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
                    <p className="text-xs text-gray-400 mt-2">A analisar reunião...</p>
                  </div>
                )}

                {ana && !ana.error && (
                  <>
                    {/* Dados extraídos */}
                    {ana.investidor_dados && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Dados Extraídos do Investidor</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {ana.investidor_dados.capital_max && <MiniField label="Capital Max" value={`€ ${ana.investidor_dados.capital_max.toLocaleString('pt-PT')}`} />}
                          {ana.investidor_dados.capital_min && <MiniField label="Capital Min" value={`€ ${ana.investidor_dados.capital_min.toLocaleString('pt-PT')}`} />}
                          {ana.investidor_dados.perfil_risco && <MiniField label="Perfil Risco" value={ana.investidor_dados.perfil_risco} />}
                          {ana.investidor_dados.estrategia && <MiniField label="Estratégia" value={Array.isArray(ana.investidor_dados.estrategia) ? ana.investidor_dados.estrategia.join(', ') : ana.investidor_dados.estrategia} />}
                          {ana.classificacao_sugerida && <MiniField label="Classificação" value={ana.classificacao_sugerida} highlight />}
                          {ana.probabilidade_investimento != null && <MiniField label="Probabilidade" value={`${ana.probabilidade_investimento}%`} />}
                        </div>
                        {ana.autoFilled && ana.fieldsUpdated?.length > 0 && (
                          <p className="text-xs text-green-600 mt-2">✓ Campos preenchidos automaticamente: {ana.fieldsUpdated.join(', ')}</p>
                        )}
                      </div>
                    )}

                    {/* Sugestões de melhoria */}
                    {ana.sugestoes_melhoria?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Sugestões de Melhoria</p>
                        <div className="space-y-1.5">
                          {ana.sugestoes_melhoria.map((s, i) => (
                            <div key={i} className="flex gap-2 text-xs">
                              <span className="text-yellow-500 shrink-0">💡</span>
                              <span className="text-gray-600">{s}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Próximos passos */}
                    {ana.proximos_passos?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Próximos Passos</p>
                        <div className="space-y-1">
                          {ana.proximos_passos.map((p, i) => (
                            <div key={i} className="flex gap-2 text-xs">
                              <span className="text-indigo-500 shrink-0 font-bold">{i + 1}.</span>
                              <span className="text-gray-600">{p}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Transcrição */}
                {transcricao[r.id] && (
                  <details className="group">
                    <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Transcrição Completa
                    </summary>
                    <div className="mt-2 max-h-[400px] overflow-y-auto bg-white rounded-lg border border-gray-100 p-3 text-xs space-y-1">
                      {transcricao[r.id].split('\n').filter(Boolean).map((line, i) => {
                        const match = line.match(/^\[(.+?)\]:\s*(.+)/)
                        if (match) {
                          const isSomnium = /somnium|alexandre|jo[aã]o/i.test(match[1])
                          return (
                            <div key={i}>
                              <span className={`font-semibold ${isSomnium ? 'text-indigo-600' : 'text-yellow-700'}`}>{match[1]}: </span>
                              <span className="text-gray-600">{match[2]}</span>
                            </div>
                          )
                        }
                        return <div key={i} className="text-gray-500">{line}</div>
                      })}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        )
      })}

      {reunioes.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">Sem reuniões registadas para este contacto.</p>
      )}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800 truncate">{value || '—'}</p>
    </div>
  )
}

function EF({ label, field, form, set, type = 'text', options }) {
  const inputClass = "w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {type === 'select' ? (
        <select value={form[field] ?? ''} onChange={e => set(field, e.target.value)} className={inputClass}>
          <option value="">—</option>
          {options.map(o => typeof o === 'object' ? <option key={o.v} value={o.v}>{o.l}</option> : <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'date' ? (
        <input type="date" value={(form[field] || '').slice(0, 10)} onChange={e => set(field, e.target.value)} className={inputClass} />
      ) : type === 'number' ? (
        <input type="number" value={form[field] || ''} onChange={e => set(field, +e.target.value || null)} className={inputClass} />
      ) : (
        <input type="text" value={form[field] || ''} onChange={e => set(field, e.target.value)} className={inputClass} />
      )}
    </div>
  )
}

// Conta quantos campos da lista estão preenchidos no objecto (truthy + !== "")
function countFilled(obj, fields) {
  let n = 0
  for (const f of fields) {
    const v = obj?.[f]
    if (Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && v !== '')) n++
  }
  return n
}

// Secção colapsável reutilizável dentro do separador Imóvel.
// Ocupa toda a largura do grid pai (col-span-2 md:col-span-3) e oferece grid interno próprio.
function Section({ icon, title, fields, form, defaultOpen = false, accent, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const filled = fields ? countFilled(form, fields) : null
  const total = fields?.length ?? 0
  const complete = filled !== null && filled === total && total > 0
  return (
    <div className="col-span-2 md:col-span-3 border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
        <span className="flex items-center gap-2">
          {icon && <span>{icon}</span>}
          <span>{title}</span>
          {accent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">{accent}</span>}
        </span>
        <span className="flex items-center gap-3">
          {filled !== null && total > 0 && (
            <span className={`text-[11px] font-medium ${complete ? 'text-green-600' : 'text-gray-400'}`}>
              {filled}/{total}
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

// Editor de tags livre — guarda como JSON array em string. Suporta criar do
// zero (ex: imobiliária nova em AMP, zonas de atuação em concelhos novos).
// Enter adiciona, X remove, vírgula também separa.
function ChipsEditor({ label, jsonField, onChange, placeholder }) {
  const items = useMemo(() => {
    try {
      if (Array.isArray(jsonField)) return jsonField
      const v = JSON.parse(jsonField || '[]')
      return Array.isArray(v) ? v : []
    } catch { return [] }
  }, [jsonField])
  const [input, setInput] = useState('')
  const add = (raw) => {
    const novo = String(raw || '').trim()
    if (!novo) return
    const next = [...new Set([...items, novo])]
    onChange(next)
    setInput('')
  }
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(input)
    } else if (e.key === 'Backspace' && !input && items.length) {
      onChange(items.slice(0, -1))
    }
  }
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 bg-white min-h-[38px] focus-within:ring-2 focus-within:ring-yellow-300">
        {items.map((it, i) => (
          <span key={`${it}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-yellow-50 border border-yellow-200 text-yellow-900">
            {it}
            <button type="button" onClick={() => remove(i)} className="text-yellow-700 hover:text-red-600" aria-label={`Remover ${it}`}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => input && add(input)}
          placeholder={items.length ? '' : (placeholder || 'Escreve e prime Enter…')}
          className="flex-1 min-w-[140px] outline-none text-sm bg-transparent"
        />
      </div>
    </div>
  )
}

// Hook que devolve concelhos/freguesias para os Combobox da secção Localização.
// Determina a fonte de dados pela região do imóvel: AMP usa amp-freguesias
// (Porto, Vila Nova de Gaia, Santa Maria da Feira); Coimbra usa o JSON
// histórico do distrito de Coimbra.
function useFreguesiasLookup(form) {
  const dataset = form?.regiao === 'AMP' ? ampFreguesiasData : coimbraFreguesiasData
  const concelhos = Object.keys(dataset?.concelhos || {})
  const freguesias = useMemo(() => {
    const c = form?.concelho
    if (c && dataset?.concelhos?.[c]) return dataset.concelhos[c]
    return Object.values(dataset?.concelhos || {}).flat()
  }, [form?.concelho, form?.regiao])
  return { concelhos, freguesias }
}

const ESTADOS_PIPELINE = ['Pré-aprovação','Adicionado','Chamada Não Atendida','Pendentes','Necessidade de Visita','Visita Marcada','Estudo de VVR','Criar Proposta ao Proprietário','Enviar proposta ao Proprietário','Em negociação','Proposta aceite','Enviar proposta ao investidor','Follow Up após proposta','Follow UP','Wholesaling','CAEP','Fix and Flip','Não interessa']
const ORIGEM_OPTS = ['Pesquisa em portais/sites','Referência por consultores','Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro']
const MODELO_NEGOCIO_OPTS = ['Wholesaling','Fix & Flip','CAEP','Mediação']

// Bloco editável da Ficha do Imóvel — 6 secções colapsáveis sem duplicação.
function ImovelEditSections({ data, form, setField }) {
  const lookups = useLookups()
  const { concelhos, freguesias } = useFreguesiasLookup(form)
  const onusList = Array.isArray(form.onus_registados) ? form.onus_registados : []
  const toggleOnus = v => {
    const set = new Set(onusList)
    if (set.has(v)) set.delete(v); else set.add(v)
    setField('onus_registados', Array.from(set))
  }

  const sec = {
    identificacao: ['nome','estado','ref_interna','link','tipo_oportunidade','origem','nome_consultor'],
    localizacao:   ['distrito','concelho','freguesia','zona','coordenadas_lat','coordenadas_lng','localizacao_imagem'],
    fisica:        ['tipologia','predio_tipo','area_util','area_bruta','area_bruta_dependente','andar','numero_pisos_predio','tem_elevador','ano_construcao','cru','licenca_utilizacao'],
    valores:       ['ask_price','valor_proposta','valor_venda_remodelado','custo_estimado_obra','vpt','imi_anual','condominio_mensal_anunciado'],
    legal:         ['artigo_matricial','descricao_predial','fracao','regime_propriedade','certificado_energetico','numero_ce','onus_registados'],
    pipeline:      ['proprietario_nome','proprietario_nif','proprietario_contacto','motivo_venda_declarado','data_anuncio','tempo_no_mercado_dias','modelo_negocio','data_adicionado','data_chamada','data_visita','data_estudo_mercado','data_proposta','data_proposta_aceite','data_follow_up','data_aceite_investidor','motivo_follow_up','notas'],
  }

  return <>
    {/* 1. Identificação */}
    <Section icon="📋" title="Identificação" fields={sec.identificacao} form={form} defaultOpen>
      <EF label="Nome" field="nome" form={form} set={setField} />
      <EF label="Estado" field="estado" form={form} set={setField} type="select" options={ESTADOS_PIPELINE} />
      <EF label="REF Interna" field="ref_interna" form={form} set={setField} />
      <EF label="Link" field="link" form={form} set={setField} />
      <div>
        <p className="text-xs text-gray-400 mb-1">Tipo de Oportunidade</p>
        <select value={form.tipo_oportunidade || ''} onChange={e => setField('tipo_oportunidade', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.tipo_oportunidade || ['Off-Market','Market','Portal']).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Origem (Canal)" field="origem" form={form} set={setField} type="select" options={ORIGEM_OPTS} />
      <EF label="Consultor" field="nome_consultor" form={form} set={setField} />
    </Section>

    {/* 2. Localização */}
    <Section icon="📍" title="Localização" fields={sec.localizacao} form={form}>
      <div>
        <p className="text-xs text-gray-400 mb-1">Região</p>
        <select value={form.regiao || 'Coimbra'} onChange={e => setField('regiao', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="Coimbra">Coimbra</option>
          <option value="AMP">AMP (Porto + Gaia)</option>
        </select>
      </div>
      <div>
        <Combobox label="Distrito" value={form.distrito} onChange={v => setField('distrito', v)} options={[]} placeholder="Coimbra…" />
      </div>
      <div>
        <Combobox label="Concelho" value={form.concelho} onChange={v => setField('concelho', v)} options={concelhos} placeholder="Coimbra…" />
      </div>
      <div>
        <Combobox label="Freguesia" value={form.freguesia} onChange={v => setField('freguesia', v)} options={freguesias} placeholder="Pesquisar freguesia…" />
      </div>
      <EF label="Zona / Bairro" field="zona" form={form} set={setField} />
      <EF label="Latitude" field="coordenadas_lat" form={form} set={setField} type="number" />
      <EF label="Longitude" field="coordenadas_lng" form={form} set={setField} type="number" />
      <div className="col-span-2 md:col-span-3 mt-1">
        <label className="text-xs text-gray-400 block mb-1">Imagem de localização (print do Google Maps)</label>
        {form.localizacao_imagem ? (
          <div className="flex items-start gap-3">
            <img src={form.localizacao_imagem} alt="Localização" className="w-64 h-40 object-cover rounded-lg border border-gray-200" loading="lazy" decoding="async" />
            <div className="flex flex-col gap-2">
              <label className="text-xs px-3 py-1.5 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 hover:bg-yellow-100 cursor-pointer text-center">
                Substituir
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const fd = new FormData()
                    fd.append('imagem', file)
                    const r = await apiFetch(`/api/crm/imoveis/${data.id}/localizacao`, { method: 'POST', body: fd })
                    if (!r.ok) throw new Error(await r.text())
                    const j = await r.json()
                    setField('localizacao_imagem', j.localizacao_imagem)
                  } catch (err) { alert('Erro ao carregar: ' + err.message) }
                }} />
              </label>
              <button type="button" onClick={async () => {
                if (!confirm('Remover imagem de localização?')) return
                try {
                  const r = await apiFetch(`/api/crm/imoveis/${data.id}/localizacao`, { method: 'DELETE' })
                  if (!r.ok) throw new Error(await r.text())
                  setField('localizacao_imagem', null)
                } catch (e) { alert('Erro ao remover: ' + e.message) }
              }} className="text-xs px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 hover:bg-red-100">Remover</button>
            </div>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-gray-300 hover:border-yellow-400 hover:bg-yellow-50/50 cursor-pointer transition-colors">
            <span className="text-sm text-gray-500">Clique para carregar print do Google Maps (JPG, PNG, WEBP)</span>
            <input type="file" accept="image/*" className="hidden" onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const fd = new FormData()
                fd.append('imagem', file)
                const r = await apiFetch(`/api/crm/imoveis/${data.id}/localizacao`, { method: 'POST', body: fd })
                if (!r.ok) throw new Error(await r.text())
                const j = await r.json()
                setField('localizacao_imagem', j.localizacao_imagem)
              } catch (err) { alert('Erro ao carregar: ' + err.message) }
            }} />
          </label>
        )}
      </div>
    </Section>

    {/* 3. Caracterização Física */}
    <Section icon="🏠" title="Caracterização Física" fields={sec.fisica} form={form}>
      <EF label="Tipologia" field="tipologia" form={form} set={setField} />
      <div>
        <p className="text-xs text-gray-400 mb-1">Tipo de Prédio</p>
        <select value={form.predio_tipo || ''} onChange={e => setField('predio_tipo', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.predio_tipo || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Área Útil (m²)" field="area_util" form={form} set={setField} type="number" />
      <EF label="ABP — Área Bruta Privativa (m²)" field="area_bruta" form={form} set={setField} type="number" />
      <EF label="ABD — Área Bruta Dependente (m²)" field="area_bruta_dependente" form={form} set={setField} type="number" />
      <div>
        <p className="text-xs text-gray-400 mb-1">Andar</p>
        <select value={form.andar || ''} onChange={e => setField('andar', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.andar || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Nº Pisos do Prédio" field="numero_pisos_predio" form={form} set={setField} type="number" />
      <div>
        <p className="text-xs text-gray-400 mb-1">Elevador</p>
        <select value={form.tem_elevador || ''} onChange={e => setField('tem_elevador', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.tem_elevador || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Ano de Construção" field="ano_construcao" form={form} set={setField} type="number" />
      <div>
        <p className="text-xs text-gray-400 mb-1">CRU</p>
        <select value={form.cru || ''} onChange={e => setField('cru', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.cru || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Licença de Utilização" field="licenca_utilizacao" form={form} set={setField} />
    </Section>

    {/* 4. Valores */}
    <Section icon="💰" title="Valores" fields={sec.valores} form={form} defaultOpen>
      <EF label="Ask Price (€)" field="ask_price" form={form} set={setField} type="number" />
      <EF label="Valor Proposta (€)" field="valor_proposta" form={form} set={setField} type="number" />
      <EF label="VVR — Valor Venda Remodelado (€)" field="valor_venda_remodelado" form={form} set={setField} type="number" />
      <EF label="Custo Obra (€)" field="custo_estimado_obra" form={form} set={setField} type="number" />
      <EF label="VPT (€)" field="vpt" form={form} set={setField} type="number" />
      <EF label="IMI Anual (€)" field="imi_anual" form={form} set={setField} type="number" />
      <EF label="Condomínio Mensal (€)" field="condominio_mensal_anunciado" form={form} set={setField} type="number" />
    </Section>

    {/* 5. Situação Legal e Fiscal */}
    <Section icon="📜" title="Situação Legal e Fiscal" fields={sec.legal} form={form}>
      <EF label="Artigo Matricial" field="artigo_matricial" form={form} set={setField} />
      <EF label="Descrição Predial" field="descricao_predial" form={form} set={setField} />
      <EF label="Fração" field="fracao" form={form} set={setField} />
      <div>
        <p className="text-xs text-gray-400 mb-1">Regime de Propriedade</p>
        <select value={form.regime_propriedade || ''} onChange={e => setField('regime_propriedade', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.regime_propriedade || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Certificado Energético</p>
        <select value={form.certificado_energetico || ''} onChange={e => setField('certificado_energetico', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.certificado_energetico || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Nº CE" field="numero_ce" form={form} set={setField} />
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-gray-400 mb-1">Ónus / Encargos</p>
        <div className="flex flex-wrap gap-2">
          {(lookups.onus_registados || []).map(o => {
            const active = onusList.includes(o)
            return (
              <button type="button" key={o} onClick={() => toggleOnus(o)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >{o}</button>
            )
          })}
        </div>
      </div>
    </Section>

    {/* 6. Proprietário & Pipeline */}
    <Section icon="👤" title="Proprietário & Pipeline" fields={sec.pipeline} form={form}>
      <EF label="Proprietário" field="proprietario_nome" form={form} set={setField} />
      <EF label="NIF" field="proprietario_nif" form={form} set={setField} />
      <EF label="Contacto" field="proprietario_contacto" form={form} set={setField} />
      <div>
        <p className="text-xs text-gray-400 mb-1">Motivo Venda Declarado</p>
        <select value={form.motivo_venda_declarado || ''} onChange={e => setField('motivo_venda_declarado', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.motivo_venda || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Data do Anúncio" field="data_anuncio" form={form} set={setField} type="date" />
      <EF label="Tempo no Mercado (dias)" field="tempo_no_mercado_dias" form={form} set={setField} type="number" />
      <EF label="Modelo de Negócio" field="modelo_negocio" form={form} set={setField} type="select" options={MODELO_NEGOCIO_OPTS} />
      <EF label="Data Adicionado" field="data_adicionado" form={form} set={setField} type="date" />
      <EF label="Data Chamada" field="data_chamada" form={form} set={setField} type="date" />
      <EF label="Data Visita" field="data_visita" form={form} set={setField} type="date" />
      <EF label="Data Estudo Mercado" field="data_estudo_mercado" form={form} set={setField} type="date" />
      <EF label="Data Proposta" field="data_proposta" form={form} set={setField} type="date" />
      <EF label="Data Proposta Aceite" field="data_proposta_aceite" form={form} set={setField} type="date" />
      <EF label="Data Follow Up" field="data_follow_up" form={form} set={setField} type="date" />
      <EF label="Data Aceite Investidor" field="data_aceite_investidor" form={form} set={setField} type="date" />
      <div className="col-span-2 md:col-span-3">
        <label className="text-xs text-gray-400 block mb-1">Motivo Follow Up</label>
        <textarea value={form.motivo_follow_up || ''} onChange={e => setField('motivo_follow_up', e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
      </div>
      <div className="col-span-2 md:col-span-3">
        <label className="text-xs text-gray-400 block mb-1">Notas</label>
        <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={4}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
      </div>
    </Section>
  </>
}

// Bloco read-only — mesmas 6 secções, sem inputs.
function ImovelReadSections({ data }) {
  const fmtArea = v => (v > 0 ? `${v} m²` : '—')
  const fmtEur = v => (v > 0 ? EUR(v) : '—')
  const onusList = Array.isArray(data.onus_registados) ? data.onus_registados : []

  const sec = {
    identificacao: ['nome','estado','ref_interna','link','tipo_oportunidade','origem','nome_consultor'],
    localizacao:   ['distrito','concelho','freguesia','zona','coordenadas_lat','coordenadas_lng','localizacao_imagem'],
    fisica:        ['tipologia','predio_tipo','area_util','area_bruta','area_bruta_dependente','andar','numero_pisos_predio','tem_elevador','ano_construcao','cru','licenca_utilizacao'],
    valores:       ['ask_price','valor_proposta','valor_venda_remodelado','custo_estimado_obra','vpt','imi_anual','condominio_mensal_anunciado'],
    legal:         ['artigo_matricial','descricao_predial','fracao','regime_propriedade','certificado_energetico','numero_ce','onus_registados'],
    pipeline:      ['proprietario_nome','proprietario_nif','proprietario_contacto','motivo_venda_declarado','data_anuncio','tempo_no_mercado_dias','modelo_negocio','data_adicionado','data_chamada','data_visita','data_estudo_mercado','data_proposta','data_proposta_aceite','data_follow_up','data_aceite_investidor','motivo_follow_up','notas'],
  }

  return <>
    <Section icon="📋" title="Identificação" fields={sec.identificacao} form={data} defaultOpen>
      <Field label="Nome" value={data.nome} />
      <Field label="Estado" value={data.estado?.replace(/^\d+-/, '')} />
      <Field label="REF Interna" value={data.ref_interna} />
      <Field label="Link" value={data.link ? <a href={data.link} target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:underline truncate block">{data.link === 'OFF MARKET' ? 'OFF MARKET' : 'Ver anúncio'}</a> : '—'} />
      <Field label="Tipo de Oportunidade" value={data.tipo_oportunidade} />
      <Field label="Origem (Canal)" value={data.origem} />
      <Field label="Consultor" value={data.nome_consultor} />
    </Section>

    <Section icon="📍" title="Localização" fields={sec.localizacao} form={data}>
      <Field label="Distrito" value={data.distrito} />
      <Field label="Concelho" value={data.concelho} />
      <Field label="Freguesia" value={data.freguesia} />
      <Field label="Zona / Bairro" value={data.zona} />
      <Field label="Latitude" value={data.coordenadas_lat} />
      <Field label="Longitude" value={data.coordenadas_lng} />
      {data.localizacao_imagem && (
        <div className="col-span-2 md:col-span-3">
          <p className="text-xs text-gray-400 mb-1">Imagem de localização</p>
          <img src={data.localizacao_imagem} alt="Localização" className="w-full max-w-md rounded-lg border border-gray-200" loading="lazy" decoding="async" />
        </div>
      )}
    </Section>

    <Section icon="🏠" title="Caracterização Física" fields={sec.fisica} form={data}>
      <Field label="Tipologia" value={data.tipologia} />
      <Field label="Tipo de Prédio" value={data.predio_tipo} />
      <Field label="Área Útil" value={fmtArea(data.area_util)} />
      <Field label="ABP" value={fmtArea(data.area_bruta)} />
      <Field label="ABD" value={fmtArea(data.area_bruta_dependente)} />
      <Field label="Andar" value={data.andar} />
      <Field label="Nº Pisos" value={data.numero_pisos_predio} />
      <Field label="Elevador" value={data.tem_elevador} />
      <Field label="Ano Construção" value={data.ano_construcao} />
      <Field label="CRU" value={data.cru} />
      <Field label="Licença Utilização" value={data.licenca_utilizacao} />
    </Section>

    <Section icon="💰" title="Valores" fields={sec.valores} form={data} defaultOpen>
      <Field label="Ask Price" value={fmtEur(data.ask_price)} />
      <Field label="Valor Proposta" value={fmtEur(data.valor_proposta)} />
      <Field label="VVR" value={fmtEur(data.valor_venda_remodelado)} />
      <Field label="Custo Obra" value={fmtEur(data.custo_estimado_obra)} />
      <Field label="VPT" value={fmtEur(data.vpt)} />
      <Field label="IMI Anual" value={fmtEur(data.imi_anual)} />
      <Field label="Condomínio Mensal" value={fmtEur(data.condominio_mensal_anunciado)} />
    </Section>

    <Section icon="📜" title="Situação Legal e Fiscal" fields={sec.legal} form={data}>
      <Field label="Artigo Matricial" value={data.artigo_matricial} />
      <Field label="Descrição Predial" value={data.descricao_predial} />
      <Field label="Fração" value={data.fracao} />
      <Field label="Regime de Propriedade" value={data.regime_propriedade} />
      <Field label="Certificado Energético" value={data.certificado_energetico} />
      <Field label="Nº CE" value={data.numero_ce} />
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-gray-400">Ónus / Encargos</p>
        <p className="text-sm font-medium text-gray-800">{onusList.length > 0 ? onusList.join(', ') : '—'}</p>
      </div>
    </Section>

    <Section icon="👤" title="Proprietário & Pipeline" fields={sec.pipeline} form={data}>
      <Field label="Proprietário" value={data.proprietario_nome} />
      <Field label="NIF" value={data.proprietario_nif} />
      <Field label="Contacto" value={data.proprietario_contacto} />
      <Field label="Motivo Venda" value={data.motivo_venda_declarado} />
      <Field label="Data Anúncio" value={data.data_anuncio} />
      <Field label="Tempo no Mercado" value={data.tempo_no_mercado_dias > 0 ? `${data.tempo_no_mercado_dias} dias` : '—'} />
      <Field label="Modelo de Negócio" value={data.modelo_negocio} />
      <Field label="Data Adicionado" value={data.data_adicionado} />
      <Field label="Data Chamada" value={data.data_chamada} />
      <Field label="Data Visita" value={data.data_visita} />
      <Field label="Data Estudo Mercado" value={data.data_estudo_mercado} />
      <Field label="Data Proposta" value={data.data_proposta} />
      <Field label="Data Proposta Aceite" value={data.data_proposta_aceite} />
      <Field label="Data Follow Up" value={data.data_follow_up} />
      <Field label="Data Aceite Investidor" value={data.data_aceite_investidor} />
      {data.motivo_follow_up && <div className="col-span-2 md:col-span-3"><Field label="Motivo Follow Up" value={data.motivo_follow_up} /></div>}
      {data.notas && <div className="col-span-2 md:col-span-3"><Field label="Notas" value={data.notas} /></div>}
    </Section>
  </>
}

// ── Investidor: constantes e helpers ─────────────────────────
const INV_ROI_OPTS = ['<10%', '10–15%', '15–20%', '20–25%', '>25%']
const INV_EXPERIENCIA_OPTS = ['Nenhuma', '1–2 negócios', '3–10 negócios', '>10 negócios']
const INV_TIPO_IMOVEL_OPTS = ['T0', 'T1', 'T2', 'T3+', 'Apartamento', 'Moradia', 'Edifício', 'Comercial', 'Terreno', 'Ruína', 'Indiferente']
const INV_DISTRITOS_OPTS = ['Aveiro','Beja','Braga','Bragança','Castelo Branco','Coimbra','Évora','Faro','Guarda','Leiria','Lisboa','Portalegre','Porto','Santarém','Setúbal','Viana do Castelo','Vila Real','Viseu','Açores','Madeira']
const INV_EQUIPA_OBRAS_OPTS = ['Própria', 'Da Somnium', 'Indiferente', 'Sem opinião']
const INV_ESTRATEGIA_OPTS = ['Wholesaling', 'CAEP', 'Fix & Flip', 'Mediação', 'Cedência de posição', 'Arrendamento']
const INV_PERFIL_RISCO_OPTS = ['Conservador', 'Moderado', 'Agressivo']
const INV_ORIGEM_CAPITAL_OPTS = ['Poupança pessoal','Actividade empresarial','Venda de activo','Herança','Outro']
const INV_PREF_CONTACTO_OPTS = ['WhatsApp','Chamada','Email','Presencial']

function parseJsonArray(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}

// Multi-select por chips. Guarda como JSON array.
function MultiChips({ label, field, form, set, options }) {
  const selected = parseJsonArray(form[field])
  const toggle = (v) => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
    set(field, JSON.stringify(next))
  }
  return (
    <div className="col-span-2 md:col-span-3">
      <p className="text-xs text-gray-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = selected.includes(o)
          return (
            <button key={o} type="button" onClick={() => toggle(o)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${active ? 'bg-yellow-100 border-yellow-300 text-yellow-900' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Toggle({ label, field, form, set }) {
  const on = !!form[field]
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <button type="button" onClick={() => set(field, on ? 0 : 1)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-green-500' : 'bg-gray-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <span className="ml-2 text-xs text-gray-500">{on ? 'Sim' : 'Não'}</span>
    </div>
  )
}

function InvClassBadge({ cls }) {
  if (!cls) return <span className="text-xs text-gray-300">—</span>
  return <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold text-white ${CLASS_COLOR[cls] ?? 'bg-gray-400'}`}>{cls}</span>
}

// Format compacto de € (€100k, €2.5M)
function eurCompact(v) {
  if (!v && v !== 0) return '—'
  const n = Number(v)
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `€${Math.round(n / 1000)}k`
  return `€${n}`
}

// Posição do estado actual dentro do funil aplicável (ignora terminais).
function pipelinePosition(status, tipo) {
  const list = invStatusFor(tipo).filter(s => s !== 'Não qualificado' && s !== 'Inactivo')
  const idx = list.indexOf(status)
  if (idx === -1) return null
  return { idx: idx + 1, total: list.length }
}

// Hero card do investidor — visível em modo leitura.
function InvestidorHero({ data, onCriarPerfilDuplo }) {
  const tipo = data.tipo_principal || 'Passivo'
  const isAtivo = tipo === 'Ativo'
  const outroTipo = isAtivo ? 'Passivo' : 'Ativo'
  const tipoBg = isAtivo ? 'from-orange-500 to-amber-600' : 'from-violet-500 to-purple-600'
  const tipoText = isAtivo ? 'text-orange-700 bg-orange-100 border-orange-200' : 'text-violet-700 bg-violet-100 border-violet-200'
  const statusColor = INV_STATUS_COLOR[data.status] || 'bg-gray-100 text-gray-600'
  const iniciais = (data.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
  const [menuOpen, setMenuOpen] = useState(false)
  const tel = (data.telemovel || '').replace(/\s+/g, '')
  const phoneIntl = tel.startsWith('+') ? tel : (tel.startsWith('00') ? '+' + tel.slice(2) : (tel.length === 9 ? '+351' + tel : tel))
  const proxIso = (data.data_proxima_acao || '').slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const proximaPassada = proxIso && proxIso < today
  const isTerminal = data.status === 'Inactivo' || data.status === 'Não qualificado'

  // Days in pipeline (since first contact or created_at)
  const startDate = data.data_primeiro_contacto || (data.created_at || '').slice(0, 10)
  const diasPipeline = startDate ? Math.max(0, Math.floor((Date.now() - new Date(startDate)) / 86400000)) : null

  // Capital range compact
  const capRange = (data.capital_min > 0 && data.capital_max > 0)
    ? `${eurCompact(data.capital_min)}–${eurCompact(data.capital_max)}`
    : data.capital_max > 0 ? `até ${eurCompact(data.capital_max)}`
    : data.capital_min > 0 ? `desde ${eurCompact(data.capital_min)}`
    : null

  const pos = pipelinePosition(data.status, tipo)
  const score = Number(data.pontuacao || 0)

  return (
    <div className="col-span-2 md:col-span-3 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Topo */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${tipoBg} text-white flex items-center justify-center text-xl font-bold shrink-0 shadow-sm`}>
            {iniciais}
          </div>

          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-bold text-gray-900 truncate">{data.nome}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${tipoText}`}>{tipo}</span>
              <InvClassBadge cls={data.classificacao} />
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{data.status || '—'}</span>
              {!!data.nda_assinado && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> NDA
                </span>
              )}
              {proximaPassada && !isTerminal && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Atrasado
                </span>
              )}
              {data.duplicado_de && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Perfil duplo</span>}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
              {data.telemovel && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {data.telemovel}</span>}
              {data.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {data.email}</span>}
              {data.origem && <span className="text-gray-400">· {data.origem}</span>}
            </div>
          </div>

          {/* Kebab */}
          <div className="relative shrink-0">
            <button type="button" onClick={() => setMenuOpen(o => !o)}
              className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 inline-flex items-center justify-center" title="Mais acções">
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-lg z-10">
                <button type="button" onClick={() => { setMenuOpen(false); onCriarPerfilDuplo(outroTipo) }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">+ Criar perfil {outroTipo}</button>
              </div>
            )}
          </div>
        </div>

        {/* Mini-KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <KpiTile icon={Wallet}  label="Capital" value={capRange || '—'}  tone="indigo" />
          <KpiTile icon={Target}  label="ROI desejado" value={data.roi_pretendido || '—'} tone="amber" />
          <KpiTile icon={Hourglass} label="Na pipeline" value={diasPipeline != null ? `${diasPipeline}d` : '—'} tone="slate" />
          <KpiTile icon={TrendingUp} label="Score" value={score > 0 ? `${score}/100` : '—'} tone="green" extra={
            score > 0 ? (
              <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all" style={{ width: `${Math.min(100, score)}%` }} />
              </div>
            ) : null
          } />
        </div>

        {/* Acções rápidas */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {phoneIntl && (
            <a href={`tel:${phoneIntl}`} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Ligar
            </a>
          )}
          {phoneIntl && (
            <a href={`https://wa.me/${phoneIntl.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 inline-flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
          {data.email && (
            <a href={`mailto:${data.email}`} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
          )}
        </div>
      </div>

      {/* Faixa de progresso da pipeline */}
      {pos && !isTerminal && (
        <div className="px-4 sm:px-5 pb-3">
          <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-wide mb-1">
            <span>Pipeline {tipo.toLowerCase()}</span>
            <span className="ml-auto font-mono text-gray-500">{pos.idx}/{pos.total}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${(pos.idx / pos.total) * 100}%`, backgroundColor: '#C9A84C' }} />
          </div>
        </div>
      )}
      {isTerminal && (
        <div className="px-4 sm:px-5 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          {data.status === 'Inactivo' ? 'Investidor marcado como inactivo.' : 'Investidor não qualificado.'}
          {data.motivo_inatividade && <span className="text-gray-400">· {data.motivo_inatividade}</span>}
          {data.motivo_nao_aprovacao && <span className="text-gray-400">· {data.motivo_nao_aprovacao}</span>}
        </div>
      )}
    </div>
  )
}

// Mini-card de KPI usado no Hero
function KpiTile({ icon: Icon, label, value, tone, extra }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
    slate:  'bg-slate-50 text-slate-700 border-slate-100',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  }
  return (
    <div className={`rounded-xl border p-2.5 ${tones[tone] || 'bg-gray-50 border-gray-100 text-gray-700'}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-70">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className="text-sm font-bold mt-0.5 truncate">{value}</p>
      {extra}
    </div>
  )
}

// Pequeno calendário visual ("12 MAI") usado em cards.
function MiniDate({ iso }) {
  const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']
  const [y, m, d] = (iso || '').slice(0, 10).split('-')
  return (
    <div className="w-12 h-14 rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col overflow-hidden shrink-0">
      <div className="bg-brand-dark text-brand-gold text-[9px] text-center font-semibold py-0.5 tracking-wider">{meses[parseInt(m, 10) - 1] || '—'}</div>
      <div className="flex-1 flex items-center justify-center text-lg font-bold text-gray-800">{d || '?'}</div>
    </div>
  )
}

// Card "Próximo passo" — accionável.
function InvestidorProximoPasso({ data, onUpdate }) {
  if (!data.proxima_acao && !data.data_proxima_acao) return null
  const dataIso = (data.data_proxima_acao || '').slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const atrasado = dataIso && dataIso < today
  const diasAte = dataIso ? Math.floor((new Date(dataIso) - new Date(today)) / 86400000) : null
  const acao = (data.proxima_acao || '').toLowerCase()
  const ActionIcon = acao.includes('call') || acao.includes('lig') ? Phone
                   : acao.includes('email') || acao.includes('envia') ? Mail
                   : acao.includes('reuni') ? Calendar
                   : acao.includes('whats') ? MessageCircle
                   : Target

  const [reagendarOpen, setReagendarOpen] = useState(false)
  const [novaData, setNovaData] = useState(dataIso || today)
  const [busy, setBusy] = useState(false)

  async function reagendar() {
    if (!novaData || busy) return
    setBusy(true)
    try {
      const r = await apiFetch(`/api/crm/investidores/${data.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_proxima_acao: novaData }),
      })
      if (!r.ok) throw new Error(await r.text())
      setReagendarOpen(false)
      onUpdate?.()
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setBusy(false) }
  }

  async function concluir() {
    if (busy) return
    if (!confirm(`Marcar como concluído: "${data.proxima_acao}"?`)) return
    setBusy(true)
    try {
      const r = await apiFetch(`/api/crm/investidores/${data.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxima_acao: null,
          data_proxima_acao: null,
          data_ultimo_contacto: today,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      onUpdate?.()
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setBusy(false) }
  }

  const cor = atrasado ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50/60'
  const corBadge = atrasado ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'

  return (
    <div className={`col-span-2 md:col-span-3 rounded-2xl border p-4 ${cor}`}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm">
          <ActionIcon className="w-5 h-5 text-gray-600" />
        </div>
        {dataIso && <MiniDate iso={dataIso} />}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Próximo passo</p>
          <p className="text-sm font-bold text-gray-900 truncate">{data.proxima_acao || '—'}</p>
          {dataIso && (
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${corBadge}`}>
                {atrasado
                  ? `${Math.abs(diasAte)}d atrasado`
                  : diasAte === 0 ? 'Hoje' : diasAte === 1 ? 'Amanhã' : `Em ${diasAte}d`}
              </span>
              <span className="text-[11px] text-gray-500">{fmtDate(dataIso)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={concluir} disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm">
            <Check className="w-3.5 h-3.5" /> Concluir
          </button>
          <button onClick={() => setReagendarOpen(o => !o)} disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Reagendar
          </button>
        </div>
      </div>
      {reagendarOpen && (
        <div className="mt-3 pt-3 border-t border-yellow-200 flex items-center gap-2">
          <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white" />
          <button onClick={reagendar} disabled={busy || !novaData}
            className="text-xs px-3 py-1.5 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50">
            Guardar
          </button>
          <button onClick={() => setReagendarOpen(false)}
            className="text-xs px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">Cancelar</button>
        </div>
      )}
    </div>
  )
}

// Timeline cronológica enriquecida — eventos chave com ícone, gap em dias e estado (passado/hoje/futuro).
function InvestidorTimeline({ data }) {
  const today = new Date().toISOString().slice(0, 10)
  const eventos = [
    { key: '1º contacto',     date: data.data_primeiro_contacto, Icon: Users },
    { key: 'Reunião',         date: data.data_reuniao,           Icon: Calendar },
    { key: 'Último contacto', date: data.data_ultimo_contacto,   Icon: PhoneCall },
    { key: 'Follow-up',       date: data.data_follow_up,         Icon: RefreshCw },
    { key: 'Próxima acção',   date: data.data_proxima_acao,      Icon: Target },
  ].filter(e => e.date).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  if (eventos.length === 0) {
    return <p className="col-span-2 md:col-span-3 text-xs text-gray-400 italic">Sem eventos registados</p>
  }
  return (
    <div className="col-span-2 md:col-span-3 relative pl-2">
      <span className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-brand-gold via-gray-200 to-gray-100" />
      {eventos.map((e, i) => {
        const iso = (e.date || '').slice(0, 10)
        const future = iso > today
        const isToday = iso === today
        const past = iso < today
        const prev = i > 0 ? eventos[i - 1].date.slice(0, 10) : null
        const gap = prev ? Math.floor((new Date(iso) - new Date(prev)) / 86400000) : null
        const dotColor = future ? 'bg-yellow-500' : isToday ? 'bg-brand-gold' : 'bg-gray-300'
        const Icon = e.Icon
        return (
          <div key={i} className="relative flex items-start gap-3 py-2">
            <div className={`absolute left-2.5 top-3 w-3 h-3 rounded-full ${dotColor} border-2 border-white shadow-sm`} />
            <div className={`ml-8 flex-1 rounded-lg border p-2.5 ${future ? 'bg-yellow-50/40 border-yellow-100' : isToday ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 ${future ? 'text-yellow-700' : 'text-gray-500'}`} />
                <span className="text-sm font-medium text-gray-800">{e.key}</span>
                <span className="ml-auto text-[11px] font-mono text-gray-500">{fmtDate(iso)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                <span>{fmtDateRelative(iso)}</span>
                {gap != null && gap > 0 && <span>· {gap}d depois do anterior</span>}
                {isToday && <span className="text-amber-700 font-semibold">· Hoje</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Bloco editável — 6 secções colapsáveis.
function InvestidorEditSections({ data, form, setField }) {
  const sec = {
    identificacao: ['nome','tipo_principal','status','classificacao','origem','data_primeiro_contacto'],
    capital:       ['capital_min','capital_max','estrategia','perfil_risco','roi_pretendido','origem_capital','montante_investido'],
    preferencias:  ['tipo_imovel_preferido','localizacao_preferida','experiencia_imobiliario','equipa_obras'],
    contacto:      ['telemovel','email','preferencia_contacto','nda_assinado'],
    timeline:      ['data_primeiro_contacto','data_reuniao','data_ultimo_contacto','data_follow_up','data_proxima_acao','proxima_acao'],
    bloqueios:     ['motivo_nao_aprovacao','motivo_inatividade'],
  }
  const temBloqueios = !!(data.motivo_nao_aprovacao || data.motivo_inatividade)
  return <>
    {/* 1. Identificação & Status */}
    <Section icon="📋" title="Identificação & Status" fields={sec.identificacao} form={form} defaultOpen>
      <EF label="Nome" field="nome" form={form} set={setField} />
      <EF label="Tipo" field="tipo_principal" form={form} set={setField} type="select" options={['Passivo','Ativo']} />
      <EF label="Status" field="status" form={form} set={setField} type="select" options={invStatusFor(form.tipo_principal)} />
      <EF label="Classificação" field="classificacao" form={form} set={setField} type="select" options={['A','B','C','D']} />
      <EF label="Origem" field="origem" form={form} set={setField} type="select" options={ORIGENS_INVESTIDORES} />
      <EF label="1º Contacto" field="data_primeiro_contacto" form={form} set={setField} type="date" />
    </Section>

    {/* 2. Capital & Estratégia */}
    <Section icon="💼" title="Capital & Estratégia" fields={sec.capital} form={form} defaultOpen>
      <EF label="Capital Min (€)" field="capital_min" form={form} set={setField} type="number" />
      <EF label="Capital Max (€)" field="capital_max" form={form} set={setField} type="number" />
      <EF label="Perfil Risco" field="perfil_risco" form={form} set={setField} type="select" options={INV_PERFIL_RISCO_OPTS} />
      <EF label="ROI Pretendido" field="roi_pretendido" form={form} set={setField} type="select" options={INV_ROI_OPTS} />
      <EF label="Origem Capital" field="origem_capital" form={form} set={setField} type="select" options={INV_ORIGEM_CAPITAL_OPTS} />
      <EF label="Montante Investido (€)" field="montante_investido" form={form} set={setField} type="number" />
      <MultiChips label="Estratégia" field="estrategia" form={form} set={setField} options={INV_ESTRATEGIA_OPTS} />
    </Section>

    {/* 3. Preferências de Investimento */}
    <Section icon="🏠" title="Preferências de Investimento" fields={sec.preferencias} form={form} defaultOpen>
      <MultiChips label="Tipo de Imóvel" field="tipo_imovel_preferido" form={form} set={setField} options={INV_TIPO_IMOVEL_OPTS} />
      <MultiChips label="Localização Preferida" field="localizacao_preferida" form={form} set={setField} options={INV_DISTRITOS_OPTS} />
      <EF label="Experiência" field="experiencia_imobiliario" form={form} set={setField} type="select" options={INV_EXPERIENCIA_OPTS} />
      <EF label="Equipa de Obras" field="equipa_obras" form={form} set={setField} type="select" options={INV_EQUIPA_OBRAS_OPTS} />
    </Section>

    {/* 4. Contacto & NDA */}
    <Section icon="📞" title="Contacto & NDA" fields={sec.contacto} form={form}>
      <EF label="Telemóvel" field="telemovel" form={form} set={setField} />
      <EF label="Email" field="email" form={form} set={setField} />
      <EF label="Preferência de Contacto" field="preferencia_contacto" form={form} set={setField} type="select" options={INV_PREF_CONTACTO_OPTS} />
      <Toggle label="NDA Assinado" field="nda_assinado" form={form} set={setField} />
    </Section>

    {/* 5. Timeline */}
    <Section icon="🕐" title="Timeline" fields={sec.timeline} form={form} defaultOpen>
      <EF label="1º Contacto" field="data_primeiro_contacto" form={form} set={setField} type="date" />
      <EF label="Data Reunião" field="data_reuniao" form={form} set={setField} type="date" />
      <EF label="Último Contacto" field="data_ultimo_contacto" form={form} set={setField} type="date" />
      <EF label="Data Follow Up" field="data_follow_up" form={form} set={setField} type="date" />
      <EF label="Próxima Ação Data" field="data_proxima_acao" form={form} set={setField} type="date" />
      <EF label="Próxima Ação" field="proxima_acao" form={form} set={setField} />
    </Section>

    {/* 6. Notas */}
    <Section icon="📝" title="Notas" fields={['notas']} form={form} defaultOpen>
      <div className="col-span-2 md:col-span-3">
        <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={5}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
      </div>
    </Section>

    {/* 7. Bloqueios — só se já tem dados ou se status sugere */}
    {(temBloqueios || form.motivo_nao_aprovacao || form.motivo_inatividade) && (
      <Section icon="⚠" title="Bloqueios / Excepções" fields={sec.bloqueios} form={form} defaultOpen>
        <EF label="Motivo Não Aprovação" field="motivo_nao_aprovacao" form={form} set={setField} />
        <EF label="Motivo Inatividade" field="motivo_inatividade" form={form} set={setField} />
      </Section>
    )}
  </>
}

// Bloco de leitura — espelho das 6 secções.
function InvestidorReadSections({ data }) {
  const estrategia = parseJsonArray(data.estrategia)
  const tipoImovel = parseJsonArray(data.tipo_imovel_preferido)
  const localizacao = parseJsonArray(data.localizacao_preferida)
  const sec = {
    identificacao: ['nome','tipo_principal','status','classificacao','origem','data_primeiro_contacto'],
    capital:       ['capital_min','capital_max','estrategia','perfil_risco','roi_pretendido','origem_capital','montante_investido'],
    preferencias:  ['tipo_imovel_preferido','localizacao_preferida','experiencia_imobiliario','equipa_obras'],
    contacto:      ['telemovel','email','preferencia_contacto','nda_assinado'],
    timeline:      ['data_primeiro_contacto','data_reuniao','data_ultimo_contacto','data_follow_up','data_proxima_acao','proxima_acao'],
    bloqueios:     ['motivo_nao_aprovacao','motivo_inatividade'],
  }
  return <>
    {/* 1. Identificação */}
    <Section icon="📋" title="Identificação & Status" fields={sec.identificacao} form={data} defaultOpen>
      <Field label="Status" value={data.status} />
      <div>
        <p className="text-xs text-gray-400">Classificação</p>
        <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
          <InvClassBadge cls={data.classificacao} />
          {data.pontuacao > 0 && <span className="text-xs text-gray-500">({data.pontuacao} pts)</span>}
        </div>
      </div>
      <Field label="Origem" value={data.origem} />
      <Field label="1º Contacto" value={data.data_primeiro_contacto ? fmtDate(data.data_primeiro_contacto) : '—'} />
    </Section>

    {/* 2. Capital & Estratégia */}
    <Section icon="💼" title="Capital & Estratégia" fields={sec.capital} form={data} defaultOpen>
      <Field label="Capital Min" value={data.capital_min > 0 ? `€${Number(data.capital_min).toLocaleString('pt-PT')}` : '—'} />
      <Field label="Capital Max" value={data.capital_max > 0 ? `€${Number(data.capital_max).toLocaleString('pt-PT')}` : '—'} />
      <Field label="Perfil Risco" value={data.perfil_risco} />
      <Field label="ROI Pretendido" value={data.roi_pretendido} />
      <Field label="Origem Capital" value={data.origem_capital} />
      <Field label="Montante Investido" value={data.montante_investido > 0 ? `€${Number(data.montante_investido).toLocaleString('pt-PT')}` : '—'} />
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-gray-400 mb-1">Estratégia</p>
        {estrategia.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {estrategia.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700">{s}</span>)}
          </div>
        ) : <p className="text-sm text-gray-400">—</p>}
      </div>
    </Section>

    {/* 3. Preferências */}
    <Section icon="🏠" title="Preferências de Investimento" fields={sec.preferencias} form={data} defaultOpen>
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-gray-400 mb-1">Tipo de Imóvel</p>
        {tipoImovel.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tipoImovel.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-100 text-yellow-800">{s}</span>)}
          </div>
        ) : <p className="text-sm text-gray-400">{data.tipo_imovel_preferido || '—'}</p>}
      </div>
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-gray-400 mb-1">Localização</p>
        {localizacao.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {localizacao.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700">{s}</span>)}
          </div>
        ) : <p className="text-sm text-gray-400">{data.localizacao_preferida || '—'}</p>}
      </div>
      <Field label="Experiência" value={data.experiencia_imobiliario} />
      <Field label="Equipa Obras" value={data.equipa_obras} />
    </Section>

    {/* 4. Contacto */}
    <Section icon="📞" title="Contacto & NDA" fields={sec.contacto} form={data}>
      <Field label="Telemóvel" value={data.telemovel} />
      <Field label="Email" value={data.email} />
      <Field label="Pref. Contacto" value={data.preferencia_contacto} />
      <Field label="NDA" value={data.nda_assinado ? '✓ Assinado' : 'Não'} />
    </Section>

    {/* 5. Timeline */}
    <Section icon="🕐" title="Timeline" fields={sec.timeline} form={data} defaultOpen>
      <InvestidorTimeline data={data} />
    </Section>

    {/* 6. Notas */}
    {data.notas && (
      <Section icon="📝" title="Notas" fields={['notas']} form={data} defaultOpen>
        <div className="col-span-2 md:col-span-3">
          <p className="text-sm text-gray-700 whitespace-pre-line">{data.notas}</p>
        </div>
      </Section>
    )}

    {/* 7. Bloqueios — só se preenchido */}
    {(data.motivo_nao_aprovacao || data.motivo_inatividade) && (
      <Section icon="⚠" title="Bloqueios / Excepções" fields={sec.bloqueios} form={data} defaultOpen>
        {data.motivo_nao_aprovacao && <Field label="Motivo Não Aprovação" value={data.motivo_nao_aprovacao} />}
        {data.motivo_inatividade && <Field label="Motivo Inatividade" value={data.motivo_inatividade} />}
      </Section>
    )}
  </>
}

// ── Scorecard Tab (Discovery Call — SOP 2) ────────────────────
const CRITERIOS_INFO = {
  c1: { label: 'Capacidade Financeira', icon: '💰' },
  c2: { label: 'Experiência Imobiliária', icon: '🏗️' },
  c3: { label: 'Alinhamento Estratégico', icon: '🎯' },
  c4: { label: 'Estabilidade e Credibilidade', icon: '🔒' },
  c5: { label: 'Disponibilidade e Compromisso', icon: '⏱️' },
}

// Script de perguntas SOP 2 — guião para Discovery Call
const SCRIPT_PERGUNTAS = {
  Passivo: {
    intro: `Bom dia/Boa tarde [Nome], obrigado pelo teu tempo. Sou o Alexandre da Somnium Properties.\n\nAntes de te falar do que fazemos, quero perceber o que te trouxe até nós. Vi que preencheste o formulário — o que é que te chamou a atenção no investimento imobiliário?\n\n→ Deixar falar. A resposta inicial revela motivação, urgência e nível de sofisticação. Não interromper.`,
    c1: {
      label: 'Capacidade Financeira',
      contexto: 'Objectivo: perceber se o capital é real, líquido e mobilizável. Mínimo €50k. Não perguntar directamente "quanto tens" — conduzir a conversa para que revelem naturalmente.',
      perguntas: [
        { pergunta: 'Já tens uma ideia do montante que queres alocar a este tipo de investimento?', extrai: 'Range de capital. Se diz um valor concreto → bom sinal. Se diz "depende" → explorar.' },
        { pergunta: 'Imagina que amanhã te mostro um negócio que encaixa no teu perfil. Conseguias avançar rapidamente ou precisavas de tempo para organizar as coisas?', extrai: 'Liquidez real e velocidade de decisão. "Preciso vender primeiro X" = capital preso.' },
        { pergunta: 'Esse capital é algo que já tens separado para investimento, ou é algo que ainda estás a construir?', extrai: 'Capital exclusivo vs partilhado. Poupança dedicada vs depende de outras coisas.' },
        { pergunta: 'Já fizeste algum investimento com montantes parecidos? Como correu essa experiência?', extrai: 'Historial de mobilização. Conforto com valores altos. Se nunca movimentou, pode hesitar.' },
      ],
      red_flags: ['Fala em valores mas não concretiza ("um bom montante", "depende")', 'Capital depende de venda de casa/herança/financiamento', 'Desconforto visível quando se fala de números', 'Montante muito abaixo de €50k sem perspectiva de crescimento'],
    },
    c2: {
      label: 'Experiência Imobiliária',
      contexto: 'Para passivo, experiência imobiliária directa é menos importante. O que interessa é sofisticação financeira: percebe o que é risco-retorno? Já investiu em algo além de depósitos? Tolera incerteza?',
      perguntas: [
        { pergunta: 'Fora o imobiliário, tens algum tipo de investimento activo neste momento? Ações, fundos, crypto, algum negócio?', extrai: 'Nível de sofisticação. Se só tem depósitos → precisa de mais educação. Se tem portfólio diversificado → já pensa como investidor.' },
        { pergunta: 'Conta-me uma história de um investimento que não correu como esperavas. Todos temos uma.', extrai: 'Maturidade e tolerância ao risco. Se nunca perdeu dinheiro, pode reagir mal ao primeiro imprevisto. Como fala da perda? Com calma ou com ressentimento?' },
        { pergunta: 'Se te disser que um projecto nosso tipicamente rende entre 15% a 25% em 12 a 18 meses, como é que isso soa para ti?', extrai: 'Calibração de expectativas. Se diz "pouco" → expectativas inflacionadas. Se diz "parece-me bem" → realista. Se diz "e a garantia?" → red flag.' },
      ],
      red_flags: ['Espera "retorno garantido" ou "sem risco"', 'Nunca investiu em nada e tem receio de tudo', 'Não distingue entre investimento e especulação', 'Compara directamente com depósitos a prazo como benchmark'],
    },
    c3: {
      label: 'Alinhamento Estratégico',
      contexto: 'CRITÉRIO MAIS IMPORTANTE PARA PASSIVO. Quer perceber: delegará a operação ou quer controlar tudo? Aceita que há imprevistos em obra? As expectativas de retorno são compatíveis com o que entregamos?',
      perguntas: [
        { pergunta: 'Imagina que investes connosco e o projecto está a decorrer. Como é que gostavas que fosse a tua vida nesse período? Queres acompanhar de perto, ou preferes receber um relatório e saber que está a andar?', extrai: 'Nível de envolvimento desejado. Passivo ideal: "confio e quero updates". Red flag: "quero estar em todas as decisões".' },
        { pergunta: 'Vou ser honesto contigo: em obras, atrasos acontecem. Já tivemos projectos a atrasar 2-3 meses por licenças ou por materiais. Se isso acontecer, como reages?', extrai: 'Tolerância a imprevistos. Aceita como parte do processo ou entra em pânico? A forma como responde revela a qualidade futura da relação.' },
        { pergunta: 'O que seria para ti o cenário de sonho neste investimento? Descreve-me o resultado ideal.', extrai: 'Expectativas de ROI e timeline. Se o cenário de sonho é "dobrar o dinheiro em 6 meses" → desalinhado. Se é "15-20% num ano, sem dores de cabeça" → alinhado.' },
        { pergunta: 'E o contrário — o que te faria perder a confiança ou querer sair de um investimento, mesmo que os números ainda fizessem sentido?', extrai: 'Dealbreakers escondidos. Falta de comunicação? Atrasos? Mudança de plano? Saber isto agora evita problemas depois.' },
        { pergunta: 'Tens alguma preferência de zona, tipo de imóvel ou modelo de negócio? Ou confias na análise que fazemos?', extrai: 'Quanto quer controlar. Se diz "confio em vocês" → excelente. Se tem condições muito específicas → pode ser difícil acomodar.' },
      ],
      red_flags: ['Quer aprovar cada decisão operacional', 'Expectativa de ROI > 30% sem risco', 'Zero tolerância a atrasos ou desvios', '"Se não for exactamente assim, eu saio"', 'Quer escolher empreiteiro, materiais, etc. (não é passivo)'],
    },
    c4: {
      label: 'Estabilidade e Credibilidade',
      contexto: 'Avaliar coerência entre o que disse no formulário e o que diz na call. A disposição para KYC não se pergunta logo — sente-se. Introduzir naturalmente quando há confiança.',
      perguntas: [
        { pergunta: 'Só por curiosidade, o que é que fazes profissionalmente? Às vezes ajuda-nos a perceber melhor o perfil.', extrai: 'Profissão e estabilidade. Revela capacidade financeira real, padrão de decisão e se o investimento faz sentido no contexto da vida dele.' },
        { pergunta: 'Esse capital que pensas investir, vem de poupança, de alguma venda recente, actividade empresarial? Pergunto porque nos ajuda a perceber a timeline.', extrai: 'Origem do capital (compliance KYC). Formulação suave — "ajuda-nos a perceber a timeline" em vez de "temos de saber a origem".' },
        { pergunta: 'Quando avançarmos, vamos precisar de trocar documentação — NDA, identificação, IBAN para formalizar. É algo que consegues tratar rapidamente?', extrai: 'Disposição para KYC. Introduzir como passo normal do processo, não como exigência. Se hesita ou recusa → red flag séria.' },
      ],
      red_flags: ['Contradiz informação do formulário (capital, experiência, timeline)', 'Desconforto com documentação ("para que precisam disso?")', 'Origem do capital vaga ou muda de versão', 'Evita perguntas pessoais ou profissionais básicas'],
    },
    c5: {
      label: 'Disponibilidade e Compromisso',
      contexto: 'Não medir entusiasmo — medir compromisso real. Um "sim entusiasmado" sem data não vale nada. Um "preciso de pensar até dia X" vale ouro.',
      perguntas: [
        { pergunta: 'Se os números fizerem sentido e estivermos alinhados, qual seria o teu timing ideal para avançar? Este mês, próximo trimestre, ou estás a pensar mais a médio prazo?', extrai: 'Timeline real. Respostas vagas ("quando surgir") = baixo compromisso. Respostas concretas ("até Junho quero ter decidido") = alto compromisso.' },
        { pergunta: 'Há alguma coisa na tua vida neste momento que possa atrasar a decisão? Pergunto para gerir expectativas dos dois lados.', extrai: 'Impedimentos reais. Venda de imóvel? Decisão com cônjuge? Outro investimento em análise? Melhor saber agora.' },
        { pergunta: 'O que é que precisas de ver ou ouvir da nossa parte para ficares confortável a dizer sim?', extrai: 'Critérios de decisão e objecções escondidas. Se sabe exactamente o que precisa → está perto. Se diz "não sei" → ainda está a explorar.' },
        { pergunta: 'Estás a olhar para outras oportunidades de investimento neste momento, ou o imobiliário é o teu foco principal?', extrai: 'Competição e prioridade. Se tem 5 coisas em avaliação → baixa prioridade. Se está focado → alta probabilidade.' },
      ],
      red_flags: ['Sem data concreta ("logo se vê", "quando for a altura")', 'Decisão depende de terceiros sem timeline', '"Estou a ver muitas coisas" — disperso', 'Entusiasmo alto mas zero acção concreta após a call'],
    },
    fecho: `[Nome], gostei muito desta conversa. Fiquei com uma imagem clara do que procuras e acho que conseguimos alinhar.\n\nO que vou fazer agora:\n1. Envio-te um resumo por email nas próximas 24 horas com os pontos que falámos\n2. Se fizer sentido para ambos, preparo a documentação formal — é rápido, um NDA e a ficha de investidor\n3. Assim que estiver tudo alinhado, apresento-te a primeira oportunidade com os números todos\n\nDo teu lado, a única coisa que te peço é: pensa no que falámos e diz-me se estás confortável para avançar para o passo seguinte. Sem pressão, ao teu ritmo.\n\nAlguma questão que tenhas ficado com?`,
  },
  Ativo: {
    intro: `Bom dia/Boa tarde [Nome], obrigado pelo tempo. Sou o Alexandre da Somnium Properties.\n\nVi pelo teu formulário que já tens experiência em imobiliário, o que já nos coloca numa conversa diferente. Não te vou vender nada — quero perceber o que fazes, como trabalhas, e se faz sentido juntarmos forças.\n\nConta-me: como é que começaste no imobiliário?\n\n→ Deixar contar a história. Revela experiência real, ego, estilo de trabalho e honestidade. A melhor pergunta de abertura para activos.`,
    c1: {
      label: 'Capacidade Financeira',
      contexto: 'Objectivo: perceber se cobre aquisição + obra + contingências (mín €200k). Activos são mais directos — pode-se falar de dinheiro mais abertamente. A questão não é só "quanto", é "quanto disponível sem stress".',
      perguntas: [
        { pergunta: 'Nos teus projectos anteriores, qual foi o maior montante que alocaste a um único negócio? Aquisição e obra incluídos.', extrai: 'Historial de montantes. Se já movimentou €200k+ → confortável. Se o máximo foi €80k → pode não ter escala.' },
        { pergunta: 'Quando encontras um bom negócio, quanto tempo demoras a ter o capital disponível? Tens liquidez imediata ou precisas de organizar?', extrai: 'Velocidade de mobilização. Activos bons têm dinheiro pronto. Se precisa vender algo primeiro → atrasa o projecto.' },
        { pergunta: 'Uma coisa que vemos muito: pessoas que cobrem a aquisição mas depois ficam apertadas na obra. Como costumas estruturar isso? Reservas contingência?', extrai: 'Maturidade financeira. Se diz "sempre guardo 10-15% extra" → excelente. Se não percebe o conceito → risco.' },
        { pergunta: 'Se te mostrar um negócio esta semana que precisasse de €200k a €250k tudo incluído — estavas nessa faixa?', extrai: 'Confirmação directa do range. Pergunta natural após a conversa sobre projectos anteriores. A resposta revela se está no mínimo ou acima.' },
      ],
      red_flags: ['Nunca operou acima de €100k', 'Capital depende de venda de outro projecto que ainda não vendeu', 'Não reserva contingência ("a obra é o que é")', 'Diz valores altos mas hesita quando se concretiza'],
    },
    c2: {
      label: 'Experiência Imobiliária',
      contexto: 'PESO MÁXIMO. O activo gere a obra. Sem experiência real → risco operacional total. Não basta dizer que "já fez obras" — queremos detalhes: onde, quando, problemas, como resolveu, com que equipa.',
      perguntas: [
        { pergunta: 'Conta-me o teu último projecto do início ao fim. Como encontraste o imóvel, quanto pagaste, o que fizeste, e como correu a venda?', extrai: 'Historial completo num caso real. Atenção aos detalhes: se é vago → pode não ter feito. Se é específico → genuíno. Notar se os números fazem sentido.' },
        { pergunta: 'Qual foi a maior dor de cabeça que tiveste numa obra? Aquele momento em que pensaste "para que é que eu me meti nisto?"', extrai: 'Resiliência e honestidade. Toda a gente que faz obras tem histórias de horror. Se diz "nunca tive problemas" → ou não fez obras ou não é honesto.' },
        { pergunta: 'Tens empreiteiro de confiança? Há quanto tempo trabalham juntos e em quantos projectos?', extrai: 'Equipa operacional. Empreiteiro de confiança com historial = activo sólido. "Tenho de procurar" = risco de atraso.' },
        { pergunta: 'Só para calibrar: quanto achas que custaria remodelar um T2 com 80m² aqui em Coimbra? Cozinha e casas de banho novas, pavimento, pintura, canalização.', extrai: 'TESTE DE CONHECIMENTO REAL. Resposta razoável: €35k-€55k. Se diz €15k ou €100k → desfasado do mercado. A precisão da estimativa revela experiência operacional.' },
      ],
      red_flags: ['Respostas vagas sobre projectos ("fiz umas coisas")', 'Não consegue estimar custos de obra', 'Sem empreiteiro e sem plano para arranjar', 'Nunca geriu obra directamente — delegou tudo', 'Projectos "todos correram bem, sem problemas"'],
    },
    c3: {
      label: 'Alinhamento Estratégico',
      contexto: 'Activo trabalha no modelo Somnium: a Somnium encontra o negócio e estrutura, o activo executa com a sua equipa. Tem de aceitar esta divisão. Se quer fazer "à sua maneira" total → incompatível.',
      perguntas: [
        { pergunta: 'Nos teus projectos, trabalhas sempre sozinho ou já fizeste alguma coisa em parceria? Como é que foi?', extrai: 'Historial de parcerias. Se já trabalhou em equipa e correu bem → sinal positivo. Se diz "prefiro sozinho" → pode não encaixar no modelo.' },
        { pergunta: 'No nosso modelo, a Somnium identifica e estrutura os negócios, e o parceiro activo executa a obra e gere o terreno. Como é que isso soa para ti?', extrai: 'Reacção ao modelo. Aceita? Tem dúvidas? Quer negociar? A primeira reacção é a mais genuína.' },
        { pergunta: 'Se durante um projecto surgir uma decisão em que a tua opinião e a nossa não coincidem — como achas que devíamos resolver isso?', extrai: 'Gestão de conflito e ego. Procura consenso → maduro. "Faço o que eu achar melhor" → incompatível.' },
        { pergunta: 'Qual é o retorno mínimo que te faz mover? Abaixo de quanto é que não te compensa o trabalho?', extrai: 'Expectativas de ROI e threshold de effort. Se diz 15-25% → realista. Se diz 40%+ → desfasado.' },
      ],
      red_flags: ['"Eu faço à minha maneira"', 'Experiências negativas com parcerias sem autocrítica', 'Não aceita reportar ou coordenar decisões', 'Quer controlo total incluindo sourcing de negócios'],
    },
    c4: {
      label: 'Estabilidade e Credibilidade',
      contexto: 'Activo sem documentação ou com historial problemático é risco duplo: financeiro + operacional. Verificar se o que conta é verificável. A coerência entre o formulário e a call é fundamental.',
      perguntas: [
        { pergunta: 'Essas obras que fizeste — se eu quisesse ir ver ou falar com alguém que trabalhou contigo, seria possível?', extrai: 'Verificabilidade do historial. Se diz "claro, posso dar contactos" → credível. Se hesita → pode estar a inflacionar.' },
        { pergunta: 'De onde vem o capital que tens para investir? Actividade empresarial, poupança de anos, venda de alguma coisa?', extrai: 'Origem do capital. Mesmo para activos, compliance é necessário. Formular como curiosidade natural.' },
        { pergunta: 'Quando avançarmos para formalizar, precisamos de documentação básica — BI, IBAN, e assinamos um NDA. Costuma ser rápido. Consegues tratar disso facilmente?', extrai: 'Disposição KYC. Activos sérios estão habituados a formalizar. Quem hesita pode ter problemas.' },
      ],
      red_flags: ['Não consegue dar referências de projectos anteriores', 'Incoerência entre o formulário e o que diz na call', 'Resistência a documentação ou formalização', 'Historial de litígios com parceiros ou empreiteiros (perguntar indirectamente)'],
    },
    c5: {
      label: 'Disponibilidade e Compromisso',
      contexto: 'Para activos, compromisso = capital MAIS equipa MAIS tempo. Não basta ter dinheiro. Precisa ter empreiteiro livre, agenda disponível e foco. Activo com 4 obras em simultâneo é risco.',
      perguntas: [
        { pergunta: 'Neste momento, quantos projectos tens activos? E nos próximos 2-3 meses, como está a tua agenda?', extrai: 'Capacidade real. 0-1 projectos = disponível. 2 = pode funcionar. 3+ = sobrecarregado.' },
        { pergunta: 'Se te mostrar um negócio no próximo mês, tu e o teu empreiteiro conseguiam arrancar em quanto tempo?', extrai: 'Velocidade operacional. Se diz "2-3 semanas" → pronto. Se diz "3-4 meses" → não está operacionalmente disponível.' },
        { pergunta: 'Quando tens um projecto a decorrer, quanto tempo por semana costumas dedicar? Vais à obra todos os dias ou geres mais à distância?', extrai: 'Estilo de gestão e capacidade de absorver mais um projecto. Hands-on diário = dedica-se mas pode não ter espaço. Gestão à distância = pode acumular.' },
        { pergunta: 'O que te impediria de avançar se os números fizessem sentido? Há alguma coisa pendente que possa atrasar?', extrai: 'Impedimentos escondidos. Obras por fechar, empreiteiro ocupado, liquidez presa.' },
      ],
      red_flags: ['3+ projectos activos simultaneamente', 'Empreiteiro sem disponibilidade nos próximos meses', '"Tenho de ver a agenda" — sem compromisso concreto', 'Muitos compromissos e sem capacidade de recusar novos'],
    },
    fecho: `[Nome], esta conversa confirmou-me que tens o perfil que procuramos. Tens experiência, tens equipa, sabes do que estamos a falar.\n\nO que vou fazer:\n1. Envio-te um resumo por email nas próximas 24h\n2. Tratamos da documentação — NDA e ficha de parceiro activo. É standard, é rápido\n3. Quando estiver formalizado, apresento-te o primeiro negócio com análise financeira completa\n\nDo teu lado, confirma-me se o teu empreiteiro está disponível e se o capital está acessível para quando surgir oportunidade.\n\nAlguma dúvida?`,
  },
}

const CLASSE_CORES = {
  A: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', bar: 'bg-green-500' },
  B: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', bar: 'bg-blue-500' },
  C: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', bar: 'bg-yellow-500' },
  D: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', bar: 'bg-red-500' },
}

// Wrapper que une Scorecard (avaliação SOP 2) e Histórico de Classificação numa
// única tab, com sub-tabs internos.
function AvaliacaoTab({ data, onUpdate }) {
  const [sub, setSub] = useState('scorecard')
  const tipoInvestidor = (() => { try { const t = JSON.parse(data.tipo_investidor || '[]'); return t.includes('Ativo') ? 'Ativo' : 'Passivo' } catch { return 'Passivo' } })()
  return (
    <div>
      <div className="flex border-b border-gray-200 px-4 sm:px-6 pt-3" style={{ backgroundColor: '#FAFAF7' }}>
        {[
          { key: 'scorecard', label: 'Scorecard', icon: '🎯' },
          { key: 'historico',  label: 'Histórico', icon: '📈' },
        ].map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className="relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
            style={{ color: sub === s.key ? '#1A1A1A' : '#9ca3af' }}>
            <span className="mr-1.5">{s.icon}</span>{s.label}
            {sub === s.key && <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: '#C9A84C' }} />}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-6">
        {sub === 'scorecard'
          ? <ScorecardTab investidorId={data.id} investidorNome={data.nome} tipoInvestidor={tipoInvestidor} onUpdate={onUpdate} />
          : <ClassificacaoTab investidorId={data.id} investidorNome={data.nome} classificacaoActual={data.classificacao} pontuacaoActual={data.pontuacao} />}
      </div>
    </div>
  )
}

function ScorecardTab({ investidorId, investidorNome, tipoInvestidor, onUpdate }) {
  const [scorecards, setScorecards] = useState([])
  const [rubrica, setRubrica] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [scriptStep, setScriptStep] = useState(0) // 0=intro, 1-5=critérios, 6=fecho
  const [tipo, setTipo] = useState(tipoInvestidor || 'Passivo')
  const [form, setForm] = useState({ c1_score: 3, c2_score: 3, c3_score: 3, c4_score: 3, c5_score: 3, c1_notas: '', c2_notas: '', c3_notas: '', c4_notas: '', c5_notas: '' })

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/crm/scorecards/${investidorId}`).then(r => r.json()),
      apiFetch('/api/crm/scorecards/rubrica').then(r => r.json()),
    ]).then(([sc, rb]) => {
      setScorecards(sc)
      setRubrica(rb)
    }).finally(() => setLoading(false))
  }, [investidorId])

  const pesos = rubrica?.pesos?.[tipo] || { c1: 0.20, c2: 0.10, c3: 0.30, c4: 0.20, c5: 0.20 }

  // Calcular preview em tempo real
  const previewTotal = form.c1_score + form.c2_score + form.c3_score + form.c4_score + form.c5_score
  const previewPonderado = Math.round((form.c1_score * pesos.c1 + form.c2_score * pesos.c2 + form.c3_score * pesos.c3 + form.c4_score * pesos.c4 + form.c5_score * pesos.c5) * 20 * 100) / 100
  const previewClasse = previewPonderado >= 88 ? 'A' : previewPonderado >= 72 ? 'B' : previewPonderado >= 56 ? 'C' : 'D'

  async function saveScorecard() {
    setSaving(true)
    try {
      const r = await apiFetch('/api/crm/scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investidor_id: investidorId,
          tipo_investidor: tipo,
          ...form,
          avaliador: 'Manual',
          fonte: 'manual',
        }),
      })
      const result = await r.json()
      if (result.ok) {
        setCreating(false)
        setForm({ c1_score: 3, c2_score: 3, c3_score: 3, c4_score: 3, c5_score: 3, c1_notas: '', c2_notas: '', c3_notas: '', c4_notas: '', c5_notas: '' })
        const sc = await apiFetch(`/api/crm/scorecards/${investidorId}`).then(r => r.json())
        setScorecards(sc)
        if (onUpdate) onUpdate()
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  if (loading) return <div className="text-center text-gray-400 py-8">A carregar...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Scorecard Discovery Call</h3>
          <p className="text-xs text-gray-400">Avaliação SOP 2 — 5 critérios ponderados por tipo de investidor</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowScript(!showScript); setScriptStep(0) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${showScript ? 'bg-brand-dark text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {showScript ? 'Fechar Script' : 'Script da Call'}
          </button>
          {!creating && !showScript && (
            <button onClick={() => setCreating(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#C9A84C' }}>
              + Novo Scorecard
            </button>
          )}
        </div>
      </div>

      {/* Script de Discovery Call */}
      {showScript && (() => {
        const script = SCRIPT_PERGUNTAS[tipo]
        if (!script) return null
        const criterioKeys = ['c1', 'c2', 'c3', 'c4', 'c5']
        const totalSteps = criterioKeys.length + 2 // intro + 5 critérios + fecho
        const stepLabels = ['Introdução', ...criterioKeys.map(c => CRITERIOS_INFO[c].label), 'Fecho e Próximos Passos']

        return (
          <div className="rounded-xl border-2 border-brand-gold overflow-hidden" style={{ backgroundColor: '#faf8f2' }}>
            {/* Script header + tipo selector */}
            <div className="px-5 py-3 border-b border-[#C9A84C33] flex items-center justify-between" style={{ backgroundColor: '#0d0d0d' }}>
              <div className="flex items-center gap-3">
                <span className="text-white text-sm font-bold">Script Discovery Call</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-gold text-black font-medium">{investidorNome}</span>
              </div>
              <div className="flex gap-1">
                {['Passivo', 'Ativo'].map(t => (
                  <button key={t} onClick={() => setTipo(t)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition ${tipo === t ? 'bg-brand-gold text-black' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Step navigation */}
            <div className="px-5 py-2 border-b border-[#C9A84C22] flex gap-1 overflow-x-auto">
              {stepLabels.map((label, i) => (
                <button key={i} onClick={() => setScriptStep(i)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${
                    scriptStep === i ? 'bg-brand-dark text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
                  }`}>
                  {i > 0 && i < totalSteps - 1 ? `${i}. ` : ''}{label}
                </button>
              ))}
            </div>

            {/* Step content */}
            <div className="p-5">
              {scriptStep === 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-gray-800">Introdução</h4>
                  <div className="rounded-lg bg-white border border-gray-200 p-4">
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{script.intro.replace(/\[Nome\]/g, investidorNome.split(' ')[0])}</p>
                  </div>
                  <p className="text-[10px] text-gray-400">Tom: profissional mas acessível. Objectivo: criar confiança e alinhar expectativas.</p>
                </div>
              )}

              {scriptStep >= 1 && scriptStep <= 5 && (() => {
                const ck = criterioKeys[scriptStep - 1]
                const bloco = script[ck]
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{CRITERIOS_INFO[ck].icon}</span>
                      <h4 className="text-sm font-bold text-gray-800">{bloco.label}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C9A84C22] text-brand-gold font-medium">Critério {scriptStep}/5</span>
                    </div>

                    {/* Contexto */}
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-[10px] uppercase text-blue-500 font-semibold tracking-wide mb-1">Contexto (não ler em voz alta)</p>
                      <p className="text-xs text-blue-800">{bloco.contexto}</p>
                    </div>

                    {/* Perguntas */}
                    <div className="space-y-3">
                      <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">Perguntas a fazer</p>
                      {bloco.perguntas.map((p, i) => (
                        <div key={i} className="rounded-lg bg-white border border-gray-200 hover:border-brand-gold transition overflow-hidden">
                          <div className="flex gap-3 items-start p-3 pb-2">
                            <span className="text-xs font-bold text-brand-gold shrink-0 mt-0.5">{i + 1}.</span>
                            <p className="text-sm text-gray-800 leading-relaxed font-medium">"{p.pergunta.replace(/\[Nome\]/g, investidorNome.split(' ')[0])}"</p>
                          </div>
                          <div className="px-3 pb-3 pl-8">
                            <div className="flex items-start gap-1.5 rounded bg-amber-50 px-2.5 py-1.5">
                              <span className="text-[10px] text-amber-600 shrink-0 mt-px">EXTRAI:</span>
                              <p className="text-[11px] text-amber-800 leading-snug">{p.extrai}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Red flags */}
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                      <p className="text-[10px] uppercase text-red-500 font-semibold tracking-wide mb-1.5">Red Flags (atenção a)</p>
                      <div className="space-y-1">
                        {bloco.red_flags.map((rf, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-red-700">
                            <span className="text-red-400 shrink-0">!</span>
                            <span>{rf}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {scriptStep === 6 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-gray-800">Fecho e Próximos Passos</h4>
                  <div className="rounded-lg bg-white border border-gray-200 p-4">
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{script.fecho.replace(/\[Nome\]/g, investidorNome.split(' ')[0])}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                    <p className="text-[10px] uppercase text-green-600 font-semibold tracking-wide mb-1">Após a call</p>
                    <div className="space-y-1 text-xs text-green-800">
                      <p>1. Preencher o Scorecard com base nas respostas (botão abaixo)</p>
                      <p>2. Enviar resumo por email ao investidor dentro de 24h</p>
                      <p>3. Actualizar status no CRM para "Follow Up" ou "Investidor Qualificado em Carteira"</p>
                      <p>4. Se Classe A/B: agendar apresentação de oportunidade</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Script navigation */}
            <div className="px-5 py-3 border-t border-[#C9A84C22] flex items-center justify-between">
              <button onClick={() => setScriptStep(Math.max(0, scriptStep - 1))} disabled={scriptStep === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed">
                Anterior
              </button>
              <span className="text-[10px] text-gray-400">{scriptStep + 1} / {totalSteps}</span>
              {scriptStep < totalSteps - 1 ? (
                <button onClick={() => setScriptStep(scriptStep + 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#C9A84C' }}>
                  Seguinte
                </button>
              ) : (
                <button onClick={() => { setShowScript(false); setCreating(true) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: '#0d0d0d' }}>
                  Preencher Scorecard
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* Formulário de criação */}
      {creating && (
        <div className="rounded-xl border border-[#C9A84C33] p-5 space-y-5" style={{ backgroundColor: '#faf8f2' }}>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-800">Nova Avaliação — {investidorNome}</h4>
            <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {/* Tipo investidor */}
          <div className="flex gap-2">
            {['Passivo', 'Ativo'].map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${tipo === t ? 'bg-brand-dark text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t}
              </button>
            ))}
            <span className="text-[10px] text-gray-400 self-center ml-2">Pesos ajustados automaticamente</span>
          </div>

          {/* Critérios */}
          <div className="space-y-4">
            {['c1', 'c2', 'c3', 'c4', 'c5'].map(c => {
              const info = CRITERIOS_INFO[c]
              const peso = pesos[c]
              const rubricaItems = rubrica?.rubrica?.[tipo]?.[c] || []
              const score = form[`${c}_score`]
              const rubricaDesc = rubricaItems.find(r => r.min === score)?.desc || ''

              return (
                <div key={c} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{info.icon}</span>
                      <span className="text-sm font-semibold text-gray-800">{info.label}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                      Peso: {Math.round(peso * 100)}%
                    </span>
                  </div>

                  {/* Score selector */}
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(v => (
                      <button key={v} onClick={() => setForm(f => ({ ...f, [`${c}_score`]: v }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                          score === v ? 'bg-brand-dark text-white shadow-sm' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>

                  {/* Rubrica description */}
                  {rubricaDesc && (
                    <p className="text-xs text-brand-gold font-medium mb-2">{rubricaDesc}</p>
                  )}

                  {/* Notas */}
                  <textarea
                    value={form[`${c}_notas`] || ''}
                    onChange={e => setForm(f => ({ ...f, [`${c}_notas`]: e.target.value }))}
                    placeholder="Notas da entrevista..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-none"
                  />
                </div>
              )
            })}
          </div>

          {/* Preview resultado */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase text-gray-400 tracking-wide">Resultado Previsto</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-2xl font-black ${CLASSE_CORES[previewClasse]?.text || 'text-gray-800'}`}>
                    Classe {previewClasse}
                  </span>
                  <span className="text-sm text-gray-500">{previewPonderado}/100 pts</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400">Total bruto: {previewTotal}/25</p>
                <p className="text-[10px] text-gray-400">A ≥88 | B ≥72 | C ≥56 | D &lt;56</p>
              </div>
            </div>

            {/* Barra visual por critério */}
            <div className="mt-3 space-y-1">
              {['c1', 'c2', 'c3', 'c4', 'c5'].map(c => {
                const s = form[`${c}_score`]
                const p = pesos[c]
                return (
                  <div key={c} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-8">{CRITERIOS_INFO[c].icon}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${CLASSE_CORES[previewClasse]?.bar || 'bg-gray-400'}`}
                        style={{ width: `${(s / 5) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 w-12 text-right">{s}/5 ({Math.round(p * 100)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg text-xs text-gray-600 bg-gray-100 hover:bg-gray-200">
              Cancelar
            </button>
            <button onClick={saveScorecard} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
              {saving ? 'A guardar...' : 'Guardar Scorecard'}
            </button>
          </div>
        </div>
      )}

      {/* Histórico de scorecards */}
      {scorecards.length > 0 ? (
        <div className="space-y-3">
          {scorecards.map((sc, idx) => {
            const cores = CLASSE_CORES[sc.classificacao] || CLASSE_CORES.D
            return (
              <div key={sc.id} className={`rounded-xl border ${cores.border} p-4 ${idx === 0 ? cores.bg : 'bg-white'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-black ${cores.text}`}>Classe {sc.classificacao}</span>
                    <span className="text-xs text-gray-500">{sc.pontuacao_ponderada}/100 pts</span>
                    {idx === 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-dark text-white font-medium">Actual</span>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{new Date(sc.created_at).toLocaleDateString('pt-PT')}</p>
                    <p className="text-[10px] text-gray-400">{sc.tipo_investidor} · {sc.fonte === 'transcricao_automatica' ? 'Via transcrição' : sc.fonte === 'manual' ? 'Manual' : sc.fonte}</p>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {['c1', 'c2', 'c3', 'c4', 'c5'].map(c => (
                    <div key={c} className="text-center">
                      <p className="text-[10px] text-gray-400">{CRITERIOS_INFO[c].icon}</p>
                      <p className="text-sm font-bold text-gray-800">{sc[`${c}_score`]}</p>
                      {sc[`${c}_notas`] && (
                        <p className="text-[9px] text-gray-400 mt-1 line-clamp-2">{sc[`${c}_notas`]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : !creating && (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm text-gray-500">Sem scorecards registados</p>
          <p className="text-xs text-gray-400 mt-1">Cria um scorecard após a Discovery Call ou analisa uma transcrição de reunião</p>
        </div>
      )}
    </div>
  )
}

// ── Classificação Tab (Histórico + Reclassificação) ──────────
function ClassificacaoTab({ investidorId, investidorNome, classificacaoActual, pontuacaoActual }) {
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [reclassificando, setReclassificando] = useState(false)

  useEffect(() => {
    apiFetch(`/api/crm/classificacao-historico/${investidorId}`)
      .then(r => r.json())
      .then(setHistorico)
      .finally(() => setLoading(false))
  }, [investidorId])

  async function triggerReclassificacao() {
    setReclassificando(true)
    try {
      await apiFetch('/api/crm/automation/reclassificar-investidores', { method: 'POST' })
      const h = await apiFetch(`/api/crm/classificacao-historico/${investidorId}`).then(r => r.json())
      setHistorico(h)
    } catch (e) { console.error(e) }
    setReclassificando(false)
  }

  if (loading) return <div className="text-center text-gray-400 py-8">A carregar...</div>

  const coresActual = CLASSE_CORES[classificacaoActual] || CLASSE_CORES.D

  return (
    <div className="space-y-6">
      {/* Estado actual */}
      <div className={`rounded-xl border ${coresActual.border} ${coresActual.bg} p-5`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase text-gray-500 tracking-wide">Classificação Actual</p>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-3xl font-black ${coresActual.text}`}>
                {classificacaoActual || '—'}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{pontuacaoActual || 0}/100 pts</p>
                <p className="text-xs text-gray-500">
                  {classificacaoActual === 'A' ? 'Prioritário — recebe oportunidades primeiro' :
                   classificacaoActual === 'B' ? 'Elegível — recebe oportunidades em 2.ª prioridade' :
                   classificacaoActual === 'C' ? 'Em observação — reavaliação periódica' :
                   classificacaoActual === 'D' ? 'Não elegível — manter em pipeline de nurturing' :
                   'Sem classificação — completar scorecard'}
                </p>
              </div>
            </div>
          </div>
          <button onClick={triggerReclassificacao} disabled={reclassificando}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">
            {reclassificando ? 'A processar...' : 'Reavaliar agora'}
          </button>
        </div>
      </div>

      {/* Regras de follow-up */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Ciclo de Follow-Up e Reclassificação</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-green-50 p-3 border border-green-100 text-center">
            <p className="text-lg font-bold text-green-700">30d</p>
            <p className="text-[10px] text-green-600 font-medium">Follow-up quente</p>
            <p className="text-[10px] text-gray-400">Sem penalização</p>
          </div>
          <div className="rounded-lg bg-yellow-50 p-3 border border-yellow-100 text-center">
            <p className="text-lg font-bold text-yellow-700">60d</p>
            <p className="text-[10px] text-yellow-600 font-medium">Follow-up intermédio</p>
            <p className="text-[10px] text-gray-400">-5 a -10 pts</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3 border border-red-100 text-center">
            <p className="text-lg font-bold text-red-700">90d</p>
            <p className="text-[10px] text-red-600 font-medium">Follow-up frio</p>
            <p className="text-[10px] text-gray-400">-15 a -25 pts</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Bónus: NDA assinado (+5), montante investido (+10), negócios activos (+10).
          Classe C sem evolução em 180 dias → sugestão de arquivo.
        </p>
      </div>

      {/* Timeline de classificação */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Histórico de Classificação</h4>
        {historico.length > 0 ? (
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" />
            <div className="space-y-4">
              {historico.map((h, idx) => {
                const coresNova = CLASSE_CORES[h.classificacao_nova] || CLASSE_CORES.D
                const subiu = h.classificacao_anterior && h.classificacao_nova < h.classificacao_anterior
                const desceu = h.classificacao_anterior && h.classificacao_nova > h.classificacao_anterior
                return (
                  <div key={h.id} className="relative pl-8">
                    <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${coresNova.border} ${idx === 0 ? coresNova.bg : 'bg-white'}`} />
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {h.classificacao_anterior ? (
                            <span className="text-xs">
                              <span className="font-semibold text-gray-500">{h.classificacao_anterior}</span>
                              <span className="mx-1">{subiu ? '→' : desceu ? '→' : '→'}</span>
                              <span className={`font-bold ${coresNova.text}`}>{h.classificacao_nova}</span>
                              {subiu && <span className="ml-1 text-green-500">▲</span>}
                              {desceu && <span className="ml-1 text-red-500">▼</span>}
                            </span>
                          ) : (
                            <span className={`text-xs font-bold ${coresNova.text}`}>
                              → {h.classificacao_nova} (primeira classificação)
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {h.pontuacao_anterior ? `${h.pontuacao_anterior} → ` : ''}{h.pontuacao_nova} pts
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">{new Date(h.created_at).toLocaleDateString('pt-PT')}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{h.motivo}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {h.tipo === 'manual' ? 'Scorecard manual' :
                         h.tipo === 'transcricao_automatica' ? 'Via transcrição automática' :
                         h.tipo === 'reclassificacao_periodica' ? 'Reclassificação periódica' : h.tipo}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">Sem histórico de classificação</p>
            <p className="text-xs text-gray-300 mt-1">O histórico é criado automaticamente quando um scorecard é preenchido ou na reclassificação periódica</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniField({ label, value, highlight }) {
  return (
    <div className={`px-2 py-1.5 rounded-lg ${highlight ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border border-gray-100'}`}>
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      <p className={`text-xs font-semibold ${highlight ? 'text-yellow-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

