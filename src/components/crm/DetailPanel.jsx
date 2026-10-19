/**
 * Painel de detalhe para Imóveis, Investidores, Consultores.
 * Mostra: campos editáveis + relações. Tarefas, histórico e reuniões têm sítio próprio
 * (Tarefas, Auditoria, aba Reuniões): a ficha não os repete.
 */
import { useState, useEffect, useCallback, useMemo, useRef, memo, lazy, Suspense } from 'react'
import { FileDown, ChevronDown, ChevronUp, ClipboardList, Home, Euro, Repeat, BarChart3, Lightbulb, Phone, FileText, Pencil, Save, X, ArrowLeft, Link2, Check, PhoneCall, Mail, MessageCircle, Calendar, CheckCircle2, TrendingUp, Wallet, Target, Hourglass, AlertTriangle, Users, MapPin, Eye, Trash2, ThumbsUp, TrendingDown, Shield, Building2, UserRound, FolderOpen, Calculator, Hammer, Scale, DoorOpen, FileBarChart, ListChecks, Building, CalendarCheck, Star, Gauge, History, Briefcase, ShieldCheck, Timer } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrandLoader } from '../ui/BrandLoader.jsx'
import { TabTransition, useTabDirection } from '../ui/PageTransition.jsx'
import { tabIndicatorTransition } from '../../lib/motion.js'
import { Button } from '../ui/Button.jsx'
import { apiFetch, apiFetchJson, openDocument } from '../../lib/api.js'
import { friendlyError } from '../../lib/friendlyError.js'
import { useToast } from '../ui/Toast.jsx'
import { PartilharAcesso } from '../PartilharAcesso.jsx'
import { GravacoesConsultor } from './GravacoesConsultor.jsx'
import { DocumentosConsultor } from './DocumentosConsultor.jsx'
import { RegistoChamadasTab } from './RegistoChamadasTab.jsx'
import { isWholesaling } from '../../lib/modelos.js'
import { fmtTempoMercado } from '../../lib/tempoMercado.js'
import { DealBreakersPanel } from './DealBreakersPanel.jsx'
import { TransicaoFaseModal } from './TransicaoFaseModal.jsx'
import { ProximosPassos } from './ProximosPassos.jsx'
import { ContactoPessoa } from './ContactoPessoa.jsx'
import { BaseLegalRGPD } from './BaseLegalRGPD.jsx'
import { ESTADOS_IMOVEIS, eFaseFollowUp, limpaEstado } from '../../constants/pipelineImoveis.js'

// Leads do consultor: só os imóveis que ele enviou por referência, anunciados
// ou off-market. A origem 'Referência' é outra coisa: leads vindas de quem não
// é consultor.
const leadsPorReferencia = imoveis => (imoveis || []).filter(i => i.origem === 'Referência por consultores')

// A ficha está a pôr o imóvel numa fase de follow-up onde ele ainda não estava.
const entraEmFollowUp = (form, data) => eFaseFollowUp(form?.estado) && limpaEstado(form.estado) !== limpaEstado(data?.estado)

const AnaliseTab = lazy(() => import('../analise/AnaliseTab.jsx').then(m => ({ default: m.AnaliseTab })))
const ObraTab = lazy(() => import('../obra/ObraTab.jsx').then(m => ({ default: m.ObraTab })))
const MatchingInvestidoresTab = lazy(() => import('./MatchingInvestidoresTab.jsx').then(m => ({ default: m.MatchingInvestidoresTab })))
const FicheirosTab = lazy(() => import('./FicheirosTab.jsx').then(m => ({ default: m.FicheirosTab })))
const ChecklistTab = lazy(() => import('./ChecklistTab.jsx').then(m => ({ default: m.ChecklistTab })))
const VisitasTab = lazy(() => import('./VisitasTab.jsx').then(m => ({ default: m.VisitasTab })))
const DocumentosInvestidorTab = lazy(() => import('./DocumentosInvestidorTab.jsx').then(m => ({ default: m.DocumentosInvestidorTab })))
const DadosEmpresaInvestidorTab = lazy(() => import('./DadosEmpresaInvestidorTab.jsx').then(m => ({ default: m.DadosEmpresaInvestidorTab })))

function TabFallback() {
  return <BrandLoader variant="inline" />
}

// Ordem de todas as abas possíveis (para saber de que lado entra o conteúdo).
const ORDEM_ABAS = ['detalhe', 'registo_chamadas', 'ficheiros', 'analise', 'obra', 'localizacao', 'pontos_riscos', 'visitas', 'matching', 'relatorios_imovel', 'checklist', 'documentos', 'dados_empresa', 'documentos_consultor', 'relatorios', 'avaliacao']
import { Combobox } from '../ui/Combobox.jsx'
import coimbraFreguesiasData from '../../constants/coimbra-freguesias.json'
import ampFreguesiasData from '../../constants/amp-freguesias.json'
import { CLASS_COLOR, INV_STATUS, INV_STATUS_COLOR, INV_STATUS_PASSIVO, INV_STATUS_ATIVO, invStatusFor, ORIGENS_INVESTIDORES, PARC_TIPOS, PARC_ESTADOS, fmtDate, fmtDateRelative } from '../../constants.js'

// Hook simples — carrega lookups uma vez e mantém em memória. Invalidada
// automaticamente pelo evento global `somnium:refresh` (mesmo padrão do
// useConsultoresLookup abaixo), para não servir zonas/tags desactualizadas
// depois de uma mutation que as tenha alterado noutro sítio da app.
const __lookupsCache = { data: null, promise: null }
function useLookups() {
  const [data, setData] = useState(__lookupsCache.data)
  const [refreshTick, setRefreshTick] = useState(0)
  useEffect(() => {
    const onRefresh = () => {
      __lookupsCache.data = null
      __lookupsCache.promise = null
      setRefreshTick(t => t + 1)
    }
    window.addEventListener('somnium:refresh', onRefresh)
    return () => window.removeEventListener('somnium:refresh', onRefresh)
  }, [])
  useEffect(() => {
    if (__lookupsCache.data) { setData(__lookupsCache.data); return }
    if (!__lookupsCache.promise) {
      __lookupsCache.promise = apiFetchJson('/api/crm/lookups').then(d => { __lookupsCache.data = d; return d }).catch(() => ({}))
    }
    __lookupsCache.promise.then(setData)
  }, [refreshTick])
  return data || {}
}

// Lista de consultores da região do imóvel (id + nome + estatuto). O endpoint
// filtra por X-Regiao quando presente. Cache em memória por região para evitar
// pedidos repetidos enquanto a tab está aberta. Invalidada automaticamente
// quando dispara o evento global `somnium:refresh` (após criar/editar/apagar
// consultor o apiFetch dispara este sinal em todas as mutations bem-sucedidas).
const __consultoresLookupCache = {}
function useConsultoresLookup(regiao) {
  const key = regiao || 'all'
  const [data, setData] = useState(__consultoresLookupCache[key] || null)
  const [refreshTick, setRefreshTick] = useState(0)
  useEffect(() => {
    const onRefresh = () => {
      // Apaga todas as entries (não sabemos qual região foi mutada) e
      // força refetch nos componentes montados.
      for (const k of Object.keys(__consultoresLookupCache)) delete __consultoresLookupCache[k]
      setRefreshTick(t => t + 1)
    }
    window.addEventListener('somnium:refresh', onRefresh)
    return () => window.removeEventListener('somnium:refresh', onRefresh)
  }, [])
  useEffect(() => {
    if (__consultoresLookupCache[key]) { setData(__consultoresLookupCache[key]); return }
    let cancelled = false
    const opts = regiao ? { regiao } : {}
    apiFetch('/api/crm/lookup/consultores', opts)
      .then(r => r.ok ? r.json() : [])
      .then(rows => { if (!cancelled) { __consultoresLookupCache[key] = rows; setData(rows) } })
      .catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [key, regiao, refreshTick])
  return data || []
}

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)


export { MOTIVOS_NAO_INTERESSA_PADRAO } from './detailPanelConstants.js'
import { MOTIVOS_NAO_INTERESSA_PADRAO } from './detailPanelConstants.js'
import { confirmar } from '../ui/ConfirmDialog.jsx'
import { dotClass, pillClass } from '../../lib/statusTone.js'

function PontosRiscosTab({ imovel, endpoint, id, onUpdate, toast }) {
  const CAMPOS = [
    { key: 'tese_investimento', label: 'Tese de investimento', color: 'indigo', icon: Target },
    { key: 'pontos_fortes', label: 'Pontos fortes', color: 'emerald', icon: ThumbsUp },
    { key: 'pontos_fracos', label: 'Pontos fracos', color: 'amber', icon: TrendingDown },
    { key: 'riscos', label: 'Riscos', color: 'rose', icon: AlertTriangle },
    { key: 'mitigacao_riscos', label: 'Mitigação de riscos', color: 'sky', icon: Shield },
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
        <h3 className="text-sm font-bold text-ink">Pontos & Riscos do imóvel</h3>
        <p className="text-xs text-ink-muted mt-0.5">
          Um por linha. Aparece no relatório enviado ao investidor. Auto-guarda ao sair do campo.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {CAMPOS.map(c => {
          const hint = c.key === 'riscos' || c.key === 'mitigacao_riscos'
            ? 'Uma linha por risco. Os Riscos e a Mitigação emparelham-se na mesma ordem para a tabela do PDF.'
            : null
          return (
            <div key={c.key} className="rounded-xl border border-line p-4 bg-surface-raised">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink mb-2">
                <c.icon className="w-3.5 h-3.5 text-brand-gold shrink-0" />{c.label}
              </label>
              <textarea
                value={valores[c.key]}
                onChange={e => setValores(prev => ({ ...prev, [c.key]: e.target.value }))}
                onBlur={() => saveCampo(c.key)}
                rows={8}
                placeholder={`Um ${c.label.toLowerCase()} por linha…`}
                className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
              />
              {hint && <p className="text-[11px] text-ink-muted mt-1.5">{hint}</p>}
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
    if (!(await confirmar('Remover imagem de localização?'))) return
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
    { v: 'driving', l: 'Carro' },
    { v: 'walking', l: 'A pé' },
    { v: 'bicycling', l: 'Bicicleta' },
    { v: 'transit', l: 'Transp. público' },
  ]

  return (
    <div className="space-y-5">
      {/* Imagem do estudo no topo */}
      {imagemUrl ? (
        <div className="rounded-xl border border-line bg-surface-raised overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line bg-gradient-to-r from-yellow-50 to-white flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Estudo de Localização</span>
            <div className="flex gap-1.5">
              <a href={imagemUrl} target="_blank" rel="noreferrer"
                className="text-[11px] px-2.5 py-1 rounded-md bg-surface-raised border border-line text-ink hover:bg-surface">
                Abrir em nova aba
              </a>
              <label className={`text-[11px] px-2.5 py-1 rounded-md bg-surface-raised border border-line text-ink hover:bg-surface cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? 'A carregar…' : 'Substituir'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => uploadManual(e.target.files?.[0])} />
              </label>
              <button type="button" onClick={removerImagem}
                className="text-[11px] px-2.5 py-1 rounded-md bg-surface-raised border border-danger/30 text-danger hover:bg-danger/10">
                Remover
              </button>
            </div>
          </div>
          <div className="p-3 bg-surface flex justify-center">
            <img src={imagemUrl} alt="Estudo de Localização" className="w-full max-w-3xl rounded-md border border-line bg-surface-raised" loading="lazy" decoding="async" />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-line p-6 bg-surface-raised text-center">
          <p className="text-sm text-ink-muted">Sem imagem de localização ainda. Preenche os destinos e clica em <strong>"Gerar imagem do estudo"</strong> em baixo.</p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-ink">Estudo de Localização</h3>
        <p className="text-xs text-ink-muted mt-0.5">
          Distâncias e tempo do imóvel a vários pontos de interesse via Google Distance Matrix.
        </p>
      </div>

      {/* Origem + modo */}
      <div className="rounded-xl border border-line p-4 bg-surface-raised space-y-3">
        <div>
          <label className="text-xs font-semibold text-ink block mb-1">Morada do imóvel (origem)</label>
          <input type="text" value={origem} onChange={e => setOrigem(e.target.value)}
            placeholder={imovel?.regiao === 'AMP' ? 'Ex: Rua de Santa Catarina 200, Porto' : 'Ex: Rua das Flores 12, Coimbra'}
            className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink block mb-1">Modo de transporte</label>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map(m => (
              <button key={m.v} type="button" onClick={() => setMode(m.v)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  mode === m.v ? 'border-accent bg-accent text-accent-foreground' : 'bg-surface-raised border-line text-ink-muted hover:bg-surface'
                }`}>
                {m.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Destinos */}
      <div className="rounded-xl border border-line p-4 bg-surface-raised">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-ink">Pontos de interesse</h4>
          <button type="button" onClick={adicionar}
            className="px-2.5 py-1 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface">
            + Adicionar
          </button>
        </div>
        <div className="space-y-2">
          {destinos.map((d, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input type="text" value={d.icone || ''} onChange={e => setDestino(i, { icone: e.target.value })}
                className="w-12 text-center px-2 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={d.categoria || ''} onChange={e => setDestino(i, { categoria: e.target.value })}
                placeholder="Categoria (ex: Hospital)"
                className="flex-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={d.endereco || ''} onChange={e => setDestino(i, { endereco: e.target.value })}
                placeholder={imovel?.regiao === 'AMP' ? 'Morada do ponto (ex: Hospital São João, Porto)' : 'Morada do ponto (ex: Hospital Geral, Coimbra)'}
                className="flex-[2] px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <button type="button" onClick={() => remover(i)}
                className="px-2 py-2 text-xs rounded-lg bg-danger/10 text-danger hover:bg-danger/15">×</button>
            </div>
          ))}
          {destinos.length === 0 && <p className="text-xs text-ink-muted text-center py-3">Sem pontos de interesse — clica em "Adicionar"</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={calcular} disabled={calculando || gerando}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-line bg-surface-raised text-ink hover:bg-surface disabled:opacity-50">
            {calculando ? 'A calcular…' : 'Calcular distâncias'}
          </button>
          <button type="button" onClick={gerarImagem} disabled={calculando || gerando}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
            {gerando ? 'A gerar imagem…' : 'Gerar imagem do estudo'}
          </button>
        </div>
      </div>

      {/* Opções da imagem (destaque + highlights) */}
      <details className="rounded-xl border border-line bg-surface-raised">
        <summary className="px-4 py-3 text-xs font-semibold text-ink cursor-pointer select-none">
          Opções da imagem (destaque + highlights)
        </summary>
        <div className="p-4 pt-0 space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink block mb-1">★ Destacar ponto (gold)</label>
            <select value={destaque} onChange={e => setDestaque(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
              <option value="">— sem destaque —</option>
              {destinos.filter(d => d.categoria?.trim()).map((d, i) => (
                <option key={i} value={d.categoria}>{d.icone} {d.categoria}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-warning/30 rounded-lg p-3 space-y-2 bg-warning/10">
              <p className="text-[11px] font-bold text-warning uppercase tracking-wide">Highlight 1 (gold)</p>
              <input type="text" value={hl1Titulo} onChange={e => setHl1Titulo(e.target.value)} placeholder="Título (ex: 🚌 SMTUC à porta)"
                className="w-full px-3 py-1.5 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={hl1Desc} onChange={e => setHl1Desc(e.target.value)} placeholder="Descrição"
                className="w-full px-3 py-1.5 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={hl1Badge} onChange={e => setHl1Badge(e.target.value)} placeholder="Badge curto (ex: 5)"
                className="w-full px-3 py-1.5 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <input type="text" value={hl1Sub} onChange={e => setHl1Sub(e.target.value)} placeholder="Sub-texto"
                className="w-full px-3 py-1.5 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
            </div>
            <div className="border border-danger/30 rounded-lg p-3 space-y-2 bg-danger/10">
              <p className="text-[11px] font-bold text-danger uppercase tracking-wide">Highlight 2 (red)</p>
              <input type="text" value={hl2Titulo} onChange={e => setHl2Titulo(e.target.value)} placeholder="Título (ex: 🛡️ GNR em frente)"
                className="w-full px-3 py-1.5 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-red-300" />
              <input type="text" value={hl2Desc} onChange={e => setHl2Desc(e.target.value)} placeholder="Descrição"
                className="w-full px-3 py-1.5 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-red-300" />
              <input type="text" value={hl2Sub} onChange={e => setHl2Sub(e.target.value)} placeholder="Sub-texto"
                className="w-full px-3 py-1.5 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-red-300" />
            </div>
          </div>
        </div>
      </details>

      {/* Resultados */}
      {resultado?.resultados?.length > 0 && (
        <div className="rounded-xl border border-line overflow-hidden bg-surface-raised">
          <div className="px-4 py-2.5 border-b border-line bg-surface flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Resultados — carro e a pé</span>
            <span className="text-[10px] text-ink-muted">
              {resultado.atualizado_em ? new Date(resultado.atualizado_em).toLocaleString('pt-PT') : ''}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] text-ink-muted uppercase tracking-wide">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-2">Ponto</th>
                <th className="text-left px-4 py-2">Endereço</th>
                <th className="text-right px-4 py-2">Carro</th>
                <th className="text-right px-4 py-2">A pé</th>
              </tr>
            </thead>
            <tbody>
              {resultado.resultados.map((r, i) => {
                const carro = r.carro || (r.distancia_texto ? { distancia_texto: r.distancia_texto, duracao_texto: r.duracao_texto, status: r.status } : null)
                const pe = r.pe || null
                const fmt = (m) => {
                  if (!m) return '—'
                  if (m.status && m.status !== 'OK') return m.status
                  return `${m.distancia_texto || '—'} · ${m.duracao_texto || '—'}`
                }
                return (
                  <tr key={i} className="border-b border-line">
                    <td className="px-4 py-2"><span className="mr-1">{r.icone || '📍'}</span>{r.categoria || '—'}</td>
                    <td className="px-4 py-2 text-ink-muted truncate max-w-xs">{r.endereco}</td>
                    <td className="px-4 py-2 text-right num">{fmt(carro)}</td>
                    <td className="px-4 py-2 text-right num text-success">{fmt(pe)}</td>
                  </tr>
                )
              })}
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
      <label className="text-xs text-ink-muted block mb-1">Motivo Não Interessa</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {MOTIVOS_NAO_INTERESSA_PADRAO.map(m => {
          const on = selected.has(m)
          return (
            <button key={m} type="button" onClick={() => toggle(m)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                on
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'bg-surface-raised border-line text-ink-muted hover:bg-surface'
              }`}>
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
        className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
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


// ── Tab Documentos para Imóveis ─────────────────────────────
const DOC_LABELS = {
  ficha_imovel: 'Ficha do Imóvel',
  ficha_visita: 'Ficha de Visita',
  analise_rentabilidade: 'Análise de Rentabilidade',
  estudo_comparaveis: 'Estudo Comparáveis',
  proposta_formal: 'Proposta Formal',
  dossier_investidor: 'Dossier de Investimento',
  proposta_investimento_anonima: 'Proposta de Investimento (Anónima)',
  proposta_cedencia_posicao: 'Proposta de Cedência de Posição',
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
  'Enviar proposta ao investidor': ['dossier_investidor', 'proposta_investimento_anonima', 'proposta_cedencia_posicao'],
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
      { tipo: 'proposta_cedencia_posicao',     label: 'Proposta de Cedência de Posição',    compilavel: 'proposta_cedencia_posicao' },
    ] },
  { key: 'followup',     label: 'Follow Up',           estados: ['Follow Up após proposta', 'Follow UP'],
    docs: [{ tipo: 'ficha_follow_up', label: 'Ficha de Follow Up', compilavel: 'ficha_follow_up' }] },
  { key: 'descarte',     label: 'Descartado',          estados: ['Descartado'],
    docs: [{ tipo: 'ficha_descarte', label: 'Ficha de Descarte', compilavel: 'ficha_descarte' }] },
]

function RelatoriosImovelTab({ imovelId, estado, driveFolderId }) {
  const estadoClean = (estado || '').replace(/^\d+-\s*/, '').trim()
  const faseActual = FASE_TABS.find(f => f.estados.includes(estadoClean))

  const [subTab, setSubTab] = useState(faseActual?.key || 'adicionado')

  // Abre o documento com um token FRESCO no momento do clique. Cachar o token no
  // mount tornava o link inválido (JWT expira ~1h -> 401 "Sessão inválida") ou
  // vazio se a sessão ainda não estava pronta no mount (-> 401 "Autenticação
  // necessária"). Para não quebrar o user-gesture do Safari (que bloqueia o
  // window.open após um await), abrimos primeiro um separador em branco de forma
  // síncrona e só depois navegamos para o URL já com o token.
  // `download: true` -> ?download=1 (Content-Disposition: attachment), para enviar a investidores.
  async function abrirDocumento(tipo, { refresh = false, download = false } = {}) {
    try {
      await openDocument(`/api/crm/imoveis/${imovelId}/documento/${tipo}`, { refresh, download })
    } catch (e) {
      console.error('[documento]', tipo, e.message)
    }
  }

  const activeTab = FASE_TABS.find(f => f.key === subTab)
  const visibleDocs = activeTab?.docs || []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-bold text-ink">Documentos do Imóvel</h3>
        <p className="text-xs text-ink-muted mt-0.5">Abre o documento da fase ou força regeneração</p>
      </div>

      {/* Sub-abas — fases da pipeline */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {FASE_TABS.map(f => {
          const isActive = subTab === f.key
          const isCurrent = faseActual?.key === f.key
          return (
            <button key={f.key} onClick={() => setSubTab(f.key)}
              className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity,transform] ${
                isActive ? 'bg-ink text-surface shadow-sm' : isCurrent ? 'text-success bg-success/10' : 'text-ink-muted hover:bg-surface-muted'
              }`}
>
              {f.label}
              {isCurrent && !isActive && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-success inline-block" />}
            </button>
          )
        })}
      </div>

      {/* Lista de documentos da fase seleccionada */}
      <div className="rounded-xl border border-line overflow-hidden divide-y divide-line">
        {visibleDocs.map(d => (
          <div key={d.tipo} className="flex items-center gap-3 px-4 py-3 bg-surface-raised hover:bg-surface/50 transition-colors group">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">{d.label}</p>
            </div>
            <button
              type="button"
              onClick={() => abrirDocumento(d.tipo, { refresh: true })}
              title="Forçar regeneração (ignora versão em cache)"
              className="px-2 py-1.5 text-[11px] font-medium rounded-lg bg-surface-muted text-ink-muted hover:bg-line transition-colors shrink-0 opacity-50 group-hover:opacity-100">
              Regerar
            </button>
            <button
              type="button"
              onClick={() => abrirDocumento(d.tipo)}
              title="Abrir o PDF numa nova aba"
              className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-surface-muted text-ink-muted hover:bg-line transition-colors shrink-0 opacity-50 group-hover:opacity-100">
              Abrir
            </button>
            <button
              type="button"
              onClick={() => abrirDocumento(d.tipo, { download: true })}
              title="Descarregar o PDF para enviar a investidores"
              className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-surface-muted text-ink border border-line hover:bg-line transition-colors shrink-0">
              PDF
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailPanel({ type, id, onClose, onSave, onNavigate, defaultEdit = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('detalhe')
  const direcaoAba = useTabDirection(activeTab, ORDEM_ABAS)
  const [reunioes, setReunioes] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [transicao, setTransicao] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  // Sugestões para autocomplete (imobiliárias + zonas) — alimentado pelos
  // valores já usados por outros consultores na região activa.
  const [sugestoesTags, setSugestoesTags] = useState({ imobiliarias: [], zonas: [] })
  const toast = useToast()
  useEffect(() => {
    if (type !== 'Consultores' || !editing) return
    apiFetch('/api/crm/consultores/sugestoes-tags')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSugestoesTags({ imobiliarias: d.imobiliarias || [], zonas: d.zonas || [] }) })
      .catch(() => {})
  }, [type, editing])

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

  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Parceiros': 'parceiros' }[type]
  const prevTab = useRef(activeTab)

  // Apagar a entidade directamente a partir da ficha aberta (sem voltar à lista).
  async function handleDelete() {
    if (deleting) return
    if (!(await confirmar(`Apagar "${data?.nome || 'este registo'}"? Esta ação não pode ser desfeita.`))) return
    setDeleting(true)
    try {
      const r = await apiFetch(`/api/crm/${endpoint}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Falha ao apagar')
      toast('Registo apagado', 'success')
      window.dispatchEvent(new CustomEvent('somnium:refresh'))
      onClose?.()  // onClose já recarrega a lista
    } catch (e) {
      toast(e.message || 'Erro ao apagar', 'error')
      setDeleting(false)
    }
  }

  function startEdit() {
    setForm({ ...data })
    setEditing(true)
  }

  function loadData() {
    return apiFetchJson(`/api/crm/${endpoint}/${id}/full`).then(setData).catch(() => {})
  }

  // O follow-up pode ter mudado a fase do imóvel: recarrega, alinha o formulário
  // em edição (senão o próximo "Guardar" repunha a fase antiga) e avisa a lista.
  async function aposFollowUp() {
    const d = await apiFetchJson(`/api/crm/${endpoint}/${id}/full`).catch(() => null)
    if (!d) return
    setData(d)
    setForm(f => (f && Object.keys(f).length
      ? { ...f, estado: d.estado, motivo_follow_up: d.motivo_follow_up, data_follow_up: d.data_follow_up } : f))
    if (onSave) onSave()
  }

  // Recarregar dados quando sai da tab analise (alterações da calculadora) ou
  // dos documentos (a leitura de documentos preenche campos da ficha).
  useEffect(() => {
    if (['analise', 'ficheiros'].includes(prevTab.current) && activeTab !== prevTab.current) {
      loadData()
    }
    prevTab.current = activeTab
  }, [activeTab])

  // camposExtra: só quando chamado pela janela de registo de mudança de fase.
  async function saveEdit(camposExtra) {
    const extra = camposExtra && camposExtra.__transicao ? camposExtra.campos : {}
    // Validação: Follow Up e Não Interessa exigem motivo antes de guardar
    if (type === 'Imóveis') {
      const est = (form.estado || '').replace(/^\d+-\s*/, '').trim()
      if (/follow ?up/i.test(est) && !(form.motivo_follow_up || '').trim()) {
        toast('Indica o "Motivo Follow Up" antes de guardar', 'error')
        return false
      }
      if (form.origem === 'Referência por consultores' && !(form.nome_consultor || '').trim()) {
        toast('Origem «Referência por consultores»: indica o consultor que enviou o imóvel', 'error')
        return false
      }
      if (entraEmFollowUp(form, data) && !form._follow_up_data) {
        toast('Indica a data do follow-up antes de guardar', 'error')
        return false
      }
      if (/n[ãa]o interessa/i.test(est) && !(form.motivo_nao_interessa || '').trim()) {
        toast('Indica o "Motivo Não Interessa" antes de guardar', 'error')
        return false
      }
    }
    setSaving(true)
    try {
      // Limpar campos do form que são relações (não enviar ao PUT).
      // montante_investido (investidores) é calculado a partir de
      // projeto_investidores — nunca enviar o valor do form, para não
      // sobrescrever com um valor potencialmente desactualizado.
      const { negocios, consultores, imoveis, tarefas, timeline, analises, documentos, checklist, interacoes, montante_investido, ...rest } = form
      // Remover campos virtuais (prefixo _) que vêm da lista enriquecida e não existem na BD
      const cleanForm = { ...Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith('_'))), ...extra }
      // Entrada numa fase de follow-up: a fase, o motivo e a tarefa vão pela
      // porta única do follow-up (abaixo), não por este PUT.
      const followUp = type === 'Imóveis' && entraEmFollowUp(form, data)
        ? { data: form._follow_up_data, motivo: form.motivo_follow_up, destino: limpaEstado(form.estado) } : null
      if (followUp) { delete cleanForm.estado; delete cleanForm.motivo_follow_up; delete cleanForm.data_follow_up }
      const r = await apiFetch(`/api/crm/${endpoint}/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleanForm),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        if (err.requisitos?.length) {
          // A fase de destino precisa de dados em falta: abre a janela de registo.
          setTransicao({ destino: err.destino || cleanForm.estado, requisitos: err.requisitos })
          setSaving(false)
          return false
        }
        throw new Error(err.error || 'Erro ao guardar')
      }
      if (followUp) {
        const rf = await apiFetch(`/api/crm/imoveis/${id}/follow-up`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(followUp),
        })
        if (!rf.ok) throw new Error((await rf.json().catch(() => ({}))).error || 'Erro ao passar para follow-up')
      }
      setTransicao(null)
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

  // Trocar de aba com edição por guardar em curso sobrescrevia silenciosamente
  // alterações feitas noutras abas (ex: Checklist) ao voltar e guardar com o
  // form antigo. Avisar e obrigar a guardar (ou ficar) antes de mudar de aba.
  async function handleTabChange(key) {
    if (key === activeTab) return
    if (editing && JSON.stringify(form) !== JSON.stringify(data)) {
      const guardar = await confirmar('Tens alterações por guardar nesta aba.\n\nGuarda antes de mudar de aba, ou fica para continuar a editar.', { confirmLabel: 'Guardar e mudar', cancelLabel: 'Ficar nesta aba' })
      if (!guardar) return
      const ok = await saveEdit()
      if (!ok) return
    }
    setActiveTab(key)
  }

  useEffect(() => {
    if (!id || !endpoint) return
    setLoading(true)
    setActiveTab('detalhe')
    setEditing(false)
    loadData()
      .then(() => {
        // defaultEdit: arrancar logo em edit mode (ex: vindo do form de criação).
        // Lê data depois do setData ter corrido — usar a ref ao state actual
        // não funciona aqui; chamamos startEdit que copia data→form e activa edit.
        if (defaultEdit) {
          // micro-deferred para garantir que setData foi commit antes do startEdit
          queueMicrotask(() => {
            setData(d => { if (d) { setForm({ ...d }); setEditing(true) } return d })
          })
        }
      })
      .finally(() => setLoading(false))

    // Carregar reuniões para investidores e consultores
    if (type === 'Investidores' || type === 'Consultores') {
      apiFetchJson(`/api/crm/reunioes?entidade_tipo=${endpoint}&entidade_id=${id}`)
        .then(setReunioes)
        .catch(() => {})
    }
  }, [id, endpoint])

  if (loading) return (
    <div className="rounded-xl overflow-hidden">
      <BrandLoader variant="inline" label={type === 'Imóveis' ? 'Ficha do imóvel' : type === 'Investidores' ? 'Ficha do investidor' : type === 'Consultores' ? 'Ficha do consultor' : type === 'Parceiros' ? 'Ficha do parceiro' : 'A carregar'} />
    </div>
  )
  if (!data) return null

  // Tabs dinâmicos por tipo
  const tabs = [
    { key: 'detalhe', label: type === 'Imóveis' ? 'Imóvel' : type === 'Investidores' ? 'Ficha do investidor' : type === 'Consultores' ? 'Ficha do consultor' : type === 'Parceiros' ? 'Ficha do parceiro' : 'Detalhe', icon: type === 'Imóveis' ? Building2 : UserRound, show: true },
    { key: 'registo_chamadas', label: 'Registo de Chamada', icon: PhoneCall, show: type === 'Consultores' },
    { key: 'ficheiros', label: 'Documentos', icon: FolderOpen, show: type === 'Imóveis' },
    { key: 'analise', label: 'Análise Financeira', icon: Calculator, show: type === 'Imóveis' },
    { key: 'obra', label: 'Obra', icon: Hammer, show: type === 'Imóveis' },
    { key: 'localizacao', label: 'Localização', icon: MapPin, show: type === 'Imóveis' },
    { key: 'pontos_riscos', label: 'Pontos & Riscos', icon: Scale, show: type === 'Imóveis' },
    { key: 'visitas', label: 'Visitas', icon: DoorOpen, show: type === 'Imóveis' },
    { key: 'matching', label: 'Matching investidores', icon: Link2, show: type === 'Imóveis' },
    { key: 'relatorios_imovel', label: 'Relatórios', icon: FileBarChart, show: type === 'Imóveis' },
    { key: 'checklist', label: 'Checklist', icon: ListChecks, show: type === 'Imóveis' },
    { key: 'documentos', label: `Documentos (${data?.documentos?.length ?? 0})`, icon: FolderOpen, show: type === 'Investidores' },
    { key: 'dados_empresa', label: 'Dados Empresa', icon: Building, show: type === 'Investidores' },
    { key: 'documentos_consultor', label: 'Documentos', icon: FolderOpen, show: type === 'Consultores' },
    { key: 'relatorios', label: `Reuniões (${reunioes.length})`, icon: CalendarCheck, show: (type === 'Investidores' || type === 'Consultores') },
    { key: 'avaliacao', label: 'Avaliação', icon: Star, show: type === 'Investidores' },
  ].filter(t => t.show)

  return (
    <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-line flex flex-wrap items-center gap-y-2 gap-x-3">
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={attemptClose} disabled={saving} className="shrink-0"
          title={editing ? 'Guardar e voltar' : 'Voltar à lista (Esc)'}>
          {editing ? 'Guardar e voltar' : 'Voltar'}
        </Button>
        <div className="min-w-0 flex-1 order-first w-full sm:order-none sm:w-auto">
          <p className="text-overline uppercase text-ink-muted">{type}</p>
          <h2 className="font-display text-xl font-medium text-ink truncate">{data.nome ?? data.movimento}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button variant="secondary" size="sm" icon={linkCopied ? Check : Link2} onClick={copyLink} title="Copiar link partilhável">
            {linkCopied ? 'Copiado' : 'Link'}
          </Button>
          {type === 'Imóveis' && (
            <PartilharAcesso entidade="imovel" entidadeId={data.id} nome={data.nome} />
          )}
          {editing ? (
            <>
              <Button size="sm" icon={Save} onClick={saveEdit} loading={saving}>
                {saving ? 'A guardar…' : 'Guardar'}
              </Button>
              <Button variant="ghost" size="sm" icon={X} onClick={cancelEdit}>Cancelar</Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" icon={Pencil} onClick={startEdit}>Editar</Button>
          )}
          {(type === 'Investidores' || type === 'Parceiros') && !editing && (
            <Button variant="secondary" size="sm" icon={Trash2} onClick={handleDelete} disabled={deleting} className="!text-danger"
              title={type === 'Parceiros' ? 'Apagar este parceiro' : 'Apagar este investidor'}>
              {deleting ? 'A apagar…' : 'Apagar'}
            </Button>
          )}
          {type === 'Imóveis' && !editing && (
            <Button variant="secondary" size="sm" icon={FileDown}
              onClick={() => openDocument(`/api/crm/imoveis/${id}/relatorio`).catch(e => console.error('[relatorio imovel]', e.message))}>
              PDF
            </Button>
          )}
          <button onClick={attemptClose} disabled={saving} aria-label={editing ? 'Guardar e fechar' : 'Fechar'}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
            title={editing ? 'Guardar e fechar' : 'Fechar'}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {type === 'Imóveis' && <ProximosPassos imovelId={id} imovel={data} onAbrirTab={setActiveTab} onUpdate={aposFollowUp} onNavigate={onNavigate} />}
      {type === 'Consultores' && <ContactoPessoa tipo="consultor" pessoaId={id} imoveis={data?.imoveis} regiao={data?.regiao} onNavigate={onNavigate} onUpdate={loadData} />}
      {type === 'Investidores' && <ContactoPessoa tipo="investidor" pessoaId={id} notaAntiga={data?.proxima_acao} onNavigate={onNavigate} onUpdate={loadData} />}
      {type === 'Parceiros' && <ContactoPessoa tipo="parceiro" pessoaId={id} onNavigate={onNavigate} onUpdate={loadData} />}
      {type === 'Imóveis' && <DealBreakersPanel imovelId={id} imovel={data} onAbrirTab={setActiveTab} onUpdate={loadData} />}
      <AnimatePresence>
        {type === 'Imóveis' && transicao && (
          <TransicaoFaseModal
            key={transicao.requisitos.map(r => r.id).join()}
            imovel={{ ...data, ...form }}
            destino={transicao.destino}
            requisitos={transicao.requisitos}
            onCancel={() => setTransicao(null)}
            onConfirm={campos => saveEdit({ __transicao: true, campos })}
            onResolvido={msg => { setTransicao(null); setEditing(false); toast(msg, 'success'); loadData(); onSave?.() }}
            onAbrirImovel={() => { setTransicao(null); setActiveTab('analise') }}
          />
        )}
      </AnimatePresence>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex border-b border-line overflow-x-auto bg-surface" role="tablist">
          {tabs.map(t => (
            <button key={t.key} onClick={() => handleTabChange(t.key)} role="tab" aria-selected={activeTab === t.key}
              className={`relative px-4 sm:px-5 py-3 text-ui font-medium transition-colors duration-fast ease-entry whitespace-nowrap ${activeTab === t.key ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}>
              {activeTab === t.key && (
                <motion.span layoutId="ficha-tab" className="absolute inset-0 bg-surface-raised" transition={tabIndicatorTransition}>
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                </motion.span>
              )}
              <span className="relative"><t.icon className="w-4 h-4 mr-1.5 inline-block align-[-3px]" />{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Análise Financeira tab */}
      {/* Interacções (Consultores) */}
      <TabTransition tabKey={activeTab} direction={direcaoAba}>
      <Suspense fallback={<TabFallback />}>
      {type === 'Consultores' && activeTab === 'registo_chamadas' ? (
        <div className="p-4 sm:p-6">
          <RegistoChamadasTab consultorId={data.id} onUpdate={loadData} />
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
          {data.negocios?.some(n => !n.deleted_at) ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-warning/30 bg-warning/10 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-warning dark:text-amber-300 flex items-center justify-between gap-3 flex-wrap">
                <span>Negócio fechado — já existe Projeto para este imóvel. A Análise Financeira edita-se agora no <strong>Departamento de Obras</strong>; aqui fica só como consulta.</span>
                {(() => {
                  const negocioActivo = data.negocios.find(n => !n.deleted_at)
                  return negocioActivo ? (
                    <a href={`/projectos/${negocioActivo.id}`} className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400 text-warning dark:text-amber-300 hover:bg-warning/15 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap">
                      Abrir no Departamento de Obras →
                    </a>
                  ) : null
                })()}
              </div>
              <AnaliseTab imovelId={data.id} imovelNome={data.nome} imovel={data} readOnly />
            </div>
          ) : (
            <AnaliseTab imovelId={data.id} imovelNome={data.nome} imovel={data} />
          )}
        </div>

      /* Ficheiros do imóvel (fotos + documentos + Drive) */
      ) : type === 'Imóveis' && activeTab === 'ficheiros' ? (
        <div className="p-4 sm:p-6">
          <FicheirosTab imovelId={data.id} driveFolderId={data.drive_folder_id} tipoImovel={data.predio_tipo || data.tipologia} />
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

      /* Dados legais de empresa (investidor pessoa colectiva) */
      ) : type === 'Investidores' && activeTab === 'dados_empresa' ? (
        <div className="p-4 sm:p-6">
          <DadosEmpresaInvestidorTab investidorId={data.id} dadosEmpresa={data.dados_empresa} onUpdate={loadData} />
        </div>

      /* Relatórios reuniões (investidores/consultores) */
      ) : type === 'Consultores' && activeTab === 'documentos_consultor' ? (
        <div className="p-4 sm:p-6">
          <DocumentosConsultor consultorId={data.id} />
        </div>

      ) : activeTab === 'relatorios' ? (
        <div className="p-4 sm:p-6">
          <RelatoriosTab reunioes={reunioes} investidorNome={data.nome}
            entidadeTipo={endpoint} entidadeId={id} onChange={setReunioes} />
        </div>

      /* Avaliação (Investidores) — fundir Scorecard + Histórico de Classificação */
      ) : type === 'Investidores' && activeTab === 'avaliacao' ? (
        <AvaliacaoTab data={data} onUpdate={loadData} />

      ) : (
      /* Detalhe tab */
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

        <div>
        {/* Main info */}
        <div className="space-y-6">
          {/* Key fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {type === 'Imóveis' && <>
              {editing ? <>
                {(/n[ãa]o interessa/i.test(form.estado || '')) && (
                  <div className="col-span-2 md:col-span-3 -mt-1 mb-1 rounded-xl border border-danger/30 bg-danger/10 p-3">
                    <MotivoNaoInteressaChips
                      value={form.motivo_nao_interessa || ''}
                      onChange={v => setField('motivo_nao_interessa', v)}
                    />
                    <p className="text-[11px] text-danger mt-1">⚠ Seleciona pelo menos um motivo (ou escreve nas notas) antes de guardar.</p>
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
                <ImovelReadSections data={data} onNavigate={onNavigate} />

                {/* ── Dados da Calculadora de Rentabilidade ── */}
                {analise && (
                  <div className="col-span-2 md:col-span-3 mt-2">
                    <div className="rounded-xl border border-line bg-surface p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-ink-muted" />
                        <h4 className="text-sm font-bold text-ink">Análise de Rentabilidade</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">Ativa</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {analise.vvr > 0 && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">VVR</p>
                          <p className="text-sm font-bold text-ink">{EUR(analise.vvr)}</p>
                        </div>}
                        {analise.custo_obra > 0 && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">Custo Obra</p>
                          <p className="text-sm font-bold text-ink">{EUR(analise.custo_obra)}</p>
                        </div>}
                        {analise.capital_necessario > 0 && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">Capital Necessário</p>
                          <p className="text-sm font-bold text-ink">{EUR(analise.capital_necessario)}</p>
                        </div>}
                        {analise.lucro_liquido != null && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">Lucro Líquido</p>
                          <p className={`text-sm font-bold ${analise.lucro_liquido >= 0 ? 'text-success' : 'text-danger'}`}>{EUR(analise.lucro_liquido)}</p>
                        </div>}
                        {analise.retorno_total != null && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">ROI Total</p>
                          <p className={`text-sm font-bold ${analise.retorno_total >= 0 ? 'text-success' : 'text-danger'}`}>{analise.retorno_total}%</p>
                        </div>}
                        {analise.retorno_anualizado != null && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">ROI Anualizado</p>
                          <p className={`text-sm font-bold ${analise.retorno_anualizado >= 0 ? 'text-success' : 'text-danger'}`}>{analise.retorno_anualizado}%</p>
                        </div>}
                        {analise.payback_meses > 0 && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">Payback</p>
                          <p className="text-sm font-bold text-ink">{analise.payback_meses} meses</p>
                        </div>}
                        {analise.risco && <div>
                          <p className="text-[10px] uppercase text-ink-muted tracking-wide">Risco</p>
                          <p className={`text-sm font-bold ${analise.risco === 'Baixo' ? 'text-success' : analise.risco === 'Médio' ? 'text-warning' : 'text-danger'}`}>{analise.risco}</p>
                        </div>}
                      </div>
                    </div>
                  </div>
                )}
                {!analise && (
                  <div className="col-span-2 md:col-span-3 mt-2">
                    <div className="rounded-xl border border-dashed border-line p-4 text-center">
                      <p className="text-xs text-ink-muted">Sem análise de rentabilidade — usa a tab "Análise Financeira" para calcular</p>
                    </div>
                  </div>
                )}
              </>
              })()}
            </>}
            {type === 'Investidores' && <>
              {!editing && <InvestidorHero data={data} />}
              {editing
                ? <InvestidorEditSections data={data} form={form} setField={setField} />
                : <InvestidorReadSections data={data} />}
            </>}
            {type === 'Parceiros' && <>
              {editing ? <>
                <EF label="Nome" field="nome" form={form} set={setField} />
                <EF label="Tipo" field="tipo" form={form} set={setField} type="select" options={PARC_TIPOS} />
                <EF label="Estado" field="estado" form={form} set={setField} type="select" options={PARC_ESTADOS} />
                <EF label="Classificação" field="classificacao" form={form} set={setField} type="select" options={['A','B','C','D']} />
                <EF label="Empresa" field="empresa" form={form} set={setField} />
                <EF label="NIF" field="nif" form={form} set={setField} />
                <EF label="Contacto" field="contacto" form={form} set={setField} />
                <EF label="Email" field="email" form={form} set={setField} />
                <EF label="Morada" field="morada" form={form} set={setField} />
                <EF label="Zona de atuação" field="zona_atuacao" form={form} set={setField} />
                <EF label="Honorários" field="honorarios" form={form} set={setField} />
                <EF label="1º Contacto" field="data_primeiro_contacto" form={form} set={setField} type="date" />
              </> : <>
                <Field label="Tipo" value={data.tipo} />
                <Field label="Estado" value={data.estado} />
                <Field label="Classificação" value={data.classificacao} />
                <Field label="Empresa" value={data.empresa} />
                <Field label="Contacto" value={data.contacto} />
                <Field label="Email" value={data.email} />
                <Field label="Zona de atuação" value={data.zona_atuacao} />
                <Field label="Honorários" value={data.honorarios} />
                <Field label="1º Contacto" value={data.data_primeiro_contacto} />
              </>}
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
                <EF label="Link da equipa" field="link_perfil" form={form} set={setField} />
                <EF label="Comissão %" field="comissao" form={form} set={setField} type="number" />
                <div className="col-span-1 sm:col-span-2 md:col-span-3">
                  <ChipsEditor label="Imobiliárias" jsonField={form.imobiliaria} onChange={v => setField('imobiliaria', JSON.stringify(v))} placeholder="Ex: Remax, Century 21…" suggestions={sugestoesTags.imobiliarias} />
                </div>
                <div className="col-span-1 sm:col-span-2 md:col-span-3">
                  <ChipsEditor label="Zonas de Atuação" jsonField={form.zonas} onChange={v => setField('zonas', JSON.stringify(v))} placeholder={form.regiao === 'AMP' ? 'Ex: Porto, Vila Nova de Gaia, Bonfim…' : 'Ex: Coimbra, Lousã, Penacova…'} suggestions={sugestoesTags.zonas} /></div>
                <EF label="Meta Mensal Leads" field="meta_mensal_leads" form={form} set={setField} type="number" />
                <EF label="Data Início Parceria" field="data_inicio" form={form} set={setField} type="date" />
                <EF label="1º Contacto" field="data_primeira_call" form={form} set={setField} type="date" />
                <EF label="Motivo Descontinuação" field="motivo_descontinuacao" form={form} set={setField} />
              </> : <>
                <Field label="Estatuto" value={data.estatuto} />
                <Field label="Classificação" value={data.classificacao} />
                <Field label="Contacto" value={data.contacto} />
                <Field label="Email" value={data.email} />
                <Field label="Link da equipa" value={data.link_perfil
                  ? <a href={/^https?:\/\//i.test(data.link_perfil) ? data.link_perfil : `https://${data.link_perfil}`} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">{data.link_perfil}</a>
                  : null} />
                <Field label="Imobiliária" value={(() => { try { return JSON.parse(data.imobiliaria || '[]').join(', ') } catch { return '—' } })()} />
                {/* Contado a partir dos imóveis que o consultor enviou por referência (não se escreve à mão). */}
                <Field label="Leads por referência" value={(() => {
                  const refs = leadsPorReferencia(data.imoveis)
                  const off = refs.filter(i => /off/i.test(i.tipo_oportunidade || '')).length
                  return off ? `${refs.length} (${off} off-market)` : refs.length
                })()} />
                <Field label="Comissão" value={data.comissao > 0 ? `${data.comissao}%` : '—'} />
                <Field label="1º Contacto" value={data.data_primeira_call} />
              </>}
            </>}
          </div>

          {/* Consultores e parceiros: as notas vivem na linha do tempo dos Próximos passos. */}
          {!editing && data.notas && !['Consultores', 'Parceiros'].includes(type) && (
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Notas</p>
              <p className="text-sm text-ink bg-surface rounded-lg p-3 whitespace-pre-line">{data.notas}</p>
            </div>
          )}

          {type === 'Consultores' && data.id && (
            <GravacoesConsultor consultorId={data.id} />
          )}

          {/* Relações — Negócios Associados (resumo) */}
          {data.negocios?.length > 0 && (
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">Negócios Associados</p>
              <div className="space-y-2">
                {data.negocios.map(n => {
                  let pags = []
                  try { pags = typeof n.pagamentos_faseados === 'string' ? JSON.parse(n.pagamentos_faseados || '[]') : (n.pagamentos_faseados || []) } catch {}
                  const totalPags = pags.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                  const recebido = pags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
                  return (
                    <div key={n.id} className="bg-surface-muted rounded-lg px-3 py-2 border border-line">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink">{n.movimento}</span>
                        <div className="flex gap-3 text-xs items-center">
                          <span className="text-ink">{n.categoria}</span>
                          <span className="num font-semibold">{EUR(n.lucro_estimado)}</span>
                        </div>
                      </div>
                      {pags.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {pags.map((p, i) => {
                            const atrasado = !p.recebido && p.data && new Date(p.data) < new Date()
                            return (
                              <div key={i} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                                p.recebido ? 'bg-success/10 text-success' : atrasado ? 'bg-danger/10 text-danger' : 'bg-surface-raised text-ink-muted'
                              }`}>
                                <span>{p.recebido ? '✓' : atrasado ? '!' : '○'} {p.descricao || 'Pagamento'}</span>
                                <span className="num">{EUR(p.valor)} — {p.data || 'sem data'}</span>
                              </div>
                            )
                          })}
                          <p className="text-[10px] text-ink-muted mt-0.5">{EUR(recebido)} de {EUR(totalPags)} recebido — editar no Financeiro</p>
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
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">Consultores</p>
              <div className="space-y-2">
                {data.consultores.map(c => (
                  <div key={c.id}
                    onClick={() => onNavigate?.('Consultores', c.id)}
                    className={`flex items-center justify-between bg-surface-muted rounded-lg px-3 py-2 ${onNavigate ? 'cursor-pointer hover:bg-surface-muted transition-colors' : ''}`}>
                    <span className="text-sm font-medium text-ink">{c.nome}</span>
                    <span className="text-xs text-ink">{c.estatuto} · {c.contacto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.imoveis?.length > 0 && (
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">Imóveis</p>
              <div className="space-y-2">
                {data.imoveis.map(i => (
                  <div key={i.id}
                    onClick={() => onNavigate?.('Imóveis', i.id)}
                    className={`flex items-center justify-between bg-success/10 rounded-lg px-3 py-2 ${onNavigate ? 'cursor-pointer hover:bg-success/15 transition-colors' : ''}`}>
                    <span className="text-sm font-medium text-success">{i.nome}</span>
                    <div className="flex gap-3 text-xs">
                      <span className="text-success">{i.estado?.replace(/^\d+-/, '')}</span>
                      <span className="num">{EUR(i.ask_price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Proteção de dados (RGPD): fecha a ficha, compacta */}
          {type === 'Investidores' && <BaseLegalRGPD entidade="investidor" id={data.id} />}
          {type === 'Consultores' && <BaseLegalRGPD entidade="consultor" id={data.id} />}
          {type === 'Imóveis' && data.proprietario_nome && <BaseLegalRGPD entidade="proprietario" id={data.id} titulo="Proteção de dados do proprietário" />}
        </div>
      </div>
      </div>
      )}
      </Suspense>
      </TabTransition>
    </div>
  )
}

// ── Relatórios Tab ────────────────────────────────────────────
const NOVA_REUNIAO_VAZIA = { titulo: '', data: '', duracao_min: '', resumo: '', file: null }

function RelatoriosTab({ reunioes, investidorNome, entidadeTipo, entidadeId, onChange }) {
  const toast = useToast()
  const [expanded, setExpanded] = useState(null)
  const [transcricao, setTranscricao] = useState({})
  const [analises, setAnalises] = useState({})
  const [analyzing, setAnalyzing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nova, setNova] = useState(NOVA_REUNIAO_VAZIA)

  async function adicionarReuniao(e) {
    e.preventDefault()
    if (!nova.titulo.trim() || !nova.data || !nova.file) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('relatorio', nova.file)
      fd.append('titulo', nova.titulo.trim())
      fd.append('data', new Date(nova.data).toISOString())
      if (nova.duracao_min) fd.append('duracao_min', nova.duracao_min)
      if (nova.resumo.trim()) fd.append('resumo', nova.resumo.trim())
      fd.append('entidade_tipo', entidadeTipo)
      fd.append('entidade_id', entidadeId)
      const r = await apiFetch('/api/crm/reunioes', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Erro ao guardar a reunião')
      onChange([d, ...reunioes].sort((a, b) => String(b.data).localeCompare(String(a.data))))
      setNova(NOVA_REUNIAO_VAZIA)
      setAdding(false)
      toast('Reunião adicionada', 'success')
    } catch (err) { toast('Erro: ' + err.message, 'error') }
    setSaving(false)
  }

  async function apagarReuniao(r) {
    if (!(await confirmar(`Apagar a reunião "${r.titulo}" e o relatório anexado? Esta ação não pode ser desfeita.`))) return
    try {
      const res = await apiFetch(`/api/crm/reunioes/${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao apagar')
      onChange(reunioes.filter(x => x.id !== r.id))
      toast('Reunião apagada', 'success')
    } catch (err) { toast('Erro: ' + err.message, 'error') }
  }

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
    // Reuniões manuais já trazem o relatório anexado: não correr a análise IA.
    const manual = reunioes.find(x => x.id === id)?.relatorio_path
    if (!manual && !analises[id]) runAnalise(id)
    apiFetch(`/api/crm/reunioes/${id}/marcar-vista`, { method: 'POST' }).catch(() => {})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-ink">Histórico de Reuniões</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted">{reunioes.length} reunião(ões)</span>
          {!adding && (
            <button onClick={() => setAdding(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-surface hover:opacity-90">
              Adicionar reunião
            </button>
          )}
        </div>
      </div>

      {adding && (
        <form onSubmit={adicionarReuniao} className="bg-surface-raised rounded-xl border border-line p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="sm:col-span-2 text-xs text-ink-muted">Título
              <input type="text" required value={nova.titulo} onChange={e => setNova(n => ({ ...n, titulo: e.target.value }))}
                placeholder={`Reunião com ${investidorNome || 'contacto'}`}
                className="mt-1 w-full px-3 py-2 text-sm border border-line rounded-lg text-ink" />
            </label>
            <label className="text-xs text-ink-muted">Data e hora
              <input type="datetime-local" required value={nova.data} onChange={e => setNova(n => ({ ...n, data: e.target.value }))}
                className="mt-1 w-full px-3 py-2 text-sm border border-line rounded-lg text-ink" />
            </label>
            <label className="text-xs text-ink-muted">Duração (min)
              <input type="number" min="0" value={nova.duracao_min} onChange={e => setNova(n => ({ ...n, duracao_min: e.target.value }))}
                className="mt-1 w-full px-3 py-2 text-sm border border-line rounded-lg text-ink" />
            </label>
          </div>
          <label className="block text-xs text-ink-muted">Resumo (opcional)
            <textarea rows={3} value={nova.resumo} onChange={e => setNova(n => ({ ...n, resumo: e.target.value }))}
              className="mt-1 w-full px-3 py-2 text-sm border border-line rounded-lg text-ink" />
          </label>
          <label className="block text-xs text-ink-muted">Relatório (PDF)
            <input type="file" required accept="application/pdf,.pdf" onChange={e => setNova(n => ({ ...n, file: e.target.files?.[0] || null }))}
              className="mt-1 block w-full text-sm text-ink-muted" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setNova(NOVA_REUNIAO_VAZIA) }} disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-line text-ink-muted hover:border-line">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !nova.file}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-surface hover:opacity-90 disabled:opacity-50">
              {saving ? 'A guardar...' : 'Guardar reunião'}
            </button>
          </div>
        </form>
      )}

      {reunioes.map(r => {
        const isOpen = expanded === r.id
        const ana = analises[r.id]
        const dataStr = r.data ? new Date(r.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

        return (
          <div key={r.id} className="bg-surface rounded-xl border border-line overflow-hidden">
            {/* Header da reunião */}
            <button onClick={() => toggleExpand(r.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-muted transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-muted">
                  <Phone className="w-4 h-4 text-ink-muted" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{r.titulo}</p>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <span>{dataStr}</span>
                    {r.duracao_min > 0 && <><span>·</span><span>{r.duracao_min} min</span></>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={(e) => {
                  e.stopPropagation()
                  openDocument(`/api/crm/reunioes/${r.id}/relatorio`).catch(err => console.error('[reuniao pdf]', err.message))
                }}
                  title="Abrir o PDF numa nova aba"
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-surface-raised border border-line text-ink-muted hover:border-line">
                  <Eye className="w-3 h-3" /> Ver
                </button>
                <button onClick={(e) => {
                  e.stopPropagation()
                  openDocument(`/api/crm/reunioes/${r.id}/relatorio`, { download: true }).catch(err => console.error('[reuniao pdf download]', err.message))
                }}
                  title="Descarregar o PDF"
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-surface-raised border border-line text-ink-muted hover:border-line">
                  <FileDown className="w-3 h-3" /> PDF
                </button>
                {r.relatorio_path && (
                  <button onClick={(e) => { e.stopPropagation(); apagarReuniao(r) }}
                    title="Apagar reunião e relatório"
                    className="flex items-center px-2 py-1 rounded-lg bg-surface-raised border border-line text-ink-muted hover:text-danger hover:border-danger/30">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                {isOpen ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
              </div>
            </button>

            {/* Conteúdo expandido */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-line">
                {/* Resumo */}
                {r.resumo && (
                  <div className="mt-3">
                    <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Resumo</p>
                    <p className="text-sm text-ink bg-surface-raised rounded-lg p-3 border border-line">{r.resumo}</p>
                  </div>
                )}

                {/* Keywords */}
                {r.keywords && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.keywords.split(',').filter(Boolean).map((k, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-surface-muted text-ink">{k.trim()}</span>
                    ))}
                  </div>
                )}

                {/* Análise AI */}
                {analyzing === r.id && (
                  <div className="text-center py-4">
                    <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full mx-auto" />
                    <p className="text-xs text-ink-muted mt-2">A analisar reunião...</p>
                  </div>
                )}

                {ana && !ana.error && (
                  <>
                    {/* Dados extraídos */}
                    {ana.investidor_dados && (
                      <div>
                        <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">Dados Extraídos do Investidor</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {ana.investidor_dados.capital_max && <MiniField label="Capital Max" value={`€ ${ana.investidor_dados.capital_max.toLocaleString('pt-PT')}`} />}
                          {ana.investidor_dados.capital_min && <MiniField label="Capital Min" value={`€ ${ana.investidor_dados.capital_min.toLocaleString('pt-PT')}`} />}
                          {ana.investidor_dados.perfil_risco && <MiniField label="Perfil Risco" value={ana.investidor_dados.perfil_risco} />}
                          {ana.investidor_dados.estrategia && <MiniField label="Estratégia" value={Array.isArray(ana.investidor_dados.estrategia) ? ana.investidor_dados.estrategia.join(', ') : ana.investidor_dados.estrategia} />}
                          {ana.classificacao_sugerida && <MiniField label="Classificação" value={ana.classificacao_sugerida} highlight />}
                          {ana.probabilidade_investimento != null && <MiniField label="Probabilidade" value={`${ana.probabilidade_investimento}%`} />}
                        </div>
                        {ana.autoFilled && ana.fieldsUpdated?.length > 0 && (
                          <p className="text-xs text-success mt-2">✓ Campos preenchidos automaticamente: {ana.fieldsUpdated.join(', ')}</p>
                        )}
                      </div>
                    )}

                    {/* Sugestões de melhoria */}
                    {ana.sugestoes_melhoria?.length > 0 && (
                      <div>
                        <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">Sugestões de Melhoria</p>
                        <div className="space-y-1.5">
                          {ana.sugestoes_melhoria.map((s, i) => (
                            <div key={i} className="flex gap-2 text-xs">
                              <Lightbulb className="w-3.5 h-3.5 text-warning shrink-0 mt-px" />
                              <span className="text-ink-muted">{s}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Próximos passos */}
                    {ana.proximos_passos?.length > 0 && (
                      <div>
                        <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">Próximos Passos</p>
                        <div className="space-y-1">
                          {ana.proximos_passos.map((p, i) => (
                            <div key={i} className="flex gap-2 text-xs">
                              <span className="text-ink-muted shrink-0 font-bold">{i + 1}.</span>
                              <span className="text-ink-muted">{p}</span>
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
                    <summary className="text-xs text-ink-muted uppercase tracking-wide cursor-pointer hover:text-ink-muted flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Transcrição Completa
                    </summary>
                    <div className="mt-2 max-h-[400px] overflow-y-auto bg-surface-raised rounded-lg border border-line p-3 text-xs space-y-1">
                      {transcricao[r.id].split('\n').filter(Boolean).map((line, i) => {
                        const match = line.match(/^\[(.+?)\]:\s*(.+)/)
                        if (match) {
                          const isSomnium = /somnium|alexandre|jo[aã]o/i.test(match[1])
                          return (
                            <div key={i}>
                              <span className={`font-semibold ${isSomnium ? 'text-ink' : 'text-warning'}`}>{match[1]}: </span>
                              <span className="text-ink-muted">{match[2]}</span>
                            </div>
                          )
                        }
                        return <div key={i} className="text-ink-muted">{line}</div>
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
        <p className="text-center text-ink-muted text-sm py-8">Sem reuniões registadas para este contacto.</p>
      )}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-sm font-medium text-ink truncate">{value || '—'}</p>
    </div>
  )
}

// memo com comparador próprio (achado da auditoria — Problema 27): o `form`
// inteiro muda de referência a cada tecla premida em QUALQUER campo (setField
// faz setForm(prev => ({...prev, [k]: v}))), por isso um memo raso continuaria
// a re-renderizar todos os ~48 campos do formulário a cada tecla. Comparar só
// o valor do campo que este EF representa resolve isso: só o campo realmente
// alterado volta a renderizar.
const EF = memo(function EF({ label, field, form, set, type = 'text', options }) {
  const inputClass = "w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
  return (
    <div>
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      {type === 'select' ? (
        <select value={form[field] ?? ''} onChange={e => set(field, e.target.value)} className={inputClass}>
          <option value="">—</option>
          {options.map(o => typeof o === 'object' ? <option key={o.v} value={o.v}>{o.l}</option> : <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'date' ? (
        <input type="date" value={(form[field] || '').slice(0, 10)} onChange={e => set(field, e.target.value)} className={inputClass} />
      ) : type === 'number' ? (
        <input type="number" step="any" value={form[field] || ''} onChange={e => set(field, +e.target.value || null)} className={inputClass} onWheel={e => e.target.blur()} />
      ) : (
        <input type="text" value={form[field] || ''} onChange={e => set(field, e.target.value)} className={inputClass} />
      )}
    </div>
  )
}, (prev, next) => (
  prev.field === next.field &&
  prev.label === next.label &&
  prev.type === next.type &&
  prev.options === next.options &&
  prev.form[prev.field] === next.form[next.field]
))

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
function Section({ icon: Icon, title, fields, form, defaultOpen = false, accent, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const filled = fields ? countFilled(form, fields) : null
  const total = fields?.length ?? 0
  const complete = filled !== null && filled === total && total > 0
  return (
    // overflow-visible quando aberto: o dropdown do Combobox de consultor
    // estava a ser cortado pelo `overflow-hidden` desta caixa (lista da
    // imobiliária ocultada). Mantém overflow-hidden quando fechado para
    // preservar os rounded corners do botão de header.
    <div className={`col-span-2 md:col-span-3 border border-line rounded-xl bg-surface-raised ${open ? '' : 'overflow-hidden'}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface ${open ? 'rounded-t-xl' : 'rounded-xl'}`}>

        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-ink-muted shrink-0" />}
          <span>{title}</span>
          {accent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">{accent}</span>}
        </span>
        <span className="flex items-center gap-3">
          {filled !== null && total > 0 && (
            <span className={`text-[11px] font-medium ${complete ? 'text-success' : 'text-ink-muted'}`}>
              {filled}/{total}
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
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

// Editor de tags livre — guarda como JSON array em string. Suporta autocomplete
// a partir de uma lista de sugestões já existentes na DB (ex: imobiliárias já
// usadas por outros consultores). Enter ou clique numa sugestão adiciona;
// X remove; vírgula também separa.
function ChipsEditor({ label, jsonField, onChange, placeholder, suggestions = [] }) {
  const items = useMemo(() => {
    try {
      if (Array.isArray(jsonField)) return jsonField
      const v = JSON.parse(jsonField || '[]')
      return Array.isArray(v) ? v : []
    } catch { return [] }
  }, [jsonField])
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const add = (raw) => {
    const novo = String(raw || '').trim()
    if (!novo) return
    const next = [...new Set([...items, novo])]
    onChange(next)
    setInput('')
    setOpen(false)
  }
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(input)
    } else if (e.key === 'Backspace' && !input && items.length) {
      onChange(items.slice(0, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Filtra sugestões: remove já seleccionadas, faz match insensitive ao texto.
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const filtered = useMemo(() => {
    const q = norm(input)
    const sel = new Set(items.map(norm))
    return (suggestions || []).filter(s => !sel.has(norm(s)) && (q === '' || norm(s).includes(q))).slice(0, 50)
  }, [suggestions, input, items])

  // Fechar dropdown ao clicar fora.
  useEffect(() => {
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 px-2 py-1.5 rounded-lg border border-line bg-surface-raised min-h-[38px] focus-within:ring-2 focus-within:ring-yellow-300">
        {items.map((it, i) => (
          <span key={`${it}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-warning/10 border border-warning/30 text-yellow-900">
            {it}
            <button type="button" onClick={() => remove(i)} className="text-warning hover:text-danger" aria-label={`Remover ${it}`}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          onBlur={() => { if (input) add(input) }}
          placeholder={items.length ? '' : (placeholder || 'Escreve e prime Enter…')}
          className="flex-1 min-w-[140px] outline-none text-sm bg-transparent"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-surface-raised border border-line rounded-lg shadow-lg max-h-56 overflow-auto">
          {filtered.map((s, i) => (
            <button
              key={s + i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s) }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-warning/10 hover:text-yellow-900"
            >
              {s}
            </button>
          ))}
        </div>
      )}
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

const ESTADOS_PIPELINE = ESTADOS_IMOVEIS
const ORIGEM_OPTS = ['Pesquisa em portais/sites','Referência por consultores','Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro']
const MODELO_NEGOCIO_OPTS = ['Wholesaling','Fix and Flip','CAEP','Mediação Imobiliária','Consultoria/Assessoria']

// Mini-form embutido para criar consultor sem sair da ficha do imóvel.
// Triggado quando o utilizador escreve um nome novo no Combobox de consultor
// e clica "+ Criar consultor 'X'". Herda a região do imóvel; estatuto e
// estado_avaliacao usam os defaults consistentes com find-or-create.
function ConsultorInlineCreator({ initialNome, regiao, sugestoesImobiliarias = [], onCreated, onCancel }) {
  const [nome, setNome] = useState(initialNome || '')
  const [contacto, setContacto] = useState('')
  const [email, setEmail] = useState('')
  const [imobiliarias, setImobiliarias] = useState([])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)
  const toast = useToast()

  async function submit() {
    if (!nome.trim()) { setErro('Nome obrigatório'); return }
    setSaving(true)
    setErro(null)
    try {
      const body = {
        nome: nome.trim(),
        contacto: contacto.trim() || null,
        email: email.trim() || null,
        imobiliaria: imobiliarias.length ? JSON.stringify(imobiliarias) : null,
        regiao,
        estatuto: 'Cold Call',
        estado_avaliacao: 'Em avaliação',
      }
      const r = await apiFetch('/api/crm/consultores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        regiao,
      })
      if (!r.ok) throw new Error(await r.text())
      const created = await r.json()
      toast(`Consultor "${created.nome}" criado`, 'success')
      onCreated?.(created)
    } catch (e) {
      setErro(e.message || 'Erro ao criar consultor')
    } finally {
      setSaving(false)
    }
  }

  const input = "w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"

  return (
    <div className="mt-2 p-3 rounded-xl border border-warning/30 bg-warning/10">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-warning">
          Criar consultor em <strong>{regiao}</strong>
        </p>
        <button type="button" onClick={onCancel}
          className="text-[11px] text-ink-muted hover:text-ink">Cancelar</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <p className="text-[10px] text-ink-muted mb-0.5">Nome *</p>
          <input value={nome} onChange={e => setNome(e.target.value)} className={input} autoFocus />
        </div>
        <div>
          <p className="text-[10px] text-ink-muted mb-0.5">Contacto</p>
          <input value={contacto} onChange={e => setContacto(e.target.value)} className={input} placeholder="9XX XXX XXX" />
        </div>
        <div>
          <p className="text-[10px] text-ink-muted mb-0.5">Email</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={input} placeholder="nome@exemplo.pt" />
        </div>
        <div>
          <ChipsEditor
            label="Imobiliária"
            jsonField={imobiliarias}
            onChange={setImobiliarias}
            placeholder="Ex: Remax, ERA…"
            suggestions={sugestoesImobiliarias}
          />
        </div>
      </div>
      {erro && <p className="mt-2 text-[11px] text-danger">{erro}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={saving || !nome.trim()}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-warning text-white hover:bg-yellow-700 disabled:opacity-50">
          {saving ? 'A criar…' : 'Criar consultor'}
        </button>
        <span className="text-[10px] text-ink-muted">Os restantes campos preenchem-se depois na ficha do consultor.</span>
      </div>
    </div>
  )
}

// Bloco editável da Ficha do Imóvel — 6 secções colapsáveis sem duplicação.
function ImovelEditSections({ data, form, setField }) {
  const toast = useToast()
  const lookups = useLookups()
  const { concelhos, freguesias } = useFreguesiasLookup(form)
  const consultoresRegiao = useConsultoresLookup(form?.regiao)
  const consultoresOptions = useMemo(() => consultoresRegiao.map(c => c.nome).filter(Boolean), [consultoresRegiao])
  // Quando o utilizador escreve um nome de consultor que não está na lista da
  // região e clica "+ Criar consultor 'X'", abre-se um mini-form embutido.
  const [openCreatorFor, setOpenCreatorFor] = useState(null)
  const [sugestoesImob, setSugestoesImob] = useState([])
  useEffect(() => {
    if (!openCreatorFor) return
    apiFetch('/api/crm/consultores/sugestoes-tags', { regiao: form?.regiao })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSugestoesImob(d.imobiliarias || []) })
      .catch(() => {})
  }, [openCreatorFor, form?.regiao])
  const onusList = Array.isArray(form.onus_registados) ? form.onus_registados : []
  const toggleOnus = v => {
    const set = new Set(onusList)
    if (set.has(v)) set.delete(v); else set.add(v)
    setField('onus_registados', Array.from(set))
  }

  const sec = {
    identificacao: ['nome','estado','ref_interna','link','tipo_oportunidade','origem','nome_consultor'],
    localizacao:   ['distrito','concelho','freguesia','morada','coordenadas_lat','coordenadas_lng','localizacao_imagem'],
    fisica:        ['tipologia','predio_tipo','area_util','area_bruta','area_bruta_dependente','andar','numero_pisos_predio','tem_elevador','ano_construcao','cru','licenca_utilizacao','licenca_utilizacao_detalhe'],
    valores:       ['ask_price','valor_proposta','fee_cedencia','valor_venda_remodelado','custo_estimado_obra','vpt','imi_anual','condominio_mensal_anunciado'],
    legal:         ['artigo_matricial','descricao_predial','fracao','regime_propriedade','certificado_energetico','numero_ce','onus_registados'],
    pipeline:      ['proprietario_nome','proprietario_nif','proprietario_contacto','motivo_venda_declarado','data_anuncio','modelo_negocio','data_adicionado','data_chamada','data_visita','data_estudo_mercado','data_proposta','data_proposta_aceite','data_aceite_investidor','notas'],
  }

  return <>
    {/* 1. Identificação */}
    <Section icon={ClipboardList} title="Identificação" fields={sec.identificacao} form={form} defaultOpen>
      <EF label="Nome" field="nome" form={form} set={setField} />
      <EF label="Estado" field="estado" form={form} set={setField} type="select" options={ESTADOS_PIPELINE} />
      {(() => {
        // Ao escolher Follow Up / Não interessa no dropdown, abrir aqui mesmo o campo
        // de justificação (obrigatório no saveEdit) — antes só aparecia ao arrastar no Kanban.
        const est = (form.estado || '').replace(/^\d+-\s*/, '').trim()
        const isFup = /follow ?up/i.test(est)
        const isNi = /n[ãa]o interessa/i.test(est)
        if (!isFup && !isNi) return null
        const field = isFup ? 'motivo_follow_up' : 'motivo_nao_interessa'
        return (
          <div className="col-span-2 md:col-span-3">
            <label className="text-xs font-medium text-warning block mb-1">
              {isFup ? 'Motivo Follow Up *' : 'Motivo Não Interessa *'}
            </label>
            <textarea value={form[field] || ''} onChange={e => setField(field, e.target.value)} rows={2}
              autoFocus
              placeholder={isFup ? 'Ex: Aguardar resposta do proprietário…' : 'Ex: preço acima do mercado, sem margem…'}
              className="w-full px-3 py-2 rounded-lg border border-warning/30 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            <p className="text-[11px] text-warning mt-1">⚠ Obrigatório para gravar este estado.</p>
            {isFup && entraEmFollowUp(form, data) && (
              <div className="mt-2">
                <label className="text-xs font-medium text-warning block mb-1">Data do follow-up * (cria a tarefa na agenda)</label>
                <input type="date" value={form._follow_up_data || ''} onChange={e => setField('_follow_up_data', e.target.value)}
                  className="px-3 py-2 rounded-lg border border-warning/30 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
            )}
          </div>
        )
      })()}
      <EF label="REF Interna" field="ref_interna" form={form} set={setField} />
      <EF label="Link" field="link" form={form} set={setField} />
      <div>
        <p className="text-xs text-ink-muted mb-1">Tipo de Oportunidade</p>
        <select value={form.tipo_oportunidade || ''} onChange={e => setField('tipo_oportunidade', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.tipo_oportunidade || ['Off-Market','Market','Portal']).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Origem (Canal)" field="origem" form={form} set={setField} type="select" options={ORIGEM_OPTS} />
      <div className="col-span-2 md:col-span-1">
        <Combobox
          label="Consultor"
          value={form.nome_consultor}
          onChange={v => setField('nome_consultor', v)}
          options={consultoresOptions}
          placeholder={consultoresRegiao.length ? `Pesquisar (${consultoresRegiao.length} ${form?.regiao || ''})…` : 'Sem consultores nesta região'}
          allowFree={false}
          onCreateNew={(nome) => setOpenCreatorFor(nome)}
          createLabel="Criar consultor"
        />
        {form.nome_consultor && !consultoresOptions.some(o => o.toLowerCase() === form.nome_consultor.toLowerCase()) && (
          <p className="text-[10px] text-warning mt-1">Nome livre (não corresponde a consultor da BD)</p>
        )}
      </div>
      {openCreatorFor && (
        <div className="col-span-2 md:col-span-3">
          <ConsultorInlineCreator
            initialNome={openCreatorFor}
            regiao={form.regiao || 'Coimbra'}
            sugestoesImobiliarias={sugestoesImob}
            onCreated={(c) => { setField('nome_consultor', c.nome); setOpenCreatorFor(null) }}
            onCancel={() => setOpenCreatorFor(null)}
          />
        </div>
      )}
    </Section>

    {/* 2. Localização */}
    <Section icon={MapPin} title="Localização" fields={sec.localizacao} form={form}>
      <div>
        <p className="text-xs text-ink-muted mb-1">Região</p>
        <select value={form.regiao || 'Coimbra'} onChange={e => setField('regiao', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="Coimbra">Coimbra</option>
          <option value="AMP">AMP (Porto + Gaia)</option>
        </select>
      </div>
      <div>
        <Combobox label="Distrito" value={form.distrito} onChange={v => setField('distrito', v)} options={[]} placeholder={form.regiao === 'AMP' ? 'Porto…' : 'Coimbra…'} />
      </div>
      <div>
        <Combobox label="Concelho" value={form.concelho} onChange={v => setField('concelho', v)} options={concelhos} placeholder={form.regiao === 'AMP' ? 'Porto / V. N. Gaia / S. M. da Feira…' : 'Coimbra…'} />
      </div>
      <div>
        <Combobox label="Freguesia" value={form.freguesia} onChange={v => setField('freguesia', v)} options={freguesias} placeholder="Pesquisar freguesia…" />
      </div>
      <EF label="Rua" field="morada" form={form} set={setField} />
      <EF label="Latitude" field="coordenadas_lat" form={form} set={setField} type="number" />
      <EF label="Longitude" field="coordenadas_lng" form={form} set={setField} type="number" />
      <div className="col-span-2 md:col-span-3 mt-1">
        <label className="text-xs text-ink-muted block mb-1">Imagem de localização (print do Google Maps)</label>
        {form.localizacao_imagem ? (
          <div className="flex items-start gap-3">
            <img src={form.localizacao_imagem} alt="Localização" className="w-64 h-40 object-cover rounded-lg border border-line" loading="lazy" decoding="async" />
            <div className="flex flex-col gap-2">
              <label className="text-xs px-3 py-1.5 rounded-md bg-warning/10 border border-warning/30 text-warning hover:bg-warning/15 cursor-pointer text-center">
                Substituir
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const fd = new FormData()
                    fd.append('imagem', file)
                    const r = await apiFetch(`/api/crm/imoveis/${data.id}/localizacao`, { method: 'POST', body: fd })
                    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível carregar a imagem.')
                    const j = await r.json()
                    setField('localizacao_imagem', j.localizacao_imagem)
                  } catch (err) { toast(friendlyError(err.message), 'error') }
                }} />
              </label>
              <button type="button" onClick={async () => {
                if (!(await confirmar('Remover imagem de localização?'))) return
                try {
                  const r = await apiFetch(`/api/crm/imoveis/${data.id}/localizacao`, { method: 'DELETE' })
                  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível remover a imagem.')
                  setField('localizacao_imagem', null)
                } catch (e) { toast(friendlyError(e.message), 'error') }
              }} className="text-xs px-3 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger hover:bg-danger/15">Remover</button>
            </div>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-line hover:border-ink/30 hover:bg-warning/10 cursor-pointer transition-colors">
            <span className="text-sm text-ink-muted">Clique para carregar print do Google Maps (JPG, PNG, WEBP)</span>
            <input type="file" accept="image/*" className="hidden" onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const fd = new FormData()
                fd.append('imagem', file)
                const r = await apiFetch(`/api/crm/imoveis/${data.id}/localizacao`, { method: 'POST', body: fd })
                if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível carregar a imagem.')
                const j = await r.json()
                setField('localizacao_imagem', j.localizacao_imagem)
              } catch (err) { toast(friendlyError(err.message), 'error') }
            }} />
          </label>
        )}
      </div>
    </Section>

    {/* 3. Caracterização Física */}
    <Section icon={Home} title="Caracterização Física" fields={sec.fisica} form={form}>
      {form.predio_tipo === 'Apartamento' && (
        <EF label="Tipologia" field="tipologia" form={form} set={setField} />
      )}
      <div>
        <p className="text-xs text-ink-muted mb-1">Tipo de Prédio</p>
        <select value={form.predio_tipo || ''} onChange={e => {
            const v = e.target.value
            setField('predio_tipo', v)
            if (v === 'Moradia') { setField('numero_pisos_predio', null); setField('tem_elevador', null) }
            if (v !== 'Apartamento') { setField('tipologia', null) }
          }}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.predio_tipo || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Área Útil (m²)" field="area_util" form={form} set={setField} type="number" />
      <EF label="ABP — Área Bruta Privativa (m²)" field="area_bruta" form={form} set={setField} type="number" />
      <EF label="ABD — Área Bruta Dependente (m²)" field="area_bruta_dependente" form={form} set={setField} type="number" />
      <div>
        <p className="text-xs text-ink-muted mb-1">Andar</p>
        <select value={form.andar || ''} onChange={e => setField('andar', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.andar || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {form.predio_tipo !== 'Moradia' && (
        <>
          <EF label="Nº Pisos do Prédio" field="numero_pisos_predio" form={form} set={setField} type="number" />
          <div>
            <p className="text-xs text-ink-muted mb-1">Elevador</p>
            <select value={form.tem_elevador || ''} onChange={e => setField('tem_elevador', e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
              <option value="">—</option>
              {(lookups.tem_elevador || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </>
      )}
      <EF label="Ano de Construção" field="ano_construcao" form={form} set={setField} type="number" />
      <div>
        <p className="text-xs text-ink-muted mb-1">CRU</p>
        <select value={form.cru || ''} onChange={e => setField('cru', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.cru || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <p className="text-xs text-ink-muted mb-1">Licença de Utilização</p>
        <select value={form.licenca_utilizacao || ''} onChange={e => setField('licenca_utilizacao', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.licenca_utilizacao || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {form.licenca_utilizacao === 'Tem' && <EF label="Licença: número e data" field="licenca_utilizacao_detalhe" form={form} set={setField} />}
    </Section>

    {/* 4. Valores */}
    <Section icon={Euro} title="Valores" fields={sec.valores} form={form} defaultOpen>
      <EF label="Ask Price (€)" field="ask_price" form={form} set={setField} type="number" />
      <EF label="Valor Proposta (€)" field="valor_proposta" form={form} set={setField} type="number" />
      {isWholesaling(form) && (
        <>
          <EF label="Valor de Cedência de Posição (€)" field="fee_cedencia" form={form} set={setField} type="number" />
          <Field label="Compra apresentada ao investidor" value={EUR((Number(form.valor_proposta) || 0) + (Number(form.fee_cedencia) || 0))} />
        </>
      )}
      <EF label="VVR — Valor Venda Remodelado (€)" field="valor_venda_remodelado" form={form} set={setField} type="number" />
      <EF label="Custo Obra (€)" field="custo_estimado_obra" form={form} set={setField} type="number" />
      <EF label="VPT (€)" field="vpt" form={form} set={setField} type="number" />
      <EF label="IMI Anual (€)" field="imi_anual" form={form} set={setField} type="number" />
      <EF label="Condomínio Mensal (€)" field="condominio_mensal_anunciado" form={form} set={setField} type="number" />
    </Section>

    {/* 5. Situação Legal e Fiscal */}
    <Section icon={Scale} title="Situação Legal e Fiscal" fields={sec.legal} form={form}>
      <EF label="Artigo Matricial" field="artigo_matricial" form={form} set={setField} />
      <EF label="Descrição Predial" field="descricao_predial" form={form} set={setField} />
      <EF label="Fração" field="fracao" form={form} set={setField} />
      <div>
        <p className="text-xs text-ink-muted mb-1">Regime de Propriedade</p>
        <select value={form.regime_propriedade || ''} onChange={e => setField('regime_propriedade', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.regime_propriedade || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <p className="text-xs text-ink-muted mb-1">Certificado Energético</p>
        <select value={form.certificado_energetico || ''} onChange={e => setField('certificado_energetico', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.certificado_energetico || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Nº CE" field="numero_ce" form={form} set={setField} />
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-ink-muted mb-1">Ónus / Encargos</p>
        <div className="flex flex-wrap gap-2">
          {(lookups.onus_registados || []).map(o => {
            const active = onusList.includes(o)
            return (
              <button type="button" key={o} onClick={() => toggleOnus(o)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? 'bg-warning/15 border-warning/30 text-warning' : 'bg-surface-raised border-line text-ink-muted hover:bg-surface'}`}
              >{o}</button>
            )
          })}
        </div>
      </div>
    </Section>

    {/* 6. Proprietário & Pipeline */}
    <Section icon={UserRound} title="Proprietário & Pipeline" fields={sec.pipeline} form={form}>
      <EF label="Proprietário" field="proprietario_nome" form={form} set={setField} />
      <EF label="NIF" field="proprietario_nif" form={form} set={setField} />
      <EF label="Contacto" field="proprietario_contacto" form={form} set={setField} />
      <div>
        <p className="text-xs text-ink-muted mb-1">Motivo Venda Declarado</p>
        <select value={form.motivo_venda_declarado || ''} onChange={e => setField('motivo_venda_declarado', e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
          <option value="">—</option>
          {(lookups.motivo_venda || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <EF label="Data de Entrada no Mercado (Casafari)" field="data_anuncio" form={form} set={setField} type="date" />
      {/* Read-only: contado a partir da data de entrada até hoje (ver src/lib/tempoMercado.js). */}
      <Field label="Tempo no Mercado (auto)" value={fmtTempoMercado(form.data_anuncio)} />
      <EF label="Modelo de Negócio" field="modelo_negocio" form={form} set={setField} type="select" options={MODELO_NEGOCIO_OPTS} />
      <EF label="Data Adicionado" field="data_adicionado" form={form} set={setField} type="date" />
      <EF label="Data Chamada" field="data_chamada" form={form} set={setField} type="date" />
      {/* Read-only: derivado automaticamente da última visita realizada (aba
          Visitas / tabela `visitas`), nunca deve ser editado directamente
          (ver comentário em src/db/pg.js sobre `imoveis.data_visita`). */}
      <Field label="Data Visita (auto — ver aba Visitas)" value={data.data_visita} />
      <EF label="Data Estudo Mercado" field="data_estudo_mercado" form={form} set={setField} type="date" />
      <EF label="Data Proposta" field="data_proposta" form={form} set={setField} type="date" />
      <EF label="Data Proposta Aceite" field="data_proposta_aceite" form={form} set={setField} type="date" />
      <EF label="Data Aceite Investidor" field="data_aceite_investidor" form={form} set={setField} type="date" />
      <div className="col-span-2 md:col-span-3">
        <label className="text-xs text-ink-muted block mb-1">Notas</label>
        <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={4}
          className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
      </div>
    </Section>
  </>
}

// Bloco read-only — mesmas 6 secções, sem inputs.
function ImovelReadSections({ data, onNavigate }) {
  const fmtArea = v => (v > 0 ? `${v} m²` : '—')
  const fmtEur = v => (v > 0 ? EUR(v) : '—')
  const onusList = Array.isArray(data.onus_registados) ? data.onus_registados : []
  // Resolve o nome livre para o consultor real (id) da BD na região do imóvel.
  // Match exacto ou substring (alinhado com navigateToConsultor do CRM.jsx).
  const consultoresRegiao = useConsultoresLookup(data?.regiao)
  const consultorMatch = useMemo(() => {
    if (!data?.nome_consultor || !consultoresRegiao.length) return null
    const n = data.nome_consultor.trim().toLowerCase()
    return consultoresRegiao.find(c => {
      const cn = c.nome?.trim().toLowerCase()
      return cn && (cn === n || cn.includes(n) || n.includes(cn))
    }) || null
  }, [data?.nome_consultor, consultoresRegiao])

  const consultorContacto = (
    data.consultores?.find(c => c.id === consultorMatch?.id) || data.consultores?.[0]
  )?.contacto || null

  const sec = {
    identificacao: ['nome','estado','ref_interna','link','tipo_oportunidade','origem','nome_consultor'],
    localizacao:   ['distrito','concelho','freguesia','morada','coordenadas_lat','coordenadas_lng','localizacao_imagem'],
    fisica:        ['tipologia','predio_tipo','area_util','area_bruta','area_bruta_dependente','andar','numero_pisos_predio','tem_elevador','ano_construcao','cru','licenca_utilizacao','licenca_utilizacao_detalhe'],
    valores:       ['ask_price','valor_proposta','fee_cedencia','valor_venda_remodelado','custo_estimado_obra','vpt','imi_anual','condominio_mensal_anunciado'],
    legal:         ['artigo_matricial','descricao_predial','fracao','regime_propriedade','certificado_energetico','numero_ce','onus_registados'],
    pipeline:      ['proprietario_nome','proprietario_nif','proprietario_contacto','motivo_venda_declarado','data_anuncio','modelo_negocio','data_adicionado','data_chamada','data_visita','data_estudo_mercado','data_proposta','data_proposta_aceite','data_aceite_investidor','notas'],
  }

  return <>
    <Section icon={ClipboardList} title="Identificação" fields={sec.identificacao} form={data} defaultOpen>
      <Field label="Nome" value={data.nome} />
      <Field label="Estado" value={data.estado?.replace(/^\d+-/, '')} />
      <Field label="REF Interna" value={data.ref_interna} />
      <Field label="Link" value={data.link ? <a href={data.link} target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:underline truncate block">{data.link === 'OFF MARKET' ? 'OFF MARKET' : 'Ver anúncio'}</a> : '—'} />
      <Field label="Tipo de Oportunidade" value={data.tipo_oportunidade} />
      <Field label="Origem (Canal)" value={data.origem} />
      <Field label="Consultor" value={
        data.nome_consultor ? (
          <span className="flex flex-col gap-0.5">
            {consultorMatch && onNavigate
              ? <button type="button" onClick={() => onNavigate('Consultores', consultorMatch.id)}
                  className="text-brand-gold hover:underline text-left truncate">{data.nome_consultor}</button>
              : <span className="truncate">{data.nome_consultor}</span>}
            {consultorContacto && (
              <a href={`tel:${consultorContacto}`}
                 onClick={e => e.stopPropagation()}
                 className="text-xs text-ink-muted hover:text-brand-gold hover:underline truncate">
                {consultorContacto}
              </a>
            )}
          </span>
        ) : '—'
      } />
    </Section>

    <Section icon={MapPin} title="Localização" fields={sec.localizacao} form={data}>
      <Field label="Distrito" value={data.distrito} />
      <Field label="Concelho" value={data.concelho} />
      <Field label="Freguesia" value={data.freguesia} />
      <Field label="Rua" value={data.morada} />
      <Field label="Latitude" value={data.coordenadas_lat} />
      <Field label="Longitude" value={data.coordenadas_lng} />
      {data.localizacao_imagem && (
        <div className="col-span-2 md:col-span-3">
          <p className="text-xs text-ink-muted mb-1">Imagem de localização</p>
          <img src={data.localizacao_imagem} alt="Localização" className="w-full max-w-md rounded-lg border border-line" loading="lazy" decoding="async" />
        </div>
      )}
    </Section>

    <Section icon={Home} title="Caracterização Física" fields={sec.fisica} form={data}>
      {data.predio_tipo === 'Apartamento' && <Field label="Tipologia" value={data.tipologia} />}
      <Field label="Tipo de Prédio" value={data.predio_tipo} />
      <Field label="Área Útil" value={fmtArea(data.area_util)} />
      <Field label="ABP" value={fmtArea(data.area_bruta)} />
      <Field label="ABD" value={fmtArea(data.area_bruta_dependente)} />
      <Field label="Andar" value={data.andar} />
      {data.predio_tipo !== 'Moradia' && (
        <>
          <Field label="Nº Pisos" value={data.numero_pisos_predio} />
          <Field label="Elevador" value={data.tem_elevador} />
        </>
      )}
      <Field label="Ano Construção" value={data.ano_construcao} />
      <Field label="CRU" value={data.cru} />
      <Field label="Licença Utilização" value={[data.licenca_utilizacao, data.licenca_utilizacao_detalhe].filter(Boolean).join(' · ') || null} />
    </Section>

    <Section icon={Euro} title="Valores" fields={sec.valores} form={data} defaultOpen>
      <Field label="Ask Price" value={fmtEur(data.ask_price)} />
      <Field label="Valor Proposta" value={fmtEur(data.valor_proposta)} />
      {isWholesaling(data) && (
        <>
          <Field label="Valor de Cedência de Posição" value={fmtEur(data.fee_cedencia)} />
          <Field label="Compra apresentada ao investidor" value={fmtEur((Number(data.valor_proposta) || 0) + (Number(data.fee_cedencia) || 0))} />
        </>
      )}
      <Field label="VVR" value={fmtEur(data.valor_venda_remodelado)} />
      <Field label="Custo Obra" value={fmtEur(data.custo_estimado_obra)} />
      <Field label="VPT" value={fmtEur(data.vpt)} />
      <Field label="IMI Anual" value={fmtEur(data.imi_anual)} />
      <Field label="Condomínio Mensal" value={fmtEur(data.condominio_mensal_anunciado)} />
    </Section>

    <Section icon={Scale} title="Situação Legal e Fiscal" fields={sec.legal} form={data}>
      <Field label="Artigo Matricial" value={data.artigo_matricial} />
      <Field label="Descrição Predial" value={data.descricao_predial} />
      <Field label="Fração" value={data.fracao} />
      <Field label="Regime de Propriedade" value={data.regime_propriedade} />
      <Field label="Certificado Energético" value={data.certificado_energetico} />
      <Field label="Nº CE" value={data.numero_ce} />
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-ink-muted">Ónus / Encargos</p>
        <p className="text-sm font-medium text-ink">{onusList.length > 0 ? onusList.join(', ') : '—'}</p>
      </div>
    </Section>

    <Section icon={UserRound} title="Proprietário & Pipeline" fields={sec.pipeline} form={data}>
      <Field label="Proprietário" value={data.proprietario_nome} />
      <Field label="NIF" value={data.proprietario_nif} />
      <Field label="Contacto" value={data.proprietario_contacto} />
      <Field label="Motivo Venda" value={data.motivo_venda_declarado} />
      <Field label="Entrada no Mercado" value={data.data_anuncio} />
      <Field label="Tempo no Mercado" value={fmtTempoMercado(data.data_anuncio)} />
      <Field label="Modelo de Negócio" value={data.modelo_negocio} />
      <Field label="Data Adicionado" value={data.data_adicionado} />
      <Field label="Data Chamada" value={data.data_chamada} />
      <Field label="Data Visita" value={data.data_visita} />
      <Field label="Data Estudo Mercado" value={data.data_estudo_mercado} />
      <Field label="Data Proposta" value={data.data_proposta} />
      <Field label="Data Proposta Aceite" value={data.data_proposta_aceite} />
      <Field label="Data Aceite Investidor" value={data.data_aceite_investidor} />
      {data.notas && <div className="col-span-2 md:col-span-3"><Field label="Notas" value={data.notas} /></div>}
    </Section>
  </>
}

// ── Investidor: constantes e helpers ─────────────────────────
// tipo_principal é multi-valor (um investidor pode ser Activo e Passivo em
// simultâneo) — guardado como JSON array (ex: '["Ativo","Passivo"]'),
// parseado com o mesmo helper parseJsonArray usado por MultiChips.
// Passivos: gamas tipicas de mercado (capital pago, sem trabalho operacional).
const INV_ROI_OPTS = ['<10%', '10–15%', '15–20%', '20–25%', '>25%']
// Ativos: aceitam risco e trabalho, intervalos sobem ate >50%.
const INV_ROI_OPTS_ATIVO = ['<10%', '10–15%', '15–20%', '20–25%', '25–30%', '30–40%', '40–50%', '>50%']
// tipo_principal é multi-valor — se incluir Ativo, usa a gama mais ampla
// (cobre também o intervalo típico de Passivo).
const roiOptsFor = (tipo) => (parseJsonArray(tipo).includes('Ativo') ? INV_ROI_OPTS_ATIVO : INV_ROI_OPTS)
const INV_EXPERIENCIA_OPTS = ['Nenhuma', '1–2 negócios', '3–10 negócios', '>10 negócios']
const INV_TIPO_IMOVEL_OPTS = ['T0', 'T1', 'T2', 'T3+', 'Apartamento', 'Moradia', 'Edifício', 'Comercial', 'Terreno', 'Ruína', 'Indiferente']
const INV_DISTRITOS_OPTS = ['Aveiro','Beja','Braga','Bragança','Castelo Branco','Coimbra','Évora','Faro','Guarda','Leiria','Lisboa','Portalegre','Porto','Santarém','Setúbal','Viana do Castelo','Vila Real','Viseu','Açores','Madeira']
const INV_REGIOES_OPTS = ['Norte','Centro','Lisboa e Vale do Tejo','Alentejo','Algarve','Açores','Madeira','Coimbra','Porto','AMP','AML']
const INV_EQUIPA_OBRAS_OPTS = ['Própria', 'Da Somnium', 'Indiferente', 'Sem opinião']
const INV_ESTRATEGIA_OPTS = ['Wholesaling', 'CAEP', 'Fix and Flip', 'Mediação Imobiliária', 'Cedência de posição', 'Arrendamento']
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
      <p className="text-xs text-ink-muted mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = selected.includes(o)
          return (
            <button key={o} type="button" onClick={() => toggle(o)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${active ? 'bg-warning/15 border-warning/30 text-yellow-900' : 'bg-surface-raised border-line text-ink-muted hover:bg-surface'}`}>
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
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      <button type="button" onClick={() => set(field, on ? 0 : 1)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-success' : 'bg-ink/20'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-surface-raised transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <span className="ml-2 text-xs text-ink-muted">{on ? 'Sim' : 'Não'}</span>
    </div>
  )
}

function InvClassBadge({ cls }) {
  if (!cls) return <span className="text-xs text-ink-muted/70">—</span>
  return <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold text-white ${CLASS_COLOR[cls] ?? 'bg-ink/40'}`}>{cls}</span>
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
function InvestidorHero({ data }) {
  const tipos = parseJsonArray(data.tipo_principal)
  const isAtivo = tipos.includes('Ativo')
  const tipo = tipos.length > 0 ? tipos.join(' + ') : 'Passivo'
  // Ativo em dourado (opera deals connosco), Passivo em tinta: mesma linguagem do resto da ficha.
  const tipoBg = isAtivo ? 'bg-accent text-accent-foreground' : 'bg-ink text-surface'
  const iniciais = (data.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
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

  const pos = pipelinePosition(data.status, tipos)
  const score = Number(data.pontuacao || 0)

  // Área geográfica de atuação — para Ativos, é informação central.
  // Une localizacao_preferida (distritos) com regioes_preferidas (regiões macro), sem duplicados.
  const areaAtuacao = Array.from(new Set([
    ...parseJsonArray(data.localizacao_preferida),
    ...parseJsonArray(data.regioes_preferidas),
  ].filter(Boolean)))

  return (
    <div className="col-span-2 md:col-span-3 rounded-2xl border border-line bg-surface-raised shadow-sm overflow-hidden">
      {/* Topo */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-16 h-16 rounded-2xl ${tipoBg} flex items-center justify-center text-xl font-bold shrink-0 shadow-sm`}>
            {iniciais}
          </div>

          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-bold text-ink truncate">{data.nome}</h3>
              {tipos.length > 0 ? tipos.map(t => (
                <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                  t === 'Ativo' ? 'text-success bg-success/15 border-success/30' : 'text-warning bg-warning/15 border-warning/30'
                }`}>{t}</span>
              )) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold text-warning bg-warning/15 border-warning/30">Passivo</span>
              )}
              <InvClassBadge cls={data.classificacao} />
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${pillClass(INV_STATUS_COLOR[data.status])}`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(INV_STATUS_COLOR[data.status])}`} aria-hidden="true" />{data.status || '—'}</span>
              {!!data.nda_assinado && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> NDA
                </span>
              )}
              {proximaPassada && !isTerminal && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger font-semibold inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Atrasado
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted flex-wrap">
              {data.telemovel && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {data.telemovel}</span>}
              {data.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {data.email}</span>}
              {data.origem && <span className="text-ink-muted">· {data.origem}</span>}
            </div>
          </div>
        </div>

        {/* Mini-KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <KpiTile icon={Wallet}  label="Capital" value={capRange || '—'}  tone="indigo" />
          <KpiTile icon={Target}  label="ROI desejado" value={data.roi_pretendido || '—'} tone="amber" extra={
            data.roi_anualizado_pretendido
              ? <p className="text-[10px] mt-0.5 opacity-70 truncate">Anualizado: {data.roi_anualizado_pretendido}</p>
              : null
          } />
          <KpiTile icon={Hourglass} label="Na pipeline" value={diasPipeline != null ? `${diasPipeline}d` : '—'} tone="slate" />
          <KpiTile icon={TrendingUp} label="Score" value={score > 0 ? `${score}/100` : '—'} tone="green" extra={
            score > 0 ? (
              <div className="mt-1 h-1 bg-surface-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-green-500 transition-[background-color,border-color,color,box-shadow,opacity,transform]" style={{ width: `${Math.min(100, score)}%` }} />
              </div>
            ) : null
          } />
        </div>

        {/* Área de Atuação — destaque para investidores Ativos */}
        {isAtivo && (
          <div className="mt-4 rounded-xl border border-success/30 bg-success/10 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-success font-semibold">
              <MapPin className="w-3 h-3" /> Área de Atuação
            </div>
            {areaAtuacao.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {areaAtuacao.map(s => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-surface-raised border border-success/30 text-success font-medium">{s}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-muted mt-1">Por definir</p>
            )}
          </div>
        )}

        {/* Acções rápidas */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {phoneIntl && (
            <a href={`tel:${phoneIntl}`} className="text-xs px-3 py-1.5 rounded-lg border border-line bg-surface-raised text-ink hover:bg-surface inline-flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Ligar
            </a>
          )}
          {phoneIntl && (
            <a href={`https://wa.me/${phoneIntl.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-lg border border-success/30 bg-success/10 text-success hover:bg-success/15 inline-flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
          {data.email && (
            <a href={`mailto:${data.email}`} className="text-xs px-3 py-1.5 rounded-lg border border-line bg-surface-raised text-ink hover:bg-surface inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
          )}
        </div>
      </div>

      {/* Faixa de progresso da pipeline */}
      {pos && !isTerminal && (
        <div className="px-4 sm:px-5 pb-3">
          <div className="flex items-center gap-2 text-[10px] text-ink-muted uppercase tracking-wide mb-1">
            <span>Pipeline {tipo.toLowerCase()}</span>
            <span className="ml-auto num text-ink-muted">{pos.idx}/{pos.total}</span>
          </div>
          <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-[width] duration-moderate ease-entry" style={{ width: `${(pos.idx / pos.total) * 100}%` }} />
          </div>
        </div>
      )}
      {isTerminal && (
        <div className="px-4 sm:px-5 py-2 bg-surface border-t border-line text-[11px] text-ink-muted flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          {data.status === 'Inactivo' ? 'Investidor marcado como inativo.' : 'Investidor não qualificado.'}
          {data.motivo_inatividade && <span className="text-ink-muted">· {data.motivo_inatividade}</span>}
          {data.motivo_nao_aprovacao && <span className="text-ink-muted">· {data.motivo_nao_aprovacao}</span>}
        </div>
      )}
    </div>
  )
}

// Mini-card de KPI usado no Hero
function KpiTile({ icon: Icon, label, value, tone, extra }) {
  const tones = {
    indigo: 'bg-surface-muted text-ink border-line',
    amber:  'bg-warning/10 text-warning border-warning/30',
    slate:  'bg-surface text-ink border-line',
    green:  'bg-success/10 text-success border-success/30',
  }
  return (
    <div className={`rounded-xl border p-2.5 ${tones[tone] || 'bg-surface border-line text-ink'}`}>
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
    <div className="w-12 h-14 rounded-lg border border-line bg-surface-raised shadow-sm flex flex-col overflow-hidden shrink-0">
      <div className="bg-brand-dark text-brand-gold text-[9px] text-center font-semibold py-0.5 tracking-wider">{meses[parseInt(m, 10) - 1] || '—'}</div>
      <div className="flex-1 flex items-center justify-center text-lg font-bold text-ink">{d || '?'}</div>
    </div>
  )
}

function InvestidorTimeline({ data }) {
  const today = new Date().toISOString().slice(0, 10)
  const eventos = [
    { key: '1º contacto',     date: data.data_primeiro_contacto, Icon: Users },
    { key: 'Reunião',         date: data.data_reuniao,           Icon: Calendar },
    { key: 'Último contacto', date: data.data_ultimo_contacto,   Icon: PhoneCall },
    { key: 'Próximo contacto', date: data.data_proxima_acao,     Icon: Target },
  ].filter(e => e.date).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  if (eventos.length === 0) {
    return <p className="col-span-2 md:col-span-3 text-xs text-ink-muted italic">Sem eventos registados</p>
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
        const dotColor = future ? 'bg-warning' : isToday ? 'bg-brand-gold' : 'bg-ink/20'
        const Icon = e.Icon
        return (
          <div key={i} className="relative flex items-start gap-3 py-2">
            <div className={`absolute left-2.5 top-3 w-3 h-3 rounded-full ${dotColor} border-2 border-white shadow-sm`} />
            <div className={`ml-8 flex-1 rounded-lg border p-2.5 ${future ? 'bg-warning/10 border-warning/30' : isToday ? 'bg-warning/10 border-warning/30' : 'bg-surface-raised border-line'}`}>
              <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 ${future ? 'text-warning' : 'text-ink-muted'}`} />
                <span className="text-sm font-medium text-ink">{e.key}</span>
                <span className="ml-auto text-[11px] num text-ink-muted">{fmtDate(iso)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-muted">
                <span>{fmtDateRelative(iso)}</span>
                {gap != null && gap > 0 && <span>· {gap}d depois do anterior</span>}
                {isToday && <span className="text-warning font-semibold">· Hoje</span>}
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
  const isAtivo = parseJsonArray(form.tipo_principal).includes('Ativo')
  const sec = {
    identificacao: ['nome','ref_investidor','tipo_principal','status','classificacao','origem','data_primeiro_contacto'],
    capital:       ['capital_min','capital_max','estrategia','perfil_risco','roi_pretendido','roi_anualizado_pretendido','origem_capital','montante_investido'],
    preferencias:  ['tipo_imovel_preferido','localizacao_preferida','regioes_preferidas','experiencia_imobiliario','equipa_obras'],
    contacto:      ['telemovel','email','preferencia_contacto','nda_assinado'],
    timeline:      ['data_primeiro_contacto','data_reuniao','data_ultimo_contacto'],
    bloqueios:     ['motivo_nao_aprovacao','motivo_inatividade'],
  }
  const roiOpts = roiOptsFor(form.tipo_principal)
  const temBloqueios = !!(data.motivo_nao_aprovacao || data.motivo_inatividade)
  return <>
    {/* 1. Identificação & Status */}
    <Section icon={ClipboardList} title="Identificação & Status" fields={sec.identificacao} form={form} defaultOpen>
      <EF label="Nome" field="nome" form={form} set={setField} />
      <EF label="REF Investidor" field="ref_investidor" form={form} set={setField} />
      <MultiChips label="Tipo" field="tipo_principal" form={form} set={setField} options={['Ativo','Passivo']} />
      <EF label="Status" field="status" form={form} set={setField} type="select" options={invStatusFor(form.tipo_principal)} />
      <div>
        <p className="text-xs text-ink-muted">Classificação</p>
        <div className="text-sm font-medium text-ink flex items-center gap-2">
          <InvClassBadge cls={data.classificacao} />
          <span className="text-xs text-ink-muted">— definida no separador Scorecard</span>
        </div>
      </div>
      <EF label="Origem" field="origem" form={form} set={setField} type="select" options={ORIGENS_INVESTIDORES} />
      <EF label="1º Contacto" field="data_primeiro_contacto" form={form} set={setField} type="date" />
    </Section>

    {/* 2. Capital & Estratégia */}
    <Section icon={Briefcase} title="Capital & Estratégia" fields={sec.capital} form={form} defaultOpen>
      <EF label="Capital Min (€)" field="capital_min" form={form} set={setField} type="number" />
      <EF label="Capital Max (€)" field="capital_max" form={form} set={setField} type="number" />
      <EF label="Perfil Risco" field="perfil_risco" form={form} set={setField} type="select" options={INV_PERFIL_RISCO_OPTS} />
      <EF label="ROI Previsto" field="roi_pretendido" form={form} set={setField} type="select" options={roiOpts} />
      <EF label="ROI Anualizado Previsto" field="roi_anualizado_pretendido" form={form} set={setField} type="select" options={roiOpts} />
      <EF label="Origem Capital" field="origem_capital" form={form} set={setField} type="select" options={INV_ORIGEM_CAPITAL_OPTS} />
      <div>
        <p className="text-xs text-ink-muted mb-1">Montante Investido (€)</p>
        <p className="w-full px-2 py-1.5 rounded-lg border border-line bg-surface text-sm text-ink-muted">
          {form.montante_investido > 0 ? `€${Number(form.montante_investido).toLocaleString('pt-PT')}` : '—'}
        </p>
        <p className="text-[10px] text-ink-muted mt-1 italic">Calculado a partir dos projetos associados a este investidor</p>
      </div>
      <MultiChips label="Estratégia" field="estrategia" form={form} set={setField} options={INV_ESTRATEGIA_OPTS} />
    </Section>

    {/* 3. Preferências de Investimento */}
    <Section icon={Home} title="Preferências de Investimento" fields={sec.preferencias} form={form} defaultOpen>
      <MultiChips label="Tipo de Imóvel" field="tipo_imovel_preferido" form={form} set={setField} options={INV_TIPO_IMOVEL_OPTS} />
      <MultiChips label={isAtivo ? 'Área de Atuação (Distritos)' : 'Localização Preferida'} field="localizacao_preferida" form={form} set={setField} options={INV_DISTRITOS_OPTS} />
      <MultiChips label={isAtivo ? 'Área de Atuação (Regiões)' : 'Regiões Preferidas'} field="regioes_preferidas" form={form} set={setField} options={INV_REGIOES_OPTS} />
      <EF label="Experiência" field="experiencia_imobiliario" form={form} set={setField} type="select" options={INV_EXPERIENCIA_OPTS} />
      <EF label="Equipa de Obras" field="equipa_obras" form={form} set={setField} type="select" options={INV_EQUIPA_OBRAS_OPTS} />
    </Section>

    {/* 4. Contacto & NDA */}
    <Section icon={Phone} title="Contacto & NDA" fields={sec.contacto} form={form}>
      <EF label="Telemóvel" field="telemovel" form={form} set={setField} />
      <EF label="Email" field="email" form={form} set={setField} />
      <EF label="Preferência de Contacto" field="preferencia_contacto" form={form} set={setField} type="select" options={INV_PREF_CONTACTO_OPTS} />
      <Toggle label="NDA Assinado" field="nda_assinado" form={form} set={setField} />
    </Section>

    {/* 5. Timeline */}
    <Section icon={Calendar} title="Datas" fields={sec.timeline} form={form} defaultOpen>
      <EF label="1º Contacto" field="data_primeiro_contacto" form={form} set={setField} type="date" />
      <EF label="Data Reunião" field="data_reuniao" form={form} set={setField} type="date" />
      <EF label="Último Contacto" field="data_ultimo_contacto" form={form} set={setField} type="date" />
    </Section>

    {/* 7. Reinvestimento / Churn — declaração explícita de saída */}
    <Section icon={Repeat} title="Reinvestimento" fields={['nao_reinveste','data_nao_reinveste']} form={form} defaultOpen>
      <label className="flex items-center gap-2 col-span-2 md:col-span-3 cursor-pointer">
        <input type="checkbox" checked={!!form.nao_reinveste}
          onChange={e => {
            const v = e.target.checked
            setField('nao_reinveste', v ? 1 : 0)
            if (v && !form.data_nao_reinveste) setField('data_nao_reinveste', new Date().toISOString().slice(0, 10))
            if (!v) setField('data_nao_reinveste', null)
          }}
          className="w-4 h-4 rounded border-line text-warning focus:ring-yellow-400" />
        <span className="text-sm text-ink">Declarou que <strong>não vai reinvestir</strong> connosco (conta para churn)</span>
      </label>
      {!!form.nao_reinveste && (
        <EF label="Data da declaração" field="data_nao_reinveste" form={form} set={setField} type="date" />
      )}
    </Section>

    {/* 8. Bloqueios — só se já tem dados ou se status sugere */}
    {(temBloqueios || form.motivo_nao_aprovacao || form.motivo_inatividade) && (
      <Section icon={AlertTriangle} title="Bloqueios / Excepções" fields={sec.bloqueios} form={form} defaultOpen>
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
  const regioes = parseJsonArray(data.regioes_preferidas)
  const isAtivo = parseJsonArray(data.tipo_principal).includes('Ativo')
  const labelLocalizacao = isAtivo ? 'Área de Atuação (Distritos)' : 'Localização'
  const sec = {
    identificacao: ['nome','ref_investidor','tipo_principal','status','classificacao','origem','data_primeiro_contacto'],
    capital:       ['capital_min','capital_max','estrategia','perfil_risco','roi_pretendido','roi_anualizado_pretendido','origem_capital','montante_investido'],
    preferencias:  ['tipo_imovel_preferido','localizacao_preferida','regioes_preferidas','experiencia_imobiliario','equipa_obras'],
    contacto:      ['telemovel','email','preferencia_contacto','nda_assinado'],
    timeline:      ['data_primeiro_contacto','data_reuniao','data_ultimo_contacto'],
    bloqueios:     ['motivo_nao_aprovacao','motivo_inatividade'],
  }
  return <>
    {/* 1. Identificação */}
    <Section icon={ClipboardList} title="Identificação & Status" fields={sec.identificacao} form={data} defaultOpen>
      <Field label="REF Investidor" value={data.ref_investidor || '—'} />
      <Field label="Status" value={data.status} />
      <div>
        <p className="text-xs text-ink-muted">Classificação</p>
        <div className="text-sm font-medium text-ink flex items-center gap-2">
          <InvClassBadge cls={data.classificacao} />
          {data.pontuacao > 0 && <span className="text-xs text-ink-muted">({data.pontuacao} pts)</span>}
        </div>
      </div>
      <Field label="Origem" value={data.origem} />
      <Field label="1º Contacto" value={data.data_primeiro_contacto ? fmtDate(data.data_primeiro_contacto) : '—'} />
    </Section>

    {/* 2. Capital & Estratégia */}
    <Section icon={Briefcase} title="Capital & Estratégia" fields={sec.capital} form={data} defaultOpen>
      <Field label="Capital Min" value={data.capital_min > 0 ? `€${Number(data.capital_min).toLocaleString('pt-PT')}` : '—'} />
      <Field label="Capital Max" value={data.capital_max > 0 ? `€${Number(data.capital_max).toLocaleString('pt-PT')}` : '—'} />
      <Field label="Perfil Risco" value={data.perfil_risco} />
      <Field label="ROI Previsto" value={data.roi_pretendido} />
      <Field label="ROI Anualizado Previsto" value={data.roi_anualizado_pretendido} />
      <Field label="Origem Capital" value={data.origem_capital} />
      <Field label="Montante Investido" value={data.montante_investido > 0 ? `€${Number(data.montante_investido).toLocaleString('pt-PT')}` : '—'} />
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-ink-muted mb-1">Estratégia</p>
        {estrategia.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {estrategia.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-surface-muted border border-line text-ink">{s}</span>)}
          </div>
        ) : <p className="text-sm text-ink-muted">—</p>}
      </div>
    </Section>

    {/* 3. Preferências */}
    <Section icon={Home} title="Preferências de Investimento" fields={sec.preferencias} form={data} defaultOpen>
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-ink-muted mb-1">Tipo de Imóvel</p>
        {tipoImovel.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tipoImovel.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-warning/10 border border-warning/30 text-warning">{s}</span>)}
          </div>
        ) : <p className="text-sm text-ink-muted">{data.tipo_imovel_preferido || '—'}</p>}
      </div>
      <div className="col-span-2 md:col-span-3">
        <p className="text-xs text-ink-muted mb-1">{labelLocalizacao}</p>
        {localizacao.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {localizacao.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-surface-muted border border-line text-ink">{s}</span>)}
          </div>
        ) : <p className="text-sm text-ink-muted">{data.localizacao_preferida || '—'}</p>}
      </div>
      {(isAtivo || regioes.length > 0) && (
        <div className="col-span-2 md:col-span-3">
          <p className="text-xs text-ink-muted mb-1">{isAtivo ? 'Área de Atuação (Regiões)' : 'Regiões Preferidas'}</p>
          {regioes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {regioes.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-surface-muted border border-line text-ink">{s}</span>)}
            </div>
          ) : <p className="text-sm text-ink-muted">—</p>}
        </div>
      )}
      <Field label="Experiência" value={data.experiencia_imobiliario} />
      <Field label="Equipa Obras" value={data.equipa_obras} />
    </Section>

    {/* 4. Contacto */}
    <Section icon={Phone} title="Contacto & NDA" fields={sec.contacto} form={data}>
      <Field label="Telemóvel" value={data.telemovel} />
      <Field label="Email" value={data.email} />
      <Field label="Pref. Contacto" value={data.preferencia_contacto} />
      <Field label="NDA" value={data.nda_assinado ? '✓ Assinado' : 'Não'} />
    </Section>

    {/* 5. Timeline */}
    <Section icon={Calendar} title="Datas" fields={sec.timeline} form={data} defaultOpen>
      <InvestidorTimeline data={data} />
    </Section>

    {/* 7. Bloqueios — só se preenchido */}
    {(data.motivo_nao_aprovacao || data.motivo_inatividade) && (
      <Section icon={AlertTriangle} title="Bloqueios / Excepções" fields={sec.bloqueios} form={data} defaultOpen>
        {data.motivo_nao_aprovacao && <Field label="Motivo Não Aprovação" value={data.motivo_nao_aprovacao} />}
        {data.motivo_inatividade && <Field label="Motivo Inatividade" value={data.motivo_inatividade} />}
      </Section>
    )}
  </>
}

// ── Scorecard Tab (Discovery Call — SOP 2) ────────────────────
const CRITERIOS_INFO = {
  c1: { label: 'Capacidade Financeira', icon: Wallet },
  c2: { label: 'Experiência Imobiliária', icon: Briefcase },
  c3: { label: 'Alinhamento Estratégico', icon: Target },
  c4: { label: 'Estabilidade e Credibilidade', icon: ShieldCheck },
  c5: { label: 'Disponibilidade e Compromisso', icon: Timer },
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
        { pergunta: 'Só para calibrar: quanto acha que custaria remodelar um T2 com 80m² em zona urbana (Coimbra, Porto ou Gaia)? Cozinha e casas de banho novas, pavimento, pintura, canalização.', extrai: 'TESTE DE CONHECIMENTO REAL. Resposta razoável: €35k-€55k. Se diz €15k ou €100k → desfasado do mercado. A precisão da estimativa revela experiência operacional.' },
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
  A: { bg: 'bg-success/15', text: 'text-success', border: 'border-success/30', bar: 'bg-success' },
  B: { bg: 'bg-surface-muted', text: 'text-ink', border: 'border-line', bar: 'bg-blue-500' },
  C: { bg: 'bg-warning/15', text: 'text-warning', border: 'border-warning/30', bar: 'bg-warning' },
  D: { bg: 'bg-danger/15', text: 'text-danger', border: 'border-danger/30', bar: 'bg-danger' },
}

// Wrapper que une Scorecard (avaliação SOP 2) e Histórico de Classificação numa
// única tab, com sub-tabs internos.
function AvaliacaoTab({ data, onUpdate }) {
  const [sub, setSub] = useState('scorecard')
  const tipoInvestidor = (() => { try { const t = JSON.parse(data.tipo_investidor || '[]'); return t.includes('Ativo') ? 'Ativo' : 'Passivo' } catch { return 'Passivo' } })()
  return (
    <div>
      <div className="flex border-b border-line px-4 sm:px-6 pt-3 bg-surface" role="tablist">
        {[
          { key: 'scorecard', label: 'Scorecard', icon: Gauge },
          { key: 'historico',  label: 'Histórico', icon: History },
        ].map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            role="tab" aria-selected={sub === s.key}
            className={`relative px-4 py-2 text-ui font-medium transition-colors duration-fast whitespace-nowrap ${sub === s.key ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}>
            <s.icon className="w-4 h-4 mr-1.5 inline-block align-[-3px]" />{s.label}
            {sub === s.key && <motion.span layoutId="avaliacao-sub" transition={tabIndicatorTransition} className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
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
  const toast = useToast()
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
      apiFetchJson(`/api/crm/scorecards/${investidorId}`),
      apiFetchJson('/api/crm/scorecards/rubrica'),
    ]).then(([sc, rb]) => {
      setScorecards(sc)
      setRubrica(rb)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [investidorId])

  const pesos = rubrica?.pesos?.[tipo] || { c1: 0.20, c2: 0.10, c3: 0.30, c4: 0.20, c5: 0.20 }

  // Calcular preview em tempo real
  const previewTotal = form.c1_score + form.c2_score + form.c3_score + form.c4_score + form.c5_score
  const previewPonderado = Math.round((form.c1_score * pesos.c1 + form.c2_score * pesos.c2 + form.c3_score * pesos.c3 + form.c4_score * pesos.c4 + form.c5_score * pesos.c5) * 20 * 100) / 100
  const previewClasse = previewPonderado >= 88 ? 'A' : previewPonderado >= 72 ? 'B' : previewPonderado >= 56 ? 'C' : 'D'

  async function saveScorecard() {
    setSaving(true)
    try {
      await apiFetchJson('/api/crm/scorecards', {
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
      setCreating(false)
      setForm({ c1_score: 3, c2_score: 3, c3_score: 3, c4_score: 3, c5_score: 3, c1_notas: '', c2_notas: '', c3_notas: '', c4_notas: '', c5_notas: '' })
      const sc = await apiFetchJson(`/api/crm/scorecards/${investidorId}`)
      setScorecards(sc)
      if (onUpdate) onUpdate()
    } catch (e) { toast(e.message || 'Erro ao guardar scorecard', 'error') }
    setSaving(false)
  }

  if (loading) return <div className="text-center text-ink-muted py-8">A carregar...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Scorecard Discovery Call</h3>
          <p className="text-xs text-ink-muted">Avaliação SOP 2 — 5 critérios ponderados por tipo de investidor</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowScript(!showScript); setScriptStep(0) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${showScript ? 'bg-brand-dark text-white' : 'bg-surface-muted text-ink-muted hover:bg-line'}`}>
            {showScript ? 'Fechar Script' : 'Script da Call'}
          </button>
          {!creating && !showScript && (
            <button onClick={() => setCreating(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:brightness-[1.04]">
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
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            {/* Script header + tipo selector */}
            <div className="px-5 py-3 border-b border-line flex items-center justify-between bg-brand-dark">
              <div className="flex items-center gap-3">
                <span className="text-white text-sm font-bold">Script Discovery Call</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-gold text-ink font-medium">{investidorNome}</span>
              </div>
              <div className="flex gap-1">
                {['Passivo', 'Ativo'].map(t => (
                  <button key={t} onClick={() => setTipo(t)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition ${tipo === t ? 'bg-brand-gold text-ink' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Step navigation */}
            <div className="px-5 py-2 border-b border-line flex gap-1 overflow-x-auto">
              {stepLabels.map((label, i) => (
                <button key={i} onClick={() => setScriptStep(i)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${
                    scriptStep === i ? 'bg-brand-dark text-white' : 'bg-surface-raised text-ink-muted hover:bg-surface-muted'
                  }`}>
                  {i > 0 && i < totalSteps - 1 ? `${i}. ` : ''}{label}
                </button>
              ))}
            </div>

            {/* Step content */}
            <div className="p-5">
              {scriptStep === 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-ink">Introdução</h4>
                  <div className="rounded-lg bg-surface-raised border border-line p-4">
                    <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{script.intro.replace(/\[Nome\]/g, investidorNome.split(' ')[0])}</p>
                  </div>
                  <p className="text-[10px] text-ink-muted">Tom: profissional mas acessível. Objetivo: criar confiança e alinhar expectativas.</p>
                </div>
              )}

              {scriptStep >= 1 && scriptStep <= 5 && (() => {
                const ck = criterioKeys[scriptStep - 1]
                const bloco = script[ck]
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      {(() => { const I = CRITERIOS_INFO[ck].icon; return <I className="w-5 h-5 text-brand-gold shrink-0" /> })()}
                      <h4 className="text-sm font-bold text-ink">{bloco.label}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent-ink font-medium">Critério {scriptStep}/5</span>
                    </div>

                    {/* Contexto */}
                    <div className="rounded-lg bg-surface-muted border border-line p-3">
                      <p className="text-[10px] uppercase text-ink-muted font-semibold tracking-wide mb-1">Contexto (não ler em voz alta)</p>
                      <p className="text-xs text-ink">{bloco.contexto}</p>
                    </div>

                    {/* Perguntas */}
                    <div className="space-y-3">
                      <p className="text-[10px] uppercase text-ink-muted font-semibold tracking-wide">Perguntas a fazer</p>
                      {bloco.perguntas.map((p, i) => (
                        <div key={i} className="rounded-lg bg-surface-raised border border-line hover:border-brand-gold transition overflow-hidden">
                          <div className="flex gap-3 items-start p-3 pb-2">
                            <span className="text-xs font-bold text-brand-gold shrink-0 mt-0.5">{i + 1}.</span>
                            <p className="text-sm text-ink leading-relaxed font-medium">"{p.pergunta.replace(/\[Nome\]/g, investidorNome.split(' ')[0])}"</p>
                          </div>
                          <div className="px-3 pb-3 pl-8">
                            <div className="flex items-start gap-1.5 rounded bg-warning/10 px-2.5 py-1.5">
                              <span className="text-[10px] text-warning shrink-0 mt-px">EXTRAI:</span>
                              <p className="text-[11px] text-warning leading-snug">{p.extrai}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Red flags */}
                    <div className="rounded-lg bg-danger/10 border border-danger/30 p-3">
                      <p className="text-[10px] uppercase text-danger font-semibold tracking-wide mb-1.5">Red Flags (atenção a)</p>
                      <div className="space-y-1">
                        {bloco.red_flags.map((rf, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-danger">
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
                  <h4 className="text-sm font-bold text-ink">Fecho e Próximos Passos</h4>
                  <div className="rounded-lg bg-surface-raised border border-line p-4">
                    <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{script.fecho.replace(/\[Nome\]/g, investidorNome.split(' ')[0])}</p>
                  </div>
                  <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                    <p className="text-[10px] uppercase text-success font-semibold tracking-wide mb-1">Após a call</p>
                    <div className="space-y-1 text-xs text-success">
                      <p>1. Preencher o Scorecard com base nas respostas (botão abaixo)</p>
                      <p>2. Enviar resumo por email ao investidor dentro de 24h</p>
                      <p>3. Atualizar status no CRM para "Follow Up" ou "Investidor Qualificado em Carteira"</p>
                      <p>4. Se Classe A/B: agendar apresentação de oportunidade</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Script navigation */}
            <div className="px-5 py-3 border-t border-line flex items-center justify-between">
              <button onClick={() => setScriptStep(Math.max(0, scriptStep - 1))} disabled={scriptStep === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted text-ink-muted hover:bg-line disabled:opacity-30 disabled:cursor-not-allowed">
                Anterior
              </button>
              <span className="text-[10px] text-ink-muted">{scriptStep + 1} / {totalSteps}</span>
              {scriptStep < totalSteps - 1 ? (
                <button onClick={() => setScriptStep(scriptStep + 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:brightness-[1.04]">
                  Seguinte
                </button>
              ) : (
                <button onClick={() => { setShowScript(false); setCreating(true) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-ink text-surface hover:opacity-90">
                  Preencher Scorecard
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* Formulário de criação */}
      {creating && (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-ink">Nova Avaliação — {investidorNome}</h4>
            <button onClick={() => setCreating(false)} className="text-ink-muted hover:text-ink-muted"><X className="w-4 h-4" /></button>
          </div>

          {/* Tipo investidor */}
          <div className="flex gap-2">
            {['Passivo', 'Ativo'].map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${tipo === t ? 'bg-brand-dark text-white' : 'bg-surface-muted text-ink-muted hover:bg-line'}`}>
                {t}
              </button>
            ))}
            <span className="text-[10px] text-ink-muted self-center ml-2">Pesos ajustados automaticamente</span>
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
                <div key={c} className="rounded-lg border border-line bg-surface-raised p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <info.icon className="w-4 h-4 text-brand-gold shrink-0" />
                      <span className="text-sm font-semibold text-ink">{info.label}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-muted text-ink-muted font-medium">
                      Peso: {Math.round(peso * 100)}%
                    </span>
                  </div>

                  {/* Score selector */}
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(v => (
                      <button key={v} onClick={() => setForm(f => ({ ...f, [`${c}_score`]: v }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                          score === v ? 'bg-brand-dark text-white shadow-sm' : 'bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink-muted'
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
                    className="w-full px-3 py-2 rounded-lg border border-line text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-none"
                  />
                </div>
              )
            })}
          </div>

          {/* Preview resultado */}
          <div className="rounded-lg border border-line bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase text-ink-muted tracking-wide">Resultado Previsto</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-2xl font-black ${CLASSE_CORES[previewClasse]?.text || 'text-ink'}`}>
                    Classe {previewClasse}
                  </span>
                  <span className="text-sm text-ink-muted">{previewPonderado}/100 pts</span>
                </div>
              </div>
              <div className="text-right num">
                <p className="text-[10px] text-ink-muted">Total bruto: {previewTotal}/25</p>
                <p className="text-[10px] text-ink-muted">A ≥88 | B ≥72 | C ≥56 | D &lt;56</p>
              </div>
            </div>

            {/* Barra visual por critério */}
            <div className="mt-3 space-y-1">
              {['c1', 'c2', 'c3', 'c4', 'c5'].map(c => {
                const s = form[`${c}_score`]
                const p = pesos[c]
                return (
                  <div key={c} className="flex items-center gap-2">
                    <span className="w-8 flex text-ink-muted">{(() => { const I = CRITERIOS_INFO[c].icon; return <I className="w-3.5 h-3.5" /> })()}</span>
                    <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] ${CLASSE_CORES[previewClasse]?.bar || 'bg-ink/40'}`}
                        style={{ width: `${(s / 5) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-ink-muted w-12 text-right num">{s}/5 ({Math.round(p * 100)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg text-xs text-ink-muted bg-surface-muted hover:bg-line">
              Cancelar
            </button>
            <button onClick={saveScorecard} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
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
              <div key={sc.id} className={`rounded-xl border ${cores.border} p-4 ${idx === 0 ? cores.bg : 'bg-surface-raised'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-black ${cores.text}`}>Classe {sc.classificacao}</span>
                    <span className="text-xs text-ink-muted">{sc.pontuacao_ponderada}/100 pts</span>
                    {idx === 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-dark text-white font-medium">Atual</span>}
                  </div>
                  <div className="text-right num">
                    <p className="text-xs text-ink-muted">{new Date(sc.created_at).toLocaleDateString('pt-PT')}</p>
                    <p className="text-[10px] text-ink-muted">{sc.tipo_investidor} · {sc.fonte === 'transcricao_automatica' ? 'Via transcrição' : sc.fonte === 'manual' ? 'Manual' : sc.fonte}</p>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {['c1', 'c2', 'c3', 'c4', 'c5'].map(c => (
                    <div key={c} className="text-center">
                      <p className="flex justify-center text-ink-muted">{(() => { const I = CRITERIOS_INFO[c].icon; return <I className="w-3.5 h-3.5" /> })()}</p>
                      <p className="text-sm font-bold text-ink">{sc[`${c}_score`]}</p>
                      {sc[`${c}_notas`] && (
                        <p className="text-[9px] text-ink-muted mt-1 line-clamp-2">{sc[`${c}_notas`]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : !creating && (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <Target className="w-6 h-6 mx-auto mb-2 text-ink-muted" />
          <p className="text-sm text-ink-muted">Sem scorecards registados</p>
          <p className="text-xs text-ink-muted mt-1">Cria um scorecard após a Discovery Call ou analisa uma transcrição de reunião</p>
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

  const toast = useToast()

  useEffect(() => {
    apiFetchJson(`/api/crm/classificacao-historico/${investidorId}`)
      .then(setHistorico)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [investidorId])

  async function triggerReclassificacao() {
    setReclassificando(true)
    try {
      await apiFetch('/api/crm/automation/reclassificar-investidores', { method: 'POST' })
      const h = await apiFetchJson(`/api/crm/classificacao-historico/${investidorId}`)
      setHistorico(h)
    } catch (e) { toast(e.message || 'Erro ao reclassificar', 'error') }
    setReclassificando(false)
  }

  if (loading) return <div className="text-center text-ink-muted py-8">A carregar...</div>

  const coresActual = CLASSE_CORES[classificacaoActual] || CLASSE_CORES.D

  return (
    <div className="space-y-6">
      {/* Estado actual */}
      <div className={`rounded-xl border ${coresActual.border} ${coresActual.bg} p-5`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase text-ink-muted tracking-wide">Classificação Atual</p>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-3xl font-black ${coresActual.text}`}>
                {classificacaoActual || '—'}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{pontuacaoActual || 0}/100 pts</p>
                <p className="text-xs text-ink-muted">
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
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted text-ink-muted hover:bg-line disabled:opacity-50">
            {reclassificando ? 'A processar...' : 'Reavaliar agora'}
          </button>
        </div>
      </div>

      {/* Regras de follow-up */}
      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <h4 className="text-sm font-semibold text-ink mb-3">Ciclo de Follow-Up e Reclassificação</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-success/10 p-3 border border-success/30 text-center">
            <p className="text-lg font-bold text-success">30d</p>
            <p className="text-[10px] text-success font-medium">Follow-up quente</p>
            <p className="text-[10px] text-ink-muted">Sem penalização</p>
          </div>
          <div className="rounded-lg bg-warning/10 p-3 border border-warning/30 text-center">
            <p className="text-lg font-bold text-warning">60d</p>
            <p className="text-[10px] text-warning font-medium">Follow-up intermédio</p>
            <p className="text-[10px] text-ink-muted">-5 a -10 pts</p>
          </div>
          <div className="rounded-lg bg-danger/10 p-3 border border-danger/30 text-center">
            <p className="text-lg font-bold text-danger">90d</p>
            <p className="text-[10px] text-danger font-medium">Follow-up frio</p>
            <p className="text-[10px] text-ink-muted">-15 a -25 pts</p>
          </div>
        </div>
        <p className="text-[10px] text-ink-muted mt-2">
          Bónus: NDA assinado (+5), montante investido (+10), negócios ativos (+10).
          Classe C sem evolução em 180 dias → sugestão de arquivo.
        </p>
      </div>

      {/* Timeline de classificação */}
      <div>
        <h4 className="text-sm font-semibold text-ink mb-3">Histórico de Classificação</h4>
        {historico.length > 0 ? (
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-line" />
            <div className="space-y-4">
              {historico.map((h, idx) => {
                const coresNova = CLASSE_CORES[h.classificacao_nova] || CLASSE_CORES.D
                const subiu = h.classificacao_anterior && h.classificacao_nova < h.classificacao_anterior
                const desceu = h.classificacao_anterior && h.classificacao_nova > h.classificacao_anterior
                return (
                  <div key={h.id} className="relative pl-8">
                    <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${coresNova.border} ${idx === 0 ? coresNova.bg : 'bg-surface-raised'}`} />
                    <div className="rounded-lg border border-line bg-surface-raised p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {h.classificacao_anterior ? (
                            <span className="text-xs">
                              <span className="font-semibold text-ink-muted">{h.classificacao_anterior}</span>
                              <span className="mx-1">{subiu ? '→' : desceu ? '→' : '→'}</span>
                              <span className={`font-bold ${coresNova.text}`}>{h.classificacao_nova}</span>
                              {subiu && <span className="ml-1 text-success">▲</span>}
                              {desceu && <span className="ml-1 text-danger">▼</span>}
                            </span>
                          ) : (
                            <span className={`text-xs font-bold ${coresNova.text}`}>
                              → {h.classificacao_nova} (primeira classificação)
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-muted text-ink-muted">
                            {h.pontuacao_anterior ? `${h.pontuacao_anterior} → ` : ''}{h.pontuacao_nova} pts
                          </span>
                        </div>
                        <span className="text-[10px] text-ink-muted">{new Date(h.created_at).toLocaleDateString('pt-PT')}</span>
                      </div>
                      <p className="text-xs text-ink-muted mt-1">{h.motivo}</p>
                      <p className="text-[10px] text-ink-muted mt-0.5">
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
          <div className="rounded-xl border border-dashed border-line p-6 text-center">
            <p className="text-sm text-ink-muted">Sem histórico de classificação</p>
            <p className="text-xs text-ink-muted/70 mt-1">O histórico é criado automaticamente quando um scorecard é preenchido ou na reclassificação periódica</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniField({ label, value, highlight }) {
  return (
    <div className={`px-2 py-1.5 rounded-lg ${highlight ? 'bg-warning/10 border border-warning/30' : 'bg-surface-raised border border-line'}`}>
      <p className="text-[10px] text-ink-muted uppercase">{label}</p>
      <p className={`text-xs font-semibold ${highlight ? 'text-warning' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

