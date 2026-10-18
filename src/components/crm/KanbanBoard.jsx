import { toneOf } from '../../lib/statusTone.js'
import { useState, useEffect, useMemo, memo } from 'react'
import { EUR } from '../../constants.js'

const COLUMN_COLORS = {
  // Imóveis, investidores e consultores: cor vem de constants.js (prop colorMap).
  // Tarefas
  'A fazer':          { bg: 'bg-gray-50',    border: 'border-gray-200',   header: 'bg-gray-100 text-gray-700' },
  'Em andamento':     { bg: 'bg-blue-50',    border: 'border-blue-200',   header: 'bg-blue-100 text-blue-700' },
  'Atrasada':         { bg: 'bg-red-50',     border: 'border-red-200',    header: 'bg-red-100 text-red-700' },
  'Concluida':        { bg: 'bg-green-50',   border: 'border-green-200',  header: 'bg-green-100 text-green-700' },
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

// A cor da fase vai para o cabeçalho (filete, fundo leve, ponto); o corpo da
// coluna e os cartões ficam neutros, no estilo da plataforma.

const KanbanCard = memo(function KanbanCard({ item, dragging, onDragStart, onDragEnd, onCardClick, onDelete, renderCard }) {
  // view-transition-name único por item → o browser anima a transição entre colunas.
  const viewName = `kanban-card-${item.id}`
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, item)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick?.(item.id)}
      style={{ viewTransitionName: viewName }}
      className={`bg-surface-raised rounded-lg border border-line p-2.5 shadow-xs cursor-pointer hover:shadow-sm hover:border-ink/20 transition-[border-color,box-shadow,opacity,transform] duration-fast ease-entry group/card relative ${
        dragging ? 'opacity-50 cursor-grabbing scale-[0.98]' : ''
      }`}
    >
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(item.id, item.nome ?? item.movimento) }}
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-danger/10 text-danger hover:bg-danger hover:text-white flex items-center justify-center text-xs opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 transition-[opacity,background-color,color] duration-fast"
          aria-label="Apagar"
          title="Apagar">
          ×
        </button>
      )}
      {renderCard(item)}
    </div>
  )
}, (prev, next) => (
  prev.item.id === next.item.id &&
  prev.item.updated_at === next.item.updated_at &&
  prev.dragging === next.dragging &&
  prev.renderCard === next.renderCard &&
  prev.onDelete === next.onDelete
))

/**
 * Kanban Board genérico.
 * @param {Object} props
 * @param {Array} props.columns - nomes das colunas (fases/estados)
 * @param {Array} props.items - todos os items
 * @param {string} props.groupField - campo que define a coluna (ex: 'estado', 'status')
 * @param {Function} props.renderCard - render function para cada card
 * @param {Function} props.onMove - callback quando um item é movido (id, newColumn)
 * @param {Function} props.onCardClick - callback quando um card é clicado (id)
 * @param {Object} [props.colorMap] - cor por coluna (mapas de constants.js); sem ele usa COLUMN_COLORS
 * @param {Function} [props.etapaDe] - etapa de cada coluna (agrupa colunas no cabeçalho e no painel de fases)
 */
function KanbanBoardImpl({ columns, items, groupField, renderCard, onMove, onCardClick, onDelete, colorMap, etapaDe }) {
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  // Painel de fases: abre um instante depois de pegar no cartão (mexer no DOM
  // no próprio dragstart cancela o arrasto em alguns browsers).
  const [painel, setPainel] = useState(false)

  const toneDe = col => toneOf(colorMap?.[col] ?? (COLUMN_COLORS[col] ?? DEFAULT_COLORS).header)

  const normalize = s => (s ?? '').replace(/^\d+-\s*/, '').replace('Nao interessa', 'Não interessa').trim()
  const colunaDe = item => {
    const val = normalize(item?.[groupField])
    return columns.find(c => val === c) ?? columns.find(c => val.includes(c)) ?? null
  }

  useEffect(() => {
    if (!dragging) { setPainel(false); return }
    const t = setTimeout(() => setPainel(true), 60)
    return () => clearTimeout(t)
  }, [dragging])

  function handleDragStart(e, item) {
    setDragging(item.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, col) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOver !== col) setDragOver(col)
  }

  function handleDrop(e, col) {
    e.preventDefault()
    if (dragging && onMove) {
      const item = items.find(i => i.id === dragging)
      if (item && normalize(item[groupField]) !== col) {
        // View Transitions API: morph nativo entre estados (Chrome/Edge/Safari TP).
        // Fallback gracioso: chama onMove directo.
        if (typeof document !== 'undefined' && document.startViewTransition) {
          document.startViewTransition(() => onMove(dragging, col))
        } else {
          onMove(dragging, col)
        }
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
  const grouped = useMemo(() => {
    const acc = {}
    for (const col of columns) acc[col] = []
    for (const item of items) {
      const col = colunaDe(item)
      if (col && acc[col]) acc[col].push(item)
      else if (acc[columns[columns.length - 1]]) acc[columns[columns.length - 1]].push(item)
    }
    return acc
  }, [columns, items, groupField])

  // Colunas seguidas da mesma etapa formam um grupo (painel de fases).
  const grupos = useMemo(() => {
    const out = []
    for (const col of columns) {
      const etapa = etapaDe?.(col) ?? null
      const ult = out[out.length - 1]
      if (ult && ult.etapa === etapa) ult.cols.push(col)
      else out.push({ etapa, cols: [col] })
    }
    return out
  }, [columns, etapaDe])

  const itemArrastado = dragging ? items.find(i => i.id === dragging) : null
  const colunaAtual = itemArrastado ? colunaDe(itemArrastado) : null

  return (
    <>
    <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:snap-none" style={{ minHeight: '350px' }}>
      {columns.map((col, i) => {
        const tone = toneDe(col)
        const colItems = grouped[col] ?? []
        const isDragTarget = dragOver === col
        const etapa = etapaDe?.(col) ?? null
        const inicioEtapa = etapa && etapaDe?.(columns[i - 1]) !== etapa

        return (
          <div
            key={col}
            className={`flex-shrink-0 snap-center sm:snap-align-none w-[85vw] sm:w-64 rounded-xl border border-line bg-surface-muted/50 flex flex-col overflow-hidden transition-shadow duration-fast ${isDragTarget ? 'ring-2 ring-accent/60' : ''}`}
            onDragOver={e => handleDragOver(e, col)}
            onDrop={e => handleDrop(e, col)}
          >
            {/* Header */}
            <div className={`relative ${tone.head}`}>
              <span className={`absolute inset-x-0 top-0 h-[3px] ${tone.bar}`} aria-hidden="true" />
              <div className="px-3 pt-3 pb-2.5">
                {etapa && (
                  <p className={`text-overline font-semibold uppercase mb-0.5 ${inicioEtapa ? tone.text : 'text-ink-muted/60'}`}>{etapa}</p>
                )}
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                  <span className="flex-1 text-caption font-semibold text-ink truncate" title={col}>{col}</span>
                  <span className={`text-overline font-semibold num px-1.5 rounded-full ${tone.pill}`}>{colItems.length}</span>
                </div>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto" style={{ maxHeight: '600px' }}>
              {colItems.map(item => (
                <KanbanCard
                  key={item.id}
                  item={item}
                  dragging={dragging === item.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onCardClick={onCardClick}
                  onDelete={onDelete}
                  renderCard={renderCard}
                />
              ))}
              {colItems.length === 0 && (
                <p className="text-caption text-ink-muted/70 text-center py-6">Vazio</p>
              )}
            </div>
          </div>
        )
      })}
    </div>

    {/* Painel de fases: aparece enquanto se arrasta um cartão; largar numa
        fase move para lá, sem ter de procurar a coluna no quadro. */}
    {painel && itemArrastado && (
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 pointer-events-none animate-slide-up">
        <div className="pointer-events-auto w-full max-w-6xl rounded-xl border border-line bg-surface-raised/95 backdrop-blur shadow-xl p-3">
          <p className="text-caption text-ink-muted mb-2 px-0.5">
            Largue <span className="font-semibold text-ink">{itemArrastado.nome ?? itemArrastado.movimento ?? 'o cartão'}</span> na fase pretendida
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2.5">
            {grupos.map((g, gi) => (
              <div key={gi} className="flex flex-col gap-1">
                {g.etapa && <p className={`text-overline font-semibold uppercase px-0.5 ${toneDe(g.cols[0]).text}`}>{g.etapa}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {g.cols.map(col => {
                    const tone = toneDe(col)
                    const atual = col === colunaAtual
                    const sobre = dragOver === col && !atual
                    return (
                      <div
                        key={col}
                        onDragOver={atual ? undefined : e => handleDragOver(e, col)}
                        onDrop={atual ? undefined : e => handleDrop(e, col)}
                        className={`flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border text-caption font-medium transition-[transform,box-shadow,border-color] duration-fast ${
                          atual ? 'border-line border-dashed text-ink-muted/60 cursor-not-allowed' :
                          sobre ? `${tone.pill} border-transparent ring-2 ring-accent scale-[1.04] shadow-md` :
                          `${tone.pill} border-transparent`
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${atual ? 'bg-ink-muted/40' : tone.dot}`} aria-hidden="true" />
                        <span className="whitespace-nowrap">{col}</span>
                        {atual && <span className="text-overline">(atual)</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export const KanbanBoard = memo(KanbanBoardImpl)
