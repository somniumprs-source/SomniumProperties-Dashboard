/**
 * Aba "Qualidade de Chamadas" (Administração): leitura agregada dos 6 KPIs do
 * SOP 2 (Framework de Métricas Simplificado), diagnóstico de funil e registo
 * de todas as chamadas (Cold/Discovery/Close/Pivot) no período seleccionado.
 * O preenchimento de cada chamada acontece na ficha do consultor
 * (FollowUpsSection/GravacaoCard) — esta aba é só leitura.
 */
import { useState, useEffect, useMemo } from 'react'
import { Phone, TrendingUp, Target, Award, Clock, Handshake, AlertCircle } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { TIPO_CHAMADA_LABEL, CC_RESULTADO_LABEL, CL_RESULTADO_LABEL, bandaScorecard, fmtDate } from '../constants.js'

const hoje = () => new Date().toISOString().slice(0, 10)
const diasAtras = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

const TIPO_BADGE_TONE = { cold_call: 'gray', discovery_call: 'gold', close_call: 'dark', pivot_parceria: 'purple' }

function resultadoResumo(g) {
  if (g.tipo_chamada === 'cold_call') return CC_RESULTADO_LABEL[g.cc_resultado] || '—'
  if (g.tipo_chamada === 'discovery_call') return g.dc_pontuacao_total != null ? `${g.dc_pontuacao_total}/12` : '—'
  if (g.tipo_chamada === 'close_call') return CL_RESULTADO_LABEL[g.cl_resultado] || '—'
  if (g.tipo_chamada === 'pivot_parceria') return g.pp_compromisso_confirmado ? 'Compromisso confirmado' : '—'
  return '—'
}

function BandaRow({ label, cor, n, total }) {
  const pct = total ? Math.round(n / total * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-600 dark:text-neutral-300">{label}</span>
        <span className="text-gray-400">{n} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AdministracaoChamadas() {
  const [desde, setDesde] = useState(diasAtras(30))
  const [ate, setAte] = useState(hoje())
  const [dados, setDados] = useState(null)
  const [chamadas, setChamadas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let activo = true
    setLoading(true)
    Promise.all([
      apiFetch(`/api/crm/gravacoes/kpis?desde=${desde}&ate=${ate}`).then(r => r.json()),
      apiFetch(`/api/crm/gravacoes?desde=${desde}&ate=${ate}`).then(r => r.json()),
    ]).then(([kpisData, lista]) => {
      if (!activo) return
      setDados(kpisData)
      setChamadas(Array.isArray(lista) ? lista : [])
    }).catch(() => { if (activo) { setDados(null); setChamadas([]) } })
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [desde, ate])

  const distribuicaoBandas = useMemo(() => {
    const discovery = chamadas.filter(g => g.tipo_chamada === 'discovery_call' && g.dc_pontuacao_total != null)
    const out = { aprofundar: 0, atencao: 0, confianca: 0 }
    for (const g of discovery) {
      const b = bandaScorecard(g.dc_pontuacao_total)
      if (!b) continue
      if (b.label === 'Aprofundar') out.aprofundar++
      else if (b.label === 'Avançar com atenção') out.atencao++
      else out.confianca++
    }
    return { ...out, total: discovery.length }
  }, [chamadas])

  const kpis = dados?.kpis || {}
  const amostras = dados?.amostras || {}
  const fmtPct = v => v == null ? '—' : `${v}%`
  const fmtDias = v => v == null ? '—' : `${v} dias`
  const fmtScore = v => v == null ? '—' : `${v}/12`

  return (
    <div className="space-y-6">
      {/* Hero — identidade Somnium */}
      <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-lg bg-gradient-to-br from-brand-dark via-brand-dark-light to-brand-dark-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-gold/15 border border-brand-gold/30 flex items-center justify-center">
              <Phone className="w-4 h-4 text-brand-gold" />
            </div>
            <div>
              <h2 className="text-overline uppercase tracking-widest font-semibold text-brand-gold">SOP 2 · Angariação de Negócios</h2>
              <p className="text-sm font-semibold text-white">Qualidade de Chamadas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ colorScheme: 'dark' }}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white" />
            <span className="text-white/40">até</span>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ colorScheme: 'dark' }}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white" />
          </div>
        </div>
      </div>

      {/* 6 KPIs (SOP 2, Framework de Métricas Simplificado) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={Phone} label="Taxa de Contacto" value={fmtPct(kpis.taxa_contacto)} sub={`${amostras.cold_total ?? 0} cold calls`} tone="gold" />
        <KpiCard icon={TrendingUp} label="Passagem a Discovery" value={fmtPct(kpis.taxa_passagem_discovery)} sub={`${amostras.cold_atendeu ?? 0} atendidas`} tone="gold" />
        <KpiCard icon={Target} label="Pontuação Média" value={fmtScore(kpis.pontuacao_media_qualificacao)} sub={`${amostras.discovery_total ?? 0} discovery calls`} tone="gold" />
        <KpiCard icon={Award} label="Taxa de Fecho" value={fmtPct(kpis.taxa_fecho)} sub={`${amostras.close_total ?? 0} close calls`} tone="gold" />
        <KpiCard icon={Clock} label="Tempo Médio de Ciclo" value={fmtDias(kpis.tempo_medio_ciclo_dias)} sub="cold call → fecho" tone="gold" />
        <KpiCard icon={Handshake} label="Conversão a Parceiro" value={fmtPct(kpis.taxa_conversao_parceiro)} sub={`${amostras.pivot_contactados ?? 0} consultores`} tone="gold" />
      </div>

      {/* Leitura do funil + distribuicao do scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Leitura do Funil</p>
          {loading ? (
            <p className="text-sm text-gray-400">A carregar...</p>
          ) : (dados?.diagnostico || []).length === 0 ? (
            <p className="text-sm text-gray-400">Sem sinais de alerta no período (ou amostra ainda insuficiente para diagnóstico).</p>
          ) : (
            <div className="space-y-2">
              {dados.diagnostico.map((d, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{d.sintoma}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{d.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Distribuição do Scorecard</p>
          {distribuicaoBandas.total === 0 ? (
            <p className="text-sm text-gray-400">Sem Discovery Calls com scorecard no período.</p>
          ) : (
            <div className="space-y-2.5">
              <BandaRow label="Aprofundar (≤7)" cor="bg-red-500" n={distribuicaoBandas.aprofundar} total={distribuicaoBandas.total} />
              <BandaRow label="Com atenção (8-10)" cor="bg-amber-500" n={distribuicaoBandas.atencao} total={distribuicaoBandas.total} />
              <BandaRow label="Com confiança (11+)" cor="bg-green-500" n={distribuicaoBandas.confianca} total={distribuicaoBandas.total} />
            </div>
          )}
        </div>
      </div>

      {/* Registo de chamadas */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Registo de Chamadas ({chamadas.length})</p>
        {loading ? (
          <p className="text-sm text-gray-400">A carregar...</p>
        ) : chamadas.length === 0 ? (
          <p className="text-sm text-gray-400">Sem chamadas registadas no período.</p>
        ) : (
          <ScrollableTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-neutral-800">
                  <th className="pb-2 pr-3">Consultor</th>
                  <th className="pb-2 pr-3">Imóvel</th>
                  <th className="pb-2 pr-3">Tipo</th>
                  <th className="pb-2 pr-3">Resultado</th>
                  <th className="pb-2 pr-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {chamadas.map(g => (
                  <tr key={g.id} className="border-b border-gray-50 dark:border-neutral-800/50">
                    <td className="py-2 pr-3 text-gray-700 dark:text-neutral-300">{g.consultor_nome || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 dark:text-neutral-400">{g.imovel_nome || '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={TIPO_BADGE_TONE[g.tipo_chamada] || 'gray'}>{TIPO_CHAMADA_LABEL[g.tipo_chamada] || g.tipo_chamada}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-neutral-400">{resultadoResumo(g)}</td>
                    <td className="py-2 pr-3 text-gray-400">{fmtDate(g.data_chamada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </div>
    </div>
  )
}
