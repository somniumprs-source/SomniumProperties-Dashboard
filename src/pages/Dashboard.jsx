import { useState, useEffect, useCallback, useRef } from 'react'
import { TrendingUp, Database, Clock, Calculator } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { DepartmentSection } from '../components/dashboard/DepartmentSection.jsx'
import { useKPIs } from '../hooks/useKPIs.js'
import { KPISkeleton } from '../components/ui/Skeleton.jsx'
import { apiFetch } from '../lib/api.js'
import { EUR, statusColor } from '../constants.js'
import { RegiaoToggle } from '../components/RegiaoBadge.jsx'

const REFRESH_INTERVAL_MS = 30_000

const REGIAO_STORAGE_KEY = 'somnium.regiao.dashboard'
function readRegiaoFromStorage() {
  try {
    const r = sessionStorage.getItem(REGIAO_STORAGE_KEY)
    return r === 'Coimbra' || r === 'AMP' ? r : null
  } catch { return null }
}

const formatEur = EUR
const statusFromValue = statusColor

const PULSE_COLOR = { excelente: '#22c55e', bom: '#C9A84C', 'atenção': '#f59e0b', 'crítico': '#ef4444' }
const PULSE_BG = { excelente: 'rgba(34,197,94,0.1)', bom: 'rgba(201,168,76,0.1)', 'atenção': 'rgba(245,158,11,0.1)', 'crítico': 'rgba(239,68,68,0.1)' }

export function Dashboard() {
  const [regiao, setRegiaoState] = useState(() => readRegiaoFromStorage())
  const setRegiao = (r) => {
    setRegiaoState(r)
    try {
      if (r) sessionStorage.setItem(REGIAO_STORAGE_KEY, r)
      else sessionStorage.removeItem(REGIAO_STORAGE_KEY)
    } catch {}
  }
  const { kpis, loading, error, refresh: refreshKpis } = useKPIs(regiao)
  const [pulse, setPulse] = useState(null)
  const [metricas, setMetricas] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const inFlightRef = useRef(false)

  const refreshPulseMetricas = useCallback(async () => {
    try {
      const [pRes, mRes] = await Promise.all([
        apiFetch('/api/weekly-pulse', { regiao }),
        apiFetch('/api/metricas', { regiao }),
      ])
      if (pRes.ok) setPulse(await pRes.json())
      if (mRes.ok) setMetricas(await mRes.json())
    } catch { /* offline / network — manter ultima leitura */ }
  }, [regiao])

  const refreshAll = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await Promise.all([refreshKpis(), refreshPulseMetricas()])
      setLastRefresh(Date.now())
    } finally {
      inFlightRef.current = false
    }
  }, [refreshKpis, refreshPulseMetricas])

  // Clique manual no botão "Atualizar": re-sincroniza os campos derivados
  // (ROI, ROI anualizado, VVR, custo de obra) das análises activas para os
  // imóveis no servidor e só depois recarrega. O polling/visibilidade
  // continuam a usar refreshAll (sem sync) para não escrever na BD a cada ciclo.
  const refreshManual = useCallback(async () => {
    try {
      await apiFetch('/api/crm/sync-derivados', { method: 'POST' })
    } catch { /* se o sync falhar, recarrega na mesma os dados */ }
    await refreshAll()
  }, [refreshAll])

  // Fetch inicial de pulse/metricas (kpis ja vai pelo useKPIs).
  useEffect(() => {
    refreshPulseMetricas().then(() => setLastRefresh(Date.now()))
  }, [refreshPulseMetricas])

  // Polling, visibilidade do tab e evento global de mutacao.
  // (Removido window.focus: duplicava visibilitychange e gerava spike ao voltar a tab.)
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) refreshAll() }, REFRESH_INTERVAL_MS)
    const onVisible = () => { if (!document.hidden) refreshAll() }
    const onMutation = () => refreshAll()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('somnium:refresh', onMutation)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('somnium:refresh', onMutation)
    }
  }, [refreshAll])

  const updatedAt = lastRefresh
    ? new Date(lastRefresh).toLocaleTimeString('pt-PT')
    : kpis?.updatedAt
      ? new Date(kpis.updatedAt).toLocaleString('pt-PT')
      : null

  const finKpis = kpis?.financeiro
  const comKpis = kpis?.comercial
  const anaKpis = finKpis?.analises

  const sections = [
    {
      title: 'CRM — Pipeline',
      icon: Database,
      color: 'bg-indigo-600',
      link: '/crm',
      kpis: [
        { label: 'Imóveis Ativos',    value: comKpis?.imóveisAtivos ?? '—',       meta: 20,  status: comKpis ? statusFromValue(comKpis.imóveisAtivos, 20) : 'yellow',        trend: 'neutral', unit: '' },
        { label: 'Investidores',      value: comKpis?.investidoresTotal ?? '—',    meta: 50,  status: comKpis ? statusFromValue(comKpis.investidoresTotal, 50) : 'yellow',    trend: 'neutral', unit: '' },
        { label: 'Em Parceria',       value: comKpis?.investParceria ?? '—',       meta: 5,   status: comKpis ? statusFromValue(comKpis.investParceria, 5) : 'yellow',        trend: 'neutral', unit: '' },
        { label: 'Capital Disponível',value: comKpis ? formatEur(comKpis.capitalDisponivel) : '—', meta: formatEur(500000), status: comKpis ? statusFromValue(comKpis.capitalDisponivel, 500000) : 'yellow', trend: 'neutral', unit: '' },
      ],
    },
    {
      title: 'Financeiro',
      icon: TrendingUp,
      color: 'bg-emerald-600',
      link: '/financeiro',
      kpis: [
        { label: 'Pipeline de Lucro',  value: finKpis ? formatEur(finKpis.lucroEstimadoTotal) : '—', meta: formatEur(100000), status: finKpis ? statusFromValue(finKpis.lucroEstimadoTotal, 100000) : 'yellow', trend: 'neutral', unit: '' },
        { label: 'Lucro Real',         value: finKpis ? formatEur(finKpis.lucroRealTotal) : '—',     meta: formatEur(50000),  status: finKpis ? statusFromValue(finKpis.lucroRealTotal, 50000) : 'yellow',        trend: 'neutral', unit: '' },
        { label: 'A Receber',          value: finKpis ? formatEur(finKpis.lucroPendente) : '—',      meta: '—',               status: finKpis?.lucroPendente > 0 ? 'yellow' : 'green',                            trend: 'neutral', unit: '' },
        { label: 'Burn Rate / Mês',    value: finKpis ? formatEur(finKpis.burnRate) : '—',           meta: formatEur(500),    status: finKpis ? statusFromValue(finKpis.burnRate, 500, false) : 'yellow',          trend: 'neutral', unit: '' },
      ],
    },
    {
      title: 'Operações',
      icon: Clock,
      color: 'bg-orange-600',
      link: '/operacoes',
      kpis: [
        { label: 'Projectos Ativos',  value: finKpis?.negóciosAtivos ?? '—',      meta: 5,   status: finKpis ? statusFromValue(finKpis.negóciosAtivos, 5) : 'yellow',        trend: 'neutral', unit: '' },
        { label: 'Classificados A/B', value: comKpis?.investClassificados ?? '—',  meta: 10,  status: comKpis ? statusFromValue(comKpis.investClassificados, 10) : 'yellow',  trend: 'neutral', unit: '' },
        { label: 'Deals Fechados',    value: finKpis?.dealsFechados ?? '0',        meta: 6,   status: finKpis ? statusFromValue(finKpis.dealsFechados, 6) : 'yellow',         trend: 'neutral', unit: '' },
        { label: 'Runway (meses)',    value: finKpis?.runway != null ? `${Math.round(finKpis.runway)}` : '—', meta: '12', unit: '', status: finKpis?.runway > 12 ? 'green' : 'yellow', trend: 'neutral' },
      ],
    },
    ...(anaKpis?.total > 0 ? [{
      title: 'Análises de Rentabilidade',
      icon: Calculator,
      color: 'bg-yellow-600',
      link: '/crm',
      kpis: [
        { label: 'Pipeline Lucro Líq.', value: formatEur(anaKpis.pipeline_lucro_liquido), meta: formatEur(100000), status: statusFromValue(anaKpis.pipeline_lucro_liquido, 100000), trend: 'neutral', unit: '' },
        { label: 'Capital Necessário',  value: formatEur(anaKpis.pipeline_capital), meta: '—', status: 'yellow', trend: 'neutral', unit: '' },
        { label: 'RA Médio',            value: `${anaKpis.media_retorno_anualizado}%`, meta: '15%', status: statusFromValue(anaKpis.media_retorno_anualizado, 15), trend: 'neutral', unit: '' },
        { label: 'Imóveis c/ Risco',    value: anaKpis.imoveis_com_risco, meta: 0, status: anaKpis.imoveis_com_risco === 0 ? 'green' : 'red', trend: 'neutral', unit: '' },
      ],
    }] : []),
  ]

  return (
    <>
      <Header
        title="Dashboard Central"
        subtitle={updatedAt ? `Última atualização: ${updatedAt}` : 'A carregar dados...'}
        onRefresh={refreshManual}
        loading={loading}
      />
      <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        <div className="flex justify-end">
          <RegiaoToggle value={regiao} onChange={setRegiao} />
        </div>
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            Erro ao carregar KPIs: {error}
          </div>
        )}

        {/* Skeleton inicial — só aparece no primeiro boot (quando ainda não há
            dados parciais). Em refresh subsequente os números antigos ficam
            visíveis sem flash. */}
        {loading && !error && !pulse && !kpis && <KPISkeleton count={8} />}

        {/* Banner principal — refinado em linha com Projetos */}
        <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-lg bg-gradient-to-br from-brand-dark via-brand-dark-light to-brand-dark-700">
          <div className="absolute top-0 right-0 w-72 h-72 bg-brand-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-overline uppercase tracking-widest font-semibold text-brand-gold mb-1.5">Dashboard Empresarial</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Visão Geral do Negócio</h2>
              <p className="text-sm mt-1 text-white/60">Todos os departamentos em tempo real</p>
            </div>
            <div className="hidden sm:flex items-center gap-7">
              {pulse && (
                <div className="text-right">
                  <p className="text-3xl font-bold font-mono" style={{ color: PULSE_COLOR[pulse.status] ?? '#C9A84C' }}>{pulse.score}</p>
                  <p className="text-overline mt-0.5 uppercase tracking-widest font-semibold" style={{ color: PULSE_COLOR[pulse.status] ?? '#888' }}>{pulse.status}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-2xl font-bold font-mono text-brand-gold">{loading ? '...' : 'Online'}</p>
                <p className="text-overline mt-0.5 uppercase tracking-widest font-semibold text-white/40">Estado</p>
              </div>
            </div>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
              <img src="/logo-transparent.png" alt="" className="w-auto" style={{ height: 48 }} />
            </div>
          </div>
        </div>

        {/* Weekly Pulse Detail */}
        {pulse && (
          <div className="rounded-xl p-5 border" style={{ backgroundColor: PULSE_BG[pulse.status], borderColor: PULSE_COLOR[pulse.status] + '33' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Pulso Semanal ({pulse.semana.de} a {pulse.semana.ate})</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: PULSE_COLOR[pulse.status] + '22', color: PULSE_COLOR[pulse.status] }}>
                {pulse.score}/100
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 text-center">
              {[
                { label: 'Imóveis Novos', value: pulse.atividades.imoveisAdicionados, good: true },
                { label: 'Chamadas', value: pulse.atividades.chamadasFeitas, good: true },
                { label: 'Visitas', value: pulse.atividades.visitasFeitas, good: true },
                { label: 'Propostas', value: pulse.atividades.propostasEnviadas, good: true },
                { label: 'Deals', value: pulse.atividades.dealsFechados, good: true },
              ].map(item => (
                <div key={item.label} className="bg-white dark:bg-neutral-900 rounded-lg p-2.5 shadow-xs border border-gray-100 dark:border-neutral-800">
                  <p className="text-lg font-bold text-gray-900">{item.value}</p>
                  <p className="text-xs text-gray-500">{item.label}</p>
                </div>
              ))}
            </div>
            {(pulse.alertas.imoveisParados > 0 || pulse.alertas.investSemContacto > 0 || pulse.alertas.consFollowUpAtrasado > 0) && (
              <div className="mt-3 flex gap-4 text-xs">
                {pulse.alertas.imoveisParados > 0 && <span className="text-red-600">{pulse.alertas.imoveisParados} imóveis parados</span>}
                {pulse.alertas.investSemContacto > 0 && <span className="text-orange-600">{pulse.alertas.investSemContacto} investidores sem contacto</span>}
                {pulse.alertas.consFollowUpAtrasado > 0 && <span className="text-yellow-700">{pulse.alertas.consFollowUpAtrasado} follow-ups atrasados</span>}
              </div>
            )}
          </div>
        )}

        {/* Leading Indicators — Weekly Activity Score */}
        {metricas?.avancado?.weeklyActivity && (() => {
          const wa = metricas.avancado.weeklyActivity
          const LABELS = {
            imoveisAdicionados: 'Imóveis adicionados',
            chamadasFeitas: 'Chamadas feitas',
            visitasRealizadas: 'Visitas realizadas',
            followUpsInvestidores: 'Follow-ups investidores',
            followUpsConsultores: 'Follow-ups consultores',
            reunioesInvestidores: 'Reuniões investidores',
          }
          return (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">Leading Indicators — Esta Semana</h3>
                  <p className="text-xs text-gray-400 mt-0.5">As metricas que preveem receita futura</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${wa.score >= 70 ? 'text-green-600' : wa.score >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {wa.score}%
                  </span>
                  <span className="text-xs text-gray-400">Activity Score</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Object.entries(wa).filter(([k]) => k !== 'score').map(([key, v]) => {
                  const pct = v.meta > 0 ? Math.min(100, Math.round(v.valor / v.meta * 100)) : 0
                  return (
                    <div key={key} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500">{LABELS[key] || key}</span>
                        <span className={`text-sm font-bold ${pct >= 100 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {v.valor}/{v.meta}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Sections */}
        {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {sections.map((s) => (
            <DepartmentSection key={s.title} {...s} />
          ))}
        </div>
        )}
      </div>
    </>
  )
}
