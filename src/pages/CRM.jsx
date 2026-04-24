import { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from '../components/layout/Header.jsx'
import { KanbanBoard } from '../components/crm/KanbanBoard.jsx'
import { DetailPanel } from '../components/crm/DetailPanel.jsx'
import { Filters } from '../components/crm/Filters.jsx'
import { TabKPIs } from '../components/crm/TabKPIs.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { KanbanSkeleton, TableSkeleton } from '../components/ui/Skeleton.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Building2, Users, UserCheck, Briefcase, HardHat, ChevronLeft, ChevronRight } from 'lucide-react'
import { MultiSelect } from '../components/ui/MultiSelect.jsx'
import { EUR, cleanLabel, fmtDate, fmtDateRelative, IMOVEL_ESTADO_COLOR, INV_STATUS_COLOR, CONS_ESTATUTO_COLOR, CONS_ESTADO_AVALIACAO_COLOR, NEG_CAT_COLOR, NEG_FASE_COLOR, DESP_TIMING_COLOR, CLASS_COLOR } from '../constants.js'
import { apiFetch } from '../lib/api.js'
import { useUnreadCounts } from '../hooks/useUnreadCounts.js'
import { useUrlState, useUrlFilters } from '../hooks/useUrlState.js'

const TABS = ['Imóveis', 'Investidores', 'Consultores', 'Empreiteiros']

// Progresso checklist por imóvel (cache local)
let checklistProgressCache = {}

function Badge({ text, colorMap }) {
  const clean = cleanLabel(text)
  const cls = colorMap?.[clean] ?? colorMap?.[text] ?? 'bg-gray-100 text-gray-600'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{clean || '—'}</span>
}

function ClassBadge({ cls }) {
  if (!cls) return <span className="text-xs text-gray-300">—</span>
  return <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${CLASS_COLOR[cls] ?? 'bg-gray-400'}`}>{cls}</span>
}

// ── Relatório Semanal de Consultores ─────────────────────────
function RelatorioConsultores() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassResult, setReclassResult] = useState(null)

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/crm/relatorio/consultores').then(r => r.json()).then(setReport).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleReclassificar() {
    setReclassifying(true)
    try {
      const r = await apiFetch('/api/crm/automation/score-prioridade-consultores', { method: 'POST' })
      const data = await r.json()
      setReclassResult(data.relatorio || data)
      // Recarregar relatório
      const r2 = await apiFetch('/api/crm/relatorio/consultores')
      setReport(await r2.json())
    } catch {}
    setReclassifying(false)
  }

  if (loading) return <div className="text-center py-12 text-gray-400">A gerar relatório...</div>
  if (!report) return <div className="text-center py-12 text-gray-400">Erro ao carregar relatório</div>

  const classeColor = { A: 'bg-green-100 text-green-700 border-green-200', B: 'bg-blue-100 text-blue-700 border-blue-200', C: 'bg-yellow-100 text-yellow-700 border-yellow-200', D: 'bg-gray-100 text-gray-600 border-gray-200' }
  const classeLabel = { A: 'Parceiro', B: 'Activo', C: 'Em desenvolvimento', D: 'Novo' }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Relatório Semanal de Consultores</h2>
          <p className="text-xs text-gray-400">{report.semana} — Gerado: {new Date(report.gerado_em).toLocaleString('pt-PT')}</p>
        </div>
        <button onClick={handleReclassificar} disabled={reclassifying}
          className="px-4 py-2 text-xs font-medium rounded-xl transition-colors text-white disabled:opacity-50"
          style={{ backgroundColor: '#C9A84C' }}>
          {reclassifying ? 'A reclassificar...' : 'Reclassificar Agora'}
        </button>
      </div>

      {/* Resultado da reclassificação */}
      {reclassResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800">Reclassificação concluída</p>
          <p className="text-xs text-green-700">
            {reclassResult.reclassificados ?? reclassResult.atualizados ?? 0} consultores actualizados
          </p>
          {reclassResult.mudancas?.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-green-700 mb-1">Mudanças de classe:</p>
              {reclassResult.mudancas.map((m, i) => (
                <p key={i} className="text-xs text-green-600">{m.nome}: {m.de} → {m.para} (score {m.score})</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPIs globais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-gray-800">{report.total_consultores}</p>
          <p className="text-xs text-gray-500">Total Consultores</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold" style={{ color: '#C9A84C' }}>{report.metricas_globais.media_score}</p>
          <p className="text-xs text-gray-500">Score Médio</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-green-600">{report.metricas_globais.media_qualidade}%</p>
          <p className="text-xs text-gray-500">Qualidade Média</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-indigo-600">{report.metricas_globais.consultores_com_imoveis}</p>
          <p className="text-xs text-gray-500">Com Imóveis</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-red-600">{report.alertas.sem_contacto_48h}</p>
          <p className="text-xs text-gray-500">Sem 1o Contacto</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-orange-600">{report.alertas.inativos_60d}</p>
          <p className="text-xs text-gray-500">Inactivos 60d+</p>
        </div>
      </div>

      {/* Distribuição por classe */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribuição por Classe</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['A', 'B', 'C', 'D'].map(cl => (
            <div key={cl} className={`rounded-xl p-4 text-center border ${classeColor[cl]}`}>
              <p className="text-3xl font-bold">{report.distribuicao[cl] || 0}</p>
              <p className="text-xs font-medium mt-1">Classe {cl}</p>
              <p className="text-xs opacity-70">{classeLabel[cl]}</p>
            </div>
          ))}
        </div>
        {/* Barra visual */}
        <div className="flex rounded-full overflow-hidden h-3 mt-4">
          {['A', 'B', 'C', 'D'].map(cl => {
            const count = report.distribuicao[cl] || 0
            const pct = report.total_consultores > 0 ? (count / report.total_consultores * 100) : 0
            const colors = { A: 'bg-green-500', B: 'bg-blue-500', C: 'bg-yellow-500', D: 'bg-gray-300' }
            return pct > 0 ? <div key={cl} className={colors[cl]} style={{ width: `${pct}%` }} title={`${cl}: ${count}`} /> : null
          })}
        </div>
      </div>

      {/* Top 5 */}
      {report.top5?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 5 Consultores</h3>
          <div className="space-y-2">
            {report.top5.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: i === 0 ? '#C9A84C' : i === 1 ? '#9CA3AF' : i === 2 ? '#B87333' : '#E5E7EB', color: i > 2 ? '#6B7280' : '#fff' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{c.nome}</p>
                </div>
                <span className="text-sm font-mono font-bold" style={{ color: '#C9A84C' }}>{c.score}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classeColor[c.classe]}`}>{c.classe}</span>
                <span className="text-xs text-gray-400">{c.imoveis} im. · {c.qualidade}% qual.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela detalhada por classe */}
      {['A', 'B', 'C', 'D'].map(cl => {
        const grupo = report.consultores_detalhados.filter(c => c.classe === cl)
        if (grupo.length === 0) return null
        return (
          <div key={cl} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`px-4 py-2 ${classeColor[cl]} flex items-center justify-between`}>
              <span className="text-xs font-semibold uppercase">Classe {cl} — {classeLabel[cl]} ({grupo.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-100 text-gray-400">
                  <th className="text-left py-2 px-3">Nome</th>
                  <th className="text-left py-2 px-3">Agência</th>
                  <th className="text-right py-2 px-3">Score</th>
                  <th className="text-right py-2 px-3">Qualidade</th>
                  <th className="text-right py-2 px-3">Imóveis</th>
                  <th className="text-right py-2 px-3">Resp.</th>
                  <th className="text-left py-2 px-3">Estatuto</th>
                  <th className="text-left py-2 px-3">Contacto</th>
                </tr></thead>
                <tbody>
                  {grupo.map(c => (
                    <tr key={c.nome} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-800">{c.nome}</td>
                      <td className="py-2 px-3 text-gray-500">{c.agencia || '—'}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold" style={{ color: '#C9A84C' }}>{c.score}</td>
                      <td className="py-2 px-3 text-right font-mono">{c.taxaQualidade}%</td>
                      <td className="py-2 px-3 text-right font-mono">{c.volume}</td>
                      <td className="py-2 px-3 text-right font-mono">{c.tempoResposta != null ? `${c.tempoResposta}h` : '—'}</td>
                      <td className="py-3 px-3"><Badge text={c.estatuto} colorMap={CONS_ESTATUTO_COLOR} /></td>
                      <td className="py-2 px-3 text-gray-500">{c.contacto || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Relatório Semanal de Investidores ────────────────────────
function RelatorioInvestidores() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/crm/relatorio/investidores').then(r => r.json()).then(setReport).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-400">A gerar relatório...</div>
  if (!report) return <div className="text-center py-12 text-gray-400">Erro ao carregar relatório</div>

  const classeColor = { A: 'bg-green-100 text-green-700 border-green-200', B: 'bg-blue-100 text-blue-700 border-blue-200', C: 'bg-yellow-100 text-yellow-700 border-yellow-200', D: 'bg-gray-100 text-gray-600 border-gray-200', 'Sem classificação': 'bg-gray-50 text-gray-500 border-gray-200' }
  const classeLabel = { A: 'Parceiro', B: 'Qualificado', C: 'Em qualificação', D: 'Potencial', 'Sem classificação': 'Por classificar' }
  const m = report.metricas_globais

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">Relatório Semanal de Investidores</h2>
        <p className="text-xs text-gray-400">{report.semana} — Gerado: {new Date(report.gerado_em).toLocaleString('pt-PT')}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-gray-800">{report.total_investidores}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold" style={{ color: '#C9A84C' }}>{EUR(m.capital_total)}</p>
          <p className="text-xs text-gray-500">Capital Pool</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-green-600">{m.taxa_conversao}%</p>
          <p className="text-xs text-gray-500">Taxa Conversão</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-indigo-600">{m.com_reuniao}</p>
          <p className="text-xs text-gray-500">Com Reunião</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-red-600">{report.alertas.sem_contacto_30d}</p>
          <p className="text-xs text-gray-500">Sem Contacto 30d</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center border border-gray-200 shadow-sm">
          <p className="text-2xl font-bold text-orange-600">{m.em_parceria}</p>
          <p className="text-xs text-gray-500">Em Parceria</p>
        </div>
      </div>

      {/* Distribuição por classificação */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribuição por Classificação</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {['A', 'B', 'C', 'D', 'Sem classificação'].map(cl => (
            <div key={cl} className={`rounded-xl p-4 text-center border ${classeColor[cl]}`}>
              <p className="text-3xl font-bold">{report.distribuicao[cl] || 0}</p>
              <p className="text-xs font-medium mt-1">{cl === 'Sem classificação' ? '—' : `Classe ${cl}`}</p>
              <p className="text-xs opacity-70">{classeLabel[cl]}</p>
            </div>
          ))}
        </div>
        <div className="flex rounded-full overflow-hidden h-3 mt-4">
          {['A', 'B', 'C', 'D', 'Sem classificação'].map(cl => {
            const count = report.distribuicao[cl] || 0
            const pct = report.total_investidores > 0 ? (count / report.total_investidores * 100) : 0
            const colors = { A: 'bg-green-500', B: 'bg-blue-500', C: 'bg-yellow-500', D: 'bg-gray-300', 'Sem classificação': 'bg-gray-200' }
            return pct > 0 ? <div key={cl} className={colors[cl]} style={{ width: `${pct}%` }} title={`${cl}: ${count}`} /> : null
          })}
        </div>
      </div>

      {/* Pipeline por status */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline por Status</h3>
        <div className="space-y-2">
          {Object.entries(report.por_status).filter(([,c]) => c > 0).map(([status, count]) => {
            const pct = report.total_investidores > 0 ? Math.round(count / report.total_investidores * 100) : 0
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-40 shrink-0 truncate">{status}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div className="h-full rounded-full flex items-center px-2" style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: '#C9A84C' }}>
                    <span className="text-[10px] font-bold text-white">{count}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top 5 por capital */}
      {report.top5?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 5 Investidores (por capital)</h3>
          <div className="space-y-2">
            {report.top5.map((inv, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: i === 0 ? '#C9A84C' : i === 1 ? '#9CA3AF' : i === 2 ? '#B87333' : '#E5E7EB', color: i > 2 ? '#6B7280' : '#fff' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{inv.nome}</p>
                  <p className="text-xs text-gray-400">{inv.status}</p>
                </div>
                <span className="text-sm font-mono font-bold" style={{ color: '#C9A84C' }}>{EUR(inv.capital)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classeColor[inv.classificacao] || classeColor['Sem classificação']}`}>{inv.classificacao || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Alertas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'Sem contacto 30d', value: report.alertas.sem_contacto_30d, color: 'text-red-600' },
            { label: 'Sem reunião', value: report.alertas.sem_reuniao, color: 'text-orange-600' },
            { label: 'Sem capital', value: report.alertas.sem_capital, color: 'text-yellow-600' },
            { label: 'Sem classificação', value: report.alertas.sem_classificacao, color: 'text-gray-600' },
            { label: 'NDA pendente', value: report.alertas.nda_pendente, color: 'text-indigo-600' },
          ].map(a => (
            <div key={a.label} className="text-center p-2 rounded-lg bg-gray-50">
              <p className={`text-xl font-bold ${a.color}`}>{a.value}</p>
              <p className="text-[10px] text-gray-500">{a.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Follow-up Priority View ──────────────────────────────────
function FollowUpView({ data, onView, onDelete }) {
  // Ordenar: vermelho primeiro, depois laranja, depois por dias sem contacto desc, depois sem dados
  const sorted = [...data].sort((a, b) => {
    const priority = { red: 0, orange: 1, green: 3, null: 2 }
    const pa = priority[a._alertStatus] ?? 2
    const pb = priority[b._alertStatus] ?? 2
    if (pa !== pb) return pa - pb
    // Dentro do mesmo grupo, ordenar por dias sem contacto (mais dias = mais urgente)
    const da = a._diasSemContacto ?? -1
    const db = b._diasSemContacto ?? -1
    return db - da
  })

  const urgentes = sorted.filter(c => c._alertStatus === 'red')
  const atencao = sorted.filter(c => c._alertStatus === 'orange')
  const pendentes = sorted.filter(c => !c._alertStatus || c._alertStatus === null)
  const ok = sorted.filter(c => c._alertStatus === 'green')

  function Section({ title, icon, color, items, borderColor }) {
    if (items.length === 0) return null
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${color}`} />
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <span className="text-xs text-gray-400">({items.length})</span>
        </div>
        <div className="space-y-1.5">
          {items.map(c => {
            const agencia = c._agencia || (() => { try { return JSON.parse(c.imobiliaria || '[]').join(', ') } catch { return '' } })()
            const diasLabel = c._diasSemContacto != null ? `${c._diasSemContacto}d sem contacto` : 'Sem contacto registado'
            const followUp = c.data_proximo_follow_up
            const followUpLabel = followUp ? fmtDate(followUp) : null
            const isOverdue = followUp && new Date(followUp) < new Date()
            return (
              <div key={c.id}
                onClick={() => onView(c.id)}
                className={`flex items-center gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:shadow-sm transition-all ${borderColor}`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 truncate">{c.nome}</span>
                    {agencia && <span className="text-xs text-gray-400 truncate hidden sm:inline">{agencia}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500">{diasLabel}</span>
                    {followUpLabel && (
                      <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        Follow-up: {followUpLabel} {isOverdue ? '(atrasado)' : ''}
                      </span>
                    )}
                    {c.contacto && (
                      <a href={`tel:${c.contacto}`} onClick={e => e.stopPropagation()} className="text-xs text-green-600 hover:underline">
                        {c.contacto}
                      </a>
                    )}
                  </div>
                  {c.notas && (
                    <p className="text-xs text-gray-400 mt-1 truncate max-w-xl">{c.notas.split('\n')[0]}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge text={c.estatuto} colorMap={CONS_ESTATUTO_COLOR} />
                  {c.score_prioridade > 0 && (
                    <span className="text-xs font-mono font-semibold" style={{ color: '#C9A84C' }}>{c.score_prioridade}</span>
                  )}
                  <span className="text-xs text-gray-300">{c._totalImoveis ?? 0} im.</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
          <p className="text-2xl font-bold text-red-600">{urgentes.length}</p>
          <p className="text-xs text-red-500">Sem 1o contacto (&gt;48h)</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-200">
          <p className="text-2xl font-bold text-orange-600">{atencao.length}</p>
          <p className="text-xs text-orange-500">Inactivos (&gt;15 dias)</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
          <p className="text-2xl font-bold text-gray-600">{pendentes.length}</p>
          <p className="text-xs text-gray-500">Pendentes</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
          <p className="text-2xl font-bold text-green-600">{ok.length}</p>
          <p className="text-xs text-green-500">Em dia</p>
        </div>
      </div>

      <Section title="Urgente — Sem 1o contacto" color="bg-red-500" borderColor="border-red-200" items={urgentes} />
      <Section title="Atenção — Inactivos há mais de 15 dias" color="bg-orange-500" borderColor="border-orange-200" items={atencao} />
      <Section title="Pendentes" color="bg-gray-400" borderColor="border-gray-200" items={pendentes} />
      <Section title="Em dia — Check positivo recente" color="bg-green-500" borderColor="border-green-200" items={ok} />

      {data.length === 0 && (
        <EmptyState icon={UserCheck} title="Sem consultores" description="Ainda não existem consultores registados." />
      )}
    </div>
  )
}

export function CRM() {
  const [tab, setTab] = useUrlState('tab', 'Imóveis')
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useUrlState('q', '')
  const [searchInput, setSearchInput] = useState(search)
  const [editing, setEditing] = useState(null) // null = list view, object = edit/create
  const [detail, setDetail] = useUrlState('detail', '') // '' = no detail, id = show detail panel
  const [stats, setStats] = useState(null)
  const [view, setView] = useUrlState('view', 'kanban') // 'kanban' | 'table'
  const [filters, setFilters] = useUrlFilters()
  const [alertCount, setAlertCount] = useState(0)
  const [consultoresLookup, setConsultoresLookup] = useState([])
  const [invSubTab, setInvSubTab] = useUrlState('invSubTab', 'Passivo') // sub-tab investidores
  const [detailName, setDetailName] = useState(null) // nome para breadcrumb
  const { counts: unreadCounts } = useUnreadCounts(tab === 'Consultores')

  const toast = useToast()
  const searchTimer = useRef(null)
  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Empreiteiros': 'empreiteiros' }[tab]

  // Garantir filtro tipo_principal sincronizado para investidores
  const effectiveFilters = tab === 'Investidores' ? { ...filters, tipo_principal: invSubTab } : filters

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (search) {
        const params = new URLSearchParams({ search })
        // Investidores: sempre filtrar por tipo mesmo na pesquisa
        if (tab === 'Investidores') params.set('tipo_principal', invSubTab)
        for (const [k, v] of Object.entries(effectiveFilters)) { if (v && k !== 'tipo_principal') params.set(k, v) }
        const r = await apiFetch(`/api/crm/${endpoint}?${params}`)
        const d = await r.json()
        let items = d.data ?? []
        // Filtrar client-side se backend não suportar tipo_principal na pesquisa
        if (tab === 'Investidores') items = items.filter(i => (i.tipo_principal || 'Passivo') === invSubTab)
        setData(items); setTotal(items.length)
      } else if (tab === 'Consultores') {
        // Usar endpoint enriquecido para consultores (com métricas e alertas)
        const params = new URLSearchParams()
        for (const [k, v] of Object.entries(effectiveFilters)) { if (v) params.set(k, v) }
        const r = await apiFetch(`/api/crm/consultores/enriched${params.toString() ? '?' + params : ''}`)
        const d = await r.json()
        let items = d.data ?? []
        // Filtrar client-side por estado_avaliacao se necessário
        if (effectiveFilters.estado_avaliacao) items = items.filter(c => c.estado_avaliacao === effectiveFilters.estado_avaliacao)
        setData(items); setTotal(items.length)
      } else {
        const params = new URLSearchParams({ limit: '200' })
        for (const [k, v] of Object.entries(effectiveFilters)) { if (v) params.set(k, v) }
        const r = await apiFetch(`/api/crm/${endpoint}?${params}`)
        const d = await r.json()
        let items = d.data ?? []
        // Segurança extra: filtrar client-side para investidores
        if (tab === 'Investidores') items = items.filter(i => (i.tipo_principal || 'Passivo') === invSubTab)
        setData(items); setTotal(items.length)
      }
      // Carregar progresso checklist para imóveis
      if (tab === 'Imóveis') {
        apiFetch('/api/crm/checklist/progress-batch').then(r => r.json()).then(d => {
          checklistProgressCache = d
        }).catch(() => {})
      }
    } catch {}
    setLoading(false)
  }, [endpoint, tab, search, filters, invSubTab, effectiveFilters])

  useEffect(() => { load() }, [load])
  // Forçar filtro tipo_principal quando sub-tab investidores muda
  useEffect(() => {
    if (tab === 'Investidores') {
      setFilters(f => ({ ...f, tipo_principal: invSubTab }))
    }
  }, [invSubTab, tab])
  useEffect(() => { apiFetch('/api/crm/stats').then(r => r.json()).then(setStats).catch(() => {}) }, [])
  useEffect(() => { apiFetch('/api/alertas').then(r => r.json()).then(d => setAlertCount(d.resumo?.total ?? 0)).catch(() => {}) }, [])
  useEffect(() => {
    apiFetch('/api/crm/lookup/consultores').then(r => r.json()).then(list => {
      setConsultoresLookup(list)
    }).catch(() => {})
  }, [])

  function navigateToConsultor(nomeConsultor) {
    if (!nomeConsultor) return
    const nome = nomeConsultor.trim().toLowerCase()
    // Match parcial como o backend (ILIKE %nome%)
    const match = consultoresLookup.find(c =>
      c.nome?.trim().toLowerCase() === nome ||
      nome.includes(c.nome?.trim().toLowerCase()) ||
      c.nome?.trim().toLowerCase().includes(nome)
    )
    if (match) { setDetail(null); setTab('Consultores'); setTimeout(() => setDetail(match.id), 150) }
  }

  // Kanban config por tab
  const KANBAN_CONFIG = {
    'Imóveis': {
      columns: ['Pré-aprovação','Adicionado','Chamada Não Atendida','Pendentes','Necessidade de Visita','Visita Marcada','Estudo de VVR','Criar Proposta ao Proprietário','Enviar proposta ao Proprietário','Em negociação','Proposta aceite','Enviar proposta ao investidor','Follow Up após proposta','Follow UP','Wholesaling','CAEP','Fix and Flip','Não interessa'],
      groupField: 'estado',
      renderCard: (item) => {
        const cp = checklistProgressCache[item.id]?.[item.estado]
        return (
          <div>
            <p className="text-sm font-semibold text-gray-800 truncate">{item.nome}</p>
            <p className="text-xs text-gray-500 mt-1">{item.zona ?? '—'} · {item.tipologia ?? '—'}</p>
            {item.ask_price > 0 && <p className="text-xs font-mono text-indigo-600 mt-1">{EUR(item.ask_price)}</p>}
            {item.roi > 0 && <p className="text-xs text-green-600">ROI: {item.roi}%</p>}
            {item.nome_consultor && (
              <p className="text-xs text-blue-500 mt-1 cursor-pointer hover:text-blue-700 hover:underline transition-colors"
                onClick={(e) => { e.stopPropagation(); navigateToConsultor(item.nome_consultor) }}>
                {item.nome_consultor}
              </p>
            )}
            {cp && cp.total > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-gray-400">{cp.done}/{cp.total}</span>
                  {cp.done < cp.total && <span className="text-amber-500 font-medium">Pendente</span>}
                  {cp.done === cp.total && <span className="text-green-600 font-medium">Completa</span>}
                </div>
                <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${(cp.done / cp.total) * 100}%`,
                      backgroundColor: cp.done === cp.total ? '#22c55e' : '#C9A84C'
                    }} />
                </div>
              </div>
            )}
          </div>
        )
      },
    },
    'Investidores': {
      columns: ['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor em espera','Investidor em parceria'],
      groupField: 'status',
      renderCard: (item) => {
        const tipo = item.tipo_principal || 'Passivo'
        const tipoColor = tipo === 'Ativo' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-violet-100 text-violet-700 border-violet-200'
        return (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${tipoColor}`}>{tipo === 'Ativo' ? 'A' : 'P'}</span>
              <ClassBadge cls={item.classificacao} />
              <p className="text-sm font-semibold text-gray-800 truncate">{item.nome}</p>
            </div>
            <p className="text-xs text-gray-500">{item.origem ?? '—'}</p>
            {item.capital_max > 0 && <p className="text-xs font-mono text-indigo-600 mt-1">até {EUR(item.capital_max)}</p>}
            {item.telemovel && <p className="text-xs text-gray-400 mt-0.5">{item.telemovel}</p>}
            {item.duplicado_de && <p className="text-[9px] text-gray-300 mt-0.5">Perfil duplo</p>}
          </div>
        )
      },
    },
    'Consultores': {
      columns: ['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'],
      groupField: 'estatuto',
      renderCard: (item) => {
        const imobs = (() => { try { return JSON.parse(item.imobiliaria || '[]').join(', ') } catch { return '' } })()
        const alertDot = item._alertStatus === 'red' ? 'bg-red-500' : item._alertStatus === 'orange' ? 'bg-orange-500' : item._alertStatus === 'green' ? 'bg-green-500' : null
        return (
          <div>
            <div className="flex items-center gap-2">
              {alertDot && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${alertDot}`} />}
              <ClassBadge cls={item.classificacao} />
              <p className="text-sm font-semibold text-gray-800 truncate flex-1">{item.nome}</p>
              {unreadCounts[item.id] > 0 && (
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: '#25D366' }}>
                  {unreadCounts[item.id] > 99 ? '99+' : unreadCounts[item.id]}
                </span>
              )}
            </div>
            {imobs && <p className="text-xs text-gray-500 mt-1">{imobs}</p>}
            {item.contacto && <p className="text-xs text-gray-400 mt-1">{item.contacto}</p>}
            {(item._totalImoveis > 0 || item.imoveis_enviados > 0) && (
              <p className="text-xs text-indigo-600 mt-1">{item._totalImoveis ?? item.imoveis_enviados} leads</p>
            )}
            {item.score_prioridade > 0 && <p className="text-xs text-amber-600 mt-0.5">Score: {item.score_prioridade}</p>}
          </div>
        )
      },
    },
    'Empreiteiros': {
      columns: ['Qualificado','Em avaliação','Rejeitado','Inativo'],
      groupField: 'estado',
      renderCard: (item) => (
        <div>
          <p className="text-sm font-semibold text-gray-800 truncate">{item.nome}</p>
          {item.empresa && <p className="text-xs text-gray-500 mt-1">{item.empresa}</p>}
          {item.score > 0 && <p className="text-xs font-mono text-indigo-600 mt-1">Score: {item.score}</p>}
          {item.custo_medio_m2 > 0 && <p className="text-xs text-gray-400 mt-1">{EUR(item.custo_medio_m2)}/m²</p>}
        </div>
      ),
    },
  }

  const kanbanConfig = KANBAN_CONFIG[tab]
  const hasKanban = !!kanbanConfig

  async function handleMove(id, newColumn) {
    if (!kanbanConfig) return
    const field = kanbanConfig.groupField
    const item = data.find(i => i.id === id)
    await apiFetch(`/api/crm/${endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newColumn }),
    })
    // Auto-task on phase change
    apiFetch('/api/crm/auto-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: endpoint, entityId: id, entityName: item?.nome ?? item?.movimento ?? '', newPhase: newColumn }),
    }).catch(() => {})
    // Auto-criar projecto quando imóvel passa para modelo de negócio
    if (tab === 'Imóveis' && ['Wholesaling', 'Fix and Flip', 'CAEP', 'Mediação Imobiliária'].includes(newColumn)) {
      apiFetch('/api/automation/pipeline-to-faturacao', { method: 'POST' }).catch(() => {})
    }
    load()
  }

  async function handleSave(item) {
    // Validação básica
    const nameField = tab === 'Negócios' ? 'movimento' : 'nome'
    if (!item[nameField]?.trim()) {
      toast('Preenche o nome/título', 'error')
      return
    }
    try {
      const isNew = !item.id
      const url = isNew ? `/api/crm/${endpoint}` : `/api/crm/${endpoint}/${item.id}`
      const method = isNew ? 'POST' : 'PUT'
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
      if (!r.ok) throw new Error('Erro ao guardar')
      const saved = await r.json()
      toast(isNew ? 'Registo criado' : 'Registo atualizado', 'success')

      // Auto-gerar relatório PDF ao criar imóvel
      if (isNew && tab === 'Imóveis' && saved.id) {
        window.open(`/api/crm/imoveis/${saved.id}/relatorio`, '_blank')
        toast('Relatório PDF gerado automaticamente', 'success')
      }

      setEditing(null)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Tens a certeza que queres apagar este registo?')) return
    try {
      await apiFetch(`/api/crm/${endpoint}/${id}`, { method: 'DELETE' })
      toast('Registo apagado', 'success')
      load()
    } catch (e) {
      toast('Erro ao apagar', 'error')
    }
  }

  function handleSearch(value) {
    setSearchInput(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value, { replace: true }), 300) // debounce 300ms
  }

  // Sync local input com URL state quando este muda externamente (ex: Voltar do browser)
  useEffect(() => { setSearchInput(search) }, [search])

  // Atalhos de teclado: Esc fecha detalhe, ←/→ navega entre propriedades, /  foca pesquisa
  useEffect(() => {
    function onKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
        if (e.key === 'Escape') e.target.blur()
        return
      }
      if (e.key === 'Escape' && detail) { setDetail(null, { replace: true }); return }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && detail) {
        const idx = data.findIndex(i => i.id === detail)
        if (idx === -1) return
        const target = e.key === 'ArrowLeft' ? data[idx - 1] : data[idx + 1]
        if (target) setDetail(target.id, { replace: true })
        return
      }
      if (e.key === '/' && !detail) {
        const input = document.querySelector('input[type="text"][placeholder^="Pesquisar"]')
        if (input) { e.preventDefault(); input.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, data, setDetail])

  // Tracking do nome do registo aberto (para breadcrumb)
  useEffect(() => {
    if (!detail) { setDetailName(null); return }
    const found = data.find(i => i.id === detail)
    if (found) setDetailName(found.nome ?? found.movimento ?? null)
  }, [detail, data])

  // Breadcrumbs
  const breadcrumbs = []
  breadcrumbs.push({ label: 'CRM', to: '/crm' })
  if (tab) breadcrumbs.push({ label: tab, onClick: () => setDetail(null, { replace: true }) })
  if (detail && detailName) breadcrumbs.push({ label: detailName })

  return (
    <>
      <Header title="CRM" subtitle="Gestão de dados — Base de dados local" onRefresh={load} loading={loading} breadcrumbs={breadcrumbs} />
      <div className="p-4 sm:p-6 flex flex-col gap-3 sm:gap-4">

        {/* Stats banner */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm text-center">
                <p className="text-lg font-bold text-gray-900">{v.total}</p>
                <p className="text-xs text-gray-400 capitalize">{k}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 sm:gap-1 border-b border-gray-200 bg-white sticky top-0 z-10 rounded-t-xl px-1 sm:px-2 pt-2 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setSearch(''); setDetail(null, { replace: true }); setEditing(null) }}
              className={`px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                tab === t ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}>{t}</button>
          ))}
        </div>

        {/* KPIs integrados */}
        <TabKPIs tab={tab} />

        {/* Sub-tabs Investidores: Passivo / Ativo */}
        {tab === 'Investidores' && (
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <button onClick={() => { setInvSubTab('Passivo'); setDetail(null, { replace: true }) }}
                className={`px-5 py-2.5 text-sm font-semibold transition-all ${invSubTab === 'Passivo' ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-violet-50 hover:text-violet-600'}`}>
                Passivos
              </button>
              <button onClick={() => { setInvSubTab('Ativo'); setDetail(null, { replace: true }) }}
                className={`px-5 py-2.5 text-sm font-semibold transition-all border-l border-gray-200 ${invSubTab === 'Ativo' ? 'bg-orange-600 text-white' : 'bg-white text-gray-500 hover:bg-orange-50 hover:text-orange-600'}`}>
                Ativos
              </button>
            </div>
            <span className="text-xs text-gray-400">{data.length} investidor{data.length !== 1 ? 'es' : ''}</span>
          </div>
        )}

        {/* Filtros dinâmicos */}
        <Filters tab={tab} filters={filters} onChange={f => { setFilters(f); setSearch('') }} />

        {/* Search + Actions */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
          <input
            type="text" placeholder={`Pesquisar ${tab.toLowerCase()}... (/ para focar)`}
            value={searchInput} onChange={e => handleSearch(e.target.value)}
            className="w-full sm:flex-1 px-4 py-3 sm:py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="flex gap-2 items-center">
            {hasKanban && (
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setView('table')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'table' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                  Tabela
                </button>
                <button onClick={() => setView('kanban')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'kanban' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                  Kanban
                </button>
                {tab === 'Consultores' && (
                  <button onClick={() => setView('followups')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'followups' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                    Follow-ups
                  </button>
                )}
                {(tab === 'Consultores' || tab === 'Investidores') && (
                  <button onClick={() => setView('relatorio')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'relatorio' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                    Relatório
                  </button>
                )}
              </div>
            )}
            <button onClick={() => setEditing({})} className="px-3 sm:px-4 py-2 bg-indigo-600 text-white text-xs sm:text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap">
              + Novo
            </button>
            <a href={`/api/crm/backup?download=true`} className="hidden sm:block px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors">
              Backup
            </a>
          </div>
        </div>

        {/* Edit/Create form */}
        {editing !== null && (
          <FormPanel tab={tab} item={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
        )}

        {/* Loading */}
        {loading && editing === null && (
          view === 'kanban' ? <KanbanSkeleton columns={5} /> : <TableSkeleton rows={8} cols={6} />
        )}

        {/* Investidores: Split View (lista compacta + detalhe lado a lado) */}
        {tab === 'Investidores' && detail ? (
          <div className="flex gap-4" style={{ minHeight: '70vh' }}>
            {/* Lista compacta à esquerda */}
            <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                <input type="text" placeholder="Filtrar..." value={searchInput} onChange={e => handleSearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div className="flex-1 overflow-y-auto">
                {[...data].sort((a, b) => {
                  const order = ['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor em espera','Investidor em parceria']
                  return (order.indexOf(a.status) - order.indexOf(b.status)) || (a.nome || '').localeCompare(b.nome || '')
                }).map((inv, idx, sorted) => {
                  const isActive = inv.id === detail
                  const prevInv = idx > 0 ? sorted[idx - 1] : null
                  const statusChanged = !prevInv || prevInv.status !== inv.status
                  return (
                    <div key={inv.id}>
                      {statusChanged && (
                        <div className="px-3 py-1 bg-gray-50 border-b border-gray-100">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{inv.status}</span>
                        </div>
                      )}
                      <button onClick={() => setDetail(inv.id)}
                        className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-all ${
                          isActive
                            ? `${invSubTab === 'Ativo' ? 'bg-orange-50 border-l-3 border-l-orange-500' : 'bg-violet-50 border-l-3 border-l-violet-500'}`
                            : 'hover:bg-gray-50'
                        }`}>
                        <div className="flex items-center gap-2">
                          <ClassBadge cls={inv.classificacao} />
                          <span className={`text-sm truncate ${isActive ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{inv.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {inv.capital_max > 0 && <span className="text-[10px] font-mono text-indigo-600">{EUR(inv.capital_max)}</span>}
                          {inv.telemovel && <span className="text-[10px] text-gray-400">{inv.telemovel}</span>}
                        </div>
                      </button>
                    </div>
                  )
                })}
                {data.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Sem investidores</p>}
              </div>
              <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400 text-center">
                {data.length} investidor{data.length !== 1 ? 'es' : ''} {invSubTab === 'Ativo' ? 'ativos' : 'passivos'}
              </div>
            </div>

            {/* Detalhe à direita */}
            <div className="flex-1 min-w-0">
              {/* Navegação anterior/seguinte */}
              {(() => {
                const currentIdx = data.findIndex(i => i.id === detail)
                const prev = currentIdx > 0 ? data[currentIdx - 1] : null
                const next = currentIdx < data.length - 1 ? data[currentIdx + 1] : null
                return (
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => prev && setDetail(prev.id)} disabled={!prev}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition">
                      <ChevronLeft className="w-3.5 h-3.5" /> {prev ? prev.nome : 'Anterior'}
                    </button>
                    <span className="text-[10px] text-gray-400">{currentIdx + 1} de {data.length}</span>
                    <button onClick={() => next && setDetail(next.id)} disabled={!next}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition">
                      {next ? next.nome : 'Seguinte'} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })()}
              <DetailPanel type="Investidores" id={detail} onClose={() => { setDetail(null, { replace: true }); load() }} onSave={load}
                onNavigate={(navType, navId) => { setDetail(null, { replace: true }); setTab(navType, { replace: true }); setTimeout(() => setDetail(navId), 150) }} />
            </div>
          </div>
        ) : detail && ['Imóveis', 'Consultores'].includes(tab) ? (
          <DetailPanel type={tab} id={detail} onClose={() => { setDetail(null, { replace: true }); load() }} onSave={load}
            onNavigate={(navType, navId) => { setDetail(null, { replace: true }); setTab(navType, { replace: true }); setTimeout(() => setDetail(navId), 150) }} />
        ) : (<>
          {/* Follow-ups View (Consultores only) */}
          {!loading && editing === null && view === 'followups' && tab === 'Consultores' && (
            <FollowUpView data={data} onView={setDetail} onDelete={handleDelete} />
          )}

          {/* Relatório View */}
          {!loading && editing === null && view === 'relatorio' && tab === 'Consultores' && (
            <RelatorioConsultores />
          )}
          {!loading && editing === null && view === 'relatorio' && tab === 'Investidores' && (
            <RelatorioInvestidores />
          )}

          {/* Kanban View */}
          {!loading && editing === null && view === 'kanban' && kanbanConfig && data.length === 0 && (
            <EmptyState
              icon={{ 'Imóveis': Building2, 'Investidores': Users, 'Consultores': UserCheck, 'Empreiteiros': HardHat }[tab] || Building2}
              title={`Sem ${tab.toLowerCase()}`}
              description={search ? `Nenhum resultado para "${search}".` : `Ainda não existem ${tab.toLowerCase()} registados.`}
            />
          )}
          {!loading && editing === null && view === 'kanban' && kanbanConfig && data.length > 0 && (
            <KanbanBoard
              columns={kanbanConfig.columns}
              items={data}
              groupField={kanbanConfig.groupField}
              renderCard={kanbanConfig.renderCard}
              onMove={handleMove}
              onDelete={(id, nome) => {
                if (!confirm(`Apagar "${nome || 'este registo'}"?`)) return
                handleDelete(id)
              }}
              onCardClick={(id) => {
                if (['Imóveis', 'Investidores', 'Consultores'].includes(tab)) {
                  setDetail(id)
                } else if (tab === 'Negócios') {
                  const item = data.find(i => i.id === id)
                  if (item?.imovel_id) {
                    setTab('Imóveis')
                    setTimeout(() => setDetail(item.imovel_id), 100)
                  } else if (item) {
                    setEditing(item)
                  }
                } else {
                  const item = data.find(i => i.id === id)
                  if (item) setEditing(item)
                }
              }}
            />
          )}

          {/* Table View */}
          {!loading && editing === null && (view === 'table' || !hasKanban) && data.length === 0 && (
            <EmptyState
              icon={{ 'Imóveis': Building2, 'Investidores': Users, 'Consultores': UserCheck, 'Empreiteiros': HardHat }[tab] || Building2}
              title={`Sem ${tab.toLowerCase()}`}
              description={search ? `Nenhum resultado para "${search}".` : `Ainda não existem ${tab.toLowerCase()} registados.`}
            />
          )}
          {!loading && editing === null && (view === 'table' || !hasKanban) && data.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                {tab === 'Imóveis' && <ImoveisTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} onConsultorClick={navigateToConsultor} />}
                {tab === 'Investidores' && <InvestidoresTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} />}
                {tab === 'Consultores' && <ConsultoresTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} />}
                {tab === 'Negócios' && <NegociosTable data={data} onEdit={setEditing} onDelete={handleDelete}
                  onViewImovel={(imovelId) => { setTab('Imóveis'); setTimeout(() => setDetail(imovelId), 100) }} />}
                {tab === 'Empreiteiros' && <GenericTable data={data} onEdit={setEditing} onDelete={handleDelete}
                  columns={['nome','empresa','estado','zona','especializacao','score','custo_medio_m2']}
                  labels={{ nome:'Nome', empresa:'Empresa', estado:'Estado', zona:'Zona', especializacao:'Especialização', score:'Score', custo_medio_m2:'Custo/m²' }} />}
              </div>
              <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 border-t">
                {total} registos {search && `(pesquisa: "${search}")`}
              </div>
            </div>
          )}
        </>)}
      </div>
    </>
  )
}

// ── Sorting ──────────────────────────────────────────────────

function useSortableData(data) {
  const [sortField, setSortField] = useState(null)
  const [sortDir, setSortDir] = useState('asc') // 'asc' | 'desc'

  function onSort(field) {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortField(null); setSortDir('asc') } // reset
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sorted = [...data].sort((a, b) => {
    if (!sortField) return 0
    let va = a[sortField], vb = b[sortField]
    // Nulls go last
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    // Numbers
    if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
    // Try parse as number
    const na = parseFloat(va), nb = parseFloat(vb)
    if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
    // Strings
    const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase()
    const cmp = sa.localeCompare(sb, 'pt')
    return sortDir === 'asc' ? cmp : -cmp
  })

  return { sorted, sortField, sortDir, onSort }
}

function Th({ field, label, sortField, sortDir, onSort, align }) {
  const active = sortField === field
  const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <th onClick={() => onSort(field)}
      className={`${align === 'right' ? 'text-right' : 'text-left'} py-3 px-3 cursor-pointer select-none hover:text-indigo-600 active:text-indigo-800 transition-colors whitespace-nowrap ${active ? 'text-indigo-700' : ''}`}>
      {label}{arrow}
    </th>
  )
}

// ── Tables ────────────────────────────────────────────────────

function ActionButtons({ item, onEdit, onDelete, onView }) {
  return (
    <div className="flex gap-1.5">
      {onView && <button onClick={() => onView(item.id)} className="px-3 py-2 min-h-[36px] text-xs bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">Ver</button>}
      <button onClick={() => onEdit(item)} className="px-3 py-2 min-h-[36px] text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 active:bg-indigo-200 transition-colors">Abrir</button>
      <button onClick={() => onDelete(item.id)} className="px-3 py-2 min-h-[36px] text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors">Apagar</button>
    </div>
  )
}

function ClickableName({ name, onClick }) {
  return (
    <button onClick={onClick} className="text-left font-medium text-gray-800 hover:text-indigo-600 hover:underline transition-colors">
      {name}
    </button>
  )
}

function ImoveisTable({ data, onEdit, onDelete, onView, onConsultorClick }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <table className="min-w-[800px] w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <Th field="nome" label="Imóvel" {...sp} />
        <Th field="estado" label="Estado" {...sp} />
        <Th field="zona" label="Zona" {...sp} />
        <Th field="nome_consultor" label="Consultor" {...sp} />
        <Th field="ask_price" label="Ask Price" align="right" {...sp} />
        <Th field="roi" label="ROI" align="right" {...sp} />
        <Th field="origem" label="Origem" {...sp} />
        <Th field="data_adicionado" label="Data" {...sp} />
        <th className="py-3 px-3"></th>
      </tr></thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => onView?.(r.id)}>
            <td className="py-3 px-3"><ClickableName name={r.nome} onClick={() => onView?.(r.id)} /></td>
            <td className="py-3 px-3"><Badge text={r.estado} colorMap={IMOVEL_ESTADO_COLOR} /></td>
            <td className="py-2 px-3 text-gray-500">{r.zona ?? '—'}</td>
            <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
              {r.nome_consultor ? (
                <button onClick={() => onConsultorClick?.(r.nome_consultor)}
                  className="text-blue-600 hover:text-blue-800 hover:underline transition-colors text-left">
                  {r.nome_consultor}
                </button>
              ) : '—'}
            </td>
            <td className="py-2 px-3 text-right font-mono">{r.ask_price > 0 ? EUR(r.ask_price) : '—'}</td>
            <td className="py-2 px-3 text-right font-mono">{r.roi > 0 ? `${r.roi}%` : '—'}</td>
            <td className="py-2 px-3 text-gray-500">{r.origem ?? '—'}</td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.data_adicionado)}</td>
            <td className="py-3 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
          </tr>
        ))}
        {!sorted.length && <tr><td colSpan={9} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function InvestidoresTable({ data, onEdit, onDelete, onView }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <table className="min-w-[900px] w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <Th field="nome" label="Nome" {...sp} />
        <Th field="tipo_principal" label="Tipo" {...sp} />
        <Th field="classificacao" label="Class." {...sp} />
        <Th field="status" label="Status" {...sp} />
        <Th field="capital_max" label="Capital Max" align="right" {...sp} />
        <Th field="nda_assinado" label="NDA" {...sp} />
        <Th field="telemovel" label="Contacto" {...sp} />
        <Th field="data_primeiro_contacto" label="1º Contacto" {...sp} />
        <th className="py-3 px-3"></th>
      </tr></thead>
      <tbody>
        {sorted.map(r => {
          const tipo = r.tipo_principal || 'Passivo'
          const tipoStyle = tipo === 'Ativo' ? 'bg-orange-100 text-orange-700' : 'bg-violet-100 text-violet-700'
          return (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => onView?.(r.id)}>
              <td className="py-3 px-3"><ClickableName name={r.nome} onClick={() => onView?.(r.id)} /></td>
              <td className="py-2 px-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tipoStyle}`}>{tipo}</span></td>
              <td className="py-2 px-3 text-center"><ClassBadge cls={r.classificacao} /></td>
              <td className="py-3 px-3"><Badge text={r.status} colorMap={INV_STATUS_COLOR} /></td>
              <td className="py-2 px-3 text-right font-mono">{r.capital_max > 0 ? EUR(r.capital_max) : '—'}</td>
              <td className="py-2 px-3 text-center">{r.nda_assinado ? '✓' : '—'}</td>
              <td className="py-2 px-3 text-gray-500" onClick={e => e.stopPropagation()}>{r.telemovel ? <a href={`tel:${r.telemovel}`} className="text-green-600 hover:underline">{r.telemovel}</a> : r.email ? <a href={`mailto:${r.email}`} className="text-blue-600 hover:underline">{r.email}</a> : '—'}</td>
              <td className="py-2 px-3 text-gray-400">{fmtDate(r.data_primeiro_contacto)}</td>
              <td className="py-3 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
            </tr>
          )
        })}
        {!sorted.length && <tr><td colSpan={9} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function AlertDot({ status }) {
  if (!status) return null
  const color = status === 'red' ? 'bg-red-500' : status === 'orange' ? 'bg-orange-500' : status === 'green' ? 'bg-green-500' : null
  const title = status === 'red' ? 'Sem 1o contacto (>48h)' : status === 'orange' ? 'Inativo (>15 dias)' : status === 'green' ? 'Check positivo recente' : ''
  if (!color) return null
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} title={title} />
}

function ConsultoresTable({ data, onEdit, onDelete, onView }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <table className="min-w-[1100px] w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <th className="w-6 py-2 px-1"></th>
        <Th field="nome" label="Nome" {...sp} />
        <Th field="_agencia" label="Agência" {...sp} />
        <Th field="score_prioridade" label="Score" align="right" {...sp} />
        <Th field="_totalImoveis" label="Imóveis" align="right" {...sp} />
        <Th field="taxa_qualidade" label="Taxa Qualidade" align="right" {...sp} />
        <Th field="tempo_medio_resposta" label="Tempo Resposta" align="right" {...sp} />
        <Th field="estado_avaliacao" label="Estado" {...sp} />
        <Th field="data_proximo_follow_up" label="Próx. Follow-up" {...sp} />
        <Th field="_diasSemContacto" label="Dias s/ contacto" align="right" {...sp} />
        <th className="py-3 px-3"></th>
      </tr></thead>
      <tbody>
        {sorted.map(r => {
          const agencia = r._agencia || (() => { try { return JSON.parse(r.imobiliaria || '[]').join(', ') } catch { return '—' } })()
          const tempoResp = r.tempo_medio_resposta != null
            ? (r.tempo_medio_resposta < 1 ? `${Math.round(r.tempo_medio_resposta * 60)}min` : r.tempo_medio_resposta < 24 ? `${Math.round(r.tempo_medio_resposta)}h` : `${Math.round(r.tempo_medio_resposta / 24)}d`)
            : '—'
          return (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => onView?.(r.id)}>
              <td className="py-2 px-1 text-center"><AlertDot status={r._alertStatus} /></td>
              <td className="py-3 px-3"><ClickableName name={r.nome} onClick={() => onView?.(r.id)} /></td>
              <td className="py-2 px-3 text-gray-500">{agencia}</td>
              <td className="py-2 px-3 text-right font-mono font-semibold" style={{ color: '#C9A84C' }}>{r.score_prioridade > 0 ? r.score_prioridade : '—'}</td>
              <td className="py-2 px-3 text-right font-mono">{r._totalImoveis ?? r.imoveis_enviados ?? '—'}</td>
              <td className="py-2 px-3 text-right font-mono">{r.taxa_qualidade > 0 ? `${r.taxa_qualidade}%` : '—'}</td>
              <td className="py-2 px-3 text-right font-mono">{tempoResp}</td>
              <td className="py-3 px-3"><Badge text={r.estado_avaliacao || 'Em avaliação'} colorMap={CONS_ESTADO_AVALIACAO_COLOR} /></td>
              <td className="py-2 px-3 text-gray-400">{fmtDate(r.data_proximo_follow_up)}</td>
              <td className="py-2 px-3 text-right font-mono">{r._diasSemContacto != null ? `${r._diasSemContacto}d` : '—'}</td>
              <td className="py-3 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
            </tr>
          )
        })}
        {!sorted.length && <tr><td colSpan={11} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function NegociosTable({ data, onEdit, onDelete, onViewImovel }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <table className="min-w-[700px] w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        <Th field="movimento" label="Negócio" {...sp} />
        <Th field="categoria" label="Categoria" {...sp} />
        <Th field="fase" label="Fase" {...sp} />
        <Th field="lucro_estimado" label="Lucro Est." align="right" {...sp} />
        <Th field="lucro_real" label="Lucro Real" align="right" {...sp} />
        <Th field="data" label="Data" {...sp} />
        <th className="py-3 px-3"></th>
      </tr></thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
            onClick={() => r.imovel_id && onViewImovel?.(r.imovel_id)}>
            <td className="py-3 px-3">
              <span className={`font-medium ${r.imovel_id ? 'text-[#C9A84C] hover:underline' : 'text-gray-800'}`}>
                {r.movimento}
              </span>
              {r.imovel_id && <span className="text-[10px] text-gray-300 ml-1.5">→ ver imóvel</span>}
            </td>
            <td className="py-3 px-3"><Badge text={r.categoria} colorMap={NEG_CAT_COLOR} /></td>
            <td className="py-3 px-3"><Badge text={r.fase} colorMap={NEG_FASE_COLOR} /></td>
            <td className="py-2 px-3 text-right font-mono text-indigo-600">{EUR(r.lucro_estimado)}</td>
            <td className="py-2 px-3 text-right font-mono text-green-600">{r.lucro_real > 0 ? EUR(r.lucro_real) : '—'}</td>
            <td className="py-2 px-3 text-gray-400">{fmtDate(r.data)}</td>
            <td className="py-2 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} /></td>
          </tr>
        ))}
        {!sorted.length && <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

function GenericTable({ data, onEdit, onDelete, columns, labels }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <table className="min-w-[700px] w-full text-xs">
      <thead><tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
        {columns.map(c => <Th key={c} field={c} label={labels[c] || c} {...sp} />)}
        <th className="py-3 px-3"></th>
      </tr></thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
            {columns.map(c => (
              <td key={c} className="py-2 px-3 text-gray-600">
                {c === columns[0] ? <ClickableName name={r[c]} item={r} onEdit={onEdit} /> : (r[c] ?? '—')}
              </td>
            ))}
            <td className="py-3 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} /></td>
          </tr>
        ))}
        {!sorted.length && <tr><td colSpan={columns.length + 1} className="py-8 text-center text-gray-400">Sem registos</td></tr>}
      </tbody>
    </table>
  )
}

// ── Form Panel ────────────────────────────────────────────────

// Freguesias do concelho de Coimbra + zonas centrais Condeixa e Mealhada
const FREGUESIAS = [
  // Concelho de Coimbra (18 freguesias oficiais pós-2013)
  'Assafarge e Antanhol',
  'Brasfemes',
  'Ceira',
  'Cernache',
  'Eiras e São Paulo de Frades',
  'Ribeira de Frades',
  'Santa Clara e Castelo Viegas',
  'Santo António dos Olivais',
  'São João do Campo',
  'São Martinho de Árvore e Lamarosa',
  'São Martinho do Bispo',
  'São Silvestre',
  'Sé Nova, Santa Cruz, Almedina e São Bartolomeu',
  'Souselas e Botão',
  'Taveiro, Ameal e Arzila',
  'Torres do Mondego',
  'Trouxemil e Torre de Vilela',
  'Vil de Matos',
  // Condeixa (centro)
  'Condeixa-a-Nova',
  'Condeixa-a-Velha',
  // Mealhada (centro)
  'Mealhada',
  'Pampilhosa',
].sort()

const FIELD_DEFS = {
  'Imóveis': [
    { key: 'nome', label: 'Nome do Imóvel', type: 'text', required: true },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Adicionado','Chamada Não Atendida','Pendentes','Pré-aprovação','Necessidade de Visita','Visita Marcada','Estudo de VVR','Criar Proposta ao Proprietário','Enviar proposta ao Proprietário','Em negociação','Proposta aceite','Enviar proposta ao investidor','Follow Up após proposta','Follow UP','Wholesaling','CAEP','Fix and Flip','Não interessa'] },
    { key: 'tipologia', label: 'Tipologia', type: 'text' },
    { key: 'ask_price', label: 'Ask Price (€)', type: 'number' },
    { key: 'valor_proposta', label: 'Valor Proposta (€)', type: 'number' },
    { key: 'custo_estimado_obra', label: 'Custo Estimado Obra (€)', type: 'number' },
    { key: 'valor_venda_remodelado', label: 'Valor Venda Remodelado (€)', type: 'number' },
    { key: 'zona', label: 'Zona Principal', type: 'text' },
    { key: 'zonas', label: 'Zonas', type: 'multiselect', options: FREGUESIAS },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Pesquisa em portais/sites','Referência por consultores','Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro'] },
    { key: 'modelo_negocio', label: 'Modelo de Negócio', type: 'select', options: ['Wholesaling','Fix & Flip','CAEP','Mediação'] },
    { key: 'nome_consultor', label: 'Consultor', type: 'relation_name_or_new', endpoint: '/api/crm/lookup/consultores', display: r => `${r.nome} (${r.estatuto ?? '—'})`, createEndpoint: '/api/crm/consultores/find-or-create' },
    { key: 'tipo_oportunidade', label: 'Tipo Oportunidade', type: 'select', options: ['Portal', 'Off-Market'] },
    { key: 'link', label: 'Link do Imóvel', type: 'url' },
    { key: 'check_qualidade', label: 'Check Qualidade', type: 'checkbox' },
    { key: 'check_ouro', label: 'Check Ouro (3 critérios)', type: 'checkbox' },
    { key: 'motivo_descarte', label: 'Motivo Descarte', type: 'select', options: ['Preço elevado','Produto final não vendável','Sem interesse do investidor','Zona fraca','ROI insuficiente','Já vendido','Outro'] },
    { key: 'data_adicionado', label: 'Data Adicionado', type: 'date' },
    { key: 'data_chamada', label: 'Data Chamada', type: 'date' },
    { key: 'data_visita', label: 'Data Visita', type: 'date' },
    { key: 'data_estudo_mercado', label: 'Data Estudo Mercado', type: 'date' },
    { key: 'data_proposta', label: 'Data Proposta', type: 'date' },
    { key: 'data_proposta_aceite', label: 'Data Proposta Aceite', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Investidores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'tipo_principal', label: 'Tipo de Investidor', type: 'select', options: ['Passivo','Ativo'], required: true },
    { key: 'status', label: 'Status', type: 'select', options: ['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor em espera','Investidor em parceria'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Skool','Grupos Whatsapp','Referenciação','LinkedIn','Google Forms','Outro'] },
    { key: 'telemovel', label: 'Telemóvel', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'capital_min', label: 'Capital Mínimo (€)', type: 'number' },
    { key: 'capital_max', label: 'Capital Máximo (€)', type: 'number' },
    { key: 'montante_investido', label: 'Montante Investido (€)', type: 'number' },
    { key: 'nda_assinado', label: 'NDA Assinado', type: 'checkbox' },
    { key: 'estrategia', label: 'Estratégia de Investimento', type: 'multiselect', options: ['Wholesaling','CAEP','Fix & Flip','Mediação','Capital Passivo','Construção'] },
    { key: 'perfil_risco', label: 'Perfil de Risco', type: 'select', options: ['Conservador','Moderado','Agressivo'] },
    { key: 'roi_pretendido', label: 'ROI Pretendido', type: 'text' },
    { key: 'experiencia_imobiliario', label: 'Experiência Imobiliária', type: 'text' },
    { key: 'localizacao_preferida', label: 'Localização Preferida', type: 'text' },
    { key: 'tipo_imovel_preferido', label: 'Tipo Imóvel Preferido', type: 'text' },
    { key: 'equipa_obras', label: 'Equipa de Obras', type: 'text' },
    { key: 'origem_capital', label: 'Origem do Capital', type: 'select', options: ['Poupança pessoal','Actividade empresarial','Venda de activo','Herança','Outro'] },
    { key: 'preferencia_contacto', label: 'Preferência de Contacto', type: 'select', options: ['WhatsApp','Chamada','Email','Presencial'] },
    { key: 'data_primeiro_contacto', label: 'Data 1º Contacto', type: 'date' },
    { key: 'data_reuniao', label: 'Data Reunião', type: 'date' },
    { key: 'data_ultimo_contacto', label: 'Data Último Contacto', type: 'date' },
    { key: 'data_capital_transferido', label: 'Data Capital Transferido', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'data_proxima_acao', label: 'Data Próxima Ação', type: 'date' },
    { key: 'proxima_acao', label: 'Próxima Ação', type: 'text' },
    { key: 'motivo_nao_aprovacao', label: 'Motivo Não Aprovação', type: 'text' },
    { key: 'motivo_inatividade', label: 'Motivo Inatividade', type: 'text' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Consultores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'estatuto', label: 'Estatuto', type: 'select', options: ['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'] },
    { key: 'estado_avaliacao', label: 'Estado Avaliação', type: 'select', options: ['Em avaliação','Ativo','Inativo'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'contacto', label: 'Contacto (telefone)', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'imobiliaria', label: 'Imobiliária', type: 'multiselect', options: ['Remax','ERA','KW','Century21','Coldwell Banker','IAD','Listoo','Impactus','Decisões e Soluções','RE/MAX','Outra'] },
    { key: 'zonas', label: 'Zonas de Atuação', type: 'multiselect', options: FREGUESIAS },
    { key: 'data_inicio', label: 'Data Início Parceria', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'data_proximo_follow_up', label: 'Data Próximo Follow Up', type: 'date' },
    { key: 'motivo_follow_up', label: 'Motivo Follow Up', type: 'text' },
    { key: 'imoveis_enviados', label: 'Imóveis Enviados', type: 'number' },
    { key: 'imoveis_off_market', label: 'Imóveis Off-Market', type: 'number' },
    { key: 'meta_mensal_leads', label: 'Meta Mensal Leads', type: 'number' },
    { key: 'comissao', label: 'Comissão %', type: 'number' },
    { key: 'motivo_descontinuacao', label: 'Motivo Descontinuação', type: 'text' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Empreiteiros': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'empresa', label: 'Empresa', type: 'text' },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Qualificado','Em avaliação','Rejeitado','Inativo'] },
    { key: 'especializacao', label: 'Especialização', type: 'text' },
    { key: 'zona', label: 'Zona', type: 'text' },
    { key: 'score', label: 'Score', type: 'number' },
    { key: 'custo_medio_m2', label: 'Custo Médio m² (€)', type: 'number' },
    { key: 'fonte', label: 'Fonte', type: 'text' },
    { key: 'contrato_formalizado', label: 'Contrato Formalizado', type: 'checkbox' },
  ],
}

function RelationOrNew({ value, options, display, createEndpoint, onChange, onCreated }) {
  const [mode, setMode] = useState('select') // 'select' | 'new'
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await fetch(createEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: newName.trim() }),
      })
      const data = await r.json()
      onChange(data.nome || newName.trim())
      onCreated()
      setMode('select')
      setNewName('')
    } catch {}
    setCreating(false)
  }

  if (mode === 'new') {
    return (
      <div className="flex gap-2">
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do novo consultor" className={inputClass} />
        <button onClick={handleCreate} disabled={creating} className="px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 shrink-0">
          {creating ? '...' : 'Criar'}
        </button>
        <button onClick={() => setMode('select')} className="px-3 py-2 bg-gray-100 text-gray-600 text-xs rounded-lg shrink-0">Cancelar</button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <select value={value} onChange={e => onChange(e.target.value)} className={inputClass}>
        <option value="">— Selecionar —</option>
        {options.map(r => <option key={r.id} value={r.nome}>{display(r)}</option>)}
      </select>
      <button onClick={() => setMode('new')} className="px-3 py-2 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-200 shrink-0">+ Novo</button>
    </div>
  )
}

function FormPanel({ tab, item, onSave, onCancel }) {
  const fields = FIELD_DEFS[tab] ?? []
  const [form, setForm] = useState({ ...item })
  const [lookups, setLookups] = useState({})
  const isNew = !item.id

  // Load relation lookups
  useEffect(() => {
    fields.filter(f => ['relation', 'relation_name', 'relation_name_or_new'].includes(f.type)).forEach(f => {
      fetch(f.endpoint).then(r => r.json()).then(data => {
        setLookups(prev => ({ ...prev, [f.key]: data }))
      }).catch(() => {})
    })
  }, [tab])

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{isNew ? 'Novo Registo' : 'Editar Registo'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {fields.map(f => (
          <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2 xl:col-span-3' : ''}>
            <label className="block text-xs text-gray-500 mb-1">{f.label}{f.required && ' *'}</label>
            {f.type === 'select' ? (
              <select value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass}>
                <option value="">—</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'multiselect' ? (
              <MultiSelect value={form[f.key]} options={f.options} onChange={v => handleChange(f.key, v)} placeholder={`Selecionar ${f.label.toLowerCase()}...`} />
            ) : f.type === 'relation' ? (
              <select value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass}>
                <option value="">— Selecionar —</option>
                {(lookups[f.key] ?? []).map(r => <option key={r.id} value={r.id}>{f.display(r)}</option>)}
              </select>
            ) : f.type === 'relation_name' ? (
              <select value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass}>
                <option value="">— Selecionar —</option>
                {(lookups[f.key] ?? []).map(r => <option key={r.id} value={r.nome}>{f.display(r)}</option>)}
              </select>
            ) : f.type === 'relation_name_or_new' ? (
              <RelationOrNew
                value={form[f.key] ?? ''}
                options={lookups[f.key] ?? []}
                display={f.display}
                createEndpoint={f.createEndpoint}
                onChange={v => handleChange(f.key, v)}
                onCreated={() => {
                  fetch(f.endpoint).then(r => r.json()).then(data => setLookups(prev => ({ ...prev, [f.key]: data }))).catch(() => {})
                }}
              />
            ) : f.type === 'textarea' ? (
              <textarea value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} rows={3} className={inputClass} />
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!form[f.key]} onChange={e => handleChange(f.key, e.target.checked ? 1 : 0)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600" />
            ) : f.type === 'url' ? (
              <div className="flex gap-2">
                <input type="url" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} placeholder="https://..." />
                {form[f.key] && <a href={form[f.key]} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-gray-100 rounded-lg text-xs text-indigo-600 hover:bg-gray-200 shrink-0">Abrir</a>}
              </div>
            ) : f.type === 'tel' ? (
              <div className="flex gap-2">
                <input type="tel" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} />
                {form[f.key] && <a href={`tel:${form[f.key]}`} className="px-3 py-2 bg-green-50 rounded-lg text-xs text-green-600 hover:bg-green-100 shrink-0">Ligar</a>}
              </div>
            ) : f.type === 'email' ? (
              <div className="flex gap-2">
                <input type="email" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} />
                {form[f.key] && <a href={`mailto:${form[f.key]}`} className="px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-600 hover:bg-blue-100 shrink-0">Email</a>}
              </div>
            ) : (
              <input type={f.type} value={form[f.key] ?? ''} onChange={e => handleChange(f.key, f.type === 'number' ? +e.target.value : e.target.value)} className={inputClass} />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={() => onSave(form)} className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700">
          {isNew ? 'Criar' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="px-6 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200">
          Cancelar
        </button>
      </div>
    </div>
  )
}
