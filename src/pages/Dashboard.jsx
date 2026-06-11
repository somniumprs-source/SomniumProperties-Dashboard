import { useState, useEffect, useCallback, useRef } from 'react'
import { TrendingUp, Database, Clock, Calculator, Megaphone } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { DepartmentSection } from '../components/dashboard/DepartmentSection.jsx'
import { ComercialDashboard } from '../components/dashboard/ComercialDashboard.jsx'
import { FinanceiroDashboard } from '../components/dashboard/FinanceiroDashboard.jsx'
import { PeriodSelector } from '../components/dashboard/PeriodSelector.jsx'
import { useKPIs } from '../hooks/useKPIs.js'
import { KPISkeleton } from '../components/ui/Skeleton.jsx'
import { Stagger } from '../components/ui/Stagger.jsx'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { apiFetch } from '../lib/api.js'
import { EUR, statusColor } from '../constants.js'
import { RegiaoToggle } from '../components/RegiaoBadge.jsx'

// Dashboard organizado por departamentos (dentro de Administração).
const DEPT_TABS = [
  { key: 'comercial',  label: 'Comercial',  icon: Database,   tone: 'gold' },
  { key: 'operacoes',  label: 'Operações',  icon: Clock,      tone: 'amber' },
  { key: 'financeiro', label: 'Financeiro', icon: TrendingUp, tone: 'green' },
  { key: 'marketing',  label: 'Marketing',  icon: Megaphone,  tone: 'indigo' },
]

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
  const [dept, setDept] = useState('comercial')
  const [periodo, setPeriodo] = useState('mes')
  const [dashData, setDashData] = useState(null)
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
  const [lastRefresh, setLastRefresh] = useState(null)
  const inFlightRef = useRef(false)

  const refreshPulseMetricas = useCallback(async () => {
    try {
      const pRes = await apiFetch('/api/weekly-pulse', { regiao })
      if (pRes.ok) setPulse(await pRes.json())
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

  // Dashboard por departamentos (Comercial + Financeiro) — um seletor de
  // período comanda este snapshot. Re-fetch quando muda período ou região.
  useEffect(() => {
    let cancel = false
    apiFetch(`/api/comercial/dashboard?periodo=${periodo}`, { regiao })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancel && j && !j.error) setDashData(j) })
      .catch(() => {})
    return () => { cancel = true }
  }, [periodo, regiao])
  const ns = dashData?.northStar

  const updatedAt = lastRefresh
    ? new Date(lastRefresh).toLocaleTimeString('pt-PT')
    : kpis?.updatedAt
      ? new Date(kpis.updatedAt).toLocaleString('pt-PT')
      : null

  const finKpis = kpis?.financeiro
  const comKpis = kpis?.comercial
  const anaKpis = finKpis?.analises

  // Número de cabeçalho de cada card de departamento (valor grande + caption).
  const deptMeta = {
    comercial:  { value: dashData?.funil?.atividade?.adicionados?.valor ?? '—', sub: 'Adicionados' },
    operacoes:  { value: finKpis?.negóciosAtivos ?? '—', sub: 'Projetos ativos' },
    financeiro: { value: finKpis ? formatEur(finKpis.lucroEstimadoTotal) : '—', sub: 'Pipeline de lucro' },
    marketing:  { value: '—', sub: 'Em breve' },
  }

  const sections = [
    {
      dept: 'operacoes',
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
    {
      dept: 'financeiro',
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
    ...(anaKpis?.total > 0 ? [{
      dept: 'financeiro',
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
  const deptSections = sections.filter(s => s.dept === dept)

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
                <p className="text-3xl font-bold font-mono text-brand-gold">{ns?.roicAnualizado != null ? `${ns.roicAnualizado}%` : '—'}</p>
                <p className="text-overline mt-0.5 uppercase tracking-widest font-semibold text-white/40">ROIC anual · North Star</p>
              </div>
            </div>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
              <img src="/logo-transparent.png" alt="" className="w-auto" style={{ height: 48 }} />
            </div>
          </div>
        </div>

        {/* Header de saúde — alertas transversais (o score está no banner).
            Atividade detalhada vive no bloco de cada departamento, com período. */}
        {pulse && (pulse.alertas.imoveisParados > 0 || pulse.alertas.investSemContacto > 0 || pulse.alertas.consFollowUpAtrasado > 0) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl px-4 py-3 border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-xs">
            <span className="font-semibold text-neutral-400 uppercase tracking-widest text-[10px]">Saúde</span>
            {pulse.alertas.imoveisParados > 0 && <span className="text-red-600">⚠ {pulse.alertas.imoveisParados} imóveis parados</span>}
            {pulse.alertas.investSemContacto > 0 && <span className="text-orange-600">⚠ {pulse.alertas.investSemContacto} investidores sem contacto</span>}
            {pulse.alertas.consFollowUpAtrasado > 0 && <span className="text-yellow-700">⚠ {pulse.alertas.consFollowUpAtrasado} follow-ups atrasados</span>}
          </div>
        )}

        {/* Seletor de departamento (cards, estilo CRM) + seletor de período global */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {DEPT_TABS.map((t) => (
              <KpiCard
                key={t.key}
                icon={t.icon}
                label={t.label}
                value={deptMeta[t.key]?.value}
                sub={deptMeta[t.key]?.sub}
                tone={t.tone}
                size="md"
                active={dept === t.key}
                onClick={() => setDept(t.key)}
              />
            ))}
          </div>
          {(dept === 'comercial' || dept === 'financeiro') && (
            <div className="flex items-center justify-end gap-3">
              {dashData?.intervalo && (
                <span className="text-[11px] text-neutral-400 hidden sm:inline">{dashData.intervalo.de} a {dashData.intervalo.ate}</span>
              )}
              <PeriodSelector value={periodo} onChange={setPeriodo} />
            </div>
          )}
        </div>

        {/* Conteúdo por departamento */}
        {dept === 'comercial' && <ComercialDashboard data={dashData} />}
        {dept === 'financeiro' && <FinanceiroDashboard data={dashData} />}

        {(dept === 'financeiro' || dept === 'operacoes') && !loading && deptSections.length > 0 && (
          <>
            {dept === 'financeiro' && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 -mb-2">Tesouraria & Análises (totais atuais)</p>
            )}
            <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {deptSections.map((s) => (
                <Stagger.Item key={s.title}>
                  <DepartmentSection {...s} />
                </Stagger.Item>
              ))}
            </Stagger>
          </>
        )}

        {dept === 'marketing' && (
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ backgroundColor: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
              <Megaphone className="w-6 h-6" style={{ color: '#C9A84C' }} />
            </div>
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Marketing — a montar</p>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm">Métricas, KPIs e OKRs de marketing entram na próxima fase, no mesmo formato do Comercial.</p>
          </div>
        )}
      </div>
    </>
  )
}
