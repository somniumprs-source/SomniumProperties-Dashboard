import { useState, useMemo, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '../components/layout/Header.jsx'
import { SummaryStat } from '../components/ui/SummaryStat.jsx'
import { PageSkeleton } from '../components/ui/Skeleton.jsx'
import { apiFetch } from '../lib/api.js'
import { useUrlState } from '../hooks/useUrlState.js'
import { useRefreshOnMutation } from '../hooks/useRefreshOnMutation.js'
import { EUR, PCT } from '../constants.js'
import { Tabs } from '../components/ui/Tabs.jsx'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Activity } from 'lucide-react'

const HRS = v => v == null ? '—' : `${Number(v).toFixed(1)}h`
const MES_LABEL = { '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez' }
const TABS = [
  { id: 'resumo',     label: 'Visão geral' },
  { id: 'horas',      label: 'Horas e custo' },
  { id: 'categorias', label: 'Atividades' },
  { id: 'equipa',     label: 'Equipa' },
  { id: 'eficiencia', label: 'Eficiência' },
]

const CAT_COLORS = ['#475569','#f59e0b','#ef4444','#10b981','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#a855f7','#e11d48','#0ea5e9','#65a30d']

// ── Components ──────────────────────────────────────────────────
function M({ label, value, sub, highlight = false, warn = false }) {
  const tone = warn ? 'red' : highlight ? 'gold' : 'gray'
  return <KpiCard label={label} value={value} sub={sub} tone={tone} size="sm" />
}

function SectionTitle({ children }) {
  return (<div className="flex items-center gap-3 mb-4"><div className="h-px flex-1 bg-line" /><span className="text-overline font-semibold uppercase text-ink-muted">{children}</span><div className="h-px flex-1 bg-line" /></div>)
}

function HBar({ items, valueKey = 'horas', labelKey = 'label', colorFn }) {
  if (!items?.length) return <p className="text-xs text-ink-muted text-center py-8">Sem dados</p>
  const max = Math.max(...items.map(i => i[valueKey] || 0), 1)
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => {
        const val = item[valueKey] || 0
        const pct = Math.max(Math.round(val / max * 100), 3)
        return (
          <div key={item[labelKey] || idx} className="flex items-center gap-3">
            <span className="text-xs text-ink-muted w-24 sm:w-40 text-right shrink-0 leading-tight truncate">{item[labelKey]}</span>
            <div className="flex-1 bg-surface-muted rounded-full h-2.5 overflow-hidden">
              <div className={`h-full rounded-full transition-[width] duration-moderate ease-entry ${colorFn ? 'bg-[var(--cor)]' : 'bg-ink-muted'}`} style={{ width: `${pct}%`, ...(colorFn ? { '--cor': colorFn(item, idx) } : {}) }} />
            </div>
            <span className="text-xs num font-semibold text-ink w-14 text-right shrink-0">{HRS(val)}</span>
            {item.tarefas != null && <span className="text-xs text-ink-muted w-16 shrink-0">{item.tarefas}x</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────
export function Operacoes({ embutido = false }) {
  const [tab, setTab] = useUrlState('tab', 'resumo')
  const [mutationError] = useState(null)
  const navigate = useNavigate()
  // As abas Tarefas e Calendário passaram para a Agenda (04/10/2026): links antigos seguem para lá.
  useEffect(() => {
    if (tab === 'tarefas') navigate('/administracao/agenda?tab=tarefas', { replace: true })
    if (tab === 'calendario') navigate('/administracao/agenda', { replace: true })
  }, [tab, navigate])

  // Migrado para React Query (Problema 23 da auditoria) — ver Financeiro.jsx/CRM.jsx.
  const query = useQuery({
    queryKey: ['operacoes-dashboard'],
    queryFn: async () => {
      // Antes esta vista chamava também /api/calendar/events (GCal directo).
      // Mas isso causava duplicação: cada evento aparecia uma vez como tarefa
      // sincronizada (com gcal_event_id) e outra vez como evento GCal "puro".
      // Resolução: passar a usar apenas as tarefas da BD, que já incluem tudo
      // o que veio do Google Calendar via pull. Para eventos GCal mais recentes
      // que ainda não passaram pelo pull, usa-se o botão "Sincronizar agora".
      const [tr, tf] = await Promise.all([
        apiFetch('/api/time-tracking').then(r => r.json()),
        // limit generoso — achado da auditoria: 200 cortava tarefas reais (já
        // havia 229 em produção, silenciosamente truncadas sem aviso nenhum).
        apiFetch('/api/tarefas?limit=1000').then(r => r.json()),
      ])
      if (tr.error) throw new Error(tr.error)
      return { data: tr, tarefas: tf.data || [] }
    },
  })
  const data = query.data?.data ?? null
  const tarefas = useMemo(() => query.data?.tarefas ?? [], [query.data])
  const loading = query.isPending
  const error = mutationError || query.error?.message || null
  const loadAll = query.refetch

  useRefreshOnMutation(loadAll)

  const r = data?.resumo
  const k = data?.kpis

  const ativas = tarefas.filter(t => t.status !== 'Concluída')

  return (
    <>
      {!embutido && <Header title="Operações" subtitle="Horas, custo, atividades e eficiência" onRefresh={loadAll} loading={loading} />}

      <div className={embutido ? 'bg-surface-raised  rounded-xl px-3 pt-2 mb-4' : 'px-4 sm:px-6 pt-3 bg-surface-raised sticky top-0 z-10'}>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex-1 min-w-0">
            <Tabs
              variant="underline"
              value={tab}
              onChange={setTab}
              items={TABS.map(t => ({ key: t.id, label: t.label }))}
            />
          </div>
        </div>
      </div>

      <div className={`flex flex-col gap-4 sm:gap-6 ${embutido ? '' : 'p-4 sm:p-6'}`}>
        {error && <div className="p-4 bg-danger/10 border border-danger/30 text-danger rounded-xl text-sm">Erro: {error}</div>}

        {/* Hero banner — Operações */}
        {(() => {
          const todayStr = new Date().toISOString().slice(0, 10)
          const tarefasAbertas = ativas.length
          const tarefasAtrasadas = tarefas.filter(t => t.status === 'Atrasada').length
          const tarefasHoje = tarefas.filter(t => t.inicio?.slice(0, 10) === todayStr).length
          const horasSemana = r?.horasSemana ?? 0
          return (
            <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs">
              <div className="relative flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
                    <Activity className="w-4 h-4 text-ink-muted" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 className="text-overline uppercase text-ink-muted">Operações</h2>
                    <p className="text-ui font-semibold text-ink">Análise das tarefas registadas na Agenda</p>
                    <Link to="/administracao/agenda?tab=tarefas" className="text-xs text-ink-muted hover:text-ink underline-offset-2 hover:underline">Gerir tarefas na Agenda →</Link>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryStat label="Tarefas abertas" value={tarefasAbertas} sub={`de ${tarefas.length} total`} />
                <SummaryStat label="Tarefas atrasadas" value={tarefasAtrasadas} sub="a recuperar" />
                <SummaryStat label="Horas esta semana" value={HRS(horasSemana)} sub={r?.totalTarefas != null ? `${r.totalTarefas} tarefas total` : ''} />
                <SummaryStat label="Tarefas hoje" value={tarefasHoje} sub={new Date().toLocaleDateString('pt-PT', { day:'2-digit', month:'2-digit' })} />
              </div>
            </div>
          )
        })()}

        {loading && !error && <PageSkeleton />}

        {/* ══════════ VISAO GERAL ══════════ */}
        {tab === 'resumo' && r && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <M label="Total de horas registadas" value={HRS(r.totalHoras)} sub={`${r.totalTarefas} tarefas`} highlight />
              <M label="Horas este mês" value={HRS(r.horasMesActual)} sub={`${r.tarefasMesActual} tarefas`} />
              <M label="Horas esta semana" value={HRS(r.horasSemana)} />
              <M label="Taxa de conclusão" value={PCT(r.taxaProdutividade)} sub={`${HRS(r.horasConcluídas)} concluídas`} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <M label="Receita / hora (pipeline)" value={k?.rph != null ? EUR(k.rph) : '—'} sub={`Pipeline: ${EUR(k?.receitaTotal)}`} highlight />
              <M label="Receita / hora (realizada)" value={k?.rphRealizado != null ? EUR(k.rphRealizado) : '—'} warn={k?.rphRealizado === null} />
              <M label="Horas / deal" value={k?.horasPorDeal != null ? HRS(k.horasPorDeal) : '—'} />
              <M label="Custo / deal (com horas)" value={k?.custoPorDeal != null ? EUR(k.custoPorDeal) : '—'} />
            </div>
            <Card padding="md">
              <Card.Header title="Estado das tarefas" subtitle="Distribuição por status" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="text-center"><span className="text-2xl num font-bold text-ink-muted">{r.statusTarefas.aFazer}</span><p className="text-overline uppercase text-ink-muted font-semibold mt-1">A fazer</p></div>
                <div className="text-center"><span className="text-2xl num font-bold text-ink-muted">{r.statusTarefas.emAndamento}</span><p className="text-overline uppercase text-ink-muted font-semibold mt-1">Em andamento</p></div>
                <div className="text-center"><span className="text-2xl num font-bold text-success">{r.statusTarefas.concluida}</span><p className="text-overline uppercase text-ink-muted font-semibold mt-1">Concluídas</p></div>
                <div className="text-center"><span className="text-2xl num font-bold text-danger">{r.statusTarefas.atrasada}</span><p className="text-overline uppercase text-ink-muted font-semibold mt-1">Atrasadas</p></div>
              </div>
            </Card>
            <Card padding="md">
              <Card.Header title="Distribuição de tempo" subtitle="Horas por tipo de atividade" />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <M label="Prospeção" value={HRS(k?.horasProspeção)} sub={k?.pctProspeção != null ? `${PCT(k.pctProspeção)} do total` : ''} />
                <M label="Análise" value={HRS(k?.horasAnálise)} sub={k?.pctAnálise != null ? `${PCT(k.pctAnálise)} do total` : ''} />
                <M label="Relacional" value={HRS(k?.horasRelacional)} sub={k?.pctRelacional != null ? `${PCT(k.pctRelacional)} do total` : ''} />
                <M label="Gestão e administração" value={HRS(k?.horasGestão)} sub={k?.pctGestão != null ? `${PCT(k.pctGestão)} do total` : ''} />
              </div>
            </Card>
            <Card padding="md">
              <Card.Header title="Estrutura de custos real" subtitle="Operação consolidada" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <M label="Custo de horas (15EUR/h)" value={EUR(r.custoHorasTotal)} sub={`${HRS(r.totalHoras)} x 15EUR`} />
                <M label="Custos fixos (ferramentas)" value={EUR(r.custoFixoTotal)} />
                <M label="Custo total operação" value={EUR(r.custoOperacaoTotal)} highlight />
              </div>
            </Card>
          </>
        )}

        {/* ══════════ HORAS & CUSTO ══════════ */}
        {tab === 'horas' && data?.meses && (
          <>
            <SectionTitle>Horas por mês</SectionTitle>
            <Card padding="md">
              <HBar items={data.meses.map(m => ({ label: `${MES_LABEL[m.mes.slice(5)] || m.mes.slice(5)} ${m.mes.slice(0,4)}`, horas: m.horas, tarefas: m.tarefas }))} labelKey="label" />
            </Card>
            <SectionTitle>Detalhe mensal</SectionTitle>
            <Card padding="md" className="overflow-x-auto">
              <table className="min-w-[600px] w-full text-sm">
                <thead><tr className="border-b border-line text-overline text-ink-muted uppercase"><th className="text-left py-2 px-3">Mês</th><th className="text-right py-2 px-3">Horas</th><th className="text-right py-2 px-3">Tarefas</th><th className="text-right py-2 px-3">Custo</th><th className="text-right py-2 px-3">h/sem</th></tr></thead>
                <tbody>
                  {data.meses.map(m => (
                    <tr key={m.mes} className="border-b border-line">
                      <td className="py-2 px-3 font-medium text-ink">{MES_LABEL[m.mes.slice(5)] || m.mes.slice(5)} {m.mes.slice(0,4)}</td>
                      <td className="py-2 px-3 text-right num text-xs font-bold">{HRS(m.horas)}</td>
                      <td className="py-2 px-3 text-right num text-xs">{m.tarefas}</td>
                      <td className="py-2 px-3 text-right num text-xs text-ink">{EUR(m.custoHoras)}</td>
                      <td className="py-2 px-3 text-right num text-xs text-ink-muted">{HRS(m.horas / 4.33)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-line font-bold"><td className="py-2 px-3">Total</td><td className="py-2 px-3 text-right num">{HRS(r?.totalHoras)}</td><td className="py-2 px-3 text-right num">{r?.totalTarefas}</td><td className="py-2 px-3 text-right num text-ink">{EUR(r?.custoHorasTotal)}</td><td className="py-2 px-3">—</td></tr></tfoot>
              </table>
            </Card>
          </>
        )}

        {/* ══════════ ACTIVIDADES ══════════ */}
        {tab === 'categorias' && data?.categorias && (
          <>
            <SectionTitle>Tempo por tipo de atividade</SectionTitle>
            <Card padding="md">
              <HBar items={data.categorias.map(c => ({ label: c.categoria, horas: c.horas, tarefas: c.tarefas }))} labelKey="label" colorFn={(_, i) => CAT_COLORS[i % CAT_COLORS.length]} />
            </Card>
            <SectionTitle>Detalhe</SectionTitle>
            <Card padding="md" className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead><tr className="border-b border-line text-overline text-ink-muted uppercase"><th className="text-left py-2 px-3">Atividade</th><th className="text-right py-2 px-3">Horas</th><th className="text-right py-2 px-3">%</th><th className="text-right py-2 px-3">Tarefas</th><th className="text-right py-2 px-3">h/tarefa</th><th className="text-right py-2 px-3">Custo</th></tr></thead>
                <tbody>
                  {data.categorias.map((c, i) => (
                    <tr key={c.categoria} className="border-b border-line">
                      <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shrink-0 bg-[var(--cor)]" style={{ '--cor': CAT_COLORS[i % CAT_COLORS.length] }} /><span className="text-ink font-medium">{c.categoria}</span></div></td>
                      <td className="py-2 px-3 text-right num text-xs font-bold">{HRS(c.horas)}</td>
                      <td className="py-2 px-3 text-right num text-xs">{PCT(c.pctHoras)}</td>
                      <td className="py-2 px-3 text-right num text-xs">{c.tarefas}</td>
                      <td className="py-2 px-3 text-right num text-xs text-ink-muted">{c.tarefas > 0 ? HRS(c.horas / c.tarefas) : '—'}</td>
                      <td className="py-2 px-3 text-right num text-xs text-ink">{EUR(c.custoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {/* ══════════ EQUIPA ══════════ */}
        {tab === 'equipa' && data?.funcionarios && (
          <>
            <SectionTitle>Desempenho por funcionário</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {data.funcionarios.map(f => (
                <Card key={f.nome} padding="md">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-ink">{f.nome}</h3>
                    <span className="text-xs num px-2 py-0.5 rounded-full bg-surface-muted text-ink font-medium">{HRS(f.horas)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-overline uppercase text-ink-muted font-semibold">Tarefas</span><p className="text-lg num font-bold text-ink">{f.tarefas}</p></div>
                    <div><span className="text-overline uppercase text-ink-muted font-semibold">Concluídas</span><p className="text-lg num font-bold text-success">{f.concluídas}</p></div>
                    <div><span className="text-overline uppercase text-ink-muted font-semibold">Taxa de conclusão</span><p className="text-lg num font-bold text-ink">{PCT(f.taxaConclusao)}</p></div>
                    <div><span className="text-overline uppercase text-ink-muted font-semibold">Custo total</span><p className="text-lg num font-bold text-ink">{EUR(f.custoTotal)}</p></div>
                  </div>
                  {data.mesesFuncionário && (
                    <div className="mt-4 pt-3 border-t border-line">
                      <span className="text-overline uppercase text-ink-muted font-semibold">Evolução mensal</span>
                      <div className="flex gap-2 mt-2">
                        {data.mesesFuncionário.filter(mf => mf.funcionario === f.nome).map(mf => (
                          <div key={mf.mes} className="flex flex-col items-center">
                            <div className="w-10 bg-surface-muted rounded-t overflow-hidden flex flex-col-reverse" style={{ height: '60px' }}>
                              <div className="bg-ink-muted/60 rounded-t transition-[height] duration-moderate ease-entry" style={{ height: `${Math.max(4, Math.round(mf.horas / Math.max(...data.mesesFuncionário.filter(x => x.funcionario === f.nome).map(x => x.horas), 1) * 60))}px` }} />
                            </div>
                            <span className="text-[9px] text-ink-muted mt-1">{MES_LABEL[mf.mes.slice(5)] || mf.mes.slice(5)}</span>
                            <span className="text-[9px] num font-bold">{HRS(mf.horas)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        {/* ══════════ EFICIENCIA ══════════ */}
        {tab === 'eficiencia' && k && (
          <>
            <SectionTitle>Receita por hora (RPH)</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <M label="RPH (pipeline)" value={k.rph != null ? EUR(k.rph) : '—'} sub={`Pipeline: ${EUR(k.receitaTotal)}`} highlight />
              <M label="RPH (realizado)" value={k.rphRealizado != null ? EUR(k.rphRealizado) : '—'} warn={k.rphRealizado === null} />
              <M label="Faturação em pipeline" value={EUR(k.receitaTotal)} />
              <M label="Faturação real" value={EUR(k.receitaRealizada)} />
            </div>
            <SectionTitle>Alocação de tempo</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <M label="% em prospeção" value={PCT(k.pctProspeção)} sub={HRS(k.horasProspeção)} highlight={k.pctProspeção >= 30} warn={k.pctProspeção < 20} />
              <M label="% em análise" value={PCT(k.pctAnálise)} sub={HRS(k.horasAnálise)} />
              <M label="% relacional" value={PCT(k.pctRelacional)} sub={HRS(k.horasRelacional)} />
              <M label="% em gestão e administração" value={PCT(k.pctGestão)} sub={HRS(k.horasGestão)} warn={k.pctGestão > 40} />
            </div>
            <Card padding="md">
              <Card.Header title="Diagnóstico" subtitle="Leitura rápida da operação" />
              <div className="flex flex-col gap-4">
                <div className="p-4 bg-surface rounded-xl">
                  <p className="text-overline uppercase text-ink-muted font-semibold mb-1">Alocação</p>
                  <p className="text-sm text-ink">{k.pctProspeção >= 40 ? 'Forte em prospeção — bom para fase de crescimento.' : k.pctProspeção >= 20 ? 'Equilibrada.' : 'Pouco tempo em prospeção — deveria ser >40%.'}</p>
                </div>
                <div className="p-4 bg-surface rounded-xl">
                  <p className="text-overline uppercase text-ink-muted font-semibold mb-1">RPH</p>
                  <p className="text-sm text-ink">{k.rphRealizado > 0 ? `${EUR(k.rphRealizado)}/h realizado.` : k.rph > 0 ? `Pipeline sugere ${EUR(k.rph)}/h. Meta: >30EUR/h.` : 'Sem receita: o RPH fica positivo após o 1.º negócio.'}</p>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  )
}

