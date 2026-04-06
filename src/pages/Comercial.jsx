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
  const [consData, setConsData]       = useState(null)
  const [selectedCons, setSelectedCons] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [kr, hr, ir, invr, empr, consr] = await Promise.all([
        fetch('/api/kpis/comercial'),
        fetch('/api/comercial/historico'),
        fetch('/api/comercial/imoveis'),
        fetch('/api/comercial/investidores'),
        fetch('/api/comercial/empreiteiros'),
        fetch('/api/comercial/consultores'),
      ])
      if (!kr.ok || !hr.ok) throw new Error('Erro no servidor')
      const [k, h, im, inv, emp, cons] = await Promise.all([
        kr.json(), hr.json(), ir.json(), invr.json(), empr.json(), consr.json(),
      ])
      if (k.error) throw new Error(k.error)
      setKpis(k); setHist(h)
      setImoveis(im?.imoveis ?? [])
      setInvData(inv ?? {})
      setEmpData(emp?.empreiteiros ?? [])
      setConsData(cons?.consultores ?? [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const ultimos6 = hist?.meses?.slice(-6) ?? []

  const TABS = ['resumo','imóveis','consultores','investidores','empreiteiros']
  const TAB_LABELS = { resumo: 'Resumo', 'imóveis': 'Pipeline Imóveis', consultores: 'Consultores', investidores: 'Investidores', empreiteiros: 'Empreiteiros' }

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
        {tab === 'consultores' && (
          <>
            {/* KPI summary */}
            {(() => {
              const cons = consData ?? []
              const ativos = cons.filter(c => c.nome !== 'Sem consultor' && c.leadsEsteMes > 0)
              const totalLeads = cons.reduce((s, c) => s + c.total, 0)
              const totalAtivos = cons.reduce((s, c) => s + c.ativos, 0)
              const avgResposta = (() => {
                const vals = cons.map(c => c.tempoRespostaMedio).filter(v => v != null)
                return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
              })()
              const inativos = cons.filter(c => c.nome !== 'Sem consultor' && c.diasSemLead != null && c.diasSemLead > 30).length
              return (
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Total Consultores</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{cons.filter(c => c.nome !== 'Sem consultor').length}</p>
                    <p className="text-xs text-gray-400">{ativos.length} ativos este mês</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Total Leads</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{totalLeads}</p>
                    <p className="text-xs text-gray-400">{totalAtivos} ativos no pipeline</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Tempo Médio Resposta</p>
                    <p className="text-2xl font-bold text-indigo-600 mt-1">{avgResposta != null ? `${avgResposta}d` : '—'}</p>
                    <p className="text-xs text-gray-400">adicionado → 1ª chamada</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Consultores Inativos</p>
                    <p className={`text-2xl font-bold mt-1 ${inativos > 0 ? 'text-red-500' : 'text-green-600'}`}>{inativos}</p>
                    <p className="text-xs text-gray-400">sem lead há +30 dias</p>
                  </div>
                </div>
              )
            })()}

            {/* Ranking table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Ranking de Consultores</h2>
                <span className="text-xs text-gray-400">Ordenado por total de leads</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Consultor</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ativos</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Este mês</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">% Descarte</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">% Avanço</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resposta</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Pipeline</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Último Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(consData ?? []).map((c, i) => {
                      const inativo = c.diasSemLead != null && c.diasSemLead > 30
                      return (
                        <tr key={c.nome}
                          onClick={() => setSelectedCons(selectedCons?.nome === c.nome ? null : c)}
                          className={`border-b border-gray-50 cursor-pointer transition-colors
                            ${selectedCons?.nome === c.nome ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {c.nome.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{c.nome}</p>
                                {inativo && <p className="text-xs text-red-400">inativo há {c.diasSemLead}d</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{c.total}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{c.ativos}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-medium ${c.leadsEsteMes > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                              {c.leadsEsteMes}
                            </span>
                            {c.leadsMesAnterior > 0 && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({c.leadsMesAnterior > c.leadsEsteMes ? '↓' : c.leadsMesAnterior < c.leadsEsteMes ? '↑' : '='}{c.leadsMesAnterior})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              c.taxaDescarte > 60 ? 'bg-red-100 text-red-600' :
                              c.taxaDescarte > 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                              {c.taxaDescarte.toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              c.taxaConversao >= 20 ? 'bg-green-100 text-green-700' :
                              c.taxaConversao >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                              {c.taxaConversao.toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 text-xs">
                            {c.tempoRespostaMedio != null ? `${c.tempoRespostaMedio}d` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 text-xs font-mono">
                            {c.valorPipeline > 0 ? EUR(c.valorPipeline) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 text-xs">
                            {c.ultimoLead ? new Date(c.ultimoLead).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {!(consData?.length) && <div className="py-10 text-center text-gray-400 text-sm">Sem dados</div>}
              </div>
            </div>

            {/* Detalhe consultor selecionado */}
            {selectedCons && (
              <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                      {selectedCons.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{selectedCons.nome}</h3>
                      <p className="text-xs text-gray-400">{selectedCons.total} leads totais · ROI médio: {selectedCons.roiMedio != null ? `${selectedCons.roiMedio}%` : '—'}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCons(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Tempo resposta médio</p>
                    <p className="text-xl font-bold text-indigo-600">{selectedCons.tempoRespostaMedio != null ? `${selectedCons.tempoRespostaMedio}d` : '—'}</p>
                    <p className="text-xs text-gray-400">adicionado → chamada</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Tempo negociação médio</p>
                    <p className="text-xl font-bold text-gray-900">{selectedCons.tempoNegociacaoMedio != null ? `${selectedCons.tempoNegociacaoMedio}d` : '—'}</p>
                    <p className="text-xs text-gray-400">chamada → proposta</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Leads este mês</p>
                    <p className="text-xl font-bold text-green-600">{selectedCons.leadsEsteMes}</p>
                    <p className="text-xs text-gray-400">mês ant.: {selectedCons.leadsMesAnterior}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Valor pipeline gerado</p>
                    <p className="text-xl font-bold text-gray-900">{selectedCons.valorPipeline > 0 ? EUR(selectedCons.valorPipeline) : '—'}</p>
                    <p className="text-xs text-gray-400">leads ativos</p>
                  </div>
                </div>

                {/* Funil individual */}
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
                            style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: colors[idx] }}>
                            {f.count > 0 && <span className="text-white text-xs font-semibold">{f.count}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Gráfico comparativo */}
            {(consData ?? []).filter(c => c.nome !== 'Sem consultor').length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Comparativo — Leads por Consultor</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={(consData ?? []).filter(c => c.nome !== 'Sem consultor')} margin={{ top: 0, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="nome" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v, n) => [v, n === 'total' ? 'Total' : n === 'ativos' ? 'Ativos' : 'Este mês']} />
                    <Legend />
                    <Bar dataKey="total"       name="Total"      fill="#6366f1" radius={[3,3,0,0]} />
                    <Bar dataKey="ativos"      name="Ativos"     fill="#10b981" radius={[3,3,0,0]} />
                    <Bar dataKey="leadsEsteMes" name="Este mês"  fill="#f59e0b" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

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
