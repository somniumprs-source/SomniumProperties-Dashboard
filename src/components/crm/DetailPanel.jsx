/**
 * Painel de detalhe para Imóveis, Investidores, Consultores.
 * Mostra: campos editáveis + relações + timeline + tarefas + reuniões.
 */
import { useState, useEffect, useCallback } from 'react'
import { FileDown, ChevronDown, ChevronUp, Phone, Clock, FileText, Pencil, Save, X } from 'lucide-react'
import { AnaliseTab } from '../analise/AnaliseTab.jsx'
import { FicheirosTab } from './FicheirosTab.jsx'
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
  ficha_imovel: 'Ficha do Imóvel', ficha_pre_visita: 'Ficha Pré-Visita',
  checklist_visita: 'Checklist Visita', relatorio_visita: 'Relatório de Visita',
  analise_rentabilidade: 'Análise de Rentabilidade', estudo_comparaveis: 'Estudo Comparáveis',
  proposta_formal: 'Proposta Formal', apresentacao_investidor: 'Apresentação Investidor',
  resumo_negociacao: 'Resumo Negociação', resumo_acordo: 'Resumo Acordo',
  dossier_investimento: 'Dossier Investimento', ficha_follow_up: 'Ficha Follow-Up',
  ficha_cedencia: 'Ficha Cedência', ficha_acompanhamento_obra: 'Ficha Acompanhamento Obra',
}
const ESTADO_DOCS = {
  'Adicionado': ['ficha_imovel'], 'Pré-aprovação': ['ficha_imovel'],
  'Necessidade de Visita': ['ficha_pre_visita'], 'Visita Marcada': ['checklist_visita'],
  'Estudo de VVR': ['relatorio_visita', 'analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário': ['proposta_formal'], 'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Em negociação': ['resumo_negociacao'], 'Proposta aceite': ['resumo_acordo'],
  'Enviar proposta ao investidor': ['apresentacao_investidor', 'dossier_investimento'],
  'Follow Up após proposta': ['ficha_follow_up'], 'Follow UP': ['ficha_follow_up'],
  'Wholesaling': ['ficha_cedencia'], 'CAEP': ['ficha_acompanhamento_obra'], 'Fix and Flip': ['ficha_acompanhamento_obra'],
}

// ── Tab Relatórios (documentos de fase + geral) ─────────────
function RelatoriosImovelTab({ imovelId, estado, driveFolderId }) {
  const estadoClean = (estado || '').replace(/^\d+-\s*/, '').trim()
  const docsActuais = ESTADO_DOCS[estadoClean] || ['ficha_imovel']
  const todosDocs = Object.keys(DOC_LABELS)

  return (
    <div className="space-y-6">
      {/* Documentos da fase */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Documentos da Fase — {estadoClean || 'Sem estado'}</h3>
          {driveFolderId && (
            <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
              Abrir no Drive
            </a>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {docsActuais.map(tipo => (
            <a key={tipo} href={`/api/crm/imoveis/${imovelId}/documento/${tipo}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition-colors cursor-pointer">
              <FileDown className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-800">{DOC_LABELS[tipo] || tipo}</p>
                <p className="text-xs text-green-600">Fase actual</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Relatorio geral */}
      <div>
        <a href={`/api/crm/imoveis/${imovelId}/relatorio`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer">
          <FileText className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm font-medium text-gray-800">Relatório Geral PDF</p>
            <p className="text-xs text-indigo-600">Ficha completa do imóvel</p>
          </div>
        </a>
      </div>

      {/* Todos os docs */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Todos os Documentos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {todosDocs.map(tipo => {
            const isActive = docsActuais.includes(tipo)
            return (
              <a key={tipo} href={`/api/crm/imoveis/${imovelId}/documento/${tipo}`} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                  isActive ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}>
                <span className="text-xs">{isActive ? '●' : '○'}</span>
                <span>{DOC_LABELS[tipo]}</span>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Tab Investidor (dossier compilável) ─────────────────────
function InvestidorTab({ imovelId, imovelNome }) {
  const [selected, setSelected] = useState({ investimento: true, comparaveis: true, caep: true, stress_tests: true })

  const REPORTS = [
    { key: 'investimento', label: 'Análise de Investimento', desc: 'Custos detalhados, rentabilidade, fiscalidade, resultados', tipo: 'relatorio_investimento' },
    { key: 'comparaveis', label: 'Estudo de Comparáveis', desc: 'Preços de mercado, ajustes, VVR estimado', tipo: 'relatorio_comparaveis' },
    { key: 'caep', label: 'Distribuição CAEP', desc: 'Split Somnium/investidores, ROI por investidor', tipo: 'relatorio_caep' },
    { key: 'stress_tests', label: 'Stress Tests', desc: 'Cenários de risco e cenários favoráveis', tipo: 'relatorio_stress' },
  ]

  const selectedKeys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k)
  const compilarUrl = `/api/crm/imoveis/${imovelId}/relatorio-investidor?seccoes=${selectedKeys.join(',')}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-4 border-2" style={{ borderColor: '#C9A84C', backgroundColor: '#faf8f2' }}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-base font-bold text-gray-800">Dossier para Investidor</h3>
            <p className="text-xs text-gray-500">Selecciona as secções a incluir e gera um PDF profissional</p>
          </div>
          <a href={compilarUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors shadow-sm hover:shadow-md"
            style={{ backgroundColor: '#C9A84C' }}>
            <FileDown className="w-4 h-4" /> Compilar Dossier
          </a>
        </div>
      </div>

      {/* Relatórios individuais */}
      <div className="space-y-3">
        {REPORTS.map(r => (
          <div key={r.key} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
            <input type="checkbox" checked={selected[r.key]}
              onChange={e => setSelected(prev => ({ ...prev, [r.key]: e.target.checked }))}
              className="w-5 h-5 rounded border-gray-300 shrink-0" style={{ accentColor: '#C9A84C' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{r.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
            </div>
            <a href={`/api/crm/imoveis/${imovelId}/documento/${r.tipo}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 shrink-0 transition-colors">
              <FileDown className="w-3.5 h-3.5" /> Abrir PDF
            </a>
          </div>
        ))}
      </div>

      {/* Info */}
      <p className="text-xs text-gray-400 text-center">
        {selectedKeys.length} de 4 secções seleccionadas — o dossier compilado inclui capa profissional e índice
      </p>
    </div>
  )
}

export function DetailPanel({ type, id, onClose, onSave }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('detalhe')
  const [reunioes, setReunioes] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores' }[type]

  function startEdit() {
    setForm({ ...data })
    setEditing(true)
  }

  function loadData() {
    return fetch(`/api/crm/${endpoint}/${id}/full`).then(r => r.json()).then(setData).catch(() => {})
  }

  async function saveEdit() {
    setSaving(true)
    try {
      // Limpar campos do form que são relações (não enviar ao PUT)
      const { negocios, consultores, imoveis, tarefas, timeline, analises, ...cleanForm } = form
      const r = await fetch(`/api/crm/${endpoint}/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleanForm),
      })
      if (!r.ok) throw new Error('Erro ao guardar')
      await loadData()
      setEditing(false)
      if (onSave) onSave()
    } catch (e) { console.error('Erro ao guardar:', e) }
    setSaving(false)
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
      fetch(`/api/crm/reunioes?entidade_tipo=${endpoint}&entidade_id=${id}`)
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
    { key: 'interacoes', label: `Interacções (${data?.interacoes?.length ?? 0})`, icon: '💬', show: type === 'Consultores' },
    { key: 'analise', label: 'Análise Financeira', icon: '📊', show: type === 'Imóveis' },
    { key: 'relatorios_imovel', label: 'Relatórios', icon: '📄', show: type === 'Imóveis' },
    { key: 'investidor', label: 'Investidor', icon: '💼', show: type === 'Imóveis' },
    { key: 'relatorios', label: `Relatórios (${reunioes.length})`, icon: '📄', show: (type === 'Investidores' || type === 'Consultores') },
  ].filter(t => t.show)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: '#0d0d0d' }}>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest" style={{ color: '#C9A84C' }}>{type}</p>
          <h2 className="text-lg font-bold text-white truncate">{data.nome ?? data.movimento}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
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
      {type === 'Imóveis' && activeTab === 'analise' ? (
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
          <RelatoriosImovelTab imovelId={data.id} estado={data.estado} driveFolderId={data.drive_folder_id} />
        </div>

      /* Investidor (dossier compilável) */
      ) : type === 'Imóveis' && activeTab === 'investidor' ? (
        <div className="p-4 sm:p-6">
          <InvestidorTab imovelId={data.id} imovelNome={data.nome} />
        </div>

      /* Relatórios reuniões (investidores/consultores) */
      ) : activeTab === 'relatorios' ? (
        <div className="p-4 sm:p-6">
          <RelatoriosTab reunioes={reunioes} investidorNome={data.nome} />
        </div>

      ) : (
      /* Detalhe tab */
      <div className="p-4 sm:p-6 grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Main info */}
        <div className="xl:col-span-2 space-y-6">
          {/* Key fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {type === 'Imóveis' && <>
              {editing ? <>
                <EF label="Nome" field="nome" form={form} set={setField} />
                <EF label="Estado" field="estado" form={form} set={setField} type="select" options={['Adicionado','Chamada Não Atendida','Pendentes','Necessidade de Visita','Visita Marcada','Estudo de VVR','Criar Proposta ao Proprietário','Enviar proposta ao Proprietário','Em negociação','Proposta aceite','Enviar proposta ao investidor','Follow Up após proposta','Follow UP','Wholesaling','CAEP','Fix and Flip','Não interessa']} />
                <EF label="Ask Price (€)" field="ask_price" form={form} set={setField} type="number" />
                <EF label="Valor Proposta (€)" field="valor_proposta" form={form} set={setField} type="number" />
                <EF label="Tipologia" field="tipologia" form={form} set={setField} />
                <EF label="Área Útil (m²)" field="area_util" form={form} set={setField} type="number" />
                <EF label="Área Bruta (m²)" field="area_bruta" form={form} set={setField} type="number" />
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
                  <label className="text-xs text-gray-400 block mb-1">Notas</label>
                  <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
              </> : <>
                <Field label="Estado" value={data.estado?.replace(/^\d+-/, '')} />
                <Field label="Ask Price" value={data.ask_price > 0 ? EUR(data.ask_price) : '—'} />
                <Field label="Valor Proposta" value={data.valor_proposta > 0 ? EUR(data.valor_proposta) : '—'} />
                <Field label="ROI" value={data.roi > 0 ? `${data.roi}%` : '—'} />
                <Field label="Zona" value={data.zona} />
                <Field label="Tipologia" value={data.tipologia} />
                <Field label="Modelo" value={data.modelo_negocio} />
                <Field label="Origem" value={data.origem} />
                <Field label="Consultor" value={data.nome_consultor} />
                <Field label="Link" value={data.link ? <a href={data.link} target="_blank" rel="noopener noreferrer" className="text-[#C9A84C] hover:underline truncate block">{data.link === 'OFF MARKET' ? 'OFF MARKET' : 'Ver anúncio'}</a> : '—'} />
                <Field label="Área Útil" value={data.area_util > 0 ? `${data.area_util} m²` : '—'} />
                <Field label="Área Bruta" value={data.area_bruta > 0 ? `${data.area_bruta} m²` : '—'} />
                <Field label="Data Adicionado" value={data.data_adicionado} />
                <Field label="Data Chamada" value={data.data_chamada} />
                <Field label="Data Visita" value={data.data_visita} />
                <Field label="Data Proposta" value={data.data_proposta} />
              </>}
            </>}
            {type === 'Investidores' && <>
              {editing ? <>
                <EF label="Nome" field="nome" form={form} set={setField} />
                <EF label="Status" field="status" form={form} set={setField} type="select" options={['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor classificado','Investidor em parceria']} />
                <EF label="Classificação" field="classificacao" form={form} set={setField} type="select" options={['A','B','C','D']} />
                <EF label="Origem" field="origem" form={form} set={setField} type="select" options={['Skool','Grupos Whatsapp','Referenciação','LinkedIn','Google Forms','Outro']} />
                <EF label="Capital Min (€)" field="capital_min" form={form} set={setField} type="number" />
                <EF label="Capital Max (€)" field="capital_max" form={form} set={setField} type="number" />
                <EF label="Telemóvel" field="telemovel" form={form} set={setField} />
                <EF label="Email" field="email" form={form} set={setField} />
                <EF label="Perfil Risco" field="perfil_risco" form={form} set={setField} type="select" options={['Conservador','Moderado','Agressivo']} />
                <EF label="Montante Investido (€)" field="montante_investido" form={form} set={setField} type="number" />
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
                <Field label="Status" value={data.status} />
                <Field label="Classificação" value={data.classificacao} />
                <Field label="Pontuação" value={data.pontuacao} />
                <Field label="Origem" value={data.origem} />
                <Field label="Capital Min" value={data.capital_min > 0 ? EUR(data.capital_min) : '—'} />
                <Field label="Capital Max" value={data.capital_max > 0 ? EUR(data.capital_max) : '—'} />
                <Field label="Telemóvel" value={data.telemovel} />
                <Field label="Email" value={data.email} />
                <Field label="Perfil Risco" value={data.perfil_risco} />
                <Field label="Tipo Investidor" value={(() => { try { return JSON.parse(data.tipo_investidor || '[]').join(', ') } catch { return data.tipo_investidor || '—' } })()} />
                <Field label="Estratégia" value={(() => { try { return JSON.parse(data.estrategia || '[]').join(', ') } catch { return data.estrategia || '—' } })()} />
                <Field label="NDA" value={data.nda_assinado ? 'Sim' : 'Não'} />
                <Field label="1º Contacto" value={data.data_primeiro_contacto} />
                <Field label="Último Contacto" value={data.data_ultimo_contacto} />
                <Field label="Reunião" value={data.data_reuniao} />
                <Field label="Próxima Ação" value={data.proxima_acao} />
              </>}
            </>}
            {type === 'Consultores' && <>
              <Field label="Estatuto" value={data.estatuto} />
              <Field label="Classificação" value={data.classificacao} />
              <Field label="Contacto" value={data.contacto} />
              <Field label="Email" value={data.email} />
              <Field label="Imobiliária" value={(() => { try { return JSON.parse(data.imobiliaria || '[]').join(', ') } catch { return '—' } })()} />
              <Field label="Leads Enviados" value={data.imoveis_enviados} />
              <Field label="Off-Market" value={data.imoveis_off_market} />
              <Field label="Comissão" value={data.comissao > 0 ? `${data.comissao}%` : '—'} />
              <Field label="Follow Up" value={data.data_follow_up} />
              <Field label="Próx. Follow Up" value={data.data_proximo_follow_up} />
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
                  <div key={c.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-blue-800">{c.nome}</span>
                    <span className="text-xs text-blue-600">{c.estatuto} · {c.contacto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.imoveis?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Imóveis</p>
              <div className="space-y-2">
                {data.imoveis.map(i => (
                  <div key={i.id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
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
    const r = await fetch(`/api/crm/reunioes/${id}/transcricao`)
    const d = await r.json()
    setTranscricao(prev => ({ ...prev, [id]: d.transcricao }))
  }

  async function runAnalise(id) {
    setAnalyzing(id)
    try {
      const r = await fetch(`/api/crm/reunioes/${id}/analisar`, { method: 'POST' })
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

function MiniField({ label, value, highlight }) {
  return (
    <div className={`px-2 py-1.5 rounded-lg ${highlight ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border border-gray-100'}`}>
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      <p className={`text-xs font-semibold ${highlight ? 'text-yellow-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}
