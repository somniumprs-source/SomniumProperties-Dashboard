/**
 * Tab de Checklist obrigatória para imóveis.
 * Mostra tarefas agrupadas por estado, com inputs inline para preencher campos do CRM.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronRight, AlertTriangle, Save, Pencil } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { CHECKLIST_TEMPLATES } from '../../constants/checklistTemplates.js'

const PIPELINE_ORDER = [
  'Pré-aprovação','Adicionado','Chamada Não Atendida','Pendentes',
  'Necessidade de Visita','Visita Marcada','Estudo de VVR',
  'Criar Proposta ao Proprietário','Enviar proposta ao Proprietário',
  'Em negociação','Proposta aceite','Enviar proposta ao investidor',
  'Follow Up após proposta','Follow UP',
  'Wholesaling','CAEP','Fix and Flip','Não interessa',
]

// Mapa de campo_crm → configuração do input
const FIELD_CONFIG = {
  'nome': { label: 'Nome', type: 'text' },
  'link': { label: 'Link', type: 'text' },
  'origem': { label: 'Origem', type: 'select', options: ['Pesquisa em portais/sites','Referência por consultores','Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro'] },
  'ask_price': { label: 'Ask Price (€)', type: 'number' },
  'tipologia': { label: 'Tipologia', type: 'text' },
  'zona': { label: 'Zona', type: 'text' },
  'area_bruta': { label: 'Área Bruta (m²)', type: 'number' },
  'area_util': { label: 'Área Útil (m²)', type: 'number' },
  'area_bruta_dependente': { label: 'ABD (m²)', type: 'number' },
  'valor_proposta': { label: 'Valor Proposta (€)', type: 'number' },
  'valor_venda_remodelado': { label: 'VVR (€)', type: 'number' },
  'custo_estimado_obra': { label: 'Custo Obra (€)', type: 'number' },
  'modelo_negocio': { label: 'Modelo de Negócio', type: 'select', options: ['Wholesaling','Fix & Flip','CAEP','Mediação'] },
  'nome_consultor': { label: 'Consultor', type: 'text' },
  'motivo_descarte': { label: 'Motivo de Descarte', type: 'select', options: ['ROI insuficiente','Preço inflacionado','Zona sem procura','Problemas estruturais','Problemas legais','Proprietário não vende','Outro'] },
  'data_chamada': { label: 'Data Chamada', type: 'date' },
  'data_visita': { label: 'Data Visita', type: 'date' },
  'data_estudo_mercado': { label: 'Data Estudo Mercado', type: 'date' },
  'data_proposta': { label: 'Data Proposta', type: 'date' },
  'data_proposta_aceite': { label: 'Data Proposta Aceite', type: 'date' },
  'data_follow_up': { label: 'Data Follow Up', type: 'date' },
  'data_aceite_investidor': { label: 'Data Aceite Investidor', type: 'date' },
  'notas': { label: 'Notas', type: 'textarea' },
}

// Extrair o primeiro campo simples (do imóvel) de um campo_crm string
function parseMainField(campo_crm) {
  if (!campo_crm) return null
  // Ignorar campos de análise, negócio, documentos ou calendário
  if (campo_crm.startsWith('analise:') || campo_crm.startsWith('negocio:') || campo_crm.startsWith('doc:') || campo_crm === 'tarefa calendario') return null
  // Pode ser "area_bruta, area_util" — retornar array
  const fields = campo_crm.split(',').map(f => f.trim()).filter(f => FIELD_CONFIG[f])
  return fields.length > 0 ? fields : null
}

const inputClass = 'w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'

function InlineField({ field, value, onChange }) {
  const cfg = FIELD_CONFIG[field]
  if (!cfg) return null

  if (cfg.type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onChange(field, e.target.value)} className={inputClass}>
        <option value="">—</option>
        {cfg.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (cfg.type === 'date') {
    return <input type="date" value={(value || '').slice(0, 10)} onChange={e => onChange(field, e.target.value)} className={inputClass} />
  }
  if (cfg.type === 'number') {
    return <input type="number" value={value ?? ''} onChange={e => onChange(field, +e.target.value || null)} className={inputClass} placeholder={cfg.label} />
  }
  if (cfg.type === 'textarea') {
    return <textarea value={value ?? ''} onChange={e => onChange(field, e.target.value)} rows={2} className={inputClass} placeholder="Registar aqui..." />
  }
  return <input type="text" value={value ?? ''} onChange={e => onChange(field, e.target.value)} className={inputClass} placeholder={cfg.label} />
}

export function ChecklistTab({ imovel, onUpdate }) {
  const [items, setItems] = useState([])
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)
  const [localData, setLocalData] = useState({})  // dados editaveis do imovel
  const [dirty, setDirty] = useState({})           // campos modificados
  const [saving, setSaving] = useState(false)

  const estado = imovel?.estado

  // Inicializar localData com dados do imovel
  useEffect(() => {
    if (!imovel) return
    setLocalData({ ...imovel })
    setDirty({})
  }, [imovel?.id, imovel?.updated_at])

  useEffect(() => {
    if (!imovel?.id) return
    loadChecklist()
  }, [imovel?.id])

  async function loadChecklist() {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/checklist/${imovel.id}`)
      const data = await r.json()
      setItems(data)
      if (estado) setExpanded(prev => ({ ...prev, [estado]: true }))
    } catch {}
    setLoading(false)
  }

  function handleFieldChange(field, value) {
    setLocalData(prev => ({ ...prev, [field]: value }))
    setDirty(prev => ({ ...prev, [field]: true }))
  }

  async function saveFields() {
    const dirtyFields = Object.keys(dirty)
    if (dirtyFields.length === 0) return

    setSaving(true)
    try {
      const payload = {}
      for (const f of dirtyFields) {
        payload[f] = localData[f]
      }
      const r = await apiFetch(`/api/crm/imoveis/${imovel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (r.ok) {
        setDirty({})
        if (onUpdate) onUpdate()
      }
    } catch {}
    setSaving(false)
  }

  async function toggleItem(item) {
    const newVal = !item.concluida
    try {
      await apiFetch(`/api/crm/checklist/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concluida: newVal }),
      })
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, concluida: newVal, concluida_em: newVal ? new Date().toISOString() : null }
        : i
      ))
      if (onUpdate) onUpdate()
    } catch {}
  }

  const grouped = useMemo(() => {
    const map = {}
    for (const item of items) {
      if (!map[item.estado]) map[item.estado] = []
      map[item.estado].push(item)
    }
    return map
  }, [items])

  const orderedEstados = useMemo(() => {
    const present = new Set(Object.keys(grouped))
    return PIPELINE_ORDER.filter(e => present.has(e))
  }, [grouped])

  const currentProgress = useMemo(() => {
    const current = grouped[estado] || []
    const obrigatorias = current.filter(i => i.obrigatoria)
    const done = obrigatorias.filter(i => i.concluida).length
    return { done, total: obrigatorias.length }
  }, [grouped, estado])

  const globalProgress = useMemo(() => {
    const obrigatorias = items.filter(i => i.obrigatoria)
    const done = obrigatorias.filter(i => i.concluida).length
    return { done, total: obrigatorias.length }
  }, [items])

  const pipelineIdx = PIPELINE_ORDER.indexOf(estado)
  const hasTemplates = estado && CHECKLIST_TEMPLATES[estado]?.length > 0
  const isEmpty = items.length === 0
  const hasDirty = Object.keys(dirty).length > 0

  async function generateChecklist() {
    try {
      await apiFetch('/api/crm/auto-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'imoveis', entityId: imovel.id, entityName: imovel.nome, newPhase: estado }),
      })
      await loadChecklist()
    } catch {}
  }

  // Verificar se um campo está preenchido
  function isFieldFilled(field) {
    const val = localData[field]
    if (val === null || val === undefined || val === '' || val === 0) return false
    return true
  }

  if (loading) return <div className="p-6 text-center text-gray-400">A carregar checklist...</div>

  if (isEmpty && hasTemplates) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={32} />
        <p className="text-sm text-gray-600 mb-4">Ainda não foi gerada checklist para este imóvel.</p>
        <button onClick={generateChecklist}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white"
          style={{ backgroundColor: '#C9A84C' }}>
          Gerar checklist para "{estado}"
        </button>
      </div>
    )
  }

  if (isEmpty) {
    return <div className="p-6 text-center text-gray-400">Sem checklist disponível para este estado.</div>
  }

  return (
    <div className="p-4 space-y-4">
      {/* Resumo do estado actual + botão gravar */}
      {estado && grouped[estado] && (
        <div className="rounded-lg border border-gray-200 p-4" style={{ backgroundColor: '#FAFAF8' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800">Estado actual: {estado}</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                currentProgress.done === currentProgress.total
                  ? 'bg-green-100 text-green-700'
                  : currentProgress.done > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-600'
              }`}>
                {currentProgress.done}/{currentProgress.total} obrigatórias
              </span>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300"
              style={{
                width: currentProgress.total > 0 ? `${(currentProgress.done / currentProgress.total) * 100}%` : '0%',
                backgroundColor: currentProgress.done === currentProgress.total ? '#22c55e' : '#C9A84C',
              }} />
          </div>
          {currentProgress.done < currentProgress.total && (
            <p className="text-xs text-gray-500 mt-2">
              Faltam {currentProgress.total - currentProgress.done} tarefa(s) obrigatória(s) para garantir dados completos nas métricas.
            </p>
          )}
        </div>
      )}

      {/* Barra de gravar fixa */}
      {hasDirty && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-amber-400 bg-amber-50 shadow-md">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <Pencil size={14} />
            <span>{Object.keys(dirty).length} campo(s) alterado(s)</span>
          </div>
          <button onClick={saveFields} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#C9A84C' }}>
            <Save size={14} />
            {saving ? 'A gravar...' : 'Gravar alterações'}
          </button>
        </div>
      )}

      {/* Progresso global */}
      {globalProgress.total > 0 && orderedEstados.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Global:</span>
          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-green-400 transition-all"
              style={{ width: `${(globalProgress.done / globalProgress.total) * 100}%` }} />
          </div>
          <span>{globalProgress.done}/{globalProgress.total}</span>
        </div>
      )}

      {/* Grupos por estado */}
      {orderedEstados.map(est => {
        const stateItems = grouped[est]
        const isCurrentState = est === estado
        const stateIdx = PIPELINE_ORDER.indexOf(est)
        const isPast = stateIdx < pipelineIdx
        const isExpanded = expanded[est] ?? isCurrentState
        const obrig = stateItems.filter(i => i.obrigatoria)
        const obrigDone = obrig.filter(i => i.concluida).length
        const totalTime = stateItems.reduce((s, i) => s + (i.tempo_estimado || 0), 0)

        return (
          <div key={est} className={`rounded-lg border ${isCurrentState ? 'border-amber-300 shadow-sm' : 'border-gray-200'}`}>
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [est]: !isExpanded }))}
              className={`w-full flex items-center justify-between px-4 py-3 text-left ${
                isCurrentState ? 'bg-gray-900 text-white rounded-t-lg' : 'bg-gray-50 text-gray-800 rounded-lg'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className={`text-sm font-semibold truncate ${isCurrentState ? 'text-white' : ''}`}>{est}</span>
                {isPast && obrigDone === obrig.length && obrig.length > 0 && (
                  <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs ${isCurrentState ? 'text-gray-300' : 'text-gray-500'}`}>
                  {obrigDone}/{obrig.length}
                </span>
                <span className={`text-xs ${isCurrentState ? 'text-gray-400' : 'text-gray-400'}`}>
                  {totalTime.toFixed(1)}h
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {stateItems.map(item => {
                  const fields = parseMainField(item.campo_crm)
                  const hasInlineFields = fields && fields.length > 0

                  return (
                    <div key={item.id}
                      className={`px-4 py-3 hover:bg-gray-50/50 transition-colors ${
                        item.concluida ? 'bg-green-50/30' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleItem(item)} className="mt-0.5 shrink-0">
                          {item.concluida
                            ? <CheckCircle2 size={18} className="text-green-500" />
                            : <Circle size={18} className={item.obrigatoria ? 'text-amber-400' : 'text-gray-300'} />
                          }
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-tight ${
                            item.concluida ? 'text-gray-400 line-through' : 'text-gray-800'
                          }`}>
                            {item.titulo}
                            {item.obrigatoria && !item.concluida && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-gray-400 italic">{item.categoria}</span>
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                              <Clock size={9} /> {item.tempo_estimado}h
                            </span>
                          </div>
                          {item.concluida && item.concluida_em && (
                            <p className="text-[10px] text-green-600 mt-0.5">
                              Concluída em {new Date(item.concluida_em).toLocaleDateString('pt-PT')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Inputs inline para preencher campos do CRM */}
                      {hasInlineFields && !item.concluida && (
                        <div className="ml-8 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {fields.map(field => {
                            const cfg = FIELD_CONFIG[field]
                            if (!cfg) return null
                            const filled = isFieldFilled(field)
                            return (
                              <div key={field}>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[10px] font-medium text-gray-500">{cfg.label}</span>
                                  {filled && <CheckCircle2 size={10} className="text-green-500" />}
                                  {!filled && <span className="text-[10px] text-red-400">vazio</span>}
                                  {dirty[field] && <span className="text-[10px] text-amber-500 font-medium">alterado</span>}
                                </div>
                                <InlineField
                                  field={field}
                                  value={localData[field]}
                                  onChange={handleFieldChange}
                                />
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Campos preenchidos (quando concluido) */}
                      {hasInlineFields && item.concluida && (
                        <div className="ml-8 mt-1 flex flex-wrap gap-2">
                          {fields.map(field => {
                            const cfg = FIELD_CONFIG[field]
                            if (!cfg) return null
                            const val = localData[field]
                            const display = val != null && val !== '' && val !== 0
                              ? (cfg.type === 'number' ? new Intl.NumberFormat('pt-PT').format(val) : String(val).slice(0, 50))
                              : '—'
                            return (
                              <span key={field} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                {cfg.label}: <strong>{display}</strong>
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
