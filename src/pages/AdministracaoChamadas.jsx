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
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { TIPO_CHAMADA_LABEL, TIPO_CHAMADA_COLOR, bandaScorecard, fmtDate, resultadoResumo } from '../constants.js'
import { dotClass } from '../lib/statusTone.js'

const hoje = () => new Date().toISOString().slice(0, 10)
const diasAtras = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)


function BandaRow({ label, cor, n, total }) {
  const pct = total ? Math.round(n / total * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-ink-muted">{label}</span>
        <span className="text-ink-muted num">{n} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
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
      <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
              <Phone className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-overline uppercase text-ink-muted">SOP 2 · Angariação de Negócios</h2>
              <p className="text-ui font-semibold text-ink">Avaliação de calls</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="h-9 px-2.5 rounded-lg bg-surface-raised border border-line text-ink text-ui focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            <span className="text-ink-muted">até</span>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)}
              className="h-9 px-2.5 rounded-lg bg-surface-raised border border-line text-ink text-ui focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
          </div>
        </div>
      </div>

      {/* 6 KPIs (SOP 2, Framework de Métricas Simplificado) */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
        <KpiCard icon={Phone} label="Taxa de contacto" value={fmtPct(kpis.taxa_contacto)} sub={`${amostras.cold_total ?? 0} cold calls`} />
        <KpiCard icon={TrendingUp} label="Passagem a discovery" value={fmtPct(kpis.taxa_passagem_discovery)} sub={`${amostras.cold_atendeu ?? 0} atendidas`} />
        <KpiCard icon={Target} label="Pontuação média" value={fmtScore(kpis.pontuacao_media_qualificacao)} sub={`${amostras.discovery_total ?? 0} discovery calls`} />
        <KpiCard icon={Award} label="Taxa de fecho" value={fmtPct(kpis.taxa_fecho)} sub={`${amostras.close_total ?? 0} close calls`} />
        <KpiCard icon={Clock} label="Tempo médio de ciclo" value={fmtDias(kpis.tempo_medio_ciclo_dias)} sub="cold call → fecho" />
        <KpiCard icon={Handshake} label="Conversão a parceiro" value={fmtPct(kpis.taxa_conversao_parceiro)} sub={`${amostras.pivot_contactados ?? 0} consultores`} />
      </div>

      {/* Leitura do funil + distribuicao do scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface-raised rounded-xl border border-line p-4">
          <p className="text-overline font-semibold text-ink-muted uppercase mb-3">Leitura do funil</p>
          {loading ? (
            <p className="text-sm text-ink-muted">A carregar...</p>
          ) : (dados?.diagnostico || []).length === 0 ? (
            <p className="text-sm text-ink-muted">Sem sinais de alerta no período (ou amostra ainda insuficiente para diagnóstico).</p>
          ) : (
            <div className="space-y-2">
              {dados.diagnostico.map((d, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/30">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-warning">{d.sintoma}</p>
                    <p className="text-xs text-ink mt-0.5">{d.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-raised rounded-xl border border-line p-4">
          <p className="text-overline font-semibold text-ink-muted uppercase mb-3">Distribuição do scorecard</p>
          {distribuicaoBandas.total === 0 ? (
            <p className="text-sm text-ink-muted">Sem Discovery Calls com scorecard no período.</p>
          ) : (
            <div className="space-y-2.5">
              <BandaRow label="Aprofundar (≤7)" cor="bg-danger" n={distribuicaoBandas.aprofundar} total={distribuicaoBandas.total} />
              <BandaRow label="Com atenção (8-10)" cor="bg-warning" n={distribuicaoBandas.atencao} total={distribuicaoBandas.total} />
              <BandaRow label="Com confiança (11+)" cor="bg-success" n={distribuicaoBandas.confianca} total={distribuicaoBandas.total} />
            </div>
          )}
        </div>
      </div>

      {/* Registo de chamadas */}
      <div className="bg-surface-raised rounded-xl border border-line p-4">
        <p className="text-overline font-semibold text-ink-muted uppercase mb-3">Registo de chamadas ({chamadas.length})</p>
        {loading ? (
          <p className="text-sm text-ink-muted">A carregar...</p>
        ) : chamadas.length === 0 ? (
          <p className="text-sm text-ink-muted">Sem chamadas registadas no período.</p>
        ) : (
          <ScrollableTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-overline uppercase text-ink-muted border-b border-line">
                  <th className="pb-2 pr-3">Consultor</th>
                  <th className="pb-2 pr-3">Imóvel</th>
                  <th className="pb-2 pr-3">Tipo</th>
                  <th className="pb-2 pr-3">Resultado</th>
                  <th className="pb-2 pr-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {chamadas.map(g => (
                  <tr key={g.id} className="border-b border-line">
                    <td className="py-2 pr-3 text-ink">{g.consultor_nome || '—'}</td>
                    <td className="py-2 pr-3 text-ink-muted">{g.imovel_nome || '—'}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-muted text-caption font-medium text-ink whitespace-nowrap">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(TIPO_CHAMADA_COLOR[g.tipo_chamada])}`} aria-hidden="true" />{TIPO_CHAMADA_LABEL[g.tipo_chamada] || g.tipo_chamada}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">{resultadoResumo(g)}</td>
                    <td className="py-2 pr-3 text-ink-muted num whitespace-nowrap">{fmtDate(g.data_chamada)}</td>
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
