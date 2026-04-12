import { useState, useRef } from 'react'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)

const COLUMN_COLORS = {
  // Pipeline Imóveis — Prospeção
  'Adicionado':                     { bg: 'bg-gray-50',    border: 'border-gray-200',   header: 'bg-gray-100 text-gray-700' },
  'Chamada Não Atendida':           { bg: 'bg-gray-50',    border: 'border-gray-200',   header: 'bg-gray-100 text-gray-700' },
  'Pendentes':                      { bg: 'bg-gray-50',    border: 'border-gray-200',   header: 'bg-gray-100 text-gray-700' },
  // Qualificação
  'Necessidade de Visita':          { bg: 'bg-blue-50',    border: 'border-blue-200',   header: 'bg-blue-100 text-blue-700' },
  'Visita Marcada':                 { bg: 'bg-indigo-50',  border: 'border-indigo-200', header: 'bg-indigo-100 text-indigo-700' },
  // Análise
  'Estudo de VVR':                  { bg: 'bg-purple-50',  border: 'border-purple-200', header: 'bg-purple-100 text-purple-700' },
  // Negociação
  'Criar Proposta ao Proprietário': { bg: 'bg-cyan-50',    border: 'border-cyan-200',   header: 'bg-cyan-100 text-cyan-700' },
  'Enviar proposta ao Proprietário':{ bg: 'bg-cyan-50',    border: 'border-cyan-200',   header: 'bg-cyan-100 text-cyan-700' },
  'Em negociação':                  { bg: 'bg-orange-50',  border: 'border-orange-200', header: 'bg-orange-100 text-orange-700' },
  'Proposta aceite':                { bg: 'bg-amber-50',   border: 'border-amber-200',  header: 'bg-amber-100 text-amber-700' },
  'Enviar proposta ao investidor':  { bg: 'bg-teal-50',    border: 'border-teal-200',   header: 'bg-teal-100 text-teal-700' },
  'Follow Up após proposta':        { bg: 'bg-yellow-50',  border: 'border-yellow-200', header: 'bg-yellow-100 text-yellow-700' },
  'Follow UP':                      { bg: 'bg-yellow-50',  border: 'border-yellow-200', header: 'bg-yellow-100 text-yellow-700' },
  // Fecho
  'Wholesaling':                    { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  'CAEP':                           { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  'Fix and Flip':                   { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  // Saída
  'Não interessa':                  { bg: 'bg-red-50',     border: 'border-red-200',    header: 'bg-red-100 text-red-700' },
  'Descartado':                     { bg: 'bg-red-50',     border: 'border-red-200',    header: 'bg-red-100 text-red-700' },
  // Tarefas
  'A fazer':          { bg: 'bg-gray-50',    border: 'border-gray-200',   header: 'bg-gray-100 text-gray-700' },
  'Em andamento':     { bg: 'bg-blue-50',    border: 'border-blue-200',   header: 'bg-blue-100 text-blue-700' },
  'Atrasada':         { bg: 'bg-red-50',     border: 'border-red-200',    header: 'bg-red-100 text-red-700' },
  'Concluida':        { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  // Investidores
  'Potencial Investidor': { bg: 'bg-gray-50',  border: 'border-gray-200', header: 'bg-gray-100 text-gray-700' },
  'Marcar call':      { bg: 'bg-yellow-50',  border: 'border-yellow-200', header: 'bg-yellow-100 text-yellow-700' },
  'Call marcada':     { bg: 'bg-blue-50',    border: 'border-blue-200',   header: 'bg-blue-100 text-blue-700' },
  'Follow Up':        { bg: 'bg-orange-50',  border: 'border-orange-200', header: 'bg-orange-100 text-orange-700' },
  'Investidor classificado': { bg: 'bg-indigo-50', border: 'border-indigo-200', header: 'bg-indigo-100 text-indigo-700' },
  'Investidor em parceria':  { bg: 'bg-green-50',  border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  // Consultores
  'Cold Call':              { bg: 'bg-gray-50',    border: 'border-gray-200',   header: 'bg-gray-100 text-gray-700' },
  'Follow up':              { bg: 'bg-yellow-50',  border: 'border-yellow-200', header: 'bg-yellow-100 text-yellow-700' },
  'Aberto Parcerias':       { bg: 'bg-blue-50',    border: 'border-blue-200',   header: 'bg-blue-100 text-blue-700' },
  'Acesso imoveis Off market': { bg: 'bg-purple-50', border: 'border-purple-200', header: 'bg-purple-100 text-purple-700' },
  'Consultores em Parceria': { bg: 'bg-green-50',  border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  // Negócios — Fases
  'Fase de obras':    { bg: 'bg-orange-50',  border: 'border-orange-200', header: 'bg-orange-100 text-orange-700' },
  'Fase de venda':    { bg: 'bg-blue-50',    border: 'border-blue-200',   header: 'bg-blue-100 text-blue-700' },
  'Vendido':          { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  // Empreiteiros
  'Qualificado':      { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
  'Em avaliação':     { bg: 'bg-yellow-50',  border: 'border-yellow-200', header: 'bg-yellow-100 text-yellow-700' },
  'Rejeitado':        { bg: 'bg-red-50',     border: 'border-red-200',    header: 'bg-red-100 text-red-700' },
  'Inativo':          { bg: 'bg-gray-50',    border: 'border-gray-200',   header: 'bg-gray-100 text-gray-700' },
}

const DEFAULT_COLORS = { bg: 'bg-gray-50', border: 'border-gray-200', header: 'bg-gray-100 text-gray-700' }

/**
 * Kanban Board genérico.
 * @param {Object} props
 * @param {Array} props.columns - nomes das colunas (fases/estados)
 * @param {Array} props.items - todos os items
 * @param {string} props.groupField - campo que define a coluna (ex: 'estado', 'status')
 * @param {Function} props.renderCard - render function para cada card
 * @param {Function} props.onMove - callback quando um item é movido (id, newColumn)
 * @param {Function} props.onCardClick - callback quando um card é clicado (id)
 */
export function KanbanBoard({ columns, items, groupField, renderCard, onMove, onCardClick }) {
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function handleDragStart(e, item) {
    setDragging(item.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, col) {
    e.preventDefault()
    setDragOver(col)
  }

  function handleDrop(e, col) {
    e.preventDefault()
    if (dragging && onMove) {
      const item = items.find(i => i.id === dragging)
      if (item && (item[groupField] ?? '').replace(/^\d+-/, '') !== col) {
        onMove(dragging, col)
      }
    }
    setDragging(null)
    setDragOver(null)
  }

  function handleDragEnd() {
    setDragging(null)
    setDragOver(null)
  }

  // Group items by column — normaliza prefixos numéricos e acentos
  const normalize = s => (s ?? '').replace(/^\d+-\s*/, '').replace('Nao interessa', 'Não interessa').trim()
  const grouped = {}
  for (const col of columns) grouped[col] = []
  for (const item of items) {
    const val = normalize(item[groupField])
    const col = columns.find(c => val === c) ?? columns.find(c => val.includes(c)) ?? null
    if (col && grouped[col]) grouped[col].push(item)
    // Se não encontrou coluna, não esconder — pôr na última antes de "Não interessa"
    else if (grouped[columns[columns.length - 1]]) grouped[columns[columns.length - 1]].push(item)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
      {columns.map(col => {
        const colors = COLUMN_COLORS[col] ?? DEFAULT_COLORS
        const colItems = grouped[col] ?? []
        const isDragTarget = dragOver === col

        return (
          <div
            key={col}
            className={`flex-shrink-0 w-64 rounded-xl border ${colors.border} ${colors.bg} flex flex-col ${isDragTarget ? 'ring-2 ring-indigo-400' : ''}`}
            onDragOver={e => handleDragOver(e, col)}
            onDrop={e => handleDrop(e, col)}
            onDragLeave={() => setDragOver(null)}
          >
            {/* Header */}
            <div className={`px-3 py-2 rounded-t-xl ${colors.header} flex items-center justify-between`}>
              <span className="text-xs font-semibold uppercase tracking-wide truncate">{col}</span>
              <span className="text-xs font-bold bg-white bg-opacity-50 rounded-full w-5 h-5 flex items-center justify-center">
                {colItems.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: '500px' }}>
              {colItems.map(item => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={e => handleDragStart(e, item)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onCardClick?.(item.id)}
                  className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all ${
                    dragging === item.id ? 'opacity-50 cursor-grabbing' : ''
                  }`}
                >
                  {renderCard(item)}
                </div>
              ))}
              {colItems.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-6">Vazio</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
