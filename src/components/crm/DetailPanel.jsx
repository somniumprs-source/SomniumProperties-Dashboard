/**
 * Painel de detalhe para Imóveis, Investidores, Consultores.
 * Mostra: campos editáveis + relações + timeline + tarefas + reuniões.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { FileDown, ChevronDown, ChevronUp, Phone, Clock, FileText, Pencil, Save, X, ArrowLeft, Link2, Check, PhoneCall } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { PartilharAcesso } from '../PartilharAcesso.jsx'
import { AnaliseTab } from '../analise/AnaliseTab.jsx'
import { InteracoesTab } from './InteracoesTab.jsx'
import { FollowUpsSection } from './FollowUpsSection.jsx'
import { WhatsAppTab } from './WhatsAppTab.jsx'
import { FicheirosTab } from './FicheirosTab.jsx'
import { ChecklistTab } from './ChecklistTab.jsx'
import { DocumentosInvestidorTab } from './DocumentosInvestidorTab.jsx'
import { ImovelInteracoesSection } from './ImovelInteracoesSection.jsx'
import { supabase } from '../../lib/supabase.js'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)

const ACAO_LABEL = { INSERT: 'Criado', UPDATE: 'Atualizado', DELETE: 'Apagado' }
const ACAO_COLOR = { INSERT: 'text-green-600', UPDATE: 'text-blue-600', DELETE: 'text-red-600' }

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
  resumo_acordo: 'Resumo Acordo',
  ficha_follow_up: 'Ficha Follow-Up',
  ficha_cedencia: 'Ficha Cedência',
  ficha_acompanhamento_obra: 'Ficha Acompanhamento Obra',
  ficha_descarte: 'Ficha de Descarte',
}
const ESTADO_DOCS = {
  'Adicionado': ['ficha_imovel'], 'Pré-aprovação': ['ficha_imovel'],
  'Necessidade de Visita': ['ficha_visita'],
  'Estudo de VVR': ['analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário': ['proposta_formal'], 'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Em negociação': ['resumo_negociacao'], 'Proposta aceite': ['resumo_acordo'],
  'Enviar proposta ao investidor': ['dossier_investidor', 'proposta_investimento_anonima'],
  'Follow Up após proposta': ['ficha_follow_up'], 'Follow UP': ['ficha_follow_up'],
  'Wholesaling': ['ficha_cedencia'], 'CAEP': ['ficha_acompanhamento_obra'], 'Fix and Flip': ['ficha_acompanhamento_obra'],
  'Não interessa': ['ficha_descarte'],
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
  { key: 'aceite',       label: 'Proposta Aceite',     estados: ['Proposta aceite'],
    docs: [{ tipo: 'resumo_acordo', label: 'Resumo de Acordo', compilavel: 'resumo_acordo' }] },
  { key: 'investidor',   label: 'Investidor',          estados: ['Enviar proposta ao investidor'],
    docs: [
      { tipo: 'dossier_investidor',            label: 'Dossier de Investimento',            compilavel: 'dossier_investidor' },
      { tipo: 'proposta_investimento_anonima', label: 'Proposta de Investimento (Anónima)', compilavel: 'proposta_investimento_anonima' },
    ] },
  { key: 'followup',     label: 'Follow Up',           estados: ['Follow Up após proposta', 'Follow UP'],
    docs: [{ tipo: 'ficha_follow_up', label: 'Ficha de Follow Up', compilavel: 'ficha_follow_up' }] },
  { key: 'wholesaling',  label: 'Wholesaling',         estados: ['Wholesaling'],
    docs: [{ tipo: 'ficha_cedencia', label: 'Ficha de Cedência', compilavel: 'ficha_cedencia' }] },
  { key: 'obra',         label: 'CAEP / Fix & Flip',   estados: ['CAEP', 'Fix and Flip'],
    docs: [{ tipo: 'ficha_acompanhamento_obra', label: 'Acompanhamento de Obra', compilavel: 'ficha_acompanhamento_obra' }] },
  { key: 'descarte',     label: 'Descartado',          estados: ['Não interessa', 'Nao interessa', 'Descartado'],
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
              <a href={`/api/crm/imoveis/${imovelId}/documento/${d.tipo}`} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors shrink-0 opacity-50 group-hover:opacity-100">
                Abrir
              </a>
            </div>
          )
        })}
      </div>

      {/* Barra fixa em baixo — gerar dossier */}
      <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
        selectedDocs.length > 0 ? 'border-[#C9A84C] bg-[#faf8f2]' : 'border-neutral-200 bg-neutral-50'
      }`}>
        <div>
          <p className="text-sm font-bold text-neutral-800">
            {selectedDocs.length > 0 ? `${selectedDocs.length} documento${selectedDocs.length > 1 ? 's' : ''} seleccionado${selectedDocs.length > 1 ? 's' : ''}` : 'Nenhum documento seleccionado'}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">O dossier compilado inclui capa profissional e índice</p>
        </div>
        {compilarUrl ? (
          <a href={compilarUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white shadow-sm hover:shadow transition-all"
            style={{ backgroundColor: '#C9A84C' }}>
            <FileDown className="w-4 h-4" /> Gerar Dossier
          </a>
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
    // Validação: imóvel em Follow Up / Não interessa exige motivo
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
    { key: 'detalhe', label: 'Detalhe', icon: '📋', show: true },
    { key: 'ficheiros', label: 'Ficheiros', icon: '📷', show: type === 'Imóveis' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '📱', show: type === 'Consultores' },
    { key: 'interacoes', label: `Interacções (${data?.interacoes?.length ?? 0})`, icon: '💬', show: type === 'Consultores' },
    { key: 'checklist', label: 'Checklist', icon: '📋', show: type === 'Imóveis' },
    { key: 'analise', label: 'Análise Financeira', icon: '📊', show: type === 'Imóveis' },
    { key: 'relatorios_imovel', label: 'Documentos', icon: '📄', show: type === 'Imóveis' },
    { key: 'documentos', label: `Documentos (${data?.documentos?.length ?? 0})`, icon: '📎', show: type === 'Investidores' },
    { key: 'relatorios', label: `Reuniões (${reunioes.length})`, icon: '📄', show: (type === 'Investidores' || type === 'Consultores') },
    { key: 'scorecard', label: 'Scorecard', icon: '🎯', show: type === 'Investidores' },
    { key: 'classificacao', label: 'Classificação', icon: '📈', show: type === 'Investidores' },
  ].filter(t => t.show)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
      {type === 'Consultores' && activeTab === 'whatsapp' ? (
        <WhatsAppTab consultorId={data.id} consultorNome={data.nome} controloManual={data.controlo_manual} onUpdate={loadData} />

      ) : type === 'Consultores' && activeTab === 'interacoes' ? (
        <div className="p-4 sm:p-6">
          <InteracoesTab consultorId={data.id} onUpdate={loadData} controloManual={data.controlo_manual}
            autoOpenForm={openContactoForm} onAutoOpenConsumed={() => setOpenContactoForm(false)} />
        </div>

      ) : type === 'Imóveis' && activeTab === 'checklist' ? (
        <ChecklistTab imovel={data} onUpdate={loadData} />

      ) : type === 'Imóveis' && activeTab === 'analise' ? (
        <div className="p-4 sm:p-6">
          <AnaliseTab imovelId={data.id} imovelNome={data.nome} />
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

      /* Scorecard Discovery Call (Investidores) */
      ) : type === 'Investidores' && activeTab === 'scorecard' ? (
        <div className="p-4 sm:p-6">
          <ScorecardTab investidorId={data.id} investidorNome={data.nome} tipoInvestidor={(() => { try { const t = JSON.parse(data.tipo_investidor || '[]'); return t.includes('Ativo') ? 'Ativo' : 'Passivo' } catch { return 'Passivo' } })()} onUpdate={loadData} />
        </div>

      /* Histórico de Classificação (Investidores) */
      ) : type === 'Investidores' && activeTab === 'classificacao' ? (
        <div className="p-4 sm:p-6">
          <ClassificacaoTab investidorId={data.id} investidorNome={data.nome} classificacaoActual={data.classificacao} pontuacaoActual={data.pontuacao} />
        </div>

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
                <EF label="Nome" field="nome" form={form} set={setField} />
                <EF label="Estado" field="estado" form={form} set={setField} type="select" options={['Pré-aprovação','Adicionado','Chamada Não Atendida','Pendentes','Necessidade de Visita','Visita Marcada','Estudo de VVR','Criar Proposta ao Proprietário','Enviar proposta ao Proprietário','Em negociação','Proposta aceite','Enviar proposta ao investidor','Follow Up após proposta','Follow UP','Wholesaling','CAEP','Fix and Flip','Não interessa']} />
                <EF label="Ask Price (€)" field="ask_price" form={form} set={setField} type="number" />
                <EF label="Valor Proposta (€)" field="valor_proposta" form={form} set={setField} type="number" />
                <EF label="VVR (€)" field="valor_venda_remodelado" form={form} set={setField} type="number" />
                <EF label="Custo Obra (€)" field="custo_estimado_obra" form={form} set={setField} type="number" />
                <EF label="Tipologia" field="tipologia" form={form} set={setField} />
                <EF label="ABP — Área Bruta Privativa (m²)" field="area_bruta" form={form} set={setField} type="number" />
                <EF label="ABD — Área Bruta Dependente (m²)" field="area_bruta_dependente" form={form} set={setField} type="number" />
                <EF label="Área Útil (m²)" field="area_util" form={form} set={setField} type="number" />
                <EF label="Zona" field="zona" form={form} set={setField} />
                <EF label="Modelo de Negócio" field="modelo_negocio" form={form} set={setField} type="select" options={['Wholesaling','Fix & Flip','CAEP','Mediação']} />
                <EF label="Origem" field="origem" form={form} set={setField} type="select" options={['Pesquisa em portais/sites','Referência por consultores','Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro']} />
                <EF label="Consultor" field="nome_consultor" form={form} set={setField} />
                <EF label="Link" field="link" form={form} set={setField} />
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
                  <label className="text-xs text-gray-400 block mb-1">Motivo Não Interessa</label>
                  <textarea value={form.motivo_nao_interessa || ''} onChange={e => setField('motivo_nao_interessa', e.target.value)} rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Notas</label>
                  <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Pontos fortes</label>
                  <textarea value={form.pontos_fortes || ''} onChange={e => setField('pontos_fortes', e.target.value)} rows={3}
                    placeholder="Um por linha. Aparece no relatório enviado ao investidor."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Pontos fracos</label>
                  <textarea value={form.pontos_fracos || ''} onChange={e => setField('pontos_fracos', e.target.value)} rows={3}
                    placeholder="Um por linha. Aparece no relatório enviado ao investidor."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Riscos</label>
                  <textarea value={form.riscos || ''} onChange={e => setField('riscos', e.target.value)} rows={3}
                    placeholder="Um por linha. Aparece no relatório enviado ao investidor."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Imagem de localização (print do Google Maps)</label>
                  {form.localizacao_imagem ? (
                    <div className="flex items-start gap-3">
                      <img src={form.localizacao_imagem} alt="Localização" className="w-64 h-40 object-cover rounded-lg border border-gray-200" />
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
              </> : (() => {
                const analise = data.analises?.find(a => a.activa) || null
                return <>
                <Field label="Estado" value={data.estado?.replace(/^\d+-/, '')} />
                <Field label="Ask Price" value={data.ask_price > 0 ? EUR(data.ask_price) : '—'} />
                <Field label="Valor Proposta" value={data.valor_proposta > 0 ? EUR(data.valor_proposta) : '—'} />
                <Field label="VVR" value={data.valor_venda_remodelado > 0 ? EUR(data.valor_venda_remodelado) : '—'} />
                <Field label="Custo Obra" value={data.custo_estimado_obra > 0 ? EUR(data.custo_estimado_obra) : '—'} />
                <Field label="Zona" value={data.zona} />
                <Field label="Tipologia" value={data.tipologia} />
                <Field label="Modelo" value={data.modelo_negocio} />
                <Field label="Origem" value={data.origem} />
                <Field label="Consultor" value={data.nome_consultor && data.consultores?.[0]?.id ? (
                  <button onClick={() => onNavigate?.('Consultores', data.consultores[0].id)}
                    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors text-left">
                    {data.nome_consultor}
                  </button>
                ) : data.nome_consultor} />
                <Field label="Link" value={data.link ? <a href={data.link} target="_blank" rel="noopener noreferrer" className="text-[#C9A84C] hover:underline truncate block">{data.link === 'OFF MARKET' ? 'OFF MARKET' : 'Ver anúncio'}</a> : '—'} />
                <Field label="ABP" value={data.area_bruta > 0 ? `${data.area_bruta} m²` : '—'} />
                <Field label="ABD" value={data.area_bruta_dependente > 0 ? `${data.area_bruta_dependente} m²` : '—'} />
                <Field label="Área Útil" value={data.area_util > 0 ? `${data.area_util} m²` : '—'} />
                <Field label="Data Adicionado" value={data.data_adicionado} />
                <Field label="Data Chamada" value={data.data_chamada} />
                <Field label="Data Visita" value={data.data_visita} />
                <Field label="Data Proposta" value={data.data_proposta} />
                {(/follow ?up/i.test(data.estado || '')) && <Field label="Data Follow Up" value={data.data_follow_up || '—'} />}
                {(/follow ?up/i.test(data.estado || '')) && (
                  <div className="col-span-2 md:col-span-3"><Field label="Motivo Follow Up" value={data.motivo_follow_up || '—'} /></div>
                )}
                <div className="col-span-2 md:col-span-3"><Field label="Motivo Não Interessa" value={data.motivo_nao_interessa || '—'} /></div>
                {data.notas && <div className="col-span-2 md:col-span-3"><Field label="Notas" value={data.notas} /></div>}
                {data.pontos_fortes && <div className="col-span-2 md:col-span-3"><Field label="Pontos fortes" value={data.pontos_fortes} /></div>}
                {data.pontos_fracos && <div className="col-span-2 md:col-span-3"><Field label="Pontos fracos" value={data.pontos_fracos} /></div>}
                {data.riscos && <div className="col-span-2 md:col-span-3"><Field label="Riscos" value={data.riscos} /></div>}
                {data.localizacao_imagem && (
                  <div className="col-span-2 md:col-span-3">
                    <p className="text-xs text-gray-400 mb-1">Localização</p>
                    <img src={data.localizacao_imagem} alt="Localização" className="w-full max-w-md rounded-lg border border-gray-200" />
                  </div>
                )}

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
              {editing ? <>
                <EF label="Nome" field="nome" form={form} set={setField} />
                <EF label="Tipo" field="tipo_principal" form={form} set={setField} type="select" options={['Passivo','Ativo']} />
                <EF label="Status" field="status" form={form} set={setField} type="select" options={['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor em espera','Investidor em parceria']} />
                <EF label="Classificação" field="classificacao" form={form} set={setField} type="select" options={['A','B','C','D']} />
                <EF label="Origem" field="origem" form={form} set={setField} type="select" options={['Skool','Grupos Whatsapp','Referenciação','LinkedIn','Google Forms','Outro']} />
                <EF label="Capital Min (€)" field="capital_min" form={form} set={setField} type="number" />
                <EF label="Capital Max (€)" field="capital_max" form={form} set={setField} type="number" />
                <EF label="Telemóvel" field="telemovel" form={form} set={setField} />
                <EF label="Email" field="email" form={form} set={setField} />
                <EF label="Perfil Risco" field="perfil_risco" form={form} set={setField} type="select" options={['Conservador','Moderado','Agressivo']} />
                <EF label="Montante Investido (€)" field="montante_investido" form={form} set={setField} type="number" />
                <EF label="ROI Pretendido" field="roi_pretendido" form={form} set={setField} />
                <EF label="Experiência Imobiliária" field="experiencia_imobiliario" form={form} set={setField} />
                <EF label="Localização Preferida" field="localizacao_preferida" form={form} set={setField} />
                <EF label="Tipo Imóvel Preferido" field="tipo_imovel_preferido" form={form} set={setField} />
                <EF label="Equipa de Obras" field="equipa_obras" form={form} set={setField} />
                <EF label="Origem do Capital" field="origem_capital" form={form} set={setField} type="select" options={['Poupança pessoal','Actividade empresarial','Venda de activo','Herança','Outro']} />
                <EF label="Preferência de Contacto" field="preferencia_contacto" form={form} set={setField} type="select" options={['WhatsApp','Chamada','Email','Presencial']} />
                <EF label="Próxima Ação Data" field="data_proxima_acao" form={form} set={setField} type="date" />
                <EF label="Motivo Não Aprovação" field="motivo_nao_aprovacao" form={form} set={setField} />
                <EF label="Motivo Inatividade" field="motivo_inatividade" form={form} set={setField} />
                <div>
                  <p className="text-xs text-gray-400 mb-1">NDA Assinado</p>
                  <input type="checkbox" checked={!!form.nda_assinado} onChange={e => setField('nda_assinado', e.target.checked ? 1 : 0)}
                    className="w-5 h-5 rounded border-gray-300 text-yellow-600" />
                </div>
                <EF label="1º Contacto" field="data_primeiro_contacto" form={form} set={setField} type="date" />
                <EF label="Data Reunião" field="data_reuniao" form={form} set={setField} type="date" />
                <EF label="Último Contacto" field="data_ultimo_contacto" form={form} set={setField} type="date" />
                <EF label="Data Follow Up" field="data_follow_up" form={form} set={setField} type="date" />
                <EF label="Próxima Ação" field="proxima_acao" form={form} set={setField} />
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-400 block mb-1">Notas</label>
                  <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
              </> : <>
                {/* Tipo Investidor — destaque */}
                <div className="col-span-2 md:col-span-3">
                  {(() => {
                    const tipo = data.tipo_principal || 'Passivo'
                    const isAtivo = tipo === 'Ativo'
                    const outroTipo = isAtivo ? 'Passivo' : 'Ativo'
                    return (
                      <div className={`flex items-center justify-between rounded-lg border p-3 ${isAtivo ? 'bg-orange-50 border-orange-200' : 'bg-violet-50 border-violet-200'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-black ${isAtivo ? 'text-orange-700' : 'text-violet-700'}`}>
                            Investidor {tipo}
                          </span>
                          {data.duplicado_de && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Perfil duplo</span>}
                        </div>
                        <button onClick={async () => {
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
                        }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                            isAtivo ? 'border-violet-300 text-violet-700 hover:bg-violet-100' : 'border-orange-300 text-orange-700 hover:bg-orange-100'
                          }`}>
                          + Criar perfil {outroTipo}
                        </button>
                      </div>
                    )
                  })()}
                </div>
                <Field label="Status" value={data.status} />
                <Field label="Classificação" value={data.classificacao} />
                <Field label="Pontuação" value={data.pontuacao} />
                <Field label="Origem" value={data.origem} />
                <Field label="Capital Min" value={data.capital_min > 0 ? EUR(data.capital_min) : '—'} />
                <Field label="Capital Max" value={data.capital_max > 0 ? EUR(data.capital_max) : '—'} />
                <Field label="Telemóvel" value={data.telemovel} />
                <Field label="Email" value={data.email} />
                <Field label="Perfil Risco" value={data.perfil_risco} />
                <Field label="Estratégia" value={(() => { try { return JSON.parse(data.estrategia || '[]').join(', ') } catch { return data.estrategia || '—' } })()} />
                <Field label="NDA" value={data.nda_assinado ? 'Sim' : 'Não'} />
                <Field label="ROI Pretendido" value={data.roi_pretendido} />
                <Field label="Experiência" value={data.experiencia_imobiliario} />
                <Field label="Localização" value={data.localizacao_preferida} />
                <Field label="Tipo Imóvel" value={data.tipo_imovel_preferido} />
                <Field label="Equipa Obras" value={data.equipa_obras} />
                <Field label="Origem Capital" value={data.origem_capital} />
                <Field label="Pref. Contacto" value={data.preferencia_contacto} />
                <Field label="1º Contacto" value={data.data_primeiro_contacto} />
                <Field label="Último Contacto" value={data.data_ultimo_contacto} />
                <Field label="Reunião" value={data.data_reuniao} />
                <Field label="Próxima Ação" value={data.proxima_acao} />
              </>}
            </>}
            {type === 'Consultores' && <>
              {editing ? <>
                <EF label="Nome" field="nome" form={form} set={setField} />
                <EF label="Estatuto" field="estatuto" form={form} set={setField} type="select" options={['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria']} />
                <EF label="Estado Avaliação" field="estado_avaliacao" form={form} set={setField} type="select" options={['Em avaliação','Ativo','Inativo']} />
                <EF label="Classificação" field="classificacao" form={form} set={setField} type="select" options={['A','B','C','D']} />
                <EF label="Contacto" field="contacto" form={form} set={setField} />
                <EF label="Email" field="email" form={form} set={setField} />
                <EF label="Comissão %" field="comissao" form={form} set={setField} type="number" />
                <EF label="Leads Enviados" field="imoveis_enviados" form={form} set={setField} type="number" />
                <EF label="Off-Market" field="imoveis_off_market" form={form} set={setField} type="number" />
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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${showScript ? 'bg-[#0d0d0d] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
          <div className="rounded-xl border-2 border-[#C9A84C] overflow-hidden" style={{ backgroundColor: '#faf8f2' }}>
            {/* Script header + tipo selector */}
            <div className="px-5 py-3 border-b border-[#C9A84C33] flex items-center justify-between" style={{ backgroundColor: '#0d0d0d' }}>
              <div className="flex items-center gap-3">
                <span className="text-white text-sm font-bold">Script Discovery Call</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C9A84C] text-black font-medium">{investidorNome}</span>
              </div>
              <div className="flex gap-1">
                {['Passivo', 'Ativo'].map(t => (
                  <button key={t} onClick={() => setTipo(t)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition ${tipo === t ? 'bg-[#C9A84C] text-black' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
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
                    scriptStep === i ? 'bg-[#0d0d0d] text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
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
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C9A84C22] text-[#C9A84C] font-medium">Critério {scriptStep}/5</span>
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
                        <div key={i} className="rounded-lg bg-white border border-gray-200 hover:border-[#C9A84C] transition overflow-hidden">
                          <div className="flex gap-3 items-start p-3 pb-2">
                            <span className="text-xs font-bold text-[#C9A84C] shrink-0 mt-0.5">{i + 1}.</span>
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
                      <p>3. Actualizar status no CRM para "Follow Up" ou "Investidor em espera"</p>
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${tipo === t ? 'bg-[#0d0d0d] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
                          score === v ? 'bg-[#0d0d0d] text-white shadow-sm' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>

                  {/* Rubrica description */}
                  {rubricaDesc && (
                    <p className="text-xs text-[#C9A84C] font-medium mb-2">{rubricaDesc}</p>
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
                    {idx === 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0d0d0d] text-white font-medium">Actual</span>}
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
