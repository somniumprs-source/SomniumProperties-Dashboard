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

export function Dashboard() {
  const { kpis, loading, error, refresh } = useKPIs()

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

        {/* Banner */}
        <div className="rounded-2xl px-7 py-6 flex items-center justify-between overflow-hidden relative"
          style={{ backgroundColor: '#0d0d0d', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', border: '1px solid #1a1a1a' }}>
          {/* Gold line top */}
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
            {[
              { label: 'Departamentos', value: '4' },
              { label: 'Estado', value: loading ? '...' : 'Online' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#C9A84C' }}>{item.value}</p>
                <p className="text-xs mt-0.5" style={{ color: '#555' }}>{item.label}</p>
              </div>
            ))}
          </div>

          {/* Logo watermark */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
            <img src="/logo.png" alt="" className="h-16 w-auto" />
          </div>
        </div>

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
