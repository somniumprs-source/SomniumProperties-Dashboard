/**
 * Administração > Chamadas > Investidores: leitura agregada das Cold Calls e
 * Follow-ups a investidores avaliados contra o SOP 4. Nota por passo (onde
 * falhamos), conversão para Entrevista Estratégica, conformidade, evolução,
 * leitura do Claude com prioridades e script recomendado, e exportação PDF.
 * As chamadas carregam-se na ficha do investidor (aba Reuniões).
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Target, TrendingUp, RefreshCw, ShieldAlert, Gauge, FileDown, Sparkles, Loader2 } from 'lucide-react'
import { apiFetch, openDocument } from '../lib/api.js'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'
import { fmtDate } from '../constants.js'
import {
  TIPO_CHAMADA_INV_LABEL, RESULTADO_INV_LABEL, PROXIMO_PASSO_INV_LABEL, corNota, corBarra,
} from '../lib/chamadasInvestidor.js'

const hoje = () => new Date().toISOString().slice(0, 10)
const diasAtras = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const fmtPct = v => (v == null ? '—' : `${String(v).replace('.', ',')}%`)
const fmtNota = v => (v == null ? '—' : String(v).replace('.', ','))

const inputData = 'h-9 px-2.5 rounded-lg bg-surface-raised border border-line text-ink text-ui focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

function PassosBloco({ titulo, passos }) {
  const comDados = (passos || []).filter(p => p.n > 0).sort((a, b) => a.pct - b.pct)
  return (
    <div>
      <p className="text-xs font-semibold text-ink mb-2">{titulo}</p>
      {comDados.length === 0 ? (
        <p className="text-xs text-ink-muted">Sem chamadas analisadas.</p>
      ) : (
        <div className="space-y-2">
          {comDados.map(p => (
            <div key={p.chave} className="flex items-center gap-2">
              <span className="text-xs text-ink-muted w-44 shrink-0 truncate" title={p.label}>{p.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                <div className={`h-full rounded-full ${corBarra(p.pct)}`} style={{ width: `${p.pct}%` }} />
              </div>
              <span className="text-xs text-ink w-10 text-right num shrink-0">{p.pct}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Sintese({ s }) {
  if (!s) return <p className="text-sm text-ink-muted">Sem chamadas analisadas no período para gerar a leitura.</p>
  return (
    <div className="space-y-4">
      {s.diagnostico && <p className="text-sm text-ink">{s.diagnostico}</p>}
      {Array.isArray(s.prioridades) && s.prioridades.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-2">Prioridades</p>
          <ol className="space-y-2">
            {s.prioridades.map((p, i) => (
              <li key={i} className="text-xs rounded-lg border border-line p-2.5">
                <p className="font-semibold text-ink">{i + 1}. {p.titulo}</p>
                {p.porque && <p className="text-ink-muted mt-0.5">Porquê: {p.porque}</p>}
                {p.accao && <p className="text-ink mt-0.5">Acção: {p.accao}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {Array.isArray(s.objeccoes_frequentes) && s.objeccoes_frequentes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-2">Objecções frequentes e melhor resposta</p>
          <div className="space-y-2">
            {s.objeccoes_frequentes.map((o, i) => (
              <div key={i} className="text-xs rounded-lg bg-surface border border-line p-2.5">
                <p className="font-semibold text-ink">{o.objeccao}{o.frequencia ? ` (${o.frequencia}x)` : ''}</p>
                <p className="text-ink-muted mt-0.5 italic">{o.melhor_resposta}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {s.script_cold_call && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-2">Script recomendado de Cold Call</p>
          <div className="text-xs rounded-lg bg-surface border border-line p-2.5 space-y-2">
            {s.script_cold_call.abertura && <p><span className="font-semibold text-ink">Abertura: </span><span className="text-ink-muted">{s.script_cold_call.abertura}</span></p>}
            {Array.isArray(s.script_cold_call.qualificacao) && s.script_cold_call.qualificacao.length > 0 && (
              <div>
                <p className="font-semibold text-ink">Qualificação:</p>
                <ol className="list-decimal pl-5 text-ink-muted space-y-0.5">{s.script_cold_call.qualificacao.map((q, i) => <li key={i}>{q}</li>)}</ol>
              </div>
            )}
            {s.script_cold_call.fecho && <p><span className="font-semibold text-ink">Fecho: </span><span className="text-ink-muted">{s.script_cold_call.fecho}</span></p>}
          </div>
        </div>
      )}
      {Array.isArray(s.follow_up) && s.follow_up.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted mb-2">Follow-ups</p>
          <ul className="list-disc pl-5 text-xs text-ink-muted space-y-0.5">{s.follow_up.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

export function AdministracaoChamadasInvestidores() {
  const toast = useToast()
  const [desde, setDesde] = useState(diasAtras(30))
  const [ate, setAte] = useState(hoje())
  const [rel, setRel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sintese, setSintese] = useState(undefined) // undefined = ainda não gerada
  const [aGerar, setAGerar] = useState(false)
  const [aExportar, setAExportar] = useState(false)

  useEffect(() => {
    let activo = true
    setLoading(true)
    setSintese(undefined)
    apiFetch(`/api/crm/chamadas-investidores/relatorio?desde=${desde}&ate=${ate}`)
      .then(r => r.json())
      .then(d => { if (activo) setRel(d?.totais ? d : null) })
      .catch(() => { if (activo) setRel(null) })
      .finally(() => { if (activo) setLoading(false) })
    return () => { activo = false }
  }, [desde, ate])

  async function gerarSintese() {
    setAGerar(true)
    try {
      const r = await apiFetch(`/api/crm/chamadas-investidores/sintese?desde=${desde}&ate=${ate}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Falha a gerar a leitura')
      setSintese(d)
    } catch (err) { toast(friendlyError(err.message), 'error') }
    setAGerar(false)
  }

  async function exportarPdf() {
    setAExportar(true)
    try { await openDocument(`/api/crm/chamadas-investidores/relatorio/pdf?desde=${desde}&ate=${ate}`, { download: true, filename: `Relatorio_Chamadas_Investidores_${desde}_${ate}.pdf` }) }
    catch { /* openDocument já mostra o erro */ }
    setAExportar(false)
  }

  const t = rel?.totais || {}
  const c = rel?.conversao || {}
  const conf = rel?.conformidade || {}

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
              <Phone className="w-4 h-4 text-ink-muted" />
            </div>
            <div>
              <h2 className="text-overline uppercase text-ink-muted">SOP 4 · Procura e Classificação de Investidores</h2>
              <p className="text-ui font-semibold text-ink">Chamadas a investidores</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputData} />
            <span className="text-ink-muted">até</span>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)} className={inputData} />
            <button type="button" onClick={exportarPdf} disabled={aExportar || !t.chamadas}
              className="h-9 px-3 rounded-lg bg-ink text-surface text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
              {aExportar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Exportar PDF
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
        <KpiCard icon={Phone} label="Chamadas" value={loading ? '—' : String(t.chamadas ?? 0)} sub={`${t.cold_call ?? 0} cold call · ${t.follow_up ?? 0} follow-up`} />
        <KpiCard icon={Gauge} label="Nota SOP média" value={fmtNota(rel?.nota_media?.global)} sub={`${t.analisadas ?? 0} analisadas`} />
        <KpiCard icon={TrendingUp} label="Taxa de contacto" value={fmtPct(c.taxa_contacto)} sub="chamadas atendidas" />
        <KpiCard icon={Target} label="Cold Call para entrevista" value={fmtPct(c.taxa_cold_entrevista)} sub={`${c.cold_entrevista ?? 0} de ${c.cold_atendidas ?? 0} atendidas`} />
        <KpiCard icon={RefreshCw} label="Follow-up para entrevista" value={fmtPct(c.taxa_follow_entrevista)} sub={`${c.follow_entrevista ?? 0} de ${c.follow_atendidas ?? 0} atendidas`} />
        <KpiCard icon={ShieldAlert} label="Alertas de conformidade" value={String((conf.promessas_rentabilidade ?? 0) + (conf.info_financeira_cedo ?? 0))} sub="promessas ou info cedo demais" />
      </div>

      {t.sem_registo_manual > 0 && (
        <p className="text-xs text-ink-muted -mt-3">
          {t.sem_registo_manual} chamada(s) sem registo manual: nesses casos a conversão usa a sugestão da IA. Confirma o registo na ficha do investidor.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface-raised rounded-xl border border-line p-4">
          <p className="text-overline font-semibold text-ink-muted uppercase mb-3">Onde estamos a falhar · nota por passo do SOP</p>
          {loading ? <p className="text-sm text-ink-muted">A carregar...</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <PassosBloco titulo="Cold Call" passos={rel?.passos?.cold_call} />
              <PassosBloco titulo="Follow-up" passos={rel?.passos?.follow_up} />
            </div>
          )}
        </div>
        <div className="bg-surface-raised rounded-xl border border-line p-4 space-y-4">
          <div>
            <p className="text-overline font-semibold text-ink-muted uppercase mb-2">Temperatura dos leads</p>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded-lg bg-danger/10 text-danger">Quente {rel?.temperatura?.quente ?? 0}</span>
              <span className="px-2 py-1 rounded-lg bg-warning/10 text-warning">Intermédio {rel?.temperatura?.intermedio ?? 0}</span>
              <span className="px-2 py-1 rounded-lg bg-surface-muted text-ink-muted">Frio {rel?.temperatura?.frio ?? 0}</span>
            </div>
          </div>
          <div className="text-xs space-y-1 text-ink-muted">
            <p>Sem interesse ou não elegível: <span className="text-ink">{c.sem_interesse ?? 0}</span></p>
            <p>Follow-ups sem data definida: <span className={c.follow_up_sem_data ? 'text-danger font-semibold' : 'text-ink'}>{c.follow_up_sem_data ?? 0}</span></p>
            <p>Em processamento: <span className="text-ink">{t.por_processar ?? 0}</span></p>
          </div>
          {(rel?.evolucao || []).length > 1 && (
            <div>
              <p className="text-overline font-semibold text-ink-muted uppercase mb-2">Evolução semanal</p>
              <div className="space-y-1.5">
                {rel.evolucao.map(e => (
                  <div key={e.semana} className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted w-16 shrink-0 num">{fmtDate(e.semana)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className={`h-full rounded-full ${corBarra(e.nota_media)}`} style={{ width: `${e.nota_media}%` }} />
                    </div>
                    <span className="text-[11px] text-ink w-8 text-right num">{fmtNota(e.nota_media)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface-raised rounded-xl border border-line p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <p className="text-overline font-semibold text-ink-muted uppercase">Leitura e recomendações (IA)</p>
          <button type="button" onClick={gerarSintese} disabled={aGerar || !t.analisadas}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium disabled:opacity-50 flex items-center gap-1.5">
            {aGerar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {sintese === undefined ? 'Gerar leitura' : 'Gerar de novo'}
          </button>
        </div>
        {sintese === undefined
          ? <p className="text-sm text-ink-muted">Diagnóstico do período, prioridades, objecções frequentes e script recomendado. Também incluído no PDF.</p>
          : <Sintese s={sintese} />}
      </div>

      <div className="bg-surface-raised rounded-xl border border-line p-4">
        <p className="text-overline font-semibold text-ink-muted uppercase mb-3">Registo de chamadas ({rel?.chamadas?.length ?? 0})</p>
        {loading ? (
          <p className="text-sm text-ink-muted">A carregar...</p>
        ) : !rel?.chamadas?.length ? (
          <p className="text-sm text-ink-muted">Sem chamadas no período. Carrega-as na ficha do investidor, aba Reuniões.</p>
        ) : (
          <ScrollableTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-overline uppercase text-ink-muted border-b border-line">
                  <th className="pb-2 pr-3">Data</th>
                  <th className="pb-2 pr-3">Investidor</th>
                  <th className="pb-2 pr-3">Tipo</th>
                  <th className="pb-2 pr-3">Resultado</th>
                  <th className="pb-2 pr-3">Próximo passo</th>
                  <th className="pb-2 pr-3 text-right">Nota</th>
                </tr>
              </thead>
              <tbody>
                {rel.chamadas.map(g => (
                  <tr key={g.id} className="border-b border-line">
                    <td className="py-2 pr-3 text-ink-muted num whitespace-nowrap">{fmtDate(g.data_chamada)}</td>
                    <td className="py-2 pr-3">
                      <Link to={`/crm?tab=Investidores&detail=${g.investidor_id}`} className="text-ink hover:underline">{g.investidor_nome || '—'}</Link>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">{TIPO_CHAMADA_INV_LABEL[g.tipo_chamada] || '—'}</td>
                    <td className="py-2 pr-3 text-ink-muted">{RESULTADO_INV_LABEL[g.resultado] || '—'}</td>
                    <td className="py-2 pr-3 text-ink-muted">
                      {PROXIMO_PASSO_INV_LABEL[g.proximo_passo] || '—'}
                      {g.proximo_passo && !g.registo_manual && <span className="ml-1 text-[10px] text-ink-muted">(IA)</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {g.nota_sop != null
                        ? <span className={`text-xs font-semibold px-2 py-0.5 rounded num ${corNota(g.nota_sop)}`}>{g.nota_sop}</span>
                        : <span className="text-xs text-ink-muted">{g.estado === 'erro' ? 'Erro' : '—'}</span>}
                    </td>
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
