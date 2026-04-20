/**
 * Tab de Checklist obrigatória para imóveis.
 * Mostra tarefas agrupadas por estado, com progresso e toggle de conclusão.
 */
import { useState, useEffect, useMemo } from 'react'
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { CHECKLIST_TEMPLATES } from '../../constants/checklistTemplates.js'

// Ordem dos estados no pipeline
const PIPELINE_ORDER = [
  'Pré-aprovação','Adicionado','Chamada Não Atendida','Pendentes',
  'Necessidade de Visita','Visita Marcada','Estudo de VVR',
  'Criar Proposta ao Proprietário','Enviar proposta ao Proprietário',
  'Em negociação','Proposta aceite','Enviar proposta ao investidor',
  'Follow Up após proposta','Follow UP',
  'Wholesaling','CAEP','Fix and Flip','Não interessa',
]

export function ChecklistTab({ imovel, onUpdate }) {
  const [items, setItems] = useState([])
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)

  const estado = imovel?.estado

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
      // Expandir estado actual por defeito
      if (estado) setExpanded(prev => ({ ...prev, [estado]: true }))
    } catch {}
    setLoading(false)
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

  // Agrupar por estado
  const grouped = useMemo(() => {
    const map = {}
    for (const item of items) {
      if (!map[item.estado]) map[item.estado] = []
      map[item.estado].push(item)
    }
    return map
  }, [items])

  // Ordenar estados pela pipeline
  const orderedEstados = useMemo(() => {
    const present = new Set(Object.keys(grouped))
    return PIPELINE_ORDER.filter(e => present.has(e))
  }, [grouped])

  // Progresso do estado actual
  const currentProgress = useMemo(() => {
    const current = grouped[estado] || []
    const obrigatorias = current.filter(i => i.obrigatoria)
    const done = obrigatorias.filter(i => i.concluida).length
    return { done, total: obrigatorias.length }
  }, [grouped, estado])

  // Progresso global
  const globalProgress = useMemo(() => {
    const obrigatorias = items.filter(i => i.obrigatoria)
    const done = obrigatorias.filter(i => i.concluida).length
    return { done, total: obrigatorias.length }
  }, [items])

  const pipelineIdx = PIPELINE_ORDER.indexOf(estado)

  // Se não há items e existem templates para o estado actual, mostrar botão para gerar
  const hasTemplates = estado && CHECKLIST_TEMPLATES[estado]?.length > 0
  const isEmpty = items.length === 0

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
      {/* Resumo do estado actual */}
      {estado && grouped[estado] && (
        <div className="rounded-lg border border-gray-200 p-4" style={{ backgroundColor: '#FAFAF8' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800">Estado actual: {estado}</span>
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
            {/* Estado header */}
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

            {/* Items */}
            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {stateItems.map(item => (
                  <div key={item.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                      item.concluida ? 'bg-green-50/30' : ''
                    }`}
                  >
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
                        {item.campo_crm && (
                          <span className="text-[10px] font-mono text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                            {item.campo_crm}
                          </span>
                        )}
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
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
