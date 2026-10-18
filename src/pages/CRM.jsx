import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BrandLoader } from '../components/ui/BrandLoader.jsx'
import { TabTransition, useTabDirection } from '../components/ui/PageTransition.jsx'
import { Header } from '../components/layout/Header.jsx'
import { KanbanBoard } from '../components/crm/KanbanBoard.jsx'
import { MOTIVOS_NAO_INTERESSA_PADRAO } from '../components/crm/detailPanelConstants.js'
import { TransicaoFaseModal } from '../components/crm/TransicaoFaseModal.jsx'
import { AgendarPassoModal } from '../components/crm/AgendarPassoModal.jsx'
import { ESTADOS_IMOVEIS } from '../constants/pipelineImoveis.js'
const DetailPanel = lazy(() => import('../components/crm/DetailPanel.jsx').then(m => ({ default: m.DetailPanel })))
import { Filters } from '../components/crm/Filters.jsx'
import { TabKPIs } from '../components/crm/TabKPIs.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { ErrorState } from '../components/ui/ErrorState.jsx'
import { Building2, UserCheck, HardHat, ChevronLeft, ChevronRight, Phone, MessageCircle, Wallet, AlertTriangle, Clock as Clock3, Plus, RefreshCw, HandCoins, Radar, Handshake } from 'lucide-react'
import { OportunidadesPanel } from '../components/crm/OportunidadesPanel.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { Button } from '../components/ui/Button.jsx'
import { MultiSelect } from '../components/ui/MultiSelect.jsx'
import { Combobox } from '../components/ui/Combobox.jsx'
import { EUR, cleanLabel, fmtDate, fmtDateRelative, IMOVEL_ESTADO_COLOR, INV_STATUS, INV_STATUS_COLOR, INV_STATUS_PASSIVO, INV_STATUS_ATIVO, invStatusFor, CONS_ESTATUTO_COLOR, CONS_ESTADO_AVALIACAO_COLOR, NEG_CAT_COLOR, NEG_FASE_COLOR, DESP_TIMING_COLOR, CLASS_COLOR, PARC_TIPOS, PARC_ESTADOS } from '../constants.js'
import { apiFetch, apiFetchJson, openDocument } from '../lib/api.js'
import { useUrlState, useUrlFilters } from '../hooks/useUrlState.js'
import { useRefreshOnMutation } from '../hooks/useRefreshOnMutation.js'
import { RegiaoToggle } from '../components/RegiaoBadge.jsx'
import { dotClass } from '../lib/statusTone.js'

// Sub-tabs regionais partilham as mesmas chaves de sessionStorage que o
// apiFetch consulta via getRegiaoActivaFromStorage — não trocar o prefixo
// sem actualizar os dois lados.
function readRegiaoCRM(regionalKey) {
  if (!regionalKey) return null
  try {
    const r = sessionStorage.getItem(`somnium.regiao.${regionalKey}`)
    return r === 'Coimbra' || r === 'AMP' ? r : null
  } catch { return null }
}

// tipo_principal é multi-valor (JSON array, ex: '["Ativo","Passivo"]') — um
// investidor pode ser Activo e Passivo em simultâneo, por isso "contém" e não
// igualdade exacta. Aceita também o formato legado (string simples).
function parseTipoPrincipalArr(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [raw] } catch { return [raw] }
}
function tipoPrincipalIncludes(raw, val) {
  const arr = parseTipoPrincipalArr(raw)
  return arr.length > 0 ? arr.includes(val) : val === 'Passivo'
}
// Área de atuação de um investidor ativo: 'AMP' (Porto) e/ou 'Coimbra'.
// Junta regioes_preferidas e localizacao_preferida (distritos), que nalguns
// registos vem como texto solto ("Porto ") em vez de array JSON.
function areasInvestidor(inv) {
  const vals = [...parseTipoPrincipalArr(inv.regioes_preferidas), ...parseTipoPrincipalArr(inv.localizacao_preferida)]
    .map(v => String(v || '').trim())
  const areas = new Set()
  if (vals.some(v => v === 'AMP' || v === 'Porto')) areas.add('AMP')
  if (vals.includes('Coimbra')) areas.add('Coimbra')
  return areas
}

const TABS = ['Imóveis', 'Investidores', 'Consultores', 'Construtores', 'Parceiros', 'Oportunidades']
// Sub-tabs que requerem distinção regional (modal ao entrar). Investidores
// é pool unificado (sem filtro).
const TABS_REGIONAIS = new Set(['Imóveis', 'Consultores', 'Construtores'])
const tabKeyRegional = (t) => `crm-${(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`


function Badge({ text, colorMap }) {
  const clean = cleanLabel(text)
  const cls = colorMap?.[clean] ?? colorMap?.[text]
  if (!clean) return <span className="text-caption text-ink-muted">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-muted text-caption font-medium text-ink whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(cls)}`} aria-hidden="true" />{clean}
    </span>
  )
}

function ClassBadge({ cls }) {
  if (!cls) return <span className="text-xs text-ink-muted/70">—</span>
  return <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${CLASS_COLOR[cls] ?? 'bg-ink/40'}`}>{cls}</span>
}

// ── Cards de KPI para Investidores (após escolher Activos/Passivos) ─────
// 4 quadros calculados a partir do `data` já filtrado pelo sub-tab:
//   - Investidores A         → count(classificacao = 'A')
//   - Investidores B         → count(classificacao = 'B')
//   - Capital Angariado      → Σ capital_max  WHERE status IN ('Investidor Qualificado em Carteira', 'Investidor em parceria')
//   - Capital Investido      → Σ montante_investido WHERE status = 'Investidor em parceria'
function InvestidoresKPICards({ data }) {
  const stats = data.reduce((a, inv) => {
    if (inv.classificacao === 'A') a.classA += 1
    if (inv.classificacao === 'B') a.classB += 1
    if (inv.status === 'Investidor Qualificado em Carteira' || inv.status === 'Investidor em parceria') {
      a.capAngariado += Number(inv.capital_max || 0)
    }
    if (inv.status === 'Investidor em parceria') a.capInvestido += Number(inv.montante_investido || 0)
    return a
  }, { classA: 0, classB: 0, capAngariado: 0, capInvestido: 0 })

  const cards = [
    { label: 'Investidores A',    value: stats.classA },
    { label: 'Investidores B',    value: stats.classB },
    { label: 'Capital angariado', value: EUR(stats.capAngariado), hint: 'Qualificados + parceria' },
    { label: 'Capital investido', value: EUR(stats.capInvestido), hint: 'Investidores em parceria' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface-raised px-4 py-3 shadow-xs">
          <p className="text-overline uppercase text-ink-muted">{c.label}</p>
          <p className="font-display text-2xl text-ink num mt-1">{c.value}</p>
          {c.hint && <p className="text-caption text-ink-muted mt-0.5">{c.hint}</p>}
        </div>
      ))}
    </div>
  )
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

  if (loading) return <div className="text-center py-12 text-ink-muted">A gerar relatório...</div>
  if (!report) return <div className="text-center py-12 text-ink-muted">Erro ao carregar relatório</div>

  const classeColor = { A: 'bg-success/15 text-success border-success/30', B: 'bg-surface-muted text-ink border-line', C: 'bg-warning/15 text-warning border-warning/30', D: 'bg-surface-muted text-ink-muted border-line' }
  const classeLabel = { A: 'Parceiro', B: 'Activo', C: 'Em desenvolvimento', D: 'Novo' }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Relatório Semanal de Consultores</h2>
          <p className="text-xs text-ink-muted">{report.semana} — Gerado: {new Date(report.gerado_em).toLocaleString('pt-PT')}</p>
        </div>
        <button onClick={handleReclassificar} disabled={reclassifying}
          className="px-4 py-2 text-xs font-medium rounded-xl transition-colors bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
          {reclassifying ? 'A reclassificar...' : 'Reclassificar Agora'}
        </button>
      </div>

      {/* Resultado da reclassificação */}
      {reclassResult && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-success">Reclassificação concluída</p>
          <p className="text-xs text-success">
            {reclassResult.reclassificados ?? reclassResult.atualizados ?? 0} consultores atualizados
          </p>
          {reclassResult.mudancas?.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-success mb-1">Mudanças de classe:</p>
              {reclassResult.mudancas.map((m, i) => (
                <p key={i} className="text-xs text-success">{m.nome}: {m.de} → {m.para} (score {m.score})</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPIs globais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-ink">{report.total_consultores}</p>
          <p className="text-xs text-ink-muted">Total Consultores</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-accent-ink">{report.metricas_globais.media_score}</p>
          <p className="text-xs text-ink-muted">Score Médio</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-success">{report.metricas_globais.media_qualidade}%</p>
          <p className="text-xs text-ink-muted">Qualidade Média</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-ink">{report.metricas_globais.consultores_com_imoveis}</p>
          <p className="text-xs text-ink-muted">Com Imóveis</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-danger">{report.alertas.sem_contacto_48h}</p>
          <p className="text-xs text-ink-muted">Sem 1o Contacto</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-orange-600">{report.alertas.inativos_60d}</p>
          <p className="text-xs text-ink-muted">Inativos 60d+</p>
        </div>
      </div>

      {/* Distribuição por classe */}
      <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">Distribuição por Classe</h3>
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
            const colors = { A: 'bg-success', B: 'bg-blue-500', C: 'bg-warning', D: 'bg-ink/20' }
            return pct > 0 ? <div key={cl} className={colors[cl]} style={{ width: `${pct}%` }} title={`${cl}: ${count}`} /> : null
          })}
        </div>
      </div>

      {/* Top 5 */}
      {report.top5?.length > 0 && (
        <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Top 5 Consultores</h3>
          <div className="space-y-2">
            {report.top5.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: i === 0 ? '#C9A84C' : i === 1 ? '#9CA3AF' : i === 2 ? '#B87333' : '#E5E7EB', color: i > 2 ? '#6B7280' : '#fff' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{c.nome}</p>
                </div>
                <span className="text-sm num font-bold text-accent-ink">{c.score}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classeColor[c.classe]}`}>{c.classe}</span>
                <span className="text-xs text-ink-muted">{c.imoveis} im. · {c.qualidade}% qual.</span>
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
          <div key={cl} className="bg-surface-raised  rounded-xl border border-line  shadow-xs overflow-hidden">
            <div className={`px-4 py-2 ${classeColor[cl]} flex items-center justify-between`}>
              <span className="text-xs font-semibold uppercase">Classe {cl} — {classeLabel[cl]} ({grupo.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-line text-ink-muted">
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
                    <tr key={c.nome} className="border-b border-line hover:bg-surface">
                      <td className="py-2 px-3 font-medium text-ink">{c.nome}</td>
                      <td className="py-2 px-3 text-ink-muted">{c.agencia || '—'}</td>
                      <td className="py-2 px-3 text-right num font-semibold text-accent-ink">{c.score}</td>
                      <td className="py-2 px-3 text-right num">{c.taxaQualidade}%</td>
                      <td className="py-2 px-3 text-right num">{c.volume}</td>
                      <td className="py-2 px-3 text-right num">{c.tempoResposta != null ? `${c.tempoResposta}h` : '—'}</td>
                      <td className="py-3 px-3"><Badge text={c.estatuto} colorMap={CONS_ESTATUTO_COLOR} /></td>
                      <td className="py-2 px-3 text-ink-muted">{c.contacto || '—'}</td>
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

  if (loading) return <div className="text-center py-12 text-ink-muted">A gerar relatório...</div>
  if (!report) return <div className="text-center py-12 text-ink-muted">Erro ao carregar relatório</div>

  const classeColor = { A: 'bg-success/15 text-success border-success/30', B: 'bg-surface-muted text-ink border-line', C: 'bg-warning/15 text-warning border-warning/30', D: 'bg-surface-muted text-ink-muted border-line', 'Sem classificação': 'bg-surface text-ink-muted border-line' }
  const classeLabel = { A: 'Parceiro', B: 'Qualificado', C: 'Em qualificação', D: 'Potencial', 'Sem classificação': 'Por classificar' }
  const m = report.metricas_globais

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-ink">Relatório Semanal de Investidores</h2>
        <p className="text-xs text-ink-muted">{report.semana} — Gerado: {new Date(report.gerado_em).toLocaleString('pt-PT')}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-ink">{report.total_investidores}</p>
          <p className="text-xs text-ink-muted">Total</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-accent-ink">{EUR(m.capital_total)}</p>
          <p className="text-xs text-ink-muted">Capital Pool</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-success">{m.taxa_conversao}%</p>
          <p className="text-xs text-ink-muted">Taxa Conversão</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-ink">{m.com_reuniao}</p>
          <p className="text-xs text-ink-muted">Com Reunião</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-danger">{report.alertas.sem_contacto_30d}</p>
          <p className="text-xs text-ink-muted">Sem Contacto 30d</p>
        </div>
        <div className="bg-surface-raised rounded-xl p-3 text-center border border-line shadow-sm">
          <p className="text-2xl font-bold text-orange-600">{m.em_parceria}</p>
          <p className="text-xs text-ink-muted">Em Parceria</p>
        </div>
      </div>

      {/* Distribuição por classificação */}
      <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">Distribuição por Classificação</h3>
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
            const colors = { A: 'bg-success', B: 'bg-blue-500', C: 'bg-warning', D: 'bg-ink/20', 'Sem classificação': 'bg-line' }
            return pct > 0 ? <div key={cl} className={colors[cl]} style={{ width: `${pct}%` }} title={`${cl}: ${count}`} /> : null
          })}
        </div>
      </div>

      {/* Pipeline por status */}
      <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">Pipeline por Status</h3>
        <div className="space-y-2">
          {Object.entries(report.por_status).filter(([,c]) => c > 0).map(([status, count]) => {
            const pct = report.total_investidores > 0 ? Math.round(count / report.total_investidores * 100) : 0
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="text-xs text-ink-muted w-40 shrink-0 truncate">{status}</span>
                <div className="flex-1 bg-surface-muted rounded-full h-5 overflow-hidden">
                  <div className="h-full rounded-full flex items-center px-2 bg-accent" style={{ width: `${Math.max(pct, 8)}%` }}>
                    <span className="text-[10px] font-bold text-white">{count}</span>
                  </div>
                </div>
                <span className="text-xs text-ink-muted w-10 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top 5 por capital */}
      {report.top5?.length > 0 && (
        <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Top 5 Investidores (por capital)</h3>
          <div className="space-y-2">
            {report.top5.map((inv, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: i === 0 ? '#C9A84C' : i === 1 ? '#9CA3AF' : i === 2 ? '#B87333' : '#E5E7EB', color: i > 2 ? '#6B7280' : '#fff' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{inv.nome}</p>
                  <p className="text-xs text-ink-muted">{inv.status}</p>
                </div>
                <span className="text-sm num font-bold text-accent-ink">{EUR(inv.capital)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classeColor[inv.classificacao] || classeColor['Sem classificação']}`}>{inv.classificacao || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas */}
      <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">Alertas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'Sem contacto 30d', value: report.alertas.sem_contacto_30d, color: 'text-danger' },
            { label: 'Sem reunião', value: report.alertas.sem_reuniao, color: 'text-orange-600' },
            { label: 'Sem capital', value: report.alertas.sem_capital, color: 'text-warning' },
            { label: 'Sem classificação', value: report.alertas.sem_classificacao, color: 'text-ink-muted' },
            { label: 'NDA pendente', value: report.alertas.nda_pendente, color: 'text-ink' },
          ].map(a => (
            <div key={a.label} className="text-center p-2 rounded-lg bg-surface">
              <p className={`text-xl font-bold ${a.color}`}>{a.value}</p>
              <p className="text-[10px] text-ink-muted">{a.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Modal: capturar motivo (+ data) ao mover imóvel para Follow UP / Não interessa
function MoveReasonModal({ moveModal, item, onConfirm, onCancel }) {
  const isFollowUp = moveModal.type === 'follow_up'
  const today = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState(String(item?.data_follow_up || '').slice(0, 10) || today)
  const initialMotivo = isFollowUp ? (item?.motivo_follow_up || '') : (item?.motivo_nao_interessa || '')
  const padraoSet = new Set(MOTIVOS_NAO_INTERESSA_PADRAO)
  const partesIniciais = initialMotivo.split(/;\s*/).map(s => s.trim()).filter(Boolean)
  const [selectedPresets, setSelectedPresets] = useState(
    new Set(isFollowUp ? [] : partesIniciais.filter(p => padraoSet.has(p)))
  )
  const [notas, setNotas] = useState(
    isFollowUp ? initialMotivo : partesIniciais.filter(p => !padraoSet.has(p)).join('; ')
  )
  const [saving, setSaving] = useState(false)

  function buildMotivo() {
    if (isFollowUp) return notas.trim()
    return [...selectedPresets, notas.trim()].filter(Boolean).join('; ')
  }

  function togglePreset(m) {
    const novos = new Set(selectedPresets)
    if (novos.has(m)) novos.delete(m)
    else novos.add(m)
    setSelectedPresets(novos)
  }

  async function confirm() {
    const motivoFinal = buildMotivo()
    if (!motivoFinal || (isFollowUp && !data)) return
    setSaving(true)
    const extra = isFollowUp
      ? { motivo_follow_up: motivoFinal, data_follow_up: data || null }
      : { motivo_nao_interessa: motivoFinal }
    try { await onConfirm(extra) } finally { setSaving(false) }
  }

  const motivoFinal = buildMotivo()

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-surface-raised rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink mb-1">
          {isFollowUp ? 'Mover para Follow UP' : 'Mover para Não Interessa'}
        </h3>
        <p className="text-xs text-ink-muted mb-4">
          {item?.nome ? `Imóvel: ${item.nome}` : 'Indica o motivo da transição.'}
        </p>

        {isFollowUp && (
          <div className="mb-4">
            <label className="text-xs font-medium text-ink-muted block mb-1">Data do follow-up * (cria a tarefa na agenda)</label>
            <input type="date" value={data || ''} onChange={e => setData(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
          </div>
        )}

        {!isFollowUp && (
          <div className="mb-3">
            <label className="text-xs font-medium text-ink-muted block mb-2">Motivos padrão</label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_NAO_INTERESSA_PADRAO.map(m => {
                const on = selectedPresets.has(m)
                return (
                  <button key={m} type="button" onClick={() => togglePreset(m)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      on ? 'border-accent bg-accent text-accent-foreground' : 'bg-surface-raised border-line text-ink-muted hover:bg-surface'
                    }`}>
                    {on && <span className="mr-1">✓</span>}{m}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-5">
          <label className="text-xs font-medium text-ink-muted block mb-1">
            {isFollowUp ? 'Motivo do Follow Up *' : 'Outras notas (opcional)'}
          </label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={isFollowUp ? 4 : 2}
            placeholder={isFollowUp ? 'Ex: Aguardar resposta do proprietário…' : 'Ex: detalhe específico, contexto adicional…'}
            autoFocus={isFollowUp}
            className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-line text-ink-muted hover:bg-surface disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={confirm} disabled={saving || !motivoFinal || (isFollowUp && !data)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
            {saving ? 'A guardar…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CRM() {
  const [tab, setTab] = useUrlState('tab', 'Imóveis')
  const direcaoAba = useTabDirection(tab, TABS)
  // Filtro regional inline (Coimbra | AMP | Geral). Uma chave de sessionStorage
  // por sub-tab regional — partilhada com apiFetch.getRegiaoActivaFromStorage.
  const regionalKey = TABS_REGIONAIS.has(tab) ? tabKeyRegional(tab) : null
  const [regiaoActiva, setRegiaoState] = useState(() => readRegiaoCRM(regionalKey))
  useEffect(() => { setRegiaoState(readRegiaoCRM(regionalKey)) }, [regionalKey])
  const setRegiaoActiva = (r) => {
    setRegiaoState(r)
    if (!regionalKey) return
    try {
      if (r) sessionStorage.setItem(`somnium.regiao.${regionalKey}`, r)
      else sessionStorage.removeItem(`somnium.regiao.${regionalKey}`)
    } catch {}
  }
  const [search, setSearch] = useUrlState('q', '')
  const [searchInput, setSearchInput] = useState(search)
  const [editing, setEditing] = useState(null) // null = list view, object = edit/create
  const [detail, setDetail] = useUrlState('detail', '') // '' = no detail, id = show detail panel
  // Quando true, a próxima abertura de detail arranca já em edit mode. Reseta
  // automaticamente após ser consumido. Usado pelo fluxo "criar → continuar edit".
  const [detailDefaultEdit, setDetailDefaultEdit] = useState(false)
  const [stats, setStats] = useState(null)
  const [viewUrl, setView] = useUrlState('view', 'kanban') // 'kanban' | 'table'
  const view = viewUrl === 'followups' ? 'kanban' : viewUrl // vista retirada: links antigos caem no Kanban
  const [filters, setFilters] = useUrlFilters()
  const [alertCount, setAlertCount] = useState(0)
  const [consultoresLookup, setConsultoresLookup] = useState([])
  const [invSubTab, setInvSubTab] = useUrlState('invSubTab', 'Passivo') // sub-tab investidores
  const [invArea, setInvArea] = useUrlState('invArea', '') // área dos ativos: '' (Geral) | 'Coimbra' | 'AMP'
  const [detailName, setDetailName] = useState(null) // nome para breadcrumb
  const [moveModal, setMoveModal] = useState(null) // { id, newColumn, type } | null
  const [agendar, setAgendar] = useState(null) // { id, newColumn, tipo } | null — janela de data ao mover para fases com passo agendado
  const [transicao, setTransicao] = useState(null) // { id, newColumn, requisitos } | null — janela de registo ao mudar de fase

  const toast = useToast()
  const queryClient = useQueryClient()
  const searchTimer = useRef(null)
  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores', 'Construtores': 'empreiteiros', 'Parceiros': 'parceiros' }[tab]

  // Garantir filtro tipo_principal sincronizado para investidores.
  // useMemo estabiliza referencia entre renders — sem isto, o load (useCallback)
  // recriava a cada render em Investidores e causava loop infinito de fetch.
  const effectiveFilters = useMemo(
    () => tab === 'Investidores' ? { ...filters, tipo_principal: invSubTab } : filters,
    [tab, filters, invSubTab]
  )

  // Migrado para React Query (Problema 23 da auditoria): antes cada mudança de
  // aba refazia o pedido do zero e mostrava sempre um spinner, mesmo ao voltar
  // a uma aba já vista há segundos — a cache (staleTime/gcTime já configurados
  // em src/lib/queryClient.js, nunca ligados a nenhuma página) torna a
  // navegação entre abas instantânea a partir da 2ª visita. A forma de chamar
  // (`load()`) mantém-se igual para não obrigar a mexer nos ~15 sítios que já
  // a invocam directamente após mutações.
  const listQuery = useQuery({
    queryKey: ['crm-list', tab, endpoint, search, invSubTab, effectiveFilters, regiaoActiva],
    enabled: tab !== 'Oportunidades',
    queryFn: async () => {
      // Geral (regiaoActiva = null) é válido — backend devolve sem filtro.
      let items
      if (search) {
        const params = new URLSearchParams({ search })
        // Investidores: sempre filtrar por tipo mesmo na pesquisa
        if (tab === 'Investidores') params.set('tipo_principal', invSubTab)
        for (const [k, v] of Object.entries(effectiveFilters)) { if (v && k !== 'tipo_principal') params.set(k, v) }
        const d = await apiFetchJson(`/api/crm/${endpoint}?${params}`, { regiao: regiaoActiva })
        items = d.data ?? []
        // Filtrar client-side se backend não suportar tipo_principal na pesquisa
        if (tab === 'Investidores') items = items.filter(i => tipoPrincipalIncludes(i.tipo_principal, invSubTab))
      } else if (tab === 'Consultores') {
        // Usar endpoint enriquecido para consultores (com métricas e alertas)
        const params = new URLSearchParams()
        for (const [k, v] of Object.entries(effectiveFilters)) { if (v) params.set(k, v) }
        const d = await apiFetchJson(`/api/crm/consultores/enriched${params.toString() ? '?' + params : ''}`, { regiao: regiaoActiva })
        items = d.data ?? []
        // Filtrar client-side por estado_avaliacao se necessário
        if (effectiveFilters.estado_avaliacao) items = items.filter(c => c.estado_avaliacao === effectiveFilters.estado_avaliacao)
      } else {
        // limit generoso (achado da auditoria: volumes reais são pequenos —
        // ver Problema 24 — mas 200 já não tinha margem nenhuma de segurança)
        const params = new URLSearchParams({ limit: '1000' })
        for (const [k, v] of Object.entries(effectiveFilters)) { if (v) params.set(k, v) }
        const d = await apiFetchJson(`/api/crm/${endpoint}?${params}`, { regiao: regiaoActiva })
        items = d.data ?? []
        // Segurança extra: filtrar client-side para investidores
        if (tab === 'Investidores') items = items.filter(i => tipoPrincipalIncludes(i.tipo_principal, invSubTab))
      }
      return { items, total: items.length }
    },
  })
  // useMemo (não só `?? []`) para manter a mesma referência entre renders
  // enquanto os dados não mudam — um array novo a cada render invalidava
  // desnecessariamente os useCallback/useEffect noutros pontos do ficheiro
  // que dependem de `data`.
  const dataTodos = useMemo(() => listQuery.data?.items ?? [], [listQuery.data])
  // Investidores ativos divididos por área de atuação (Porto | Coimbra).
  // Filtro client-side: quem atua nas duas áreas aparece em ambas.
  const filtraArea = tab === 'Investidores' && invSubTab === 'Ativo' && !!invArea
  const data = useMemo(
    () => filtraArea ? dataTodos.filter(i => areasInvestidor(i).has(invArea)) : dataTodos,
    [dataTodos, filtraArea, invArea]
  )
  const total = filtraArea ? data.length : (listQuery.data?.total ?? 0)
  const loading = tab === 'Oportunidades' ? false : listQuery.isPending
  const loadError = listQuery.isError
  const load = listQuery.refetch
  // Forçar filtro tipo_principal quando sub-tab investidores muda
  useEffect(() => {
    if (tab === 'Investidores') {
      setFilters(f => ({ ...f, tipo_principal: invSubTab }))
    }
  }, [invSubTab, tab])
  const loadStats = useCallback(() => {
    apiFetch('/api/crm/stats', { regiao: regiaoActiva }).then(r => r.json()).then(setStats).catch(() => {})
  }, [regiaoActiva])
  const loadAlertCount = useCallback(() => {
    apiFetch('/api/alertas').then(r => r.json()).then(d => setAlertCount(d.resumo?.total ?? 0)).catch(() => {})
  }, [])
  const loadConsultoresLookup = useCallback(() => {
    apiFetch('/api/crm/lookup/consultores').then(r => r.json()).then(setConsultoresLookup).catch(() => {})
  }, [])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadAlertCount() }, [loadAlertCount])
  useEffect(() => { loadConsultoresLookup() }, [loadConsultoresLookup])
  useRefreshOnMutation(useCallback(() => {
    load(); loadStats(); loadAlertCount(); loadConsultoresLookup()
  }, [load, loadStats, loadAlertCount, loadConsultoresLookup]))

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
      columns: ESTADOS_IMOVEIS,
      groupField: 'estado',
      renderCard: (item) => {
        return (
          <div>
            <p className="text-[13px] font-semibold text-ink truncate">{item.nome}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">{item.zona ?? '—'} · {item.tipologia ?? '—'}</p>
            {item.ask_price > 0 && <p className="text-[11px] num text-ink mt-0.5">{EUR(item.ask_price)}</p>}
            {item.roi > 0 && <p className="text-[11px] text-success">ROI: {item.roi}%</p>}
            {item.nome_consultor && (
              <p className="text-[11px] text-ink-muted mt-0.5 cursor-pointer hover:text-ink hover:underline transition-colors"
                onClick={(e) => { e.stopPropagation(); navigateToConsultor(item.nome_consultor) }}>
                {item.nome_consultor}
              </p>
            )}
          </div>
        )
      },
    },
    'Investidores': {
      // Colunas dependem do sub-tab (Passivo vs Ativo). Estados terminais
      // (Não qualificado, Inactivo) ficam fora do kanban diário — vê-los na vista tabela.
      columns: (invSubTab === 'Ativo' ? INV_STATUS_ATIVO : INV_STATUS_PASSIVO).filter(s => s !== 'Não qualificado' && s !== 'Inactivo'),
      groupField: 'status',
      renderCard: (item) => {
        const parseArr = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
        const tipoBg = parseArr(item.tipo_principal).includes('Ativo') ? 'from-green-500 to-emerald-600' : 'from-yellow-400 to-amber-500'
        const iniciais = (item.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
        // Capital compacto
        const capCompact = (() => {
          const v = item.capital_max
          if (!v) return null
          if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
          if (v >= 1_000) return `€${Math.round(v / 1000)}k`
          return `€${v}`
        })()
        // Dias parado no estado actual (usa updated_at como proxy)
        const updIso = item.updated_at ? new Date(item.updated_at) : null
        const diasParado = updIso ? Math.floor((Date.now() - updIso) / 86400000) : null
        // Próxima acção atrasada
        const proxIso = (item.data_proxima_acao || '').slice(0, 10)
        const today = new Date().toISOString().slice(0, 10)
        const atrasado = proxIso && proxIso < today
        // Telefone para WhatsApp
        const tel = (item.telemovel || '').replace(/\s+/g, '')
        const phoneIntl = tel.startsWith('+') ? tel : (tel.startsWith('00') ? '+' + tel.slice(2) : (tel.length === 9 ? '+351' + tel : tel))
        // Área de atuação: união das regiões macro (Coimbra/AMP) com os distritos,
        // de-duplicada. Espelha a definição em DetailPanel.jsx:2453.
        const areaAtuacao = Array.from(new Set([
          ...parseArr(item.regioes_preferidas),
          ...parseArr(item.localizacao_preferida),
        ].filter(Boolean)))
        const areaLabel = areaAtuacao.length > 2
          ? `${areaAtuacao.slice(0, 2).join(', ')} +${areaAtuacao.length - 2}`
          : areaAtuacao.join(', ')

        return (
          <div className="group relative">
            <div className="flex items-start gap-2">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${tipoBg} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>
                {iniciais}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <ClassBadge cls={item.classificacao} />
                  <p className="text-[13px] font-semibold text-ink truncate">{item.nome}</p>
                </div>
                <p className="text-[11px] text-ink-muted truncate" title={areaAtuacao.join(', ')}>{areaLabel || '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {capCompact && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-muted text-ink num inline-flex items-center gap-1">
                  <Wallet className="w-2.5 h-2.5" /> {capCompact}
                </span>
              )}
              {atrasado && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-danger/10 text-danger font-medium inline-flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" /> atrasado
                </span>
              )}
              {!atrasado && diasParado != null && diasParado >= 14 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-warning/10 text-warning font-medium inline-flex items-center gap-1">
                  <Clock3 className="w-2.5 h-2.5" /> {diasParado}d
                </span>
              )}
              {!!item.nda_assinado && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-success/10 text-success font-semibold">NDA</span>
              )}
              {item.duplicado_de && <span className="text-[9px] text-ink-muted/70">duplo</span>}
            </div>

            {/* Hover: acções rápidas */}
            <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition flex gap-1">
              {phoneIntl && (
                <a href={`tel:${phoneIntl}`} onClick={e => e.stopPropagation()}
                  className="w-6 h-6 rounded-md bg-surface-raised border border-line shadow-sm hover:bg-surface inline-flex items-center justify-center text-ink-muted" title="Ligar">
                  <Phone className="w-3 h-3" />
                </a>
              )}
              {phoneIntl && (
                <a href={`https://wa.me/${phoneIntl.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="w-6 h-6 rounded-md bg-success/10 border border-success/30 shadow-sm hover:bg-success/15 inline-flex items-center justify-center text-success" title="WhatsApp">
                  <MessageCircle className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )
      },
    },
    'Consultores': {
      columns: ['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'],
      groupField: 'estatuto',
      renderCard: (item) => {
        const imobs = (() => { try { return JSON.parse(item.imobiliaria || '[]').join(', ') } catch { return '' } })()
        const alertDot = item._alertStatus === 'red' ? 'bg-danger' : item._alertStatus === 'orange' ? 'bg-orange-500' : item._alertStatus === 'green' ? 'bg-success' : null
        return (
          <div>
            <div className="flex items-center gap-2">
              {alertDot && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${alertDot}`} />}
              <ClassBadge cls={item.classificacao} />
              <p className="text-[13px] font-semibold text-ink truncate flex-1">{item.nome}</p>
            </div>
            {imobs && <p className="text-[11px] text-ink-muted mt-0.5">{imobs}</p>}
            {item.contacto && <p className="text-[11px] text-ink-muted mt-0.5">{item.contacto}</p>}
            {(item._leadsReferencia ?? item.imoveis_enviados) > 0 && (
              <p className="text-[11px] text-ink mt-0.5">{item._leadsReferencia ?? item.imoveis_enviados} leads por referência</p>
            )}
            {item.score_prioridade > 0 && <p className="text-[11px] text-warning mt-0.5">Score: {item.score_prioridade}</p>}
          </div>
        )
      },
    },
    'Parceiros': {
      columns: PARC_ESTADOS,
      groupField: 'estado',
      renderCard: (item) => (
        <div>
          <p className="text-[13px] font-semibold text-ink truncate">{item.nome}</p>
          {item.tipo && <p className="text-[11px] text-ink-muted mt-0.5">{item.tipo}{item.empresa ? ` · ${item.empresa}` : ''}</p>}
          {item.data_proximo_contacto && <p className="text-[11px] text-ink mt-0.5">Próximo contacto: {fmtDate(item.data_proximo_contacto)}</p>}
        </div>
      ),
    },
    'Construtores': {
      columns: ['Qualificado','Em avaliação','Rejeitado','Inativo'],
      groupField: 'estado',
      renderCard: (item) => (
        <div>
          <p className="text-[13px] font-semibold text-ink truncate">{item.nome}</p>
          {item.empresa && <p className="text-[11px] text-ink-muted mt-0.5">{item.empresa}</p>}
          {item.score > 0 && <p className="text-[11px] num text-ink mt-0.5">Score: {item.score}</p>}
          {item.custo_medio_m2 > 0 && <p className="text-[11px] text-ink-muted mt-0.5">{EUR(item.custo_medio_m2)}/m²</p>}
        </div>
      ),
    },
  }

  const kanbanConfig = KANBAN_CONFIG[tab]
  const hasKanban = !!kanbanConfig

  async function persistMove(id, newColumn, extra = {}) {
    if (!kanbanConfig) return
    const field = kanbanConfig.groupField
    const item = data.find(i => i.id === id)
    const r = await apiFetch(`/api/crm/${endpoint}/${id}`, {
      method: 'PUT',
      regiao: regiaoActiva,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newColumn, ...extra }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      if (err.requisitos?.length) {
        // A fase de destino precisa de dados em falta: abre a janela de registo.
        setTransicao({ id, newColumn, requisitos: err.requisitos })
      } else if (err.itens_em_falta?.length) {
        toast(`Falta: ${err.itens_em_falta.join(', ')}`, 'error')
      } else {
        toast(err.error || 'Não foi possível mover', 'error')
      }
      return false
    }
    setTransicao(null)
    // Auto-task on phase change
    apiFetch('/api/crm/auto-task', {
      method: 'POST',
      regiao: regiaoActiva,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: endpoint, entityId: id, entityName: item?.nome ?? item?.movimento ?? '', newPhase: newColumn }),
    }).catch(() => {})
    // O auto-criar do projecto é feito no backend (onUpdate de /api/crm/imoveis/:id).
    // Não disparar aqui /api/automation/pipeline-to-faturacao — evita duplicação
    // de lógica e race com o load() abaixo.
    load()
  }

  async function handleMove(id, newColumn) {
    if (!kanbanConfig) return
    // Imóveis: capturar motivo ao mover para Follow Up ou Não interessa via Kanban
    const isFollowUpCol = newColumn === 'Follow UP' || newColumn === 'Follow Up' || newColumn === 'Follow Up após proposta'
    const isNaoInteressaCol = newColumn === 'Não interessa' || newColumn === 'Nao interessa'
    if (tab === 'Imóveis' && (isFollowUpCol || isNaoInteressaCol)) {
      setMoveModal({ id, newColumn, type: isFollowUpCol ? 'follow_up' : 'nao_interessa' })
      return
    }
    // Imóveis: fases que pedem uma data agendada (próxima chamada, visita)
    const passo = { 'Chamada Não Atendida': 'chamada', 'Visita Marcada': 'visita' }[newColumn]
    if (tab === 'Imóveis' && passo) {
      setAgendar({ id, newColumn, tipo: passo })
      return
    }
    await persistMove(id, newColumn)
  }

  async function handleSave(item) {
    // Validação básica
    const nameField = tab === 'Negócios' ? 'movimento' : 'nome'
    if (!item[nameField]?.trim()) {
      toast('Preenche o nome/título', 'error')
      return
    }
    if (tab === 'Imóveis' && item.origem === 'Referência por consultores' && !(item.nome_consultor || '').trim()) {
      toast('Origem «Referência por consultores»: indica o consultor que enviou o imóvel', 'error')
      return
    }
    const isNew = !item.id
    // Tabs regionais (Imóveis, Consultores, Construtores) exigem Coimbra ou
    // AMP ao criar — em "Geral" o registo ficava sem regiao, quebrando a
    // isolação regional e (nos imóveis) a sequência de REF Interna.
    if (isNew && TABS_REGIONAIS.has(tab) && !(item.regiao || regiaoActiva)) {
      toast('Escolhe Coimbra ou AMP antes de criar — em "Geral" não é possível atribuir região ao novo registo', 'error')
      return
    }
    try {
      const url = isNew ? `/api/crm/${endpoint}` : `/api/crm/${endpoint}/${item.id}`
      const method = isNew ? 'POST' : 'PUT'
      // Propagar a região activa — o middleware regional do backend usa o
      // header X-Regiao para preencher automaticamente body.regiao (ou
      // regioes_preferidas em investidores) quando ausente. Se a região foi
      // trocada depois de abrir o formulário, item.regiao vem null explícito
      // e o backend não o substitui: usa-se aqui a região ativa mais recente.
      const payload = (isNew && TABS_REGIONAIS.has(tab) && !item.regiao && regiaoActiva)
        ? { ...item, regiao: regiaoActiva }
        : item
      const r = await apiFetch(url, { method, regiao: regiaoActiva, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        if (!isNew && tab === 'Imóveis' && err.requisitos?.length) {
          // A fase escolhida precisa de dados em falta: guarda o resto do
          // formulário e abre a janela de registo para a mudança de fase.
          const { estado, ...resto } = payload
          const r2 = await apiFetch(url, { method, regiao: regiaoActiva, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resto) })
          if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || 'Erro ao guardar')
          setEditing(null)
          load()
          setTransicao({ id: item.id, newColumn: estado, requisitos: err.requisitos })
          return
        }
        throw new Error(err.error || 'Erro ao guardar')
      }
      const saved = await r.json()
      toast(isNew ? 'Registo criado' : 'Registo atualizado', 'success')

      // Auto-gerar relatório PDF ao criar imóvel
      if (isNew && tab === 'Imóveis' && saved.id) {
        // openDocument trata o seu próprio feedback de erro (toast); aqui só o sucesso.
        openDocument(`/api/crm/imoveis/${saved.id}/relatorio`)
          .then(() => toast('Relatório PDF gerado automaticamente', 'success'))
          .catch(e => console.error('[relatorio auto]', e.message))
      }

      setEditing(null)
      // Após criar imóvel: abrir a ficha em modo edição para o utilizador
      // continuar a preencher os campos avançados (localização detalhada,
      // caracterização física, valores, legal, pipeline). Antes ficava na
      // listagem e o user tinha que abrir a ficha + clicar Editar manualmente,
      // dando a sensação de "preencher duas vezes".
      if (isNew && tab === 'Imóveis' && saved.id) {
        setDetailDefaultEdit(true)
        setDetail(saved.id)
      }
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Tens a certeza que queres apagar este registo?')) return
    // Tira já a linha da lista (sem esperar pelo servidor nem pelo re-fetch);
    // se o pedido falhar, o load() repõe o que está na BD.
    queryClient.setQueriesData({ queryKey: ['crm-list', tab] }, old => {
      if (!old?.items) return old
      const items = old.items.filter(i => i.id !== id)
      return { ...old, items, total: items.length }
    })
    try {
      const r = await apiFetch(`/api/crm/${endpoint}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao apagar')
      toast('Registo apagado', 'success')
      load()
    } catch (e) {
      toast(e.message || 'Erro ao apagar', 'error')
      load()
    }
  }

  const kanbanOnDelete = useCallback((id, nome) => {
    if (!confirm(`Apagar "${nome || 'este registo'}"?`)) return
    handleDelete(id)
  }, [endpoint])
  const kanbanOnCardClick = useCallback((id) => {
    if (['Imóveis', 'Investidores', 'Consultores', 'Parceiros'].includes(tab)) {
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
  }, [tab, data, setDetail, setTab, setEditing])

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
      <Header title="CRM" subtitle="Gestão de dados — Base de dados local" onRefresh={load} loading={loading} breadcrumbs={breadcrumbs}
        regiao={regionalKey ? <RegiaoToggle value={regiaoActiva} onChange={setRegiaoActiva} />
          : tab === 'Investidores' && invSubTab === 'Ativo' ? <RegiaoToggle value={invArea || null} onChange={r => { setInvArea(r || ''); setDetail(null, { replace: true }) }} />
          : null} />
      <div className="p-4 sm:p-6 flex flex-col gap-3 sm:gap-4">

        {/* Entidades do CRM: separadores com contagem */}
        <Tabs
          variant="underline"
          value={tab}
          items={[
            { key: 'Imóveis',       icon: Building2, statsKey: 'imoveis' },
            { key: 'Investidores',  icon: HandCoins, statsKey: 'investidores' },
            { key: 'Consultores',   icon: UserCheck, statsKey: 'consultores' },
            { key: 'Construtores',  icon: HardHat,   statsKey: null },
            { key: 'Parceiros',     icon: Handshake, statsKey: null },
            { key: 'Oportunidades', icon: Radar,     statsKey: null },
          ].map(t => ({ key: t.key, label: t.key, icon: t.icon, count: t.statsKey ? stats?.[t.statsKey]?.total : undefined }))}
          onChange={key => {
            setTab(key)
            setSearch('')
            setDetail(null, { replace: true })
            setEditing(null)
            if (key !== tab) setFilters({})
            const relatorioOnlyCertasTabs = view === 'relatorio' && key !== 'Consultores' && key !== 'Investidores'
            if (relatorioOnlyCertasTabs) setView('kanban')
          }}
        />

        {/* KPIs integrados */}
        {tab !== 'Oportunidades' && <TabKPIs tab={tab} regiao={regiaoActiva} />}

        {/* Sub-tabs Investidores: Passivo / Ativo — destaque visual + barra de fases */}
        {tab === 'Investidores' && (
          <div className="space-y-3">
            <Tabs
              value={invSubTab}
              onChange={key => { setInvSubTab(key); setDetail(null, { replace: true }) }}
              items={[{ key: 'Passivo', label: 'Passivos' }, { key: 'Ativo', label: 'Ativos' }]}
            />

            {/* KPIs do sub-tab seleccionado — A, B, Capital Angariado, Capital Investido */}
            <InvestidoresKPICards data={data} />
          </div>
        )}

        {/* Filtros dinâmicos */}
        {tab !== 'Oportunidades' && (
          <Filters tab={tab} filters={filters} onChange={f => { setFilters(f); setSearch('') }} regiao={regiaoActiva} />
        )}

        {/* Search + Actions */}
        {tab !== 'Oportunidades' && (
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
            <input
              type="text" placeholder={`Pesquisar ${tab.toLowerCase()}... (/ para focar)`}
              value={searchInput} onChange={e => handleSearch(e.target.value)}
              className="w-full sm:flex-1 h-10 sm:h-9 px-3.5 rounded-lg border border-line bg-surface-raised text-ui text-ink placeholder:text-ink-muted/70 hover:border-ink/30 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors duration-fast"
            />
            <div className="flex gap-2 items-center">
              {hasKanban && (
                <div className="flex bg-surface-muted rounded-lg p-0.5">
                  <button onClick={() => setView('table')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'table' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted'}`}>
                    Tabela
                  </button>
                  <button onClick={() => setView('kanban')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'kanban' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted'}`}>
                    Kanban
                  </button>
                  {(tab === 'Consultores' || tab === 'Investidores') && (
                    <button onClick={() => setView('relatorio')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'relatorio' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted'}`}>
                      Relatório
                    </button>
                  )}
                </div>
              )}
              <Button onClick={() => setEditing({})} icon={Plus}>Novo</Button>
              <button type="button" onClick={() => openDocument('/api/crm/backup', { download: true, filename: 'backup.json' }).catch(() => {})} className="hidden sm:block px-3 py-2 bg-surface-muted text-ink-muted text-xs font-medium rounded-xl hover:bg-line transition-colors">
                Backup
              </button>
            </div>
          </div>
        )}

        {/* Edit/Create form */}
        {editing !== null && tab !== 'Oportunidades' && (
          <FormPanel tab={tab} item={editing} regiao={regiaoActiva} onSave={handleSave} onCancel={() => setEditing(null)} />
        )}

        <TabTransition tabKey={tab} direction={direcaoAba} className="flex flex-col gap-3 sm:gap-4">
          {/* Loading */}
          {loading && editing === null && tab !== 'Oportunidades' && (
            <div className="rounded-xl overflow-hidden"><BrandLoader variant="inline" label={tab} delay={250} /></div>
          )}

          {/* Oportunidades — fila de aprovar/rejeitar da pesquisa diária Idealista */}
          {tab === 'Oportunidades' && <OportunidadesPanel regiao={regiaoActiva} />}

          {/* Investidores: Split View (lista compacta + detalhe lado a lado) */}
          {tab === 'Investidores' && detail ? (
            <div className="flex gap-4" style={{ minHeight: '70vh' }}>
              {/* Lista compacta à esquerda */}
              <div className="w-72 shrink-0 bg-surface-raised  rounded-xl border border-line  shadow-xs overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto">
                  {[...data].sort((a, b) => {
                    // Estados desconhecidos vão para o fim (não para o topo).
                    const ai = INV_STATUS.indexOf(a.status); const bi = INV_STATUS.indexOf(b.status)
                    const ax = ai === -1 ? Infinity : ai; const bx = bi === -1 ? Infinity : bi
                    return (ax - bx) || (a.nome || '').localeCompare(b.nome || '')
                  }).map((inv, idx, sorted) => {
                    const isActive = inv.id === detail
                    const prevInv = idx > 0 ? sorted[idx - 1] : null
                    const statusChanged = !prevInv || prevInv.status !== inv.status
                    return (
                      <div key={inv.id}>
                        {statusChanged && (
                          <div className="px-3 py-1 bg-surface border-b border-line">
                            <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">{inv.status}</span>
                          </div>
                        )}
                        <button onClick={() => setDetail(inv.id)}
                          className={`w-full text-left px-3 py-2.5 border-b border-line transition-[background-color,border-color,color,box-shadow,opacity,transform] ${
                            isActive
                              ? `${invSubTab === 'Ativo' ? 'bg-success/10 border-l-3 border-l-green-500' : 'bg-warning/10 border-l-3 border-l-yellow-400'}`
                              : 'hover:bg-surface'
                          }`}>
                          <div className="flex items-center gap-2">
                            <ClassBadge cls={inv.classificacao} />
                            <span className={`text-sm truncate ${isActive ? 'font-bold text-ink' : 'text-ink'}`}>{inv.nome}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {inv.capital_max > 0 && <span className="text-[10px] num text-ink">{EUR(inv.capital_max)}</span>}
                            {inv.telemovel && <span className="text-[10px] text-ink-muted">{inv.telemovel}</span>}
                          </div>
                        </button>
                      </div>
                    )
                  })}
                  {data.length === 0 && <p className="text-xs text-ink-muted text-center py-6">Sem investidores</p>}
                </div>
                <div className="px-3 py-2 border-t border-line bg-surface text-[10px] text-ink-muted text-center">
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
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted text-ink-muted hover:bg-line disabled:opacity-30 disabled:cursor-not-allowed transition">
                        <ChevronLeft className="w-3.5 h-3.5" /> {prev ? prev.nome : 'Anterior'}
                      </button>
                      <span className="text-[10px] text-ink-muted">{currentIdx + 1} de {data.length}</span>
                      <button onClick={() => next && setDetail(next.id)} disabled={!next}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted text-ink-muted hover:bg-line disabled:opacity-30 disabled:cursor-not-allowed transition">
                        {next ? next.nome : 'Seguinte'} <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })()}
                <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
                  <DetailPanel type="Investidores" id={detail} onClose={() => { setDetail(null, { replace: true }); load() }} onSave={load}
                    onNavigate={(navType, navId) => { setDetail(null, { replace: true }); setTab(navType, { replace: true }); setTimeout(() => setDetail(navId), 150) }} />
                </Suspense>
              </div>
            </div>
          ) : detail && ['Imóveis', 'Consultores', 'Parceiros'].includes(tab) ? (
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
              <DetailPanel type={tab} id={detail} defaultEdit={detailDefaultEdit}
                onClose={() => { setDetail(null, { replace: true }); setDetailDefaultEdit(false); load() }} onSave={load}
                onNavigate={(navType, navId) => { setDetail(null, { replace: true }); setDetailDefaultEdit(false); setTab(navType, { replace: true }); setTimeout(() => setDetail(navId), 150) }} />
            </Suspense>
          ) : (<>

            {/* Relatório View */}
            {!loading && editing === null && view === 'relatorio' && tab === 'Consultores' && (
              <RelatorioConsultores />
            )}
            {!loading && editing === null && view === 'relatorio' && tab === 'Investidores' && (
              <RelatorioInvestidores />
            )}

            {/* Kanban View */}
            {!loading && editing === null && view === 'kanban' && kanbanConfig && data.length === 0 && (
              loadError ? (
                <ErrorState compact error={listQuery.error} onRetry={load} />
              ) : (
                <EmptyState
                  icon={{ 'Imóveis': Building2, 'Investidores': HandCoins, 'Consultores': UserCheck, 'Construtores': HardHat, 'Parceiros': Handshake, 'Oportunidades': Radar }[tab] || Building2}
                  title={`Sem ${tab.toLowerCase()}`}
                  description={search ? `Nenhum resultado para "${search}".` : `Ainda não existem ${tab.toLowerCase()} registados.`}
                />
              )
            )}
            {transicao && (
              <TransicaoFaseModal
                key={`${transicao.id}-${transicao.requisitos.map(r => r.id).join()}`}
                imovel={data.find(i => i.id === transicao.id)}
                destino={transicao.newColumn}
                requisitos={transicao.requisitos}
                onCancel={() => setTransicao(null)}
                onConfirm={extra => persistMove(transicao.id, transicao.newColumn, extra)}
                onResolvido={msg => { setTransicao(null); toast(msg, 'success'); load() }}
                onAbrirImovel={() => { const alvo = transicao.id; setTransicao(null); setDetail(alvo) }}
              />
            )}
            {agendar && (
              <AgendarPassoModal
                imovel={data.find(i => i.id === agendar.id)}
                tipo={agendar.tipo}
                destino={agendar.newColumn}
                onCancel={() => setAgendar(null)}
                onAntes={() => persistMove(agendar.id, agendar.newColumn)}
                onDone={msg => { setAgendar(null); toast(msg, 'success') }}
              />
            )}
            {moveModal && (
              <MoveReasonModal
                moveModal={moveModal}
                item={data.find(i => i.id === moveModal.id)}
                onCancel={() => setMoveModal(null)}
                onConfirm={async (extra) => {
                  if (moveModal.type === 'follow_up') {
                    // Mesma porta do bloco "Próximos passos": muda a fase, guarda
                    // o motivo e cria a tarefa do follow-up de uma vez.
                    const r = await apiFetch(`/api/crm/imoveis/${moveModal.id}/follow-up`, {
                      method: 'POST', regiao: regiaoActiva, headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ data: extra.data_follow_up, motivo: extra.motivo_follow_up, destino: moveModal.newColumn }),
                    })
                    if (!r.ok) return toast((await r.json().catch(() => ({}))).error || 'Não foi possível mover', 'error')
                    const feito = await r.json().catch(() => ({}))
                    toast(feito.consultor
                      ? `Imóvel em «${moveModal.newColumn}». O follow-up entrou no contacto com ${feito.consultor.nome} (${String(feito.data_contacto || '').slice(0, 10).split('-').reverse().join('/')})`
                      : `Imóvel em «${moveModal.newColumn}», com o follow-up na agenda`, 'success')
                    load()
                  } else {
                    await persistMove(moveModal.id, moveModal.newColumn, extra)
                  }
                  setMoveModal(null)
                }}
              />
            )}
            {!loading && editing === null && view === 'kanban' && kanbanConfig && data.length > 0 && (
              <KanbanBoard
                columns={kanbanConfig.columns}
                items={data}
                groupField={kanbanConfig.groupField}
                renderCard={kanbanConfig.renderCard}
                onMove={handleMove}
                onDelete={kanbanOnDelete}
                onCardClick={kanbanOnCardClick}
              />
            )}

            {/* Table View */}
            {!loading && editing === null && tab !== 'Oportunidades' && (view === 'table' || !hasKanban) && data.length === 0 && (
              loadError ? (
                <ErrorState compact error={listQuery.error} onRetry={load} />
              ) : (
                <EmptyState
                  icon={{ 'Imóveis': Building2, 'Investidores': HandCoins, 'Consultores': UserCheck, 'Construtores': HardHat, 'Parceiros': Handshake, 'Oportunidades': Radar }[tab] || Building2}
                  title={`Sem ${tab.toLowerCase()}`}
                  description={search ? `Nenhum resultado para "${search}".` : `Ainda não existem ${tab.toLowerCase()} registados.`}
                />
              )
            )}
            {!loading && editing === null && (view === 'table' || !hasKanban) && data.length > 0 && (
              <div className="bg-surface-raised  rounded-xl border border-line  shadow-xs overflow-hidden">
                <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                  {tab === 'Imóveis' && <ImoveisTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} onConsultorClick={navigateToConsultor} />}
                  {tab === 'Investidores' && <InvestidoresTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} />}
                  {tab === 'Consultores' && <ConsultoresTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail} />}
                  {tab === 'Negócios' && <NegociosTable data={data} onEdit={setEditing} onDelete={handleDelete}
                    onViewImovel={(imovelId) => { setTab('Imóveis'); setTimeout(() => setDetail(imovelId), 100) }} />}
                  {tab === 'Construtores' && <GenericTable data={data} onEdit={setEditing} onDelete={handleDelete}
                    columns={['nome','empresa','estado','zona','especializacao','score','custo_medio_m2']}
                    labels={{ nome:'Nome', empresa:'Empresa', estado:'Estado', zona:'Zona', especializacao:'Especialização', score:'Score', custo_medio_m2:'Custo/m²' }} />}
                {tab === 'Parceiros' && <GenericTable data={data} onEdit={setEditing} onDelete={handleDelete} onView={setDetail}
                  columns={['nome','tipo','empresa','estado','contacto','zona_atuacao','data_proximo_contacto']}
                  labels={{ nome:'Nome', tipo:'Tipo', empresa:'Empresa', estado:'Estado', contacto:'Contacto', zona_atuacao:'Zona de atuação', data_proximo_contacto:'Próximo contacto' }} />}
                </div>
                <div className="px-4 py-2 bg-surface text-xs text-ink-muted border-t">
                  {total} registos {search && `(pesquisa: "${search}")`}
                </div>
              </div>
            )}
          </>)}
        </TabTransition>
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
      className={`${align === 'right' ? 'text-right' : 'text-left'} py-3 px-3 cursor-pointer select-none hover:text-ink active:text-ink transition-colors whitespace-nowrap ${active ? 'text-ink' : ''}`}>
      {label}{arrow}
    </th>
  )
}

// ── Tables ────────────────────────────────────────────────────

function ActionButtons({ item, onEdit, onDelete, onView }) {
  return (
    <div className="flex gap-0.5">
      {onView && <button onClick={() => onView(item.id)} className="px-3 py-2 min-h-[36px] text-caption font-medium rounded-lg transition-colors duration-fast text-ink-muted hover:text-ink hover:bg-surface-muted">Ver</button>}
      <button onClick={() => onEdit(item)} className="px-3 py-2 min-h-[36px] text-caption font-medium rounded-lg transition-colors duration-fast text-ink hover:bg-surface-muted">Abrir</button>
      <button onClick={() => onDelete(item.id)} className="px-3 py-2 min-h-[36px] text-caption font-medium rounded-lg transition-colors duration-fast text-ink-muted hover:text-danger hover:bg-danger/10">Apagar</button>
    </div>
  )
}

function ClickableName({ name, onClick }) {
  return (
    <button onClick={onClick} className="text-left font-medium text-ink hover:text-ink hover:underline transition-colors">
      {name}
    </button>
  )
}

// ── Mobile cards ──────────────────────────────────────────────
// Em telemóvel (<768px) cada linha de tabela vira um cartão vertical.
// `fields`: [{ label, value }] — value pode ser texto ou JSX (badges, links).
function MobileCardList({ items, renderCard }) {
  return (
    <div className="md:hidden divide-y divide-line ">
      {items.length === 0
        ? <div className="py-8 text-center text-ink-muted text-sm">Sem registos</div>
        : items.map(renderCard)}
    </div>
  )
}

function EntityCard({ onClick, name, badge, fields = [], item, onEdit, onDelete, onView }) {
  return (
    <div className="py-3 px-1">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onClick}
          className="text-left font-semibold text-sm text-ink  hover:text-ink min-w-0 flex-1 truncate">
          {name}
        </button>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {fields.filter(f => f && f.value != null && f.value !== '—' && f.value !== '').map((f, i) => (
          <div key={i} className="flex flex-col min-w-0">
            <span className="text-[9px] text-ink-muted uppercase tracking-wide">{f.label}</span>
            <span className="text-xs text-ink  truncate">{f.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3" onClick={e => e.stopPropagation()}>
        <ActionButtons item={item} onEdit={onEdit} onDelete={onDelete} onView={onView} />
      </div>
    </div>
  )
}

function ImoveisTable({ data, onEdit, onDelete, onView, onConsultorClick }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <>
    <MobileCardList items={sorted} renderCard={r => (
      <EntityCard key={r.id} name={r.nome} onClick={() => onView?.(r.id)}
        item={r} onEdit={onEdit} onDelete={onDelete} onView={onView}
        badge={<Badge text={r.estado} colorMap={IMOVEL_ESTADO_COLOR} />}
        fields={[
          { label: 'Zona', value: r.zona },
          { label: 'Consultor', value: r.nome_consultor },
          { label: 'Ask Price', value: r.ask_price > 0 ? EUR(r.ask_price) : null },
          { label: 'ROI', value: r.roi > 0 ? `${r.roi}%` : null },
          { label: 'Origem', value: r.origem },
          { label: 'Data', value: fmtDate(r.data_adicionado) },
        ]} />
    )} />
    <table className="hidden md:table min-w-[800px] w-full text-xs">
      <thead><tr className="border-b border-line text-ink-muted uppercase tracking-wide">
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
          <tr key={r.id} className="border-b border-line hover:bg-surface cursor-pointer" onClick={() => onView?.(r.id)}>
            <td className="py-3 px-3"><ClickableName name={r.nome} onClick={() => onView?.(r.id)} /></td>
            <td className="py-3 px-3"><Badge text={r.estado} colorMap={IMOVEL_ESTADO_COLOR} /></td>
            <td className="py-2 px-3 text-ink-muted">{r.zona ?? '—'}</td>
            <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
              {r.nome_consultor ? (
                <button onClick={() => onConsultorClick?.(r.nome_consultor)}
                  className="text-ink hover:text-ink hover:underline transition-colors text-left">
                  {r.nome_consultor}
                </button>
              ) : '—'}
            </td>
            <td className="py-2 px-3 text-right num">{r.ask_price > 0 ? EUR(r.ask_price) : '—'}</td>
            <td className="py-2 px-3 text-right num">{r.roi > 0 ? `${r.roi}%` : '—'}</td>
            <td className="py-2 px-3 text-ink-muted">{r.origem ?? '—'}</td>
            <td className="py-2 px-3 text-ink-muted">{fmtDate(r.data_adicionado)}</td>
            <td className="py-3 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
          </tr>
        ))}
        {!sorted.length && <tr><td colSpan={9} className="py-8 text-center text-ink-muted">Sem registos</td></tr>}
      </tbody>
    </table>
    </>
  )
}

function InvestidoresTable({ data, onEdit, onDelete, onView }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <>
    <MobileCardList items={sorted} renderCard={r => {
      const tipos = parseTipoPrincipalArr(r.tipo_principal)
      const tipoLabel = tipos.length > 0 ? tipos.join(' + ') : 'Passivo'
      const tipoStyle = tipos.includes('Ativo') ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
      return (
        <EntityCard key={r.id} name={r.nome} onClick={() => onView?.(r.id)}
          item={r} onEdit={onEdit} onDelete={onDelete} onView={onView}
          badge={<Badge text={r.status} colorMap={INV_STATUS_COLOR} />}
          fields={[
            { label: 'Tipo', value: <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tipoStyle}`}>{tipoLabel}</span> },
            { label: 'Classe', value: <ClassBadge cls={r.classificacao} /> },
            { label: 'Capital Max', value: r.capital_max > 0 ? EUR(r.capital_max) : null },
            { label: 'NDA', value: r.nda_assinado ? '✓' : null },
            { label: 'Contacto', value: r.telemovel ? <a href={`tel:${r.telemovel}`} className="text-success">{r.telemovel}</a> : r.email ? <a href={`mailto:${r.email}`} className="text-ink">{r.email}</a> : null },
            { label: '1º Contacto', value: fmtDate(r.data_primeiro_contacto) },
          ]} />
      )
    }} />
    <table className="hidden md:table min-w-[900px] w-full text-xs">
      <thead><tr className="border-b border-line text-ink-muted uppercase tracking-wide">
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
          const tipos = parseTipoPrincipalArr(r.tipo_principal)
          const tipoLabel = tipos.length > 0 ? tipos.join(' + ') : 'Passivo'
          const tipoStyle = tipos.includes('Ativo') ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
          return (
            <tr key={r.id} className="border-b border-line hover:bg-surface cursor-pointer" onClick={() => onView?.(r.id)}>
              <td className="py-3 px-3"><ClickableName name={r.nome} onClick={() => onView?.(r.id)} /></td>
              <td className="py-2 px-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tipoStyle}`}>{tipoLabel}</span></td>
              <td className="py-2 px-3 text-center"><ClassBadge cls={r.classificacao} /></td>
              <td className="py-3 px-3"><Badge text={r.status} colorMap={INV_STATUS_COLOR} /></td>
              <td className="py-2 px-3 text-right num">{r.capital_max > 0 ? EUR(r.capital_max) : '—'}</td>
              <td className="py-2 px-3 text-center">{r.nda_assinado ? '✓' : '—'}</td>
              <td className="py-2 px-3 text-ink-muted" onClick={e => e.stopPropagation()}>{r.telemovel ? <a href={`tel:${r.telemovel}`} className="text-success hover:underline">{r.telemovel}</a> : r.email ? <a href={`mailto:${r.email}`} className="text-ink hover:underline">{r.email}</a> : '—'}</td>
              <td className="py-2 px-3 text-ink-muted">{fmtDate(r.data_primeiro_contacto)}</td>
              <td className="py-3 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
            </tr>
          )
        })}
        {!sorted.length && <tr><td colSpan={9} className="py-8 text-center text-ink-muted">Sem registos</td></tr>}
      </tbody>
    </table>
    </>
  )
}

function AlertDot({ status }) {
  if (!status) return null
  const color = status === 'red' ? 'bg-danger' : status === 'orange' ? 'bg-orange-500' : status === 'green' ? 'bg-success' : null
  const title = status === 'red' ? 'Sem 1o contacto (>48h)' : status === 'orange' ? 'Inativo (>15 dias)' : status === 'green' ? 'Check positivo recente' : ''
  if (!color) return null
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} title={title} />
}

function ConsultoresTable({ data, onEdit, onDelete, onView }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  const tempoRespFmt = (v) => v != null
    ? (v < 1 ? `${Math.round(v * 60)}min` : v < 24 ? `${Math.round(v)}h` : `${Math.round(v / 24)}d`)
    : null
  return (
    <>
    <MobileCardList items={sorted} renderCard={r => {
      const agencia = r._agencia || (() => { try { return JSON.parse(r.imobiliaria || '[]').join(', ') } catch { return null } })()
      return (
        <EntityCard key={r.id} name={<span className="inline-flex items-center gap-1.5"><AlertDot status={r._alertStatus} />{r.nome}</span>}
          onClick={() => onView?.(r.id)}
          item={r} onEdit={onEdit} onDelete={onDelete} onView={onView}
          badge={<Badge text={r.estado_avaliacao || 'Em avaliação'} colorMap={CONS_ESTADO_AVALIACAO_COLOR} />}
          fields={[
            { label: 'Agência', value: agencia },
            { label: 'Score', value: r.score_prioridade > 0 ? <span className="num font-semibold text-accent-ink">{r.score_prioridade}</span> : null },
            { label: 'Imóveis', value: r._totalImoveis ?? r.imoveis_enviados ?? null },
            { label: 'Taxa Qualidade', value: r.taxa_qualidade > 0 ? `${r.taxa_qualidade}%` : null },
            { label: 'Tempo Resposta', value: tempoRespFmt(r.tempo_medio_resposta) },
            { label: 'Próx. Follow-up', value: fmtDate(r.data_proximo_follow_up) },
            { label: 'Dias s/ contacto', value: r._diasSemContacto != null ? `${r._diasSemContacto}d` : null },
          ]} />
      )
    }} />
    <table className="hidden md:table min-w-[1100px] w-full text-xs">
      <thead><tr className="border-b border-line text-ink-muted uppercase tracking-wide">
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
            <tr key={r.id} className="border-b border-line hover:bg-surface cursor-pointer" onClick={() => onView?.(r.id)}>
              <td className="py-2 px-1 text-center"><AlertDot status={r._alertStatus} /></td>
              <td className="py-3 px-3"><ClickableName name={r.nome} onClick={() => onView?.(r.id)} /></td>
              <td className="py-2 px-3 text-ink-muted">{agencia}</td>
              <td className="py-2 px-3 text-right num font-semibold text-accent-ink">{r.score_prioridade > 0 ? r.score_prioridade : '—'}</td>
              <td className="py-2 px-3 text-right num">{r._totalImoveis ?? r.imoveis_enviados ?? '—'}</td>
              <td className="py-2 px-3 text-right num">{r.taxa_qualidade > 0 ? `${r.taxa_qualidade}%` : '—'}</td>
              <td className="py-2 px-3 text-right num">{tempoResp}</td>
              <td className="py-3 px-3"><Badge text={r.estado_avaliacao || 'Em avaliação'} colorMap={CONS_ESTADO_AVALIACAO_COLOR} /></td>
              <td className="py-2 px-3 text-ink-muted">{fmtDate(r.data_proximo_follow_up)}</td>
              <td className="py-2 px-3 text-right num">{r._diasSemContacto != null ? `${r._diasSemContacto}d` : '—'}</td>
              <td className="py-3 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
            </tr>
          )
        })}
        {!sorted.length && <tr><td colSpan={11} className="py-8 text-center text-ink-muted">Sem registos</td></tr>}
      </tbody>
    </table>
    </>
  )
}

function NegociosTable({ data, onEdit, onDelete, onViewImovel }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  return (
    <>
    <MobileCardList items={sorted} renderCard={r => (
      <EntityCard key={r.id} name={r.movimento}
        onClick={() => r.imovel_id && onViewImovel?.(r.imovel_id)}
        item={r} onEdit={onEdit} onDelete={onDelete}
        badge={<Badge text={r.fase} colorMap={NEG_FASE_COLOR} />}
        fields={[
          { label: 'Categoria', value: <Badge text={r.categoria} colorMap={NEG_CAT_COLOR} /> },
          { label: 'Lucro Est.', value: <span className="text-ink num">{EUR(r.lucro_estimado)}</span> },
          { label: 'Faturação Real', value: r.lucro_real > 0 ? <span className="text-success num">{EUR(r.lucro_real)}</span> : null },
          { label: 'Data', value: fmtDate(r.data) },
          { label: '', value: r.imovel_id ? <span className="text-brand-gold">→ ver imóvel</span> : null },
        ]} />
    )} />
    <table className="hidden md:table min-w-[700px] w-full text-xs">
      <thead><tr className="border-b border-line text-ink-muted uppercase tracking-wide">
        <Th field="movimento" label="Negócio" {...sp} />
        <Th field="categoria" label="Categoria" {...sp} />
        <Th field="fase" label="Fase" {...sp} />
        <Th field="lucro_estimado" label="Lucro Est." align="right" {...sp} />
        <Th field="lucro_real" label="Faturação Real" align="right" {...sp} />
        <Th field="data" label="Data" {...sp} />
        <th className="py-3 px-3"></th>
      </tr></thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.id} className="border-b border-line hover:bg-surface cursor-pointer"
            onClick={() => r.imovel_id && onViewImovel?.(r.imovel_id)}>
            <td className="py-3 px-3">
              <span className={`font-medium ${r.imovel_id ? 'text-brand-gold hover:underline' : 'text-ink'}`}>
                {r.movimento}
              </span>
              {r.imovel_id && <span className="text-[10px] text-ink-muted/70 ml-1.5">→ ver imóvel</span>}
            </td>
            <td className="py-3 px-3"><Badge text={r.categoria} colorMap={NEG_CAT_COLOR} /></td>
            <td className="py-3 px-3"><Badge text={r.fase} colorMap={NEG_FASE_COLOR} /></td>
            <td className="py-2 px-3 text-right num text-ink">{EUR(r.lucro_estimado)}</td>
            <td className="py-2 px-3 text-right num text-success">{r.lucro_real > 0 ? EUR(r.lucro_real) : '—'}</td>
            <td className="py-2 px-3 text-ink-muted">{fmtDate(r.data)}</td>
            <td className="py-2 px-3" onClick={e => e.stopPropagation()}><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} /></td>
          </tr>
        ))}
        {!sorted.length && <tr><td colSpan={7} className="py-8 text-center text-ink-muted">Sem registos</td></tr>}
      </tbody>
    </table>
    </>
  )
}

// onView (opcional): o nome abre a ficha em vez do formulário.
function GenericTable({ data, onEdit, onDelete, onView, columns, labels }) {
  const { sorted, sortField, sortDir, onSort } = useSortableData(data)
  const sp = { sortField, sortDir, onSort }
  const abrir = r => (onView ? onView(r.id) : onEdit?.(r))
  return (
    <>
    <MobileCardList items={sorted} renderCard={r => (
      <EntityCard key={r.id} name={r[columns[0]]} onClick={() => abrir(r)}
        item={r} onEdit={onEdit} onDelete={onDelete} onView={onView}
        fields={columns.slice(1).map(c => ({ label: labels[c] || c, value: r[c] }))} />
    )} />
    <table className="hidden md:table min-w-[700px] w-full text-xs">
      <thead><tr className="border-b border-line text-ink-muted uppercase tracking-wide">
        {columns.map(c => <Th key={c} field={c} label={labels[c] || c} {...sp} />)}
        <th className="py-3 px-3"></th>
      </tr></thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.id} className="border-b border-line hover:bg-surface">
            {columns.map(c => (
              <td key={c} className="py-2 px-3 text-ink-muted">
                {c === columns[0] ? <ClickableName name={r[c]} onClick={() => abrir(r)} /> : (r[c] ?? '—')}
              </td>
            ))}
            <td className="py-3 px-3"><ActionButtons item={r} onEdit={onEdit} onDelete={onDelete} onView={onView} /></td>
          </tr>
        ))}
        {!sorted.length && <tr><td colSpan={columns.length + 1} className="py-8 text-center text-ink-muted">Sem registos</td></tr>}
      </tbody>
    </table>
    </>
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
  // O formulário inicial reflecte o mesmo conjunto de campos da ficha de
  // detalhe (ImovelEditSections). Antes só tinha 27 keys e faltavam áreas,
  // caracterização física e localização detalhada — quem criava um imóvel
  // tinha de reabrir a ficha para preencher estes campos do zero.
  'Imóveis': [
    // — Identificação —
    // `quick: true` = campo visível na "Ficha Rápida" ao criar um imóvel novo
    // (dados normalmente já disponíveis no anúncio, antes do 1º contacto). O
    // resto regista-se à medida que o negócio avança: cada fase pede só o que
    // precisa para entrar (ver src/db/dealBreakers.js).
    { key: 'nome', label: 'Nome do Imóvel', type: 'text', required: true, quick: true },
    // Obrigatório ao criar em "Geral" (sem regiao activa no toggle) — sem isto
    // o handleSave bloqueia com toast a mandar voltar ao toggle no topo, sem
    // dar hipotese de escolher a regiao aqui mesmo na ficha rapida.
    { key: 'regiao', label: 'Região', type: 'select', options: ['Coimbra', 'AMP'], required: true, quick: true },
    { key: 'estado', label: 'Estado', type: 'select', options: ESTADOS_IMOVEIS },
    { key: 'modelo_negocio', label: 'Modelo de Negócio', type: 'select', options: ['Wholesaling','Fix and Flip','CAEP','Mediação Imobiliária','Consultoria/Assessoria'], required: true },
    { key: 'ref_interna', label: 'REF Interna', type: 'text' },
    { key: 'tipo_oportunidade', label: 'Tipo Oportunidade', type: 'select', options: ['Portal', 'Off-Market'] },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Pesquisa em portais/sites','Referência por consultores','Idealista','Imovirtual','Supercasa','Consultor','Referência','Outro'], quick: true },
    { key: 'nome_consultor', label: 'Consultor', type: 'relation_name_or_new', endpoint: '/api/crm/lookup/consultores', display: r => `${r.nome} (${r.estatuto ?? '—'})`, createEndpoint: '/api/crm/consultores/find-or-create', quick: true },
    { key: 'link', label: 'Link do Imóvel', type: 'url', quick: true },
    // — Localização —
    { key: 'distrito', label: 'Distrito', type: 'text', quick: true },
    { key: 'concelho', label: 'Concelho', type: 'text', quick: true },
    { key: 'freguesia', label: 'Freguesia', type: 'combobox_freguesias' },
    // — Caracterização Física —
    { key: 'tipologia', label: 'Tipologia (T1, T2, T3…)', type: 'text', quick: true },
    { key: 'predio_tipo', label: 'Tipo de Prédio', type: 'select', options: ['Apartamento','Edifício multifamiliar','Moradia','Terreno','Prédio para reabilitação','Outro'], quick: true },
    { key: 'area_util', label: 'Área Útil (m²)', type: 'number' },
    { key: 'area_bruta', label: 'ABP — Área Bruta Privativa (m²)', type: 'number' },
    { key: 'area_bruta_dependente', label: 'ABD — Área Bruta Dependente (m²)', type: 'number' },
    { key: 'andar', label: 'Andar', type: 'text' },
    { key: 'numero_pisos_predio', label: 'Nº Pisos do Prédio', type: 'number' },
    { key: 'tem_elevador', label: 'Tem Elevador', type: 'select', options: ['Sim','Não'] },
    { key: 'ano_construcao', label: 'Ano de Construção', type: 'number' },
    { key: 'cru', label: 'Uso (CRU)', type: 'select', options: ['Habitação','Comércio','Serviços','Indústria','Misto'] },
    // — Valores —
    { key: 'ask_price', label: 'Ask Price (€)', type: 'number', quick: true },
    { key: 'valor_proposta', label: 'Valor Proposta (€)', type: 'number' },
    { key: 'custo_estimado_obra', label: 'Custo Estimado Obra (€)', type: 'number' },
    { key: 'valor_venda_remodelado', label: 'Valor Venda Remodelado (€)', type: 'number' },
    { key: 'vpt', label: 'VPT (€)', type: 'number' },
    { key: 'imi_anual', label: 'IMI Anual (€)', type: 'number' },
    { key: 'condominio_mensal_anunciado', label: 'Condomínio Mensal (€)', type: 'number' },
    // — Pipeline & Negócio —
    { key: 'check_qualidade', label: 'Check Qualidade', type: 'checkbox' },
    { key: 'data_adicionado', label: 'Data Adicionado', type: 'date' },
    { key: 'data_chamada', label: 'Data Chamada', type: 'date' },
    { key: 'data_visita', label: 'Data Visita', type: 'date' },
    { key: 'data_estudo_mercado', label: 'Data Estudo Mercado', type: 'date' },
    { key: 'data_proposta', label: 'Data Proposta', type: 'date' },
    { key: 'data_proposta_aceite', label: 'Data Proposta Aceite', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'motivo_follow_up', label: 'Motivo Follow Up', type: 'textarea' },
    { key: 'motivo_nao_interessa', label: 'Motivo Não Interessa', type: 'textarea' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
  'Investidores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'ref_investidor', label: 'REF Investidor', type: 'text' },
    { key: 'tipo_principal', label: 'Tipo de Investidor', type: 'multiselect', options: ['Ativo','Passivo'], required: true },
    { key: 'status', label: 'Status', type: 'select', options: (form) => invStatusFor(form.tipo_principal) },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'origem', label: 'Origem', type: 'select', options: ['Landing Page','Skool','Grupos Whatsapp','Referenciação','LinkedIn','Eventos Networking','Outro'] },
    { key: 'telemovel', label: 'Telemóvel', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'capital_min', label: 'Capital Mínimo (€)', type: 'number' },
    { key: 'capital_max', label: 'Capital Máximo (€)', type: 'number' },
    { key: 'montante_investido', label: 'Montante Investido (€)', type: 'number' },
    { key: 'nda_assinado', label: 'NDA Assinado', type: 'checkbox' },
    { key: 'estrategia', label: 'Estratégia de Investimento', type: 'multiselect', options: ['Wholesaling','CAEP','Fix and Flip','Mediação Imobiliária','Capital Passivo','Construção'] },
    { key: 'perfil_risco', label: 'Perfil de Risco', type: 'select', options: ['Conservador','Moderado','Agressivo'] },
    { key: 'roi_pretendido', label: 'ROI Previsto', type: 'text' },
    { key: 'roi_anualizado_pretendido', label: 'ROI Anualizado Previsto', type: 'text' },
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
  ],
  'Consultores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'estatuto', label: 'Estatuto', type: 'select', options: ['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'] },
    { key: 'estado_avaliacao', label: 'Estado Avaliação', type: 'select', options: ['Em avaliação','Ativo','Inativo'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'contacto', label: 'Contacto (telefone)', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'link_perfil', label: 'Link da equipa', type: 'text' },
    { key: 'imobiliaria', label: 'Imobiliária', type: 'chips_autocomplete' },
    { key: 'zonas', label: 'Zonas de Atuação', type: 'multiselect_regional' },
    { key: 'data_inicio', label: 'Data Início Parceria', type: 'date' },
    { key: 'data_primeira_call', label: '1º Contacto (Data)', type: 'date' },
    { key: 'data_follow_up', label: 'Data Follow Up', type: 'date' },
    { key: 'data_proximo_follow_up', label: 'Data Próximo Follow Up', type: 'date' },
    { key: 'motivo_follow_up', label: 'Motivo Follow Up', type: 'text' },
    { key: 'meta_mensal_leads', label: 'Meta Mensal Leads', type: 'number' },
    { key: 'comissao', label: 'Comissão %', type: 'number' },
    { key: 'motivo_descontinuacao', label: 'Motivo Descontinuação', type: 'text' },
  ],
  'Parceiros': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'tipo', label: 'Tipo', type: 'select', options: PARC_TIPOS },
    { key: 'estado', label: 'Estado', type: 'select', options: PARC_ESTADOS },
    { key: 'empresa', label: 'Empresa', type: 'text' },
    { key: 'nif', label: 'NIF', type: 'text' },
    { key: 'contacto', label: 'Contacto (telefone)', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'morada', label: 'Morada', type: 'text' },
    { key: 'zona_atuacao', label: 'Zona de atuação', type: 'text' },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'honorarios', label: 'Honorários', type: 'text' },
    { key: 'data_primeiro_contacto', label: 'Data 1º Contacto', type: 'date' },
  ],
  'Construtores': [
    { key: 'nome', label: 'Nome', type: 'text', required: true },
    { key: 'empresa', label: 'Empresa', type: 'text' },
    { key: 'nif', label: 'NIF', type: 'text' },
    { key: 'contacto', label: 'Contacto (telefone)', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'morada', label: 'Morada / Sede', type: 'text' },
    { key: 'estado', label: 'Estado', type: 'select', options: ['Em avaliação','Activo','Inactivo'] },
    { key: 'classificacao', label: 'Classificação', type: 'select', options: ['A','B','C','D'] },
    { key: 'concelhos_atuacao', label: 'Concelhos de Atuação', type: 'multiselect_concelhos' },
    { key: 'especialidades', label: 'Especialidades', type: 'multiselect', options: ['Construção geral','Remodelação integral','Carpintaria','Pichelaria / Canalização','Electricidade','AVAC','Pinturas','Pavimentos','Cozinhas','Caixilharia','Coberturas','Pladur','Demolições','Estuque','Estruturas','Jardins / Exteriores'] },
    { key: 'preco_m2_medio', label: 'Preço Médio m² (€)', type: 'number' },
    { key: 'prazo_medio_dias', label: 'Prazo Médio (dias)', type: 'number' },
    { key: 'regime_iva', label: 'Regime IVA', type: 'select', options: ['Normal','Autoliquidação','Isento'] },
    { key: 'retencao_irs', label: 'Retenção IRS aplicável', type: 'checkbox' },
    { key: 'seguro_responsabilidade', label: 'Seguro Responsabilidade Civil', type: 'checkbox' },
    { key: 'alvara', label: 'Alvará', type: 'text' },
    { key: 'data_primeiro_contacto', label: 'Data 1º Contacto', type: 'date' },
    { key: 'data_ultima_obra', label: 'Data Última Obra', type: 'date' },
    { key: 'obras_realizadas', label: 'Obras Realizadas', type: 'number' },
    { key: 'lucro_gerado', label: 'Lucro Gerado (€)', type: 'number' },
    { key: 'notas', label: 'Notas', type: 'textarea' },
  ],
}

function RelationOrNew({ value, options, display, createEndpoint, regiao, onChange, onCreated }) {
  const [mode, setMode] = useState('select') // 'select' | 'new'
  const [newName, setNewName] = useState('')
  const [newContacto, setNewContacto] = useState('')
  const [newImobiliaria, setNewImobiliaria] = useState('')
  const [creating, setCreating] = useState(false)
  const inputClass = "w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await apiFetch(createEndpoint, {
        method: 'POST',
        regiao,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: newName.trim(),
          contacto: newContacto.trim() || null,
          imobiliaria: newImobiliaria.trim() ? JSON.stringify([newImobiliaria.trim()]) : null,
          regiao,
        }),
      })
      const data = await r.json()
      onChange(data.nome || newName.trim())
      onCreated()
      setMode('select')
      setNewName('')
      setNewContacto('')
      setNewImobiliaria('')
    } catch {}
    setCreating(false)
  }

  if (mode === 'new') {
    return (
      <div className="space-y-2 p-3 rounded-xl border border-line bg-surface-muted/40">
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do novo consultor *" className={inputClass} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <input type="tel" value={newContacto} onChange={e => setNewContacto(e.target.value)} placeholder="Contacto (9XX XXX XXX)" className={inputClass} />
          <input type="text" value={newImobiliaria} onChange={e => setNewImobiliaria(e.target.value)} placeholder="Imobiliária" className={inputClass} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleCreate} disabled={creating || !newName.trim()} className="px-3 py-2 bg-accent text-accent-foreground text-xs font-medium rounded-lg hover:brightness-[1.04] disabled:opacity-50 shrink-0">
            {creating ? '...' : 'Criar'}
          </button>
          <button onClick={() => setMode('select')} className="px-3 py-2 bg-surface-muted text-ink-muted text-xs rounded-lg shrink-0">Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <select value={value} onChange={e => onChange(e.target.value)} className={inputClass}>
        <option value="">— Selecionar —</option>
        {options.map(r => <option key={r.id} value={r.nome}>{display(r)}</option>)}
      </select>
      <button onClick={() => setMode('new')} className="px-3 py-2 bg-surface-muted text-ink text-xs font-medium rounded-lg hover:bg-line shrink-0">+ Novo</button>
    </div>
  )
}

// Zonas de Atuação por região — multi-select com opções fixas em ordem alfabética.
const ZONAS_ATUACAO_POR_REGIAO = {
  AMP: ['Espinho', 'Gondomar', 'Porto', 'Santa Maria da Feira', 'Vila Nova de Gaia'],
  Coimbra: FREGUESIAS,
}

// Freguesias por região — usado no campo "Zonas" do imóvel.
// AMP: agrupadas por concelho (Porto, Vila Nova de Gaia) — o MultiSelect
// suporta optgroup quando recebe um objecto em vez de array.
// Coimbra: lista plana (FREGUESIAS já é array ordenado).
const FREGUESIAS_POR_REGIAO = {
  AMP: {
    'Porto': [
      'Aldoar, Foz do Douro e Nevogilde',
      'Bonfim',
      'Campanhã',
      'Cedofeita, Santo Ildefonso, Sé, Miragaia, São Nicolau e Vitória',
      'Lordelo do Ouro e Massarelos',
      'Paranhos',
      'Ramalde',
      'São Roque da Lameira',
    ],
    'Vila Nova de Gaia': [
      'Arcozelo',
      'Avintes',
      'Canidelo',
      'Crestuma',
      'Lever',
      'Madalena',
      'Mafamude e Vilar do Paraíso',
      'Oliveira do Douro',
      'Pedroso e Seixezelo',
      'Sandim, Olival, Lever e Crestuma',
      'Santa Marinha e São Pedro da Afurada',
      'São Félix da Marinha',
      'Serzedo e Perosinho',
      'Vilar de Andorinho',
      'Vilar do Paraíso',
    ],
    'Matosinhos': [
      'Custóias, Leça do Balio e Guifões',
      'Matosinhos e Leça da Palmeira',
      'Perafita, Lavra e Santa Cruz do Bispo',
      'São Mamede de Infesta e Senhora da Hora',
    ],
  },
  Coimbra: FREGUESIAS,
}

// Input com chips + autocomplete a partir de sugestões da BD (ex: imobiliárias
// já usadas por outros consultores). Texto livre — pode-se criar nova com Enter.
// `value` é uma JSON string (formato actual da coluna `imobiliaria`).
function ChipsAutocomplete({ value, suggestions = [], onChange, placeholder }) {
  const items = useMemo(() => {
    try {
      if (Array.isArray(value)) return value
      const v = JSON.parse(value || '[]')
      return Array.isArray(v) ? v : []
    } catch { return [] }
  }, [value])
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const filtered = useMemo(() => {
    const q = norm(input)
    const sel = new Set(items.map(norm))
    return (suggestions || []).filter(s => !sel.has(norm(s)) && (q === '' || norm(s).includes(q))).slice(0, 10)
  }, [suggestions, input, items])
  const add = (raw) => {
    const novo = String(raw || '').trim()
    if (!novo) return
    const next = [...new Set([...items, novo])]
    onChange(JSON.stringify(next))
    setInput('')
    setOpen(false)
  }
  const remove = (i) => onChange(JSON.stringify(items.filter((_, k) => k !== i)))
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
    else if (e.key === 'Backspace' && !input && items.length) onChange(JSON.stringify(items.slice(0, -1)))
    else if (e.key === 'Escape') setOpen(false)
  }
  useEffect(() => {
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap gap-1.5 px-2 py-1.5 rounded-lg border border-line bg-surface-raised min-h-[38px] focus-within:ring-2 focus-within:ring-accent/40">
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
          className="flex-1 min-w-[160px] outline-none text-sm bg-transparent"
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

function FormPanel({ tab, item, regiao, onSave, onCancel }) {
  const fields = FIELD_DEFS[tab] ?? []
  const [form, setForm] = useState({ ...item, regiao: item?.regiao || regiao || null })
  const [saving, setSaving] = useState(false)
  const [lookups, setLookups] = useState({})
  const [tagSuggestions, setTagSuggestions] = useState({ imobiliarias: [], zonas: [] })
  const isNew = !item.id
  // Ficha Rápida: ao criar um imóvel novo, mostrar só os campos disponíveis
  // no anúncio (nome, link, origem, localização, tipologia, ask price). O
  // resto preenche-se ao avançar de estado (checklist obrigatória já existe
  // no backend). Escape hatch: "Mostrar todos os campos" para quem já tem
  // tudo à mão.
  const canQuick = isNew && tab === 'Imóveis'
  const [showAll, setShowAll] = useState(!canQuick)
  const quickMode = canQuick && !showAll

  // Load relation lookups
  useEffect(() => {
    fields.filter(f => ['relation', 'relation_name', 'relation_name_or_new'].includes(f.type)).forEach(f => {
      apiFetch(f.endpoint, { regiao }).then(r => r.json()).then(data => {
        setLookups(prev => ({ ...prev, [f.key]: data }))
      }).catch(() => {})
    })
  }, [tab])

  // Sugestões para chips_autocomplete (Consultores) — imobiliárias já gravadas.
  useEffect(() => {
    if (tab !== 'Consultores') return
    apiFetch('/api/crm/consultores/sugestoes-tags')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTagSuggestions({ imobiliarias: d.imobiliarias || [], zonas: d.zonas || [] }) })
      .catch(() => {})
  }, [tab])

  function handleChange(key, value) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Moradia não tem "Nº Pisos do Prédio" nem "Elevador" — limpar para não
      // ficar valor escondido guardado.
      if (key === 'predio_tipo' && value === 'Moradia') {
        next.numero_pisos_predio = null
        next.tem_elevador = null
      }
      // Tipologia (T1, T2…) só faz sentido para Apartamento — limpar nos
      // restantes tipos para não ficar valor escondido guardado.
      if (key === 'predio_tipo' && value !== 'Apartamento') {
        next.tipologia = null
      }
      return next
    })
  }

  const inputClass = "w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
  const baseFields = quickMode ? fields.filter(f => f.quick) : fields
  const visibleFields = baseFields.filter(f => {
    // Tipologia (T1, T2…) só se aplica a Apartamento.
    if (f.key === 'tipologia') return form.predio_tipo === 'Apartamento'
    // Moradia não tem "Nº Pisos do Prédio" nem "Elevador".
    if (form.predio_tipo === 'Moradia' && (f.key === 'numero_pisos_predio' || f.key === 'tem_elevador')) return false
    return true
  })

  return (
    <div className="bg-surface-raised  rounded-xl border border-line  p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-semibold text-ink">{isNew ? (canQuick ? 'Nova Ficha Rápida' : 'Novo Registo') : 'Editar Registo'}</h2>
        {canQuick && (
          <button type="button" onClick={() => setShowAll(s => !s)} className="text-xs text-ink hover:underline whitespace-nowrap">
            {quickMode ? 'Mostrar todos os campos' : 'Mostrar só ficha rápida'}
          </button>
        )}
      </div>
      {quickMode && (
        <p className="text-xs text-ink-muted -mt-2 mb-4">
          Só o essencial do anúncio. O resto (tipo de prédio, áreas, valores, pipeline) completa-se ao avançar de estado.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleFields.map(f => {
          const fieldOptions = typeof f.options === 'function' ? f.options(form) : f.options
          const currentVal = form[f.key]
          const staleSelect = f.type === 'select' && currentVal && fieldOptions && !fieldOptions.includes(currentVal)
          return (
          <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2 xl:col-span-3' : ''}>
            <label className="block text-xs text-ink-muted mb-1">{f.label}{f.required && ' *'}</label>
            {f.type === 'select' ? (
              <>
                <select value={currentVal ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={`${inputClass}${staleSelect ? ' border-amber-400 ring-1 ring-amber-200' : ''}`}>
                  <option value="">—</option>
                  {staleSelect && <option value={currentVal} disabled>{currentVal} (fora do pipeline)</option>}
                  {fieldOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {staleSelect && (
                  <p className="mt-1 text-[11px] text-warning">
                    "{currentVal}" não pertence ao pipeline atual — escolhe um novo estado para confirmar.
                  </p>
                )}
              </>
            ) : f.type === 'multiselect' ? (
              <MultiSelect value={form[f.key]} options={fieldOptions} onChange={v => handleChange(f.key, v)} placeholder={`Selecionar ${f.label.toLowerCase()}...`} />
            ) : f.type === 'multiselect_regional' ? (
              <MultiSelect
                value={form[f.key]}
                options={ZONAS_ATUACAO_POR_REGIAO[form.regiao || regiao] || ZONAS_ATUACAO_POR_REGIAO.Coimbra}
                onChange={v => handleChange(f.key, v)}
                placeholder={`Selecionar ${f.label.toLowerCase()}...`}
              />
            ) : f.type === 'multiselect_concelhos' ? (
              <MultiSelect
                value={form[f.key]}
                options={(form.regiao || regiao) === 'AMP'
                  ? ['Espinho', 'Gondomar', 'Porto', 'Santa Maria da Feira', 'Vila Nova de Gaia']
                  : ['Cantanhede', 'Coimbra', 'Condeixa-a-Nova', 'Lousã', 'Mealhada', 'Miranda do Corvo', 'Montemor-o-Velho', 'Penacova']}
                onChange={v => handleChange(f.key, v)}
                placeholder={`Selecionar ${f.label.toLowerCase()}...`}
              />
            ) : f.type === 'multiselect_freguesias' ? (
              <MultiSelect
                value={form[f.key]}
                options={FREGUESIAS_POR_REGIAO[form.regiao || regiao] || FREGUESIAS_POR_REGIAO.Coimbra}
                onChange={v => handleChange(f.key, v)}
                placeholder={`Selecionar ${f.label.toLowerCase()}...`}
              />
            ) : f.type === 'combobox_freguesias' ? (
              <Combobox
                value={form[f.key]}
                onChange={v => handleChange(f.key, v)}
                options={(() => {
                  const src = FREGUESIAS_POR_REGIAO[form.regiao || regiao] || FREGUESIAS_POR_REGIAO.Coimbra
                  return Array.isArray(src) ? src : Object.values(src).flat()
                })()}
                placeholder="Pesquisar freguesia..."
              />
            ) : f.type === 'chips_autocomplete' ? (
              <ChipsAutocomplete
                value={form[f.key]}
                suggestions={tagSuggestions[f.key === 'imobiliaria' ? 'imobiliarias' : 'zonas'] || []}
                onChange={v => handleChange(f.key, v)}
                placeholder={f.key === 'imobiliaria' ? 'Escreve para procurar ou criar nova…' : 'Escreve e prime Enter…'}
              />
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
                regiao={form.regiao || regiao}
                onChange={v => handleChange(f.key, v)}
                onCreated={() => {
                  apiFetch(f.endpoint, { regiao }).then(r => r.json()).then(data => setLookups(prev => ({ ...prev, [f.key]: data }))).catch(() => {})
                }}
              />
            ) : f.type === 'textarea' ? (
              <textarea value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} rows={3} className={inputClass} />
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!form[f.key]} onChange={e => handleChange(f.key, e.target.checked ? 1 : 0)}
                className="w-5 h-5 rounded border-line text-ink" />
            ) : f.type === 'url' ? (
              <div className="flex gap-2">
                <input type="url" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} placeholder="https://..." />
                {form[f.key] && <a href={form[f.key]} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-surface-muted rounded-lg text-xs text-ink hover:bg-line shrink-0">Abrir</a>}
              </div>
            ) : f.type === 'tel' ? (
              <div className="flex gap-2">
                <input type="tel" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} />
                {form[f.key] && <a href={`tel:${form[f.key]}`} className="px-3 py-2 bg-success/10 rounded-lg text-xs text-success hover:bg-success/15 shrink-0">Ligar</a>}
              </div>
            ) : f.type === 'email' ? (
              <div className="flex gap-2">
                <input type="email" value={form[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} className={inputClass} />
                {form[f.key] && <a href={`mailto:${form[f.key]}`} className="px-3 py-2 bg-surface-muted rounded-lg text-xs text-ink hover:bg-surface-muted shrink-0">Email</a>}
              </div>
            ) : (
              <input type={f.type} value={form[f.key] ?? ''} onChange={e => handleChange(f.key, f.type === 'number' ? +e.target.value : e.target.value)} className={inputClass} />
            )}
          </div>
        )})}
      </div>
      <div className="flex gap-3 mt-6">
        <Button
          onClick={async () => {
            if (saving) return
            setSaving(true)
            try { await onSave(form) } finally { setSaving(false) }
          }}
          disabled={saving}
          loading={saving}
        >
          {isNew ? 'Criar' : 'Guardar'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

