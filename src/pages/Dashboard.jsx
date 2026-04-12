import { useState, useEffect } from 'react'
import { TrendingUp, Users, Megaphone, HardHat } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { DepartmentSection } from '../components/dashboard/DepartmentSection.jsx'
import { useKPIs } from '../hooks/useKPIs.js'

function statusFromValue(value, meta, higherIsBetter = true) {
  if (value === null || value === undefined || meta === undefined) return 'yellow'
  const ratio = value / meta
  if (higherIsBetter) {
    if (ratio >= 0.9) return 'green'
    if (ratio >= 0.7) return 'yellow'
    return 'red'
  } else {
    if (ratio <= 1.1) return 'green'
    if (ratio <= 1.3) return 'yellow'
    return 'red'
  }
}

function formatEur(val) {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

const PULSE_COLOR = { excelente: '#22c55e', bom: '#C9A84C', 'atenção': '#f59e0b', 'crítico': '#ef4444' }
const PULSE_BG = { excelente: 'rgba(34,197,94,0.1)', bom: 'rgba(201,168,76,0.1)', 'atenção': 'rgba(245,158,11,0.1)', 'crítico': 'rgba(239,68,68,0.1)' }

export function Dashboard() {
  const { kpis, loading, error, refresh } = useKPIs()
  const [pulse, setPulse] = useState(null)
  const [metricas, setMetricas] = useState(null)

  useEffect(() => {
    fetch('/api/weekly-pulse').then(r => r.json()).then(setPulse).catch(() => {})
    fetch('/api/metricas').then(r => r.json()).then(setMetricas).catch(() => {})
  }, [])

  const updatedAt = kpis?.updatedAt
    ? new Date(kpis.updatedAt).toLocaleString('pt-PT')
    : null

  const finKpis = kpis?.financeiro
  const comKpis = kpis?.comercial
  const mktKpis = kpis?.marketing
  const opsKpis = kpis?.operacoes

  const sections = [
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
      title: 'Comercial & Vendas',
      icon: Users,
      color: 'bg-indigo-600',
      link: '/comercial',
      kpis: [
        { label: 'Investidores',      value: comKpis?.investidoresTotal ?? '—',    meta: 50,  status: comKpis ? statusFromValue(comKpis.investidoresTotal, 50) : 'yellow',    trend: 'neutral', unit: '' },
        { label: 'Em Parceria',       value: comKpis?.investParceria ?? '—',       meta: 5,   status: comKpis ? statusFromValue(comKpis.investParceria, 5) : 'yellow',        trend: 'neutral', unit: '' },
        { label: 'Classificados A/B', value: comKpis?.investClassificados ?? '—',  meta: 10,  status: comKpis ? statusFromValue(comKpis.investClassificados, 10) : 'yellow',  trend: 'neutral', unit: '' },
        { label: 'Capital Disponível',value: comKpis ? formatEur(comKpis.capitalDisponivel) : '—', meta: formatEur(500000), status: comKpis ? statusFromValue(comKpis.capitalDisponivel, 500000) : 'yellow', trend: 'neutral', unit: '' },
      ],
    },
    {
      title: 'Marketing',
      icon: Megaphone,
      color: 'bg-violet-600',
      link: '/marketing',
      kpis: [
        { label: 'Leads Gerados', value: mktKpis?.leadsGerados ?? '—', meta: 20, status: mktKpis ? statusFromValue(mktKpis.leadsGerados, 20) : 'yellow', trend: 'neutral', unit: '' },
        { label: 'Custo p/ Lead', value: mktKpis ? formatEur(mktKpis.cpl) : '—', meta: formatEur(50), status: mktKpis ? statusFromValue(mktKpis.cpl, 50, false) : 'yellow', trend: 'neutral', unit: '' },
        { label: 'Leads Qualif. (SQL)', value: mktKpis?.sql ?? '—', meta: 8, status: mktKpis ? statusFromValue(mktKpis.sql, 8) : 'yellow', trend: 'neutral', unit: '' },
        { label: 'Taxa Qualificação', value: mktKpis ? `${mktKpis.taxaQualificacao}` : '—', meta: '40', unit: '%', status: mktKpis ? statusFromValue(mktKpis.taxaQualificacao, 40) : 'yellow', trend: 'neutral' },
      ],
    },
    {
      title: 'Operações',
      icon: HardHat,
      color: 'bg-orange-600',
      link: '/operacoes',
      kpis: [
        { label: 'Obras Ativas', value: opsKpis?.obrasAtivas ?? '—', meta: 5, status: 'green', trend: 'neutral', unit: '' },
        { label: 'Obras Concluídas', value: opsKpis?.obrasConcluidas ?? '—', meta: 2, status: opsKpis ? statusFromValue(opsKpis.obrasConcluidas, 2) : 'yellow', trend: 'neutral', unit: '' },
        { label: 'No Prazo', value: opsKpis ? `${opsKpis.percentNoPrazo}` : '—', meta: '80', unit: '%', status: opsKpis ? statusFromValue(opsKpis.percentNoPrazo, 80) : 'yellow', trend: 'neutral' },
        { label: 'Desvio Médio', value: opsKpis ? `${opsKpis.desvioMedio}` : '—', meta: '5', unit: '%', status: opsKpis ? statusFromValue(opsKpis.desvioMedio, 5, false) : 'yellow', trend: 'neutral' },
      ],
    },
  ]

  return (
    <>
      <Header
        title="Dashboard Central"
        subtitle={updatedAt ? `Última atualização: ${updatedAt}` : 'A carregar dados...'}
        onRefresh={refresh}
        loading={loading}
      />
      <div className="p-6 flex flex-col gap-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            Erro ao carregar KPIs: {error}
          </div>
        )}

        {/* Banner + Weekly Pulse */}
        <div className="rounded-2xl px-7 py-6 flex items-center justify-between overflow-hidden relative"
          style={{ backgroundColor: '#0d0d0d', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', border: '1px solid #1a1a1a' }}>
          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #C9A84C, #E8D08A, #C9A84C)' }} />
          <div className="relative z-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#C9A84C' }}>
              Dashboard Empresarial
            </p>
            <h2 className="text-white text-xl font-bold tracking-tight">Visão Geral do Negócio</h2>
            <p className="text-sm mt-1" style={{ color: '#666' }}>Todos os departamentos em tempo real</p>
          </div>
          <div className="hidden xl:flex items-center gap-8 relative z-10">
            {pulse && (
              <div className="text-center">
                <p className="text-3xl font-bold" style={{ color: PULSE_COLOR[pulse.status] ?? '#C9A84C' }}>{pulse.score}</p>
                <p className="text-xs mt-0.5 uppercase font-semibold" style={{ color: PULSE_COLOR[pulse.status] ?? '#555' }}>{pulse.status}</p>
              </div>
            )}
            {[
              { label: 'Estado', value: loading ? '...' : 'Online' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#C9A84C' }}>{item.value}</p>
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>{item.label}</p>
              </div>
            ))}
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
            <img src="/logo.png" alt="" className="h-16 w-auto" />
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
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 text-center">
              {[
                { label: 'Imóveis Novos', value: pulse.atividades.imoveisAdicionados, good: true },
                { label: 'Chamadas', value: pulse.atividades.chamadasFeitas, good: true },
                { label: 'Visitas', value: pulse.atividades.visitasFeitas, good: true },
                { label: 'Propostas', value: pulse.atividades.propostasEnviadas, good: true },
                { label: 'Deals', value: pulse.atividades.dealsFechados, good: true },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg p-2 shadow-sm">
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
            imoveisAdicionados: 'Imoveis adicionados',
            chamadasFeitas: 'Chamadas feitas',
            visitasRealizadas: 'Visitas realizadas',
            followUpsInvestidores: 'Follow-ups investidores',
            followUpsConsultores: 'Follow-ups consultores',
            reunioesInvestidores: 'Reunioes investidores',
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
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {sections.map((s) => (
            <DepartmentSection key={s.title} {...s} />
          ))}
        </div>
      </div>
    </>
  )
}
