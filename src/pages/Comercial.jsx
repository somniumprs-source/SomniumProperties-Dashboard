import { useState, useEffect } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Header } from '../components/layout/Header.jsx'
import { KPICard } from '../components/dashboard/KPICard.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const PCT = v => `${(v ?? 0).toFixed(1)}%`
const K   = v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v ?? 0)

function st(val, meta, higher = true) {
  if (val === null || val === undefined) return 'yellow'
  const r = val / meta
  return higher ? (r >= 0.9 ? 'green' : r >= 0.7 ? 'yellow' : 'red')
                : (r <= 1.1 ? 'green' : r <= 1.3 ? 'yellow' : 'red')
}

const ESTADO_COLOR = {
  'Wholesaling':                    'bg-indigo-100 text-indigo-700',
  'Negócio em Curso':               'bg-indigo-100 text-indigo-700',
  'Follow UP':                      'bg-blue-100 text-blue-700',
  'Estudo de VVR':                  'bg-purple-100 text-purple-700',
  'Enviar proposta ao investidor':  'bg-amber-100 text-amber-700',
  'Visita Marcada':                 'bg-cyan-100 text-cyan-700',
  'Em Análise':                     'bg-gray-100 text-gray-600',
  'Adicionado':                     'bg-gray-100 text-gray-600',
  'Pendentes':                      'bg-gray-100 text-gray-600',
  'Descartado':                     'bg-red-100 text-red-500',
  'Nao interessa':                  'bg-red-100 text-red-500',
  'Não interessa':                  'bg-red-100 text-red-500',
  'Em negociação':                  'bg-orange-100 text-orange-700',
}

const CLASS_COLOR = {
  A: 'bg-green-100 text-green-700 border-green-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  D: 'bg-gray-100 text-gray-600 border-gray-200',
}

const ESTADO_EMP_COLOR = {
  '🟢 Qualificado':  'bg-green-100 text-green-700',
  '🟡 Em avaliação': 'bg-yellow-100 text-yellow-700',
  '🔴 Rejeitado':    'bg-red-100 text-red-600',
  '⚫ Inativo':      'bg-gray-100 text-gray-500',
}

const PIE_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#0ea5e9']

const FUNIL_IMOVEIS_COLORS = {
  'Adicionado':                    '#94a3b8',
  'Em Análise':                    '#94a3b8',
  'Visita Marcada':                '#7dd3fc',
  'Follow UP':                     '#60a5fa',
  'Estudo de VVR':                 '#818cf8',
  'Enviar proposta ao investidor': '#f59e0b',
  'Wholesaling':                   '#22c55e',
  'Negócio em Curso':              '#16a34a',
}

const FUNIL_INV_COLORS = {
  'Potencial':               '#e2e8f0',
  'Potencial Investidor':    '#e2e8f0',
  'Marcar call':             '#bfdbfe',
  'Marcar Call':             '#bfdbfe',
  'Call marcada':            '#93c5fd',
  'Call Marcada':            '#93c5fd',
  'Follow Up':               '#60a5fa',
  'Investidor classificado': '#6366f1',
  'Classificado':            '#6366f1',
  'Em Parceria':             '#16a34a',
  'Investidor em parceria':  '#16a34a',
}

const NOTION_PIPELINE = `https://www.notion.so/${(import.meta.env.VITE_NOTION_DB_PIPELINE_IMOVEIS ?? '').replace(/-/g,'')}`
const NOTION_INVEST   = `https://www.notion.so/${(import.meta.env.VITE_NOTION_DB_INVESTIDORES ?? '').replace(/-/g,'')}`

export function Comercial() {
  const [tab, setTab] = useState('resumo')
  const [kpis, setKpis]               = useState(null)
  const [hist, setHist]               = useState(null)
  const [imoveis, setImoveis]         = useState(null)
  const [invData, setInvData]         = useState(null)
  const [empData, setEmpData]         = useState(null)
  const [consData, setConsData]         = useState(null)
  const [selectedCons, setSelectedCons] = useState(null)
  const [metricasData, setMetricasData] = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [kr, hr, ir, invr, empr, consr, metr] = await Promise.all([
        fetch('/api/kpis/comercial'),
        fetch('/api/comercial/historico'),
        fetch('/api/comercial/imoveis'),
        fetch('/api/comercial/investidores'),
        fetch('/api/comercial/empreiteiros'),
        fetch('/api/comercial/consultores'),
        fetch('/api/comercial/metricas-temporais'),
      ])
      if (!kr.ok || !hr.ok) throw new Error('Erro no servidor')
      const [k, h, im, inv, emp, cons, met] = await Promise.all([
        kr.json(), hr.json(), ir.json(), invr.json(), empr.json(), consr.json(), metr.json(),
      ])
      if (k.error) throw new Error(k.error)
      setKpis(k); setHist(h)
      setImoveis(im?.imoveis ?? [])
      setInvData(inv ?? {})
      setEmpData(emp?.empreiteiros ?? [])
      setConsData(cons?.consultores ?? [])
      setMetricasData(met?.error ? null : met)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const ultimos6 = hist?.meses?.slice(-6) ?? []

  const TABS = ['resumo','imóveis','consultores','investidores','empreiteiros','kpis']
  const TAB_LABELS = { resumo: 'Resumo', 'imóveis': 'Pipeline Imóveis', consultores: 'Consultores', investidores: 'Investidores', empreiteiros: 'Empreiteiros', kpis: 'KPIs Temporais' }

  return (
    <>
      <Header title="Comercial" subtitle="Atualização em tempo real" onRefresh={load} loading={loading}
        notionUrl="https://www.notion.so/333c6d45a01f810dbae7ca7a9882ebef" />

      {/* Tab bar */}
      <div className="px-6 pt-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                ${tab === t ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* ── RESUMO ─────────────────────────────────────────── */}
        {tab === 'resumo' && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard label="Imóveis Ativos"          value={kpis?.imóveisAtivos ?? '—'}      meta={10}  status={st(kpis?.imóveisAtivos, 10)}       trend="neutral" unit="" />
              <KPICard label="Valor Potencial"         value={EUR(kpis?.valorPotencial)}        meta={EUR(500000)} status={st(kpis?.valorPotencial, 500000)} trend="neutral" unit="" />
              <KPICard label="Investidores Classif."   value={kpis?.investClassificados ?? '—'} meta={5}   status={st(kpis?.investClassificados, 5)}  trend="neutral" unit="" />
              <KPICard label="ROI Médio Pipeline"      value={kpis ? PCT(kpis.roiMedio) : '—'} meta="15%" status={st(kpis?.roiMedio, 15)}            trend="neutral" unit="" />
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Total no Pipeline</span>
                <span className="text-xl font-bold text-gray-900">{kpis?.imóveisTotal ?? '—'}</span>
                <span className="text-xs text-gray-400">{kpis?.imóveisDescartados ?? 0} descartados</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Em Parceria</span>
                <span className="text-xl font-bold text-green-600">{kpis?.investParceria ?? '—'}</span>
                <span className="text-xs text-gray-400">Investidores ativos</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Capital Disponível</span>
                <span className="text-xl font-bold text-indigo-600">{EUR(kpis?.capitalDisponivel)}</span>
                <span className="text-xs text-gray-400">Máx. de investidores A+B</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Total Investidores</span>
                <span className="text-xl font-bold text-gray-900">{kpis?.investidoresTotal ?? '—'}</span>
                <span className="text-xs text-gray-400">Na base de dados</span>
              </div>
            </div>

            {/* Funil imóveis + investidores */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Funil — Pipeline Imóveis</h2>
                <div className="flex flex-col gap-2">
                  {(kpis?.funilImoveis ?? []).map((f, i, arr) => {
                    const maxCount = arr[0]?.count || 1
                    const pct = Math.round(f.count / maxCount * 100)
                    return (
                      <div key={f.estado} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-40 text-right shrink-0 leading-tight">{f.estado}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                          <div className="h-full rounded-full flex items-center px-3 transition-all"
                            style={{ width: `${Math.max(pct,6)}%`, backgroundColor: FUNIL_IMOVEIS_COLORS[f.estado] ?? '#6366f1' }}>
                            {f.count > 0 && <span className="text-white text-xs font-semibold">{f.count}</span>}
                          </div>
                        </div>
                        <span className="text-xs font-mono text-gray-400 w-20 shrink-0">{EUR(f.valorTotal)}</span>
                      </div>
                    )
                  })}
                  {!kpis?.funilImoveis?.length && <EmptyState />}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Funil — Investidores</h2>
                <div className="flex flex-col gap-2">
                  {(kpis?.funilInvestidores ?? []).map((f, i, arr) => {
                    const maxCount = arr[0]?.count || 1
                    const pct = Math.round(f.count / maxCount * 100)
                    return (
                      <div key={f.status} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-40 text-right shrink-0 leading-tight">{f.status}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                          <div className="h-full rounded-full flex items-center px-3 transition-all"
                            style={{ width: `${Math.max(pct,6)}%`, backgroundColor: FUNIL_INV_COLORS[f.status] ?? '#6366f1' }}>
                            {f.count > 0 && <span className="text-xs font-semibold" style={{ color: ['Potencial','Marcar call'].includes(f.status) ? '#6b7280' : 'white' }}>{f.count}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {!kpis?.funilInvestidores?.length && <EmptyState />}
                </div>
              </div>
            </div>

            {/* Imóveis por mês + origem */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Imóveis Adicionados — últimos 6 meses</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ultimos6} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ativos"     name="Ativos"     fill="#6366f1" radius={[3,3,0,0]} stackId="a" />
                    <Bar dataKey="descartados" name="Descartados" fill="#f87171" radius={[3,3,0,0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Origem dos Imóveis</h2>
                {kpis?.origens?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={kpis.origens} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                        {kpis.origens.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </div>
            </div>

            {/* Imóveis ativos rápidos */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Imóveis Ativos</h2>
                <button onClick={() => setTab('imóveis')} className="text-xs text-indigo-600 hover:underline">Ver todos</button>
              </div>
              <ImoveisTable rows={kpis?.imoveisAtivosLista ?? []} />
            </div>
          </>
        )}

        {/* ── PIPELINE IMÓVEIS ──────────────────────────────── */}
        {tab === 'imóveis' && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Total no Pipeline</span>
                <span className="text-xl font-bold text-gray-900">{imoveis?.length ?? '—'}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Valor Total Ask</span>
                <span className="text-xl font-bold text-indigo-600">{EUR(imoveis?.reduce((s,i) => s + i.askPrice, 0) ?? 0)}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">ROI Médio</span>
                <span className="text-xl font-bold text-green-600">
                  {imoveis?.filter(i => i.roi > 0).length > 0
                    ? PCT(imoveis.filter(i=>i.roi>0).reduce((s,i)=>s+i.roi,0)/imoveis.filter(i=>i.roi>0).length)
                    : '—'}
                </span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Por Tipologia</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {hist?.tipologias?.slice(0,4).map(t => (
                    <span key={t.name} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.name} ({t.count})</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Todos os Imóveis</h2>
                <a href={NOTION_PIPELINE} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">Abrir no Notion</a>
              </div>
              <ImoveisTable rows={imoveis ?? []} showAll />
            </div>
          </>
        )}

        {/* ── CONSULTORES ───────────────────────────────────── */}
        {tab === 'consultores' && (() => {
          const cons = consData ?? []
          const comLeads = cons.filter(c => c.total > 0)
          const followUpHoje = cons.filter(c => c.dataProximoFollowUp && new Date(c.dataProximoFollowUp) <= new Date())
          const abertosParc = cons.filter(c => c.estatuto === 'Aberto Parcerias').length
          const avgResposta = (() => {
            const vals = comLeads.map(c => c.tempoRespostaMedio).filter(v => v != null)
            return vals.length ? Math.round(vals.reduce((a,b) => a+b,0)/vals.length) : null
          })()

          const ESTATUTO_COLOR = {
            'Aberto Parcerias': 'bg-green-100 text-green-700',
            'Follow up':        'bg-blue-100 text-blue-700',
            'Cold Call':        'bg-gray-100 text-gray-500',
            'Em Parceria':      'bg-indigo-100 text-indigo-700',
            'Inativo':          'bg-red-100 text-red-500',
          }

          return (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total na Lista</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{cons.length}</p>
                <p className="text-xs text-gray-400">{abertosParc} abertos a parcerias</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Follow-up Pendente</p>
                <p className={`text-2xl font-bold mt-1 ${followUpHoje.length > 0 ? 'text-amber-500' : 'text-green-600'}`}>{followUpHoje.length}</p>
                <p className="text-xs text-gray-400">data de follow-up atingida</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Com Leads no Pipeline</p>
                <p className="text-2xl font-bold text-indigo-600 mt-1">{comLeads.length}</p>
                <p className="text-xs text-gray-400">{cons.reduce((s,c) => s+c.total,0)} leads totais</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Tempo Médio Resposta</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{avgResposta != null ? `${avgResposta}d` : '—'}</p>
                <p className="text-xs text-gray-400">adicionado → 1ª chamada</p>
              </div>
            </div>

            {/* Follow-up pendente alert */}
            {followUpHoje.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-700 mb-2">Follow-up pendente hoje ({followUpHoje.length})</p>
                <div className="flex flex-wrap gap-2">
                  {followUpHoje.map(c => (
                    <span key={c.nome} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                      {c.nome} · {c.dataProximoFollowUp ? new Date(c.dataProximoFollowUp).toLocaleDateString('pt-PT',{day:'2-digit',month:'short'}) : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tabela principal */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Lista de Consultores</h2>
                <span className="text-xs text-gray-400">Clica numa linha para ver detalhe</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Consultor</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estatuto</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Imobiliária</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leads</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Este mês</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">% Descarte</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resposta</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Pipeline</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deals fechados</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Lucro gerado</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Próx. Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cons.map((c) => {
                      const followUpAtrasado = c.dataProximoFollowUp && new Date(c.dataProximoFollowUp) <= new Date()
                      return (
                        <tr key={c.id ?? c.nome}
                          onClick={() => setSelectedCons(selectedCons?.nome === c.nome ? null : c)}
                          className={`border-b border-gray-50 cursor-pointer transition-colors
                            ${selectedCons?.nome === c.nome ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {c.nome.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{c.nome}</p>
                                {c.contacto && <p className="text-xs text-gray-400">{c.contacto}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {c.estatuto ? (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTATUTO_COLOR[c.estatuto] ?? 'bg-gray-100 text-gray-500'}`}>
                                {c.estatuto}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{c.imobiliaria?.join(', ') || '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{c.total > 0 ? c.total : <span className="text-gray-300">0</span>}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-medium text-sm ${c.leadsEsteMes > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                              {c.leadsEsteMes}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {c.total > 0 ? (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                c.taxaDescarte > 60 ? 'bg-red-100 text-red-600' :
                                c.taxaDescarte > 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                {c.taxaDescarte.toFixed(0)}%
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">
                            {c.tempoRespostaMedio != null ? `${c.tempoRespostaMedio}d` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-mono text-gray-700">
                            {c.valorPipeline > 0 ? EUR(c.valorPipeline) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-700">
                            {c.dealsTotal > 0 ? (
                              <span>
                                {c.dealsVendidos > 0 && <span className="font-semibold text-green-600">{c.dealsVendidos}✓ </span>}
                                {c.dealsEmCurso > 0 && <span className="text-indigo-500">{c.dealsEmCurso}↗</span>}
                                {c.dealsTotal === 0 && <span className="text-gray-300">0</span>}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-mono">
                            {c.lucroRealizado > 0 ? (
                              <span className="text-green-600 font-semibold">{EUR(c.lucroRealizado)}</span>
                            ) : c.lucroPotencial > 0 ? (
                              <span className="text-indigo-400">{EUR(c.lucroPotencial)}*</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {c.dataProximoFollowUp ? (
                              <span className={followUpAtrasado ? 'text-amber-600 font-semibold' : 'text-gray-400'}>
                                {new Date(c.dataProximoFollowUp).toLocaleDateString('pt-PT',{day:'2-digit',month:'short'})}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {!cons.length && <div className="py-10 text-center text-gray-400 text-sm">Sem dados</div>}
              </div>
            </div>

            {/* Detalhe consultor selecionado */}
            {selectedCons && (
              <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                      {selectedCons.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{selectedCons.nome}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {selectedCons.estatuto && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ESTATUTO_COLOR[selectedCons.estatuto] ?? 'bg-gray-100 text-gray-500'}`}>
                            {selectedCons.estatuto}
                          </span>
                        )}
                        {selectedCons.imobiliaria?.length > 0 && (
                          <span className="text-xs text-gray-400">{selectedCons.imobiliaria.join(', ')}</span>
                        )}
                        {selectedCons.contacto && (
                          <span className="text-xs text-gray-400">{selectedCons.contacto}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCons(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Leads no pipeline</p>
                    <p className="text-xl font-bold text-gray-900">{selectedCons.total}</p>
                    <p className="text-xs text-gray-400">{selectedCons.ativos} ativos · {selectedCons.descartados} descartados</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Tempo resposta médio</p>
                    <p className="text-xl font-bold text-indigo-600">{selectedCons.tempoRespostaMedio != null ? `${selectedCons.tempoRespostaMedio}d` : '—'}</p>
                    <p className="text-xs text-gray-400">adicionado → chamada</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Tempo negociação</p>
                    <p className="text-xl font-bold text-gray-900">{selectedCons.tempoNegociacaoMedio != null ? `${selectedCons.tempoNegociacaoMedio}d` : '—'}</p>
                    <p className="text-xs text-gray-400">chamada → proposta</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Valor pipeline</p>
                    <p className="text-xl font-bold text-gray-900">{selectedCons.valorPipeline > 0 ? EUR(selectedCons.valorPipeline) : '—'}</p>
                    <p className="text-xs text-gray-400">leads ativos</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                    <p className="text-xs text-gray-400">Deals na faturação</p>
                    <p className="text-xl font-bold text-green-600">{selectedCons.dealsTotal ?? 0}</p>
                    <p className="text-xs text-gray-400">{selectedCons.dealsVendidos ?? 0} vendidos · {selectedCons.dealsEmCurso ?? 0} em curso</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                    <p className="text-xs text-gray-400">Lucro realizado</p>
                    <p className="text-xl font-bold text-green-600">{selectedCons.lucroRealizado > 0 ? EUR(selectedCons.lucroRealizado) : '—'}</p>
                    <p className="text-xs text-gray-400">negócios vendidos</p>
                  </div>
                  {selectedCons.lucroPotencial > 0 && (
                    <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                      <p className="text-xs text-gray-400">Lucro potencial</p>
                      <p className="text-xl font-bold text-indigo-600">{EUR(selectedCons.lucroPotencial)}</p>
                      <p className="text-xs text-gray-400">negócios em curso</p>
                    </div>
                  )}
                  {selectedCons.taxaConversaoFat != null && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Taxa conversão (fat.)</p>
                      <p className="text-xl font-bold text-indigo-600">{selectedCons.taxaConversaoFat}%</p>
                      <p className="text-xs text-gray-400">negócios → vendidos</p>
                    </div>
                  )}
                </div>

                {selectedCons.total > 0 && (
                  <>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Funil de Progressão</h4>
                    <div className="flex flex-col gap-2">
                      {selectedCons.funil.map((f, idx, arr) => {
                        const pct = arr[0].count > 0 ? Math.round(f.count / arr[0].count * 100) : 0
                        const colors = ['#94a3b8','#7dd3fc','#60a5fa','#818cf8','#6366f1']
                        return (
                          <div key={f.fase} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-36 text-right shrink-0">{f.fase}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                              <div className="h-full rounded-full flex items-center px-3 transition-all"
                                style={{ width: `${Math.max(pct,4)}%`, backgroundColor: colors[idx] }}>
                                {f.count > 0 && <span className="text-white text-xs font-semibold">{f.count}</span>}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {selectedCons.motivoFollowUp && (
                  <p className="mt-4 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                    <span className="font-semibold text-gray-600">Motivo follow-up: </span>{selectedCons.motivoFollowUp}
                  </p>
                )}
              </div>
            )}

            {/* Gráfico — só consultores com leads */}
            {comLeads.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Comparativo — Consultores com Leads</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={comLeads} margin={{ top: 0, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v, n) => [v, n === 'total' ? 'Total' : n === 'ativos' ? 'Ativos' : 'Este mês']} />
                    <Legend />
                    <Bar dataKey="total"        name="Total"     fill="#6366f1" radius={[3,3,0,0]} />
                    <Bar dataKey="ativos"       name="Ativos"    fill="#10b981" radius={[3,3,0,0]} />
                    <Bar dataKey="leadsEsteMes" name="Este mês"  fill="#f59e0b" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
          )
        })()}

        {/* ── INVESTIDORES ──────────────────────────────────── */}
        {tab === 'investidores' && (
          <>
            {/* Cards por classificação */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {['A','B','C','D'].map(cl => {
                const lista = invData?.porClass?.[cl] ?? []
                const capitalMax = lista.reduce((s,i) => s + i.capitalMax, 0)
                return (
                  <div key={cl} className={`rounded-xl border p-4 shadow-sm flex flex-col gap-1 ${CLASS_COLOR[cl]}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide font-semibold">Classe {cl}</span>
                      <span className="text-2xl font-bold">{lista.length}</span>
                    </div>
                    <span className="text-xs opacity-70">{lista.length > 0 ? `Cap. máx: ${EUR(capitalMax)}` : 'Sem investidores'}</span>
                  </div>
                )
              })}
            </div>

            {/* Investidores sem classe */}
            {(invData?.porClass?.['Sem class.']?.length ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                {invData.porClass['Sem class.'].length} investidor(es) sem classificação:&nbsp;
                {invData.porClass['Sem class.'].map(i => i.nome).join(', ')}
              </div>
            )}

            {/* Tabela completa */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Todos os Investidores</h2>
                <a href={NOTION_INVEST} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">Abrir no Notion</a>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-3">Nome</th>
                      <th className="text-left py-2 px-3">Status</th>
                      <th className="text-center py-2 px-3">Classe</th>
                      <th className="text-right py-2 px-3">Capital Mín.</th>
                      <th className="text-right py-2 px-3">Capital Máx.</th>
                      <th className="text-left py-2 px-3">Estratégia</th>
                      <th className="text-right py-2 px-3">Dias s/ Cont.</th>
                      <th className="text-left py-2 px-3">Próxima Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invData?.investidores ?? []).map(inv => (
                      <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{inv.nome}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            inv.status === 'Investidor em parceria' ? 'bg-green-100 text-green-700' :
                            inv.status === 'Classificado' ? 'bg-indigo-100 text-indigo-700' :
                            inv.status === 'Parceria em andamento' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{inv.status ?? '—'}</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {inv.classificacao.length > 0 ? (
                            <div className="flex gap-1 justify-center">
                              {inv.classificacao.map(c => (
                                <span key={c} className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border ${CLASS_COLOR[c] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>{c}</span>
                              ))}
                            </div>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{inv.capitalMin > 0 ? EUR(inv.capitalMin) : '—'}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{inv.capitalMax > 0 ? EUR(inv.capitalMax) : '—'}</td>
                        <td className="py-2 px-3 text-xs text-gray-500">{inv.estrategia.join(', ') || '—'}</td>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${inv.diasSemContacto > 30 ? 'text-red-600 font-semibold' : inv.diasSemContacto > 14 ? 'text-amber-600' : 'text-gray-600'}`}>
                          {inv.diasSemContacto != null ? `${inv.diasSemContacto}d` : '—'}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-500 max-w-[200px] truncate">{inv.proximaAcao || '—'}</td>
                      </tr>
                    ))}
                    {!invData?.investidores?.length && (
                      <tr><td colSpan={8} className="py-6 text-center text-gray-400 text-xs">Sem investidores</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── KPIs TEMPORAIS ───────────────────────────────── */}
        {tab === 'kpis' && (() => {
          const m = metricasData
          if (!m) return <div className="py-12 text-center text-gray-400 text-sm">A carregar métricas…</div>

          const vol  = m.imoveis?.volume  ?? {}
          const funil= m.imoveis?.funil   ?? {}
          const ciclo= m.imoveis?.ciclo   ?? {}
          const rec  = m.receita          ?? {}
          const inv  = m.investidores     ?? {}
          const cons = m.consultores      ?? {}

          function badge(val, meta, lower = false) {
            if (val == null) return 'bg-gray-100 text-gray-400'
            const r = lower ? meta / val : val / meta
            return r >= 0.9 ? 'bg-green-100 text-green-700' : r >= 0.7 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
          }
          function cycleColor(days, target) {
            if (days == null) return 'text-gray-400'
            return days <= target ? 'text-green-600 font-semibold' : days <= target * 1.3 ? 'text-amber-600' : 'text-red-600 font-semibold'
          }
          function funnelPct(n, d) {
            if (!d || d === 0) return null
            return Math.round(n / d * 10) / 10
          }

          const periodos = m.periodos ?? {}

          return (
            <>
              {/* ─ Período info ─ */}
              <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                <span className="bg-gray-100 px-2 py-1 rounded">Semana: {periodos.semana?.de} → {periodos.semana?.ate}</span>
                <span className="bg-gray-100 px-2 py-1 rounded">Trimestre: {periodos.trimestre}</span>
                <span className="bg-gray-100 px-2 py-1 rounded">Semestre: {periodos.semestre}</span>
                <span className="bg-gray-100 px-2 py-1 rounded">Ano: {periodos.ano}</span>
              </div>

              {/* ─ 1. Volume de Atividades ─ */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">2.4 Volume de Atividades — Imóveis</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left py-2 px-3">Atividade</th>
                        <th className="text-right py-2 px-3">Semana</th>
                        <th className="text-right py-2 px-3">Meta/sem</th>
                        <th className="text-right py-2 px-3">Mês</th>
                        <th className="text-right py-2 px-3">Trim.</th>
                        <th className="text-right py-2 px-3">Sem.</th>
                        <th className="text-right py-2 px-3">Ano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Imóveis adicionados', key: 'adicionados', meta: 10 },
                        { label: 'Chamadas realizadas', key: 'chamadas',    meta: 8  },
                        { label: 'Visitas realizadas',  key: 'visitas',     meta: 2  },
                        { label: 'Estudos de mercado',  key: 'estudos',     meta: 0.25 },
                        { label: 'Propostas enviadas',  key: 'propostas',   meta: 0.25 },
                      ].map(({ label, key, meta }) => (
                        <tr key={key} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-700">{label}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge(vol.semanal?.[key], meta)}`}>
                              {vol.semanal?.[key] ?? '—'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-xs text-gray-400">≥{meta}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-gray-700">{vol.mensal?.[key] ?? '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-gray-500">{vol.trimestral?.[key] ?? '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-gray-500">{vol.semestral?.[key] ?? '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-gray-500">{vol.anual?.[key] ?? '—'}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-gray-50 bg-indigo-50">
                        <td className="py-2 px-3 text-indigo-700 font-medium">Em Follow UP (agora)</td>
                        <td colSpan={2} className="py-2 px-3 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge(vol.semanal?.emFollowUp, 5)}`}>
                            {vol.semanal?.emFollowUp ?? '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-xs text-gray-400">≥5</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─ 2. Funil de Conversão ─ */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">1.2 Funil de Conversão — por coorte de adição</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left py-2 px-3">Etapa</th>
                        <th className="text-right py-2 px-3">Mês</th>
                        <th className="text-right py-2 px-3">%</th>
                        <th className="text-right py-2 px-3">Trimestre</th>
                        <th className="text-right py-2 px-3">%</th>
                        <th className="text-right py-2 px-3">Semestre</th>
                        <th className="text-right py-2 px-3">%</th>
                        <th className="text-right py-2 px-3">Ano</th>
                        <th className="text-right py-2 px-3">%</th>
                        <th className="text-right py-2 px-3">Total</th>
                        <th className="text-right py-2 px-3">%</th>
                        <th className="text-left py-2 px-3">Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Adicionados',        key: 'adicionados',       metaTxt: '—'    },
                        { label: '→ Com Chamada',       key: 'comChamada',        meta: 80, metaTxt: '≥80%' },
                        { label: '→ Com Visita',        key: 'comVisita',         meta: 35, metaTxt: '≥35%' },
                        { label: '→ Com Estudo VVR',    key: 'comEstudo',         metaTxt: 'inf.' },
                        { label: '→ Proposta Enviada',  key: 'comProposta',       meta: 50, metaTxt: '≥50%' },
                        { label: '→ Proposta Aceite',   key: 'comPropostaAceite', meta: 35, metaTxt: '≥35%' },
                      ].map(({ label, key, meta, metaTxt }) => {
                        const pcts = ['mensal','trimestral','semestral','anual','total'].map(p => {
                          const f   = funil[p] ?? {}
                          const val = f[key] ?? 0
                          const base= f.adicionados ?? 0
                          const pct = key === 'adicionados' ? null : funnelPct(val, base)
                          return { val, pct }
                        })
                        return (
                          <tr key={key} className={`border-b border-gray-50 hover:bg-gray-50 ${key === 'adicionados' ? 'font-semibold' : ''}`}>
                            <td className="py-2 px-3 text-gray-700">{label}</td>
                            {pcts.map((p, i) => (
                              <>
                                <td key={`v${i}`} className="py-2 px-3 text-right font-mono text-xs text-gray-700">{p.val > 0 ? p.val : '—'}</td>
                                <td key={`p${i}`} className="py-2 px-3 text-right text-xs">
                                  {p.pct != null ? (
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge(p.pct, meta ?? p.pct)}`}>
                                      {p.pct}%
                                    </span>
                                  ) : '—'}
                                </td>
                              </>
                            ))}
                            <td className="py-2 px-3 text-xs text-gray-400">{metaTxt}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─ 3. Ciclo médio entre fases ─ */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">2.2 Ciclo Médio entre Fases — Imóveis</h2>
                <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                  {[
                    { label: 'Lead → Chamada',    key: 'leadAChamada',    meta: 1,  metaTxt: '≤1 dia'  },
                    { label: 'Chamada → Visita',  key: 'chamadaAVisita',  meta: 7,  metaTxt: '≤7 dias' },
                    { label: 'Visita → Estudo',   key: 'visitaAEstudo',   meta: 14, metaTxt: '≤14 dias'},
                    { label: 'Estudo → Proposta', key: 'estudoAProposta', meta: 7,  metaTxt: '≤7 dias' },
                    { label: 'Proposta → Fecho',  key: 'propostaAFecho',  meta: 30, metaTxt: '≤30 dias'},
                  ].map(({ label, key, meta, metaTxt }) => (
                    <div key={key} className="bg-gray-50 rounded-lg p-4 flex flex-col gap-1">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`text-2xl font-bold ${cycleColor(ciclo[key], meta)}`}>
                        {ciclo[key] != null ? `${ciclo[key]}d` : '—'}
                      </p>
                      <p className="text-xs text-gray-400">meta: {metaTxt}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ─ 4. Motivos de descarte ─ */}
              {(m.imoveis?.motivosDescarte?.length ?? 0) > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">2.3 Motivos de Descarte</h2>
                    <div className="flex flex-col gap-2">
                      {(m.imoveis?.motivosDescarte ?? []).map(({ motivo, count }, idx, arr) => {
                        const pct = Math.round(count / arr.reduce((s,x)=>s+x.count,0) * 100)
                        return (
                          <div key={motivo} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-40 text-right shrink-0 truncate">{motivo}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                              <div className="h-full rounded-full bg-red-300 flex items-center px-2" style={{ width: `${Math.max(pct,5)}%` }}>
                                <span className="text-xs text-white font-semibold">{count}</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Descarte por Origem</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                            <th className="text-left py-2 px-3">Origem</th>
                            <th className="text-right py-2 px-3">Total</th>
                            <th className="text-right py-2 px-3">Descartados</th>
                            <th className="text-right py-2 px-3">Taxa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(m.imoveis?.descarteOrigem ?? []).map(({ origem, total, descartados, taxaDescarte }) => (
                            <tr key={origem} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2 px-3 text-gray-700">{origem}</td>
                              <td className="py-2 px-3 text-right font-mono text-xs">{total}</td>
                              <td className="py-2 px-3 text-right font-mono text-xs">{descartados}</td>
                              <td className="py-2 px-3 text-right">
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${taxaDescarte > 60 ? 'bg-red-100 text-red-600' : taxaDescarte > 40 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                  {taxaDescarte}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─ 5. Receita por modelo ─ */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">1.1 Receita por Modelo de Negócio</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left py-2 px-3">Métrica</th>
                        <th className="text-right py-2 px-3">Mês</th>
                        <th className="text-right py-2 px-3">Trimestre</th>
                        <th className="text-right py-2 px-3">Semestre</th>
                        <th className="text-right py-2 px-3">Ano</th>
                        <th className="text-left py-2 px-3">Meta anual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Negócios Wholesaling', key: 'negWH',          fmt: v => v,         meta: 6,      metaTxt: '6/ano',         suffix: '' },
                        { label: 'Lucro Wholesaling',    key: 'lucroWhTotal',    fmt: EUR,            meta: 50000,  metaTxt: '≥50k/ano',      suffix: '' },
                        { label: 'Ticket Médio Wh.',     key: 'lucroWhMedio',    fmt: v => v ? EUR(v) : '—', meta: 8333, metaTxt: '≥8.333€', suffix: '' },
                        { label: 'Negócios CAEP',        key: 'negCAEP',         fmt: v => v,         meta: 2,      metaTxt: '2/ano',         suffix: '' },
                        { label: 'Quota Somnium CAEP',   key: 'quotaSomniumCAEP',fmt: EUR,            meta: 50000,  metaTxt: '≥50k/ano',      suffix: '' },
                      ].map(({ label, key, fmt, meta, metaTxt }) => {
                        const vals = ['mensal','trimestral','semestral','anual'].map(p => rec[p]?.[key] ?? 0)
                        return (
                          <tr key={key} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 px-3 text-gray-700">{label}</td>
                            {vals.map((v, i) => (
                              <td key={i} className="py-2 px-3 text-right font-mono text-xs">
                                <span className={i === 3 ? `font-semibold ${badge(v, meta)}` : 'text-gray-600'}>
                                  {i === 3 ? (
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${badge(v, meta)}`}>{fmt(v)}</span>
                                  ) : fmt(v)}
                                </span>
                              </td>
                            ))}
                            <td className="py-2 px-3 text-xs text-gray-400">{metaTxt}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─ 6. Investidores ─ */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">3.3 Alertas — Investidores</h2>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className={`rounded-lg p-3 ${inv.alertas?.semContacto60d?.length > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-100'}`}>
                      <p className="text-xs text-gray-500">Sem contacto &gt;60 dias</p>
                      <p className={`text-2xl font-bold ${inv.alertas?.semContacto60d?.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {inv.alertas?.semContacto60d?.length ?? 0}
                      </p>
                      <p className="text-xs text-gray-400">meta: 0</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Capital mobilizado</p>
                      <p className="text-2xl font-bold text-indigo-600">{EUR(inv.capitalMobilizado)}</p>
                      <p className="text-xs text-gray-400">{inv.emParceria} em parceria · {inv.reinvestiram} reinvestiram</p>
                    </div>
                  </div>
                  {(inv.alertas?.semContacto60d?.length ?? 0) > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">Investidores sem contacto</p>
                      {inv.alertas.semContacto60d.map(i => (
                        <div key={i.nome} className="text-xs text-red-600 flex justify-between">
                          <span>{i.nome}</span><span>{i.dias}d · {i.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">2.2 Ciclo Investidor</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '1º Cont. → Reunião', val: inv.ciclo?.contactoAReuniao, meta: 14 },
                      { label: 'Reunião → Capital',  val: inv.ciclo?.reuniaoACapital,  meta: 60 },
                      { label: 'Total Cont.→Capital',val: inv.ciclo?.totalContactoACapital, meta: 90 },
                    ].map(({ label, val, meta }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-400 leading-tight">{label}</p>
                        <p className={`text-lg font-bold mt-0.5 ${cycleColor(val, meta)}`}>{val != null ? `${val}d` : '—'}</p>
                        <p className="text-xs text-gray-400">≤{meta}d</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">3.1 LTV — Investidores</h2>
                  {inv.ltv?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                            <th className="text-left py-2 px-2">Investidor</th>
                            <th className="text-right py-2 px-2">Montante</th>
                            <th className="text-right py-2 px-2">Lucro real</th>
                            <th className="text-right py-2 px-2">Neg.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.ltv.map(i => (
                            <tr key={i.nome} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-1.5 px-2 text-gray-800 text-xs font-medium">{i.nome}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-xs">{EUR(i.montante)}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-xs">
                                <span className={i.lucroRealizado > 0 ? 'text-green-600 font-semibold' : 'text-gray-300'}>
                                  {i.lucroRealizado > 0 ? EUR(i.lucroRealizado) : '—'}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-right text-xs text-gray-500">{i.numeroNegocios}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <EmptyState />}
                </div>
              </div>

              {/* ─ 7. Consultores ─ */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">3.3 Alertas — Consultores</h2>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className={`rounded-lg p-3 ${cons.alertas?.followUpAtrasado > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-100'}`}>
                      <p className="text-xs text-gray-500">Follow-up atrasado</p>
                      <p className={`text-2xl font-bold ${cons.alertas?.followUpAtrasado > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {cons.alertas?.followUpAtrasado ?? 0}
                      </p>
                    </div>
                    <div className={`rounded-lg p-3 ${cons.alertas?.semContacto30d > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-100'}`}>
                      <p className="text-xs text-gray-500">Sem contacto &gt;30d</p>
                      <p className={`text-2xl font-bold ${cons.alertas?.semContacto30d > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {cons.alertas?.semContacto30d ?? 0}
                      </p>
                      <p className="text-xs text-gray-400">meta: 0</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Inativos</p>
                      <p className="text-2xl font-bold text-gray-600">{cons.alertas?.inativos ?? 0}</p>
                      <p className="text-xs text-gray-400">{cons.totalAtivos} ativos</p>
                    </div>
                  </div>

                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">2.2 Ciclo Consultor</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Início → 1ª Call',        val: cons.ciclo?.inicioA1Call,   meta: 7  },
                      { label: '1ª Call → 1º negócio',    val: cons.ciclo?.call1ANegocio,  meta: 30 },
                    ].map(({ label, val, meta }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className={`text-xl font-bold mt-0.5 ${cycleColor(val, meta)}`}>{val != null ? `${val}d` : '—'}</p>
                        <p className="text-xs text-gray-400">meta: ≤{meta}d</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">3.1 LTV — Top Consultores</h2>
                  {cons.ltv?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                            <th className="text-left py-2 px-2">Consultor</th>
                            <th className="text-right py-2 px-2">Lucro gerado</th>
                            <th className="text-right py-2 px-2">Neg.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cons.ltv.map((c, idx) => (
                            <tr key={c.nome} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-1.5 px-2 flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-4">{idx+1}</span>
                                <span className="text-xs font-medium text-gray-800">{c.nome}</span>
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-xs">
                                <span className={c.ltv > 8000 ? 'text-green-600 font-semibold' : 'text-indigo-500'}>
                                  {EUR(c.ltv)}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-right text-xs text-gray-500">{c.negocios}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <EmptyState />}
                </div>
              </div>
            </>
          )
        })()}

        {/* ── EMPREITEIROS ──────────────────────────────────── */}
        {tab === 'empreiteiros' && (
          <>
            <div className="grid grid-cols-3 gap-4">
              {['🟢 Qualificado','🟡 Em avaliação','🔴 Rejeitado'].map(estado => {
                const count = (empData ?? []).filter(e => e.estado === estado).length
                return (
                  <div key={estado} className={`rounded-xl border p-4 shadow-sm flex flex-col gap-1 ${ESTADO_EMP_COLOR[estado] ?? 'bg-gray-50'}`}>
                    <span className="text-xs uppercase tracking-wide font-semibold">{estado}</span>
                    <span className="text-2xl font-bold">{count}</span>
                  </div>
                )
              })}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Lista de Empreiteiros</h2>
                <a href="https://www.notion.so/c032cba7569c415cb1d28b34754da4bc" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline">Abrir no Notion</a>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-3">Nome</th>
                      <th className="text-left py-2 px-3">Empresa</th>
                      <th className="text-left py-2 px-3">Estado</th>
                      <th className="text-right py-2 px-3">Score</th>
                      <th className="text-right py-2 px-3">Custo/m²</th>
                      <th className="text-left py-2 px-3">Zona</th>
                      <th className="text-left py-2 px-3">Especialização</th>
                      <th className="text-center py-2 px-3">Contrato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(empData ?? []).map(e => (
                      <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{e.nome}</td>
                        <td className="py-2 px-3 text-gray-500 text-xs">{e.empresa || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_EMP_COLOR[e.estado] ?? 'bg-gray-100 text-gray-600'}`}>{e.estado ?? '—'}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs">
                          {e.score > 0 ? <span className={`font-bold ${e.score >= 8 ? 'text-green-600' : e.score >= 5 ? 'text-amber-600' : 'text-red-500'}`}>{e.score}/10</span> : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{e.custoMedioM2 > 0 ? `${EUR(e.custoMedioM2)}/m²` : '—'}</td>
                        <td className="py-2 px-3 text-xs text-gray-500">{e.zona.join(', ') || '—'}</td>
                        <td className="py-2 px-3 text-xs text-gray-500">{e.especializacao.join(', ') || '—'}</td>
                        <td className="py-2 px-3 text-center text-xs">{e.contratoFormalizado ? '✅' : '—'}</td>
                      </tr>
                    ))}
                    {!empData?.length && (
                      <tr><td colSpan={8} className="py-6 text-center text-gray-400 text-xs">Sem empreiteiros</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function ImoveisTable({ rows, showAll = false }) {
  const display = showAll ? rows : rows.slice(0, 15)
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
            <th className="text-left py-2 px-3">Imóvel</th>
            <th className="text-left py-2 px-3">Estado</th>
            <th className="text-left py-2 px-3">Tipologia</th>
            <th className="text-right py-2 px-3">Ask Price</th>
            <th className="text-right py-2 px-3">Proposta</th>
            <th className="text-right py-2 px-3">ROI</th>
            <th className="text-left py-2 px-3">Zona</th>
            <th className="text-left py-2 px-3">Origem</th>
          </tr>
        </thead>
        <tbody>
          {display.map(im => (
            <tr key={im.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-3 font-medium text-gray-800 max-w-[200px] truncate">{im.nome}</td>
              <td className="py-2 px-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[im.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                  {im.estado ?? '—'}
                </span>
              </td>
              <td className="py-2 px-3 text-gray-500 text-xs">{im.tipologia ?? '—'}</td>
              <td className="py-2 px-3 text-right font-mono text-xs">{im.askPrice > 0 ? EUR(im.askPrice) : '—'}</td>
              <td className="py-2 px-3 text-right font-mono text-xs">{im.valorProposta > 0 ? EUR(im.valorProposta) : '—'}</td>
              <td className={`py-2 px-3 text-right font-mono text-xs font-semibold ${im.roi >= 20 ? 'text-green-600' : im.roi >= 10 ? 'text-amber-600' : im.roi > 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                {im.roi > 0 ? PCT(im.roi) : '—'}
              </td>
              <td className="py-2 px-3 text-gray-500 text-xs">{im.zona || '—'}</td>
              <td className="py-2 px-3 text-gray-400 text-xs">{im.origem ?? '—'}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={8} className="py-6 text-center text-gray-400 text-xs">Sem imóveis</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState() {
  return <p className="text-xs text-gray-400 text-center py-10">Sem dados suficientes</p>
}
