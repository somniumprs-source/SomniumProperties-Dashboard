/**
 * Painel de detalhe para Imóveis, Investidores, Consultores.
 * Mostra: campos editáveis + relações + timeline + tarefas + reuniões.
 */
import { useState, useEffect, useCallback } from 'react'
import { FileDown, ChevronDown, ChevronUp, Phone, Clock, FileText, Pencil, Save, X, Plus } from 'lucide-react'
import { AnaliseTab } from '../analise/AnaliseTab.jsx'
import { InteracoesTab } from './InteracoesTab.jsx'
import { supabase } from '../../lib/supabase.js'
import { apiFetch } from '../../lib/api.js'
import { EUR } from '../../constants.js'

const ACAO_LABEL = { INSERT: 'Criado', UPDATE: 'Atualizado', DELETE: 'Apagado' }
const ACAO_COLOR = { INSERT: 'text-green-600', UPDATE: 'text-blue-600', DELETE: 'text-red-600' }

async function getToken() {
  try {
    const { data: { session } } = await supabase?.auth?.getSession() || { data: {} }
    return session?.access_token || ''
  } catch { return '' }
}

export function DetailPanel({ type, id, onClose, onSave, onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('detalhe')
  const [reunioes, setReunioes] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showAddImovel, setShowAddImovel] = useState(false)
  const [imovelForm, setImovelForm] = useState({ nome: '', tipo_oportunidade: 'Off-Market', link: '', tipologia: '', ask_price: '', zona: '' })
  const [savingImovel, setSavingImovel] = useState(false)

  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores' }[type]

  function startEdit() {
    setForm({ ...data })
    setEditing(true)
  }

  function loadData() {
    return apiFetch(`/api/crm/${endpoint}/${id}/full`).then(r => r.json()).then(setData).catch(() => {})
  }

  async function saveEdit() {
    setSaving(true)
    try {
      // Limpar campos do form que são relações (não enviar ao PUT)
      const { negocios, consultores, imoveis, tarefas, timeline, analises, ...cleanForm } = form
      const r = await apiFetch(`/api/crm/${endpoint}/${id}`, {
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
    { key: 'interacoes', label: `Interacções (${data?.interacoes?.length ?? 0})`, icon: '💬', show: type === 'Consultores' },
    { key: 'relatorios', label: `Relatórios (${reunioes.length})`, icon: '📄', show: (type === 'Investidores' || type === 'Consultores') },
    { key: 'analise', label: 'Análise Financeira', icon: '📊', show: type === 'Imóveis' },
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

      /* Interacções tab */
      ) : activeTab === 'interacoes' && type === 'Consultores' ? (
        <div className="p-4 sm:p-6">
          <InteracoesTab consultorId={data.id} onUpdate={loadData} />
        </div>

      /* Relatórios tab */
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
              <Field label="Estado" value={data.estado?.replace(/^\d+-/, '')} />
              <Field label="Ask Price" value={data.ask_price > 0 ? EUR(data.ask_price) : '—'} />
              <Field label="Valor Proposta" value={data.valor_proposta > 0 ? EUR(data.valor_proposta) : '—'} />
              <Field label="ROI" value={data.roi > 0 ? `${data.roi}%` : '—'} />
              <Field label="Zona" value={data.zona} />
              <Field label="Tipologia" value={data.tipologia} />
              <Field label="Modelo" value={data.modelo_negocio} />
              <Field label="Origem" value={data.origem} />
              {data.nome_consultor && data.consultores?.[0]?.id ? (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Consultor</p>
                  <button onClick={() => onNavigate && onNavigate('Consultores', data.consultores[0].id)}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors text-left">
                    {data.nome_consultor}
                  </button>
                </div>
              ) : (
                <Field label="Consultor" value={data.nome_consultor} />
              )}
              <Field label="Data Adicionado" value={data.data_adicionado} />
              <Field label="Data Chamada" value={data.data_chamada} />
              <Field label="Data Visita" value={data.data_visita} />
              <Field label="Data Proposta" value={data.data_proposta} />
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
            {type === 'Consultores' && (() => {
              const tq = data._taxaQualidade ?? data.taxa_qualidade ?? 0
              const sp = data.score_prioridade ?? 0
              const tmr = data._tempoMedioResposta ?? data.tempo_medio_resposta
              const tmrLabel = tmr != null ? (tmr < 1 ? `${Math.round(tmr * 60)}min` : tmr < 24 ? `${Math.round(tmr)}h` : `${Math.round(tmr / 24)}d`) : '—'
              const totalIm = data._totalImoveis ?? data.imoveis_enviados ?? 0
              const avancados = data._imoveisAvancados ?? 0
              return <>
                {/* KPI banner — sempre visivel */}
                <div className="col-span-2 md:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-200">
                    <p className="text-2xl font-bold" style={{ color: '#C9A84C' }}>{sp}</p>
                    <p className="text-xs text-gray-500">Score Prioridade</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                    <p className="text-2xl font-bold text-green-700">{tq}%</p>
                    <p className="text-xs text-gray-500">Taxa Qualidade</p>
                  </div>
                  <div className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-200">
                    <p className="text-2xl font-bold text-indigo-700">{totalIm}</p>
                    <p className="text-xs text-gray-500">Imóveis ({avancados} avançados)</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-200">
                    <p className="text-2xl font-bold text-purple-700">{tmrLabel}</p>
                    <p className="text-xs text-gray-500">Tempo Resposta</p>
                  </div>
                </div>
                {editing ? <>
                  <EF label="Nome" field="nome" form={form} set={setField} />
                  <EF label="Estatuto" field="estatuto" form={form} set={setField} type="select" options={['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria']} />
                  <EF label="Estado Avaliação" field="estado_avaliacao" form={form} set={setField} type="select" options={['Em avaliação','Ativo','Inativo']} />
                  <EF label="Classificação" field="classificacao" form={form} set={setField} type="select" options={['A','B','C','D']} />
                  <EF label="Contacto (telefone)" field="contacto" form={form} set={setField} />
                  <EF label="Email" field="email" form={form} set={setField} />
                  <EF label="Equipa Remax" field="equipa_remax" form={form} set={setField} />
                  <EF label="Imóveis Off-Market" field="imoveis_off_market" form={form} set={setField} type="number" />
                  <EF label="Meta Mensal Leads" field="meta_mensal_leads" form={form} set={setField} type="number" />
                  <EF label="Comissão %" field="comissao" form={form} set={setField} type="number" />
                  <EF label="Data Início Parceria" field="data_inicio" form={form} set={setField} type="date" />
                  <EF label="Data 1ª Call" field="data_primeira_call" form={form} set={setField} type="date" />
                  <EF label="Data Follow Up" field="data_follow_up" form={form} set={setField} type="date" />
                  <EF label="Data Próx. Follow Up" field="data_proximo_follow_up" form={form} set={setField} type="date" />
                  <EF label="Motivo Follow Up" field="motivo_follow_up" form={form} set={setField} />
                  <EF label="Motivo Descontinuação" field="motivo_descontinuacao" form={form} set={setField} />
                  <div className="col-span-2 md:col-span-3">
                    <label className="text-xs text-gray-400 block mb-1">Notas</label>
                    <textarea value={form.notas || ''} onChange={e => setField('notas', e.target.value)} rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                  </div>
                </> : <>
                  <Field label="Estatuto" value={data.estatuto} />
                  <Field label="Estado Avaliação" value={data.estado_avaliacao || 'Em avaliação'} />
                  <Field label="Classificação" value={data.classificacao || 'D'} />
                  <Field label="Contacto" value={data.contacto} />
                  <Field label="Email" value={data.email} />
                  <Field label="Imobiliária" value={(() => { try { return JSON.parse(data.imobiliaria || '[]').join(', ') } catch { return '—' } })()} />
                  <Field label="Off-Market" value={data.imoveis_off_market} />
                  <Field label="Comissão" value={data.comissao > 0 ? `${data.comissao}%` : '—'} />
                  <Field label="Data Início" value={data.data_inicio} />
                  <Field label="1ª Call" value={data.data_primeira_call} />
                  <Field label="Follow Up" value={data.data_follow_up} />
                  <Field label="Próx. Follow Up" value={data.data_proximo_follow_up} />
                </>}
              </>
            })()}
          </div>

          {editing && type !== 'Investidores' && type !== 'Consultores' && (
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

          {/* Relações */}
          {data.negocios?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Negócios Associados</p>
              <div className="space-y-2">
                {data.negocios.map(n => (
                  <div key={n.id} className="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-indigo-800">{n.movimento}</span>
                    <div className="flex gap-3 text-xs">
                      <span className="text-indigo-600">{n.categoria}</span>
                      <span className="font-mono">{EUR(n.lucro_estimado)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.consultores?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Consultores</p>
              <div className="space-y-2">
                {data.consultores.map(c => (
                  <div key={c.id}
                    onClick={() => onNavigate && onNavigate('Consultores', c.id)}
                    className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-blue-100 transition-colors group">
                    <span className="text-sm font-medium text-blue-800 hover:underline">{c.nome}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-600">{c.estatuto} · {c.contacto}</span>
                      <button onClick={async (e) => {
                        e.stopPropagation()
                        if (!confirm(`Apagar consultor "${c.nome}"?`)) return
                        await apiFetch(`/api/crm/consultores/${c.id}`, { method: 'DELETE' })
                        await loadData()
                        if (onSave) onSave()
                      }} className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 transition-all" title="Apagar consultor">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(type === 'Consultores' || data.imoveis?.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Imóveis ({data.imoveis?.length ?? 0})</p>
                {type === 'Consultores' && (
                  <button onClick={() => setShowAddImovel(!showAddImovel)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Adicionar Imóvel
                  </button>
                )}
              </div>

              {/* Formulário inline para adicionar imóvel */}
              {showAddImovel && type === 'Consultores' && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200 mb-3">
                  <p className="text-xs font-semibold text-gray-600">Novo imóvel de {data.nome}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nome do Imóvel *</label>
                      <input type="text" value={imovelForm.nome} onChange={e => setImovelForm(p => ({ ...p, nome: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Ex: T2 Rua da Alegria" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tipo Oportunidade</label>
                      <select value={imovelForm.tipo_oportunidade} onChange={e => setImovelForm(p => ({ ...p, tipo_oportunidade: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        <option value="Off-Market">Off-Market</option>
                        <option value="Portal">Portal</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Link {imovelForm.tipo_oportunidade === 'Portal' ? '*' : '(opcional)'}</label>
                      <input type="url" value={imovelForm.link} onChange={e => setImovelForm(p => ({ ...p, link: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="https://..." />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tipologia</label>
                      <input type="text" value={imovelForm.tipologia} onChange={e => setImovelForm(p => ({ ...p, tipologia: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="T2, T3, Moradia..." />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ask Price (€)</label>
                      <input type="number" value={imovelForm.ask_price} onChange={e => setImovelForm(p => ({ ...p, ask_price: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="150000" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Zona</label>
                      <input type="text" value={imovelForm.zona} onChange={e => setImovelForm(p => ({ ...p, zona: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Santo António dos Olivais" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={savingImovel || !imovelForm.nome.trim() || (imovelForm.tipo_oportunidade === 'Portal' && !imovelForm.link.trim())}
                      onClick={async () => {
                        setSavingImovel(true)
                        try {
                          await apiFetch('/api/crm/imoveis', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              nome: imovelForm.nome.trim(),
                              nome_consultor: data.nome,
                              origem: 'Consultor',
                              tipo_oportunidade: imovelForm.tipo_oportunidade,
                              link: imovelForm.link || null,
                              tipologia: imovelForm.tipologia || null,
                              ask_price: imovelForm.ask_price ? +imovelForm.ask_price : 0,
                              zona: imovelForm.zona || null,
                            }),
                          })
                          setImovelForm({ nome: '', tipo_oportunidade: 'Off-Market', link: '', tipologia: '', ask_price: '', zona: '' })
                          setShowAddImovel(false)
                          await loadData()
                          if (onSave) onSave()
                        } catch {}
                        setSavingImovel(false)
                      }}
                      className="px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      {savingImovel ? 'A criar...' : 'Criar Imóvel'}
                    </button>
                    <button onClick={() => setShowAddImovel(false)} className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {data.imoveis?.length > 0 && (
                <div className="space-y-2">
                  {data.imoveis.map(i => (
                    <div key={i.id}
                      onClick={() => onNavigate && onNavigate('Imóveis', i.id)}
                      className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-green-100 transition-colors group">
                      <div className="flex items-center gap-2 min-w-0">
                        {i.check_qualidade && (
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs text-white shrink-0 ${i.check_ouro ? 'bg-amber-500' : 'bg-green-500'}`}>
                            {i.check_ouro ? '★' : '✓'}
                          </span>
                        )}
                        <span className="text-sm font-medium text-green-800 truncate hover:underline">{i.nome}</span>
                      </div>
                      <div className="flex gap-2 text-xs items-center shrink-0">
                        {i.tipo_oportunidade && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${i.tipo_oportunidade === 'Off-Market' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {i.tipo_oportunidade}
                          </span>
                        )}
                        {i.tipologia && <span className="text-gray-500">{i.tipologia}</span>}
                        <span className="text-green-600">{i.estado?.replace(/^\d+-/, '')}</span>
                        <span className="font-mono">{EUR(i.ask_price)}</span>
                        <button onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm(`Apagar imóvel "${i.nome}"?`)) return
                          await apiFetch(`/api/crm/imoveis/${i.id}`, { method: 'DELETE' })
                          await loadData()
                          if (onSave) onSave()
                        }} className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 text-red-400 hover:text-red-600 transition-all" title="Apagar imóvel">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(!data.imoveis || data.imoveis.length === 0) && !showAddImovel && (
                <p className="text-xs text-gray-300">Sem imóveis associados</p>
              )}
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
