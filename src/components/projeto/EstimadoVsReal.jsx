/**
 * Quadro "Estimado vs Real" (aba Resumo do projecto) — espelho entre a Análise Financeira
 * (valores estimados, análise activa do imóvel) e as Faturas e Comprovativos (valores reais,
 * tabela despesas do negócio). Cada fatura é ligada a uma rubrica da Análise
 * via despesas.rubrica_analise; custos fora da Análise usam a rubrica 'extra'
 * e exigem motivo + justificação, para a análise final do negócio.
 * Só consulta: toda a introdução de valores é feita na aba Faturas e Comprovativos.
 *
 * Tempo real: partilha a queryKey ['projeto-faturas', id] com a aba Faturas e Comprovativos e
 * recarrega em qualquer mutação (somnium:refresh). A análise chega via /resumo,
 * que o ProjectoDetalhe já recarrega nas mesmas mutações.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, TrendingDown, TrendingUp, ChevronDown, ChevronRight, FileText, Scale, Wallet, Receipt, Calculator, Landmark, ListTree, FilePlus2 } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { Card } from '../ui/Card.jsx'
import { KpiCard } from '../ui/KpiCard.jsx'
import { Badge } from '../ui/Badge.jsx'
import { ScrollableTable } from '../ui/ScrollableTable.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v) || 0)
const EUR2 = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0)
const n = v => Number(v) || 0
const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100

// Rubricas e regras do custo final: módulo partilhado com o Dashboard.
export { RUBRICAS, RUBRICA_EXTRA, GRUPOS, GRUPO_VENDA_DEDUCAO, rubricaDe } from '../../../supabase/functions/_shared/rubricasAnalise.js'
import { RUBRICAS, RUBRICA_EXTRA, GRUPOS, GRUPO_VENDA_DEDUCAO, rubricaDe, custoFinalPrevisto, erosaoLucro } from '../../../supabase/functions/_shared/rubricasAnalise.js'
import { useToast } from '../ui/Toast.jsx'

export const MOTIVOS_EXTRA = [
  'Imprevisto de obra',
  'Exigência legal / licenciamento',
  'Valorização do imóvel (upgrade)',
  'Omissão na estimativa',
  'Atraso / prolongamento do prazo',
  'Custos de venda adicionais',
  'Outro',
]

// Consultoria/Assessoria: não há Análise Financeira — só custos próprios da
// Somnium, por tipo. Faturas de obra do cliente (rubrica 'obra') não contam.
export const RUBRICAS_CONSULTORIA = [
  { key: 'cons_deslocacoes',    label: 'Deslocações' },
  { key: 'cons_subcontratacao', label: 'Subcontratação (técnicos, especialistas)' },
  { key: 'cons_materiais',      label: 'Materiais e licenças' },
  { key: 'cons_outros',         label: 'Outros' },
]

export function labelRubrica(key) {
  if (key === RUBRICA_EXTRA) return 'Custo extra'
  return RUBRICAS.find(r => r.key === key)?.label || RUBRICAS_CONSULTORIA.find(r => r.key === key)?.label || null
}

// Select de rubrica usado na aba Faturas e Comprovativos (criar e reclassificar faturas e comprovativos).
// A rubrica é obrigatória: a opção vazia só aparece como placeholder (desactivada),
// para faturas novas ("Escolher rubrica…") ou antigas ainda sem rubrica.
export function RubricaSelect({ value, onChange, analise, className = '', incluirExtra = true, consultoria = false, placeholder = '— Por classificar —', ...rest }) {
  if (consultoria) {
    return (
      <select value={value || ''} onChange={e => onChange(e.target.value)} className={className} {...rest}>
        <option value="" disabled>{placeholder}</option>
        {RUBRICAS_CONSULTORIA.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
    )
  }
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={className} {...rest}>
      <option value="" disabled>{placeholder}</option>
      {GRUPOS.map(g => (
        <optgroup key={g} label={g}>
          {RUBRICAS.filter(r => r.grupo === g).map(r => (
            <option key={r.key} value={r.key}>
              {r.label}{analise ? ` · est. ${EUR(r.est(analise))}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
      {incluirExtra && (
        <optgroup label="Fora da Análise">
          <option value={RUBRICA_EXTRA}>Custo extra (requer justificação)</option>
        </optgroup>
      )}
    </select>
  )
}

// ── Quadro Consultoria/Assessoria ───────────────────────────────
// Sem capital nem Análise: honorário (Σ tranches), faturado (tranches
// confirmadas), despesas próprias e margem.
export function QuadroConsultoria({ negocioId, faturacao }) {
  const [aberto, setAberto] = useState(false)
  const despesasQuery = useQuery({
    queryKey: ['projeto-faturas', negocioId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/despesas`)
      if (!r.ok) throw new Error('Erro ao carregar faturas')
      const { despesas } = await r.json()
      return despesas
    },
    refetchInterval: 60_000,
  })
  useRefreshOnMutation(despesasQuery.refetch)
  const despesas = useMemo(() => despesasQuery.data ?? [], [despesasQuery.data])

  const calc = useMemo(() => {
    const proprias = despesas.filter(d => rubricaDe(d) !== 'obra')
    const obraCliente = round2(despesas.filter(d => rubricaDe(d) === 'obra').reduce((s, d) => s + n(d.custo_mensal), 0))
    const porTipo = RUBRICAS_CONSULTORIA.map(r => {
      const fs = proprias.filter(d => rubricaDe(d) === r.key)
      return { ...r, n: fs.length, total: round2(fs.reduce((s, d) => s + n(d.custo_mensal), 0)) }
    })
    const semTipo = proprias.filter(d => !RUBRICAS_CONSULTORIA.some(r => r.key === rubricaDe(d)))
    const total = round2(proprias.reduce((s, d) => s + n(d.custo_mensal), 0))
    const pagas = round2(proprias.filter(d => d.pago).reduce((s, d) => s + n(d.custo_mensal), 0))
    return { porTipo, semTipo, totalSemTipo: round2(semTipo.reduce((s, d) => s + n(d.custo_mensal), 0)), total, pagas, obraCliente }
  }, [despesas])

  if (despesasQuery.isPending) return <Card><p className="py-4 text-center text-sm text-ink-muted">A carregar quadro…</p></Card>

  const honorario = n(faturacao?.totalExpectavel)
  const faturado = n(faturacao?.somniumReal)
  const pctFaturado = honorario > 0 ? Math.round((faturado / honorario) * 100) : 0
  const margem = round2(honorario - calc.total)
  const margemPct = honorario > 0 ? Math.round((margem / honorario) * 100) : 0

  return (
    <Card>
      <Card.Header icon={Scale} title="Honorário e custos"
        subtitle="Consultoria/Assessoria — sem capital próprio da Somnium"
        action={faturacao?.modeloLabel && <Badge tone="gold" size="sm">{faturacao.modeloLabel}</Badge>} />

      {honorario <= 0 && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 dark:bg-amber-900/20 dark:border-amber-800/50 px-3 py-2 text-xs text-warning dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Define o honorário acordado nas tranches, mais abaixo no Resumo.
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard size="sm" icon={Landmark} tone="gold" label="Honorário acordado" value={EUR(honorario)} sub="Soma das tranches" />
        <KpiCard size="sm" icon={Wallet} tone={faturado > 0 ? 'green' : 'gray'} label="Faturado" value={EUR(faturado)} sub={`${pctFaturado}% · tranches confirmadas`} />
        <KpiCard size="sm" icon={Receipt} tone="amber" label="Despesas próprias" value={EUR(calc.total)} sub={`${EUR(round2(calc.total - calc.pagas))} pendente`} />
        <KpiCard size="sm" icon={Calculator} tone={margem < 0 ? 'red' : 'green'} label="Margem" value={EUR(margem)} sub={honorario > 0 ? `${margemPct}% do honorário` : '—'} />
      </div>

      <Card.Footer className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={() => setAberto(v => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted  hover:text-brand-gold">
          {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {aberto ? 'Esconder despesas por tipo' : 'Ver despesas por tipo'}
        </button>
        {calc.semTipo.length > 0 && <Badge tone="yellow" size="sm">{calc.semTipo.length} por classificar</Badge>}
      </Card.Footer>

      {aberto && (
        <div className="mt-4 space-y-2">
          <div className="rounded-xl border border-line  overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line  text-xs text-ink-muted uppercase bg-surface ">
                  <th className="text-left py-2.5 px-4">Tipo de custo</th>
                  <th className="text-right py-2.5 px-3 w-24">Faturas</th>
                  <th className="text-right py-2.5 px-4 w-32">Valor</th>
                </tr>
              </thead>
              <tbody>
                {calc.porTipo.filter(t => t.n > 0).map(t => (
                  <tr key={t.key} className="border-b border-line ">
                    <td className="py-2 px-4 text-ink ">{t.label}</td>
                    <td className="py-2 px-3 text-right text-xs text-ink-muted">{t.n}</td>
                    <td className="py-2 px-4 text-right num text-ink ">{EUR2(t.total)}</td>
                  </tr>
                ))}
                {calc.semTipo.length > 0 && (
                  <tr className="border-b border-line bg-warning/10 dark:bg-amber-900/10">
                    <td className="py-2 px-4 text-warning dark:text-amber-300">Por classificar — escolher o tipo na aba Faturas</td>
                    <td className="py-2 px-3 text-right text-xs text-warning">{calc.semTipo.length}</td>
                    <td className="py-2 px-4 text-right num text-warning dark:text-amber-300">{EUR2(calc.totalSemTipo)}</td>
                  </tr>
                )}
                {calc.total === 0 && calc.semTipo.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-center text-sm text-ink-muted">Sem despesas próprias registadas.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line  font-semibold">
                  <td className="py-2.5 px-4 text-ink ">Total despesas próprias</td>
                  <td />
                  <td className="py-2.5 px-4 text-right num text-ink ">{EUR2(calc.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {calc.obraCliente > 0 && (
            <p className="text-[11px] text-ink-muted">Custos de obra do cliente lançados nas fases ({EUR(calc.obraCliente)}) não contam como despesa da Somnium.</p>
          )}
        </div>
      )}
    </Card>
  )
}

export function QuadroEstimadoVsReal({ negocioId, negocio, analise, faturacao, readOnly, onChange }) {
  const [aberto, setAberto] = useState(false)
  const despesasQuery = useQuery({
    queryKey: ['projeto-faturas', negocioId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/despesas`)
      if (!r.ok) throw new Error('Erro ao carregar faturas')
      const { despesas } = await r.json()
      return despesas
    },
    // Actualização instantânea nas gravações desta sessão (somnium:refresh) +
    // polling de 1 min para apanhar faturas lançadas por outros utilizadores.
    refetchInterval: 60_000,
  })
  useRefreshOnMutation(despesasQuery.refetch)
  const despesas = useMemo(() => despesasQuery.data ?? [], [despesasQuery.data])

  const calc = useMemo(() => {
    const a = analise || {}
    const L = n(a.lucro_bruto)
    const C = n(a.capital_necessario)
    const roi = (lucro, capital) => capital > 0 ? (lucro / capital) * 100 : 0
    const roiBase = roi(L, C)
    // Impacto isolado de um desvio d: o lucro desce d; o capital sobe d
    // (excepto rubricas pagas pelo sinal do comprador — comissão de venda).
    const impacto = (d, semCapital) => ({
      lucro: round2(-d),
      roi: round2(roi(L - d, C + (semCapital ? 0 : d)) - roiBase),
    })

    const porRubrica = {}
    for (const d of despesas) {
      const k = rubricaDe(d) || '__sem__'
      ;(porRubrica[k] ||= []).push(d)
    }
    const somar = arr => round2((arr || []).reduce((s, d) => s + n(d.custo_mensal), 0))

    // Estado por rubrica:
    //  por_faturar — sem faturas; desvio ainda desconhecido (impacto 0)
    //  em_curso    — rubrica que acumula (obra, mensais) abaixo do estimado;
    //                não conta como poupança antes de fechar (impacto 0)
    //  fechado     — desvio real conta para o resultado
    const linhas = RUBRICAS.map(r => {
      const estimado = round2(r.est(a))
      const faturas = porRubrica[r.key] || []
      const real = somar(faturas)
      const temReal = faturas.length > 0
      const desvio = temReal ? round2(real - estimado) : null
      const estado = !temReal ? 'por_faturar' : (r.acumula && real < estimado ? 'em_curso' : 'fechado')
      const desvioEfetivo = estado === 'fechado' ? desvio : 0
      return { ...r, estimado, real, temReal, desvio, estado, desvioEfetivo, nFaturas: faturas.length, imp: impacto(desvioEfetivo, r.semCapital) }
    })
    // Custos fora da Análise: cada um é um desvio integral (estimado 0).
    const linhaAvulsa = (d, tipo) => {
      const v = round2(n(d.custo_mensal))
      return { key: d.id, tipo, label: d.movimento || d.fornecedor || 'Sem descrição', motivo: d.motivo_extra, estimado: 0, real: v, desvio: v, desvioEfetivo: v, temReal: true, estado: 'fechado', imp: impacto(v, false) }
    }
    const extras = porRubrica[RUBRICA_EXTRA] || []
    const semRubrica = porRubrica.__sem__ || []
    const linhasExtra = extras.map(d => linhaAvulsa(d, 'extra'))
    const linhasSem = semRubrica.map(d => linhaAvulsa(d, 'sem'))

    const todas = [...linhas, ...linhasExtra, ...linhasSem]
    const desvioTotal = round2(todas.reduce((s, l) => s + l.desvioEfetivo, 0))
    const desvioCapital = round2(todas.reduce((s, l) => s + (l.semCapital ? 0 : l.desvioEfetivo), 0))
    const lucroAjustado = round2(L - desvioTotal)
    const capitalAjustado = round2(C + desvioCapital)
    const poupancas = round2(todas.filter(l => l.desvioEfetivo < 0).reduce((s, l) => s + l.desvioEfetivo, 0))
    const derrapagens = round2(todas.filter(l => l.desvioEfetivo > 0).reduce((s, l) => s + l.desvioEfetivo, 0))

    // Despesas = só o que o capital (e o crédito) paga. A comissão de venda é
    // descontada ao preço de venda e fica à parte (deducaoVenda*).
    const semCapitalKeys = new Set(RUBRICAS.filter(r => r.semCapital).map(r => r.key))
    const ehDeducao = d => semCapitalKeys.has(rubricaDe(d))
    const deducaoVendaEst = round2(linhas.filter(l => l.semCapital).reduce((s, l) => s + l.estimado, 0))
    const deducaoVendaReal = round2(despesas.filter(ehDeducao).reduce((s, d) => s + n(d.custo_mensal), 0))
    const despesasEstimadas = round2(linhas.filter(l => !l.semCapital).reduce((s, l) => s + l.estimado, 0))
    const despesasReais = round2(despesas.filter(d => !ehDeducao(d)).reduce((s, d) => s + n(d.custo_mensal), 0))
    const despesasPagas = round2(despesas.filter(d => d.pago && !ehDeducao(d)).reduce((s, d) => s + n(d.custo_mensal), 0))

    return {
      linhas, linhasExtra, linhasSem, extras,
      totalExtras: somar(extras),
      despesasEstimadas, despesasReais, despesasPagas, deducaoVendaEst, deducaoVendaReal, valorFinanciado: n(a.valor_financiado),
      desvioTotal, poupancas, derrapagens,
      lucroEstimado: L, lucroAjustado,
      capitalEstimado: C, capitalAjustado,
      roiEstimado: round2(roiBase), roiAjustado: round2(roi(lucroAjustado, capitalAjustado)),
    }
  }, [analise, despesas])

  if (despesasQuery.isPending) return <Card><p className="py-4 text-center text-sm text-ink-muted">A carregar quadro Estimado vs Real…</p></Card>

  const semAnalise = !analise
  const execPct = calc.despesasEstimadas > 0 ? Math.round((calc.despesasReais / calc.despesasEstimadas) * 100) : 0
  // Faturação = o que a Somnium fatura (fee, comissão ou % do lucro); o real vem
  // só das tranches confirmadas. O lucro total do negócio fica no painel de desvios.
  const fatExp = n(faturacao?.somniumExpectavel)
  const fatReal = n(faturacao?.somniumReal)
  const percSomnium = n(faturacao?.percSomnium)
  const fatPct = fatExp > 0 ? Math.round((fatReal / fatExp) * 100) : 0
  const despPendentes = round2(calc.despesasReais - calc.despesasPagas)
  const capital = n(faturacao?.capitalValor)
  const coberturaPct = calc.capitalEstimado > 0 ? Math.round((capital / calc.capitalEstimado) * 1000) / 10 : 0
  const margemCapital = round2(capital - calc.capitalEstimado)
  const capitalCobre = calc.capitalEstimado > 0 && margemCapital >= 0
  const capitalSub = calc.capitalEstimado <= 0 ? 'Sem capital necessário na Análise'
    : capitalCobre ? `Cobre ${coberturaPct.toLocaleString('pt-PT')}% · +${EUR(margemCapital)}`
    : `Faltam ${EUR(-margemCapital)} · ${coberturaPct.toLocaleString('pt-PT')}%`
  // Reconciliação despesas ↔ capital (tooltip): o KpiCard trunca a linha de baixo.
  const despEstDetalhe = [
    `${EUR(calc.despesasEstimadas)} despesas estimadas`,
    calc.valorFinanciado > 0 && `− ${EUR(calc.valorFinanciado)} financiamento bancário`,
    calc.valorFinanciado > 0 && `= ${EUR(calc.capitalEstimado)} a financiar com capital`,
    calc.deducaoVendaEst > 0 && `Comissão de mediação (${EUR(calc.deducaoVendaEst)}) descontada na venda — não usa capital`,
  ].filter(Boolean).join('\n')
  const despEstSub = calc.valorFinanciado > 0 ? `Capital: ${EUR(calc.capitalEstimado)} · resto crédito`
    : calc.deducaoVendaEst > 0 ? `Sem comissão (sai da venda)` : 'Análise Financeira'
  const actualizado = despesasQuery.dataUpdatedAt ? new Date(despesasQuery.dataUpdatedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className="space-y-4">
      <Card>
        <Card.Header icon={Scale} title="Estimado vs Real"
          subtitle={`Análise Financeira espelhada com as Faturas, custo a custo${actualizado ? ` · atualizado às ${actualizado}` : ''}`}
          action={faturacao?.modeloLabel && <Badge tone="gold" size="sm">{faturacao.modeloLabel}</Badge>} />

        {semAnalise && (
          <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 dark:bg-amber-900/20 dark:border-amber-800/50 px-3 py-2 text-xs text-warning dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Sem Análise Financeira ativa para o imóvel — os valores estimados ficam a zero.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <div title={calc.capitalEstimado > 0 ? `${EUR(capital)} de capital para ${EUR(calc.capitalEstimado)} a financiar` : undefined}>
            <KpiCard size="sm" icon={Landmark} tone={calc.capitalEstimado > 0 && !capitalCobre ? 'red' : 'gold'} label={faturacao?.capitalLabel || 'Capital alocado'}
              value={EUR(capital)} sub={capitalSub} className="h-full" />
          </div>
          <KpiCard size="sm" icon={TrendingUp} tone="indigo" label="Faturação estimada"
            value={EUR(fatExp)} sub={percSomnium > 0 && percSomnium < 100 ? `Somnium · ${percSomnium.toLocaleString('pt-PT')}% do lucro` : 'Parte da Somnium'} />
          <KpiCard size="sm" icon={Wallet} tone={fatReal > 0 ? 'green' : 'gray'} label="Faturação real"
            value={EUR(fatReal)} sub={`${fatPct}% · tranches confirmadas`} />
          <div title={despEstDetalhe}>
            <KpiCard size="sm" icon={Calculator} tone="gray" label="Despesas estimadas"
              value={EUR(calc.despesasEstimadas)} sub={despEstSub} className="h-full" />
          </div>
          <KpiCard size="sm" icon={Receipt} tone={execPct > 100 ? 'red' : 'amber'} label="Despesas reais"
            value={EUR(calc.despesasReais)} sub={`${execPct}% executado · ${EUR(despPendentes)} pendente`} />
        </div>

        {/* Painel de desvios — fechado por defeito */}
        <Card.Footer className="flex items-center justify-between gap-3 flex-wrap">
          <button type="button" onClick={() => setAberto(v => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted  hover:text-brand-gold">
            {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {aberto ? 'Esconder desvios ponto a ponto' : 'Ver desvios ponto a ponto'}
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {calc.linhasSem.length > 0 && <Badge tone="yellow" size="sm">{calc.linhasSem.length} por classificar</Badge>}
            <Badge tone={calc.desvioTotal > 0 ? 'red' : calc.desvioTotal < 0 ? 'green' : 'gray'} size="sm">
              Desvio total: {calc.desvioTotal > 0 ? '+' : ''}{EUR(calc.desvioTotal)} · {veredicto(calc.desvioTotal)}
            </Badge>
          </div>
        </Card.Footer>

        {aberto && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-line  overflow-hidden">
              <ScrollableTable>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line  text-xs text-ink-muted uppercase bg-surface ">
                      <th className="text-left py-2.5 px-4">Rubrica</th>
                      <th className="text-right py-2.5 px-3">Estimado</th>
                      <th className="text-right py-2.5 px-3">Real</th>
                      <th className="text-right py-2.5 px-3">Desvio €</th>
                      <th className="text-right py-2.5 px-3 w-20">Desvio %</th>
                      <th className="text-left py-2.5 px-4 w-32">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GRUPOS.filter(g => g !== GRUPO_VENDA_DEDUCAO).map(g => {
                      const ls = calc.linhas.filter(l => l.grupo === g && (l.estimado > 0 || l.temReal))
                      if (ls.length === 0) return null
                      return [
                        <GrupoLinha key={g} label={g} ls={ls} />,
                        ...ls.map(l => <EspelhoLinha key={l.key} l={l} />),
                      ]
                    })}
                    {calc.linhasExtra.length > 0 && [
                      <GrupoLinha key="__extra" label="Fora da Análise — custos extra" ls={calc.linhasExtra} tom="red" />,
                      ...calc.linhasExtra.map(l => <EspelhoLinha key={l.key} l={l} />),
                    ]}
                    {calc.linhasSem.length > 0 && [
                      <GrupoLinha key="__sem" label="Por classificar — atribuir rubrica na aba Faturas e Comprovativos" ls={calc.linhasSem} tom="amber" />,
                      ...calc.linhasSem.map(l => <EspelhoLinha key={l.key} l={l} />),
                    ]}
                    <tr className="border-y-2 border-line  font-semibold bg-surface-raised ">
                      <td className="py-2.5 px-4 text-ink ">Total despesas <span className="text-[11px] font-normal text-ink-muted">(pagas pelo capital)</span></td>
                      <td className="py-2.5 px-3 text-right num text-ink-muted ">{EUR(calc.despesasEstimadas)}</td>
                      <td className="py-2.5 px-3 text-right num text-ink ">{EUR(calc.despesasReais)}</td>
                      <td colSpan={3} />
                    </tr>
                    {(() => {
                      const ls = calc.linhas.filter(l => l.grupo === GRUPO_VENDA_DEDUCAO && (l.estimado > 0 || l.temReal))
                      if (ls.length === 0) return null
                      return [
                        <GrupoLinha key="__deducao" label={`${GRUPO_VENDA_DEDUCAO} — não usa capital, reduz o valor recebido`} ls={ls} />,
                        ...ls.map(l => <EspelhoLinha key={l.key} l={l} />),
                      ]
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line  font-semibold">
                      <td className="py-2.5 px-4 text-ink ">Soma do desvio <span className="text-[11px] font-normal text-ink-muted">(despesas + descontado na venda)</span></td>
                      <td />
                      <td />
                      <DesvioCell valor={calc.desvioTotal} custo />
                      <td className="py-2.5 px-3 text-right num text-xs text-ink-muted">{fmtPctDesvio(calc.desvioTotal, calc.despesasEstimadas + calc.deducaoVendaEst)}</td>
                      <td className="py-2.5 px-4">
                        <Badge tone={calc.desvioTotal > 0 ? 'red' : calc.desvioTotal < 0 ? 'green' : 'gray'} size="sm">{veredicto(calc.desvioTotal)}</Badge>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </ScrollableTable>
            </div>

            {/* Conclusão: efeito da soma dos desvios nos números do negócio */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ImpactoBox label="Soma do desvio" valor={calc.desvioTotal} custo
                sub={`${EUR(calc.poupancas)} abaixo · +${EUR(calc.derrapagens)} acima do estimado`} />
              <ImpactoBox label="Lucro bruto" de={calc.lucroEstimado} para={calc.lucroAjustado} />
              <ImpactoBox label="ROI" de={calc.roiEstimado} para={calc.roiAjustado} pct />
            </div>
            <p className="text-[11px] text-ink-muted">
              Desvio positivo = gastou-se mais do que o estimado (desfavorável); negativo = poupança (favorável). Rubricas por faturar e obra/custos mensais ainda abaixo do estimado (em curso) não contam como poupança até fecharem.
            </p>

            <ListaCustosExtra extras={calc.extras} total={calc.totalExtras} embutido />
          </div>
        )}
      </Card>
      {negocio && analise && (
        <PrevisaoCustoFinal negocio={negocio} analise={analise} despesas={despesas} readOnly={readOnly} onChange={onChange} />
      )}
    </div>
  )
}

// Custo final previsto (O04) e erosão de lucro (P07). A previsão escreve-se
// só nas rubricas que vão sendo faturadas; nas outras a fatura é o valor final.
function PrevisaoCustoFinal({ negocio, analise, despesas, readOnly, onChange }) {
  const toast = useToast()
  const guardadas = negocio.previsao_rubricas || {}
  const [valores, setValores] = useState(guardadas)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setValores(negocio.previsao_rubricas || {}) }, [negocio.previsao_rubricas])
  const custo = useMemo(() => custoFinalPrevisto(analise, despesas, valores), [analise, despesas, valores])
  const erosao = erosaoLucro(negocio.analise_referencia, analise, custo)
  const acumulam = custo.linhas.filter(l => RUBRICAS.find(r => r.key === l.key)?.acumula && (l.estimado > 0 || l.real > 0))

  async function guardar(key, texto) {
    const v = texto === '' ? null : Number(String(texto).replace(',', '.'))
    if (v != null && (!Number.isFinite(v) || v < 0)) {
      toast?.('A previsão tem de ser um valor em euros, igual ou maior que zero.', 'error', 3500)
      setValores(guardadas)
      return
    }
    if ((guardadas[key] ?? null) === v) return
    const novas = { ...guardadas }
    if (v == null) delete novas[key]; else novas[key] = v
    setSaving(true)
    const r = await apiFetch(`/api/crm/negocios/${negocio.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previsao_rubricas: JSON.stringify(novas), previsao_atualizada_em: new Date().toISOString() }),
    })
    setSaving(false)
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(`Erro ao guardar a previsão: ${err.error || r.status}`, 'error', 3500)
      setValores(guardadas)
      return
    }
    onChange?.()
  }

  const atualizada = negocio.previsao_atualizada_em ? new Date(negocio.previsao_atualizada_em).toLocaleDateString('pt-PT') : null
  return (
    <Card>
      <Card.Header icon={Calculator} title="Custo final previsto"
        subtitle={atualizada ? `Previsão atualizada a ${atualizada}` : 'Sem previsão escrita: obra e custos mensais contam pelo estimado'} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard size="sm" tone="gray" label="Orçamento" value={EUR(custo.orcamento)} sub="Análise Financeira" />
        <KpiCard size="sm" tone="amber" label="Já faturado" value={EUR(custo.real)} sub={`faltam ${EUR(custo.restante)}`} />
        <KpiCard size="sm" tone={custo.desvio < 0 ? 'red' : 'green'} label="Custo final previsto" value={EUR(custo.previsto)}
          sub={custo.desvio < 0 ? `${EUR(-custo.desvio)} acima do orçamento` : custo.desvio > 0 ? `${EUR(custo.desvio)} abaixo do orçamento` : 'igual ao orçamento'} />
        <KpiCard size="sm" tone={erosao?.erosao > 0 ? 'red' : 'green'} label="Erosão de lucro"
          value={erosao ? EUR(erosao.erosao) : '—'}
          sub={erosao ? `${EUR(erosao.lucroReferencia)} na compra → ${EUR(erosao.lucroPrevisto)} hoje` : 'sem análise de referência'} />
      </div>
      {acumulam.length > 0 && (
        <div className="mt-4 rounded-xl border border-line overflow-hidden">
          <ScrollableTable>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted uppercase bg-surface">
                  <th className="text-left py-2.5 px-4">Rubrica que vai sendo faturada</th>
                  <th className="text-right py-2.5 px-3">Estimado</th>
                  <th className="text-right py-2.5 px-3">Faturado</th>
                  <th className="text-right py-2.5 px-3 w-40">Previsão final</th>
                </tr>
              </thead>
              <tbody>
                {acumulam.map(l => (
                  <tr key={l.key} className="border-b border-line">
                    <td className="py-2 px-4 text-ink">{labelRubrica(l.key)}</td>
                    <td className="py-2 px-3 text-right num text-ink-muted">{EUR(l.estimado)}</td>
                    <td className="py-2 px-3 text-right num text-ink">{EUR(l.real)}</td>
                    <td className="py-1.5 px-3 text-right">
                      {readOnly
                        ? <span className="num text-ink">{EUR(l.final)}</span>
                        : <input type="text" inputMode="decimal" disabled={saving} value={valores[l.key] ?? ''} placeholder={String(Math.round(l.final))}
                            onChange={e => setValores({ ...valores, [l.key]: e.target.value })} onBlur={e => guardar(l.key, e.target.value.trim())}
                            aria-label={`Previsão final de ${labelRubrica(l.key)}`}
                            className="w-32 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-right num text-ink" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-muted">
        Escreve quanto achas que cada rubrica vai custar no fim. Vazio usa o maior entre o estimado e o faturado; nunca conta menos do que já foi faturado. As restantes rubricas contam pela fatura, ou pelo estimado enquanto não houver fatura.
      </p>
    </Card>
  )
}

function veredicto(desvio) {
  if (desvio > 0) return 'desfavorável ao negócio'
  if (desvio < 0) return 'favorável ao negócio'
  return 'em linha com o estimado'
}

function fmtPctDesvio(desvio, estimado) {
  if (desvio == null) return '—'
  if (!estimado) return desvio ? 'n/a' : '0%'
  const p = Math.round((desvio / estimado) * 100)
  return `${p > 0 ? '+' : ''}${p}%`
}

const PP = v => `${v > 0 ? '+' : ''}${v.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`

// Desvio colorido: para custos, positivo é mau; para receita/lucro/ROI, é bom.
function DesvioCell({ valor, custo, pp, className = 'py-2.5 px-3' }) {
  if (valor == null) return <td className={`${className} text-right num text-ink-muted/70`}>—</td>
  const mau = custo ? valor > 0 : valor < 0
  const Icon = valor === 0 ? null : (valor > 0 ? TrendingUp : TrendingDown)
  return (
    <td className={`${className} text-right num font-semibold whitespace-nowrap ${valor === 0 ? 'text-ink-muted' : mau ? 'text-danger' : 'text-success'}`}>
      <span className="inline-flex items-center gap-1 justify-end">
        {Icon && <Icon className="w-3.5 h-3.5" />}{pp ? PP(valor) : `${valor > 0 ? '+' : ''}${EUR(valor)}`}
      </span>
    </td>
  )
}

function ImpactoBox({ label, de, para, valor, sub, custo, pct }) {
  const fmt = v => pct ? `${n(v).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%` : EUR(v)
  const delta = valor != null ? valor : round2(n(para) - n(de))
  const mau = custo ? delta > 0 : delta < 0
  const cor = delta === 0 ? 'text-ink-muted' : mau ? 'text-danger' : 'text-success'
  const borda = delta === 0 ? 'border-line ' : mau ? 'border-danger/30 dark:border-red-800/50' : 'border-success/30 dark:border-emerald-800/50'
  return (
    <div className={`rounded-xl border ${borda} bg-surface-raised  p-3`}>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">{label}</p>
      {valor != null ? (
        <p className={`text-lg font-bold num ${cor}`}>{delta > 0 ? '+' : ''}{EUR(delta)}</p>
      ) : (
        <p className="text-sm num mt-0.5">
          <span className="text-ink-muted">{fmt(de)}</span>
          <span className="mx-1.5 text-ink-muted/70">→</span>
          <span className="text-lg font-bold text-ink ">{fmt(para)}</span>
        </p>
      )}
      <p className={`text-[11px] mt-0.5 ${valor != null ? 'text-ink-muted' : cor}`}>
        {sub || (pct ? PP(delta) : `${delta > 0 ? '+' : ''}${EUR(delta)}`)}
      </p>
    </div>
  )
}

function GrupoLinha({ label, ls, tom }) {
  const est = round2(ls.reduce((s, l) => s + l.estimado, 0))
  const real = round2(ls.reduce((s, l) => s + l.real, 0))
  const desvio = round2(ls.reduce((s, l) => s + l.desvioEfetivo, 0))
  const bg = tom === 'red' ? 'bg-danger/10 dark:bg-red-900/10' : tom === 'amber' ? 'bg-warning/10 dark:bg-amber-900/10' : 'bg-surface/60 '
  return (
    <tr className={`border-b border-line  ${bg}`}>
      <td className="py-2 px-4 text-xs font-semibold text-ink ">{label}</td>
      <td className="py-2 px-3 text-right num text-xs text-ink-muted">{EUR(est)}</td>
      <td className="py-2 px-3 text-right num text-xs font-semibold text-ink ">{EUR(real)}</td>
      <DesvioCell valor={desvio} custo className="py-2 px-3 text-xs" />
      <td className="py-2 px-3 text-right num text-[11px] text-ink-muted">{fmtPctDesvio(desvio, est)}</td>
      <td />
    </tr>
  )
}

const ESTADO_BADGE = {
  por_faturar: { tone: 'gray', label: 'Por faturar' },
  em_curso:    { tone: 'blue', label: 'Em curso' },
  fechado:     { tone: 'green', label: 'Faturado' },
}

function EspelhoLinha({ l }) {
  const badge = l.tipo === 'extra' ? { tone: 'red', label: l.motivo || 'Custo extra' }
    : l.tipo === 'sem' ? { tone: 'yellow', label: 'Por classificar' }
    : l.desvioEfetivo > 0 ? { tone: 'red', label: 'Acima' }
    : l.desvioEfetivo < 0 ? { tone: 'green', label: 'Abaixo' }
    : ESTADO_BADGE[l.estado]
  const contaImpacto = l.estado === 'fechado'
  return (
    <tr className="border-b border-line  hover:bg-surface ">
      <td className="py-2 px-4 pl-7 text-ink ">
        {l.label}
        {l.nFaturas > 0 && <span className="ml-1.5 text-[10px] text-ink-muted">{l.nFaturas} doc.</span>}
      </td>
      <td className="py-2 px-3 text-right num text-ink-muted ">{EUR(l.estimado)}</td>
      <td className="py-2 px-3 text-right num text-ink ">{l.temReal ? EUR(l.real) : <span className="text-ink-muted/70">—</span>}</td>
      {l.estado === 'em_curso'
        ? <td className="py-2 px-3 text-right num text-xs text-ink whitespace-nowrap">faltam {EUR(l.estimado - l.real)}</td>
        : <DesvioCell valor={l.desvio} custo className="py-2 px-3" />}
      <td className={`py-2 px-3 text-right num text-xs ${!contaImpacto ? 'text-ink-muted/70' : l.desvio > 0 ? 'text-danger' : l.desvio < 0 ? 'text-success' : 'text-ink-muted'}`}>
        {contaImpacto ? fmtPctDesvio(l.desvio, l.estimado) : '—'}
      </td>
      <td className="py-2 px-4"><Badge tone={badge.tone} size="sm">{badge.label}</Badge></td>
    </tr>
  )
}

// ── Custos extra (só leitura) ───────────────────────────────────
// Registados na aba Faturas e Comprovativos com rubrica 'extra' + motivo + justificação.
function ListaCustosExtra({ extras, total, embutido }) {
  const porMotivo = useMemo(() => {
    const m = {}
    for (const d of extras) { const k = d.motivo_extra || 'Outro'; m[k] = round2((m[k] || 0) + n(d.custo_mensal)) }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [extras])

  // Dentro do painel de desvios: sem card próprio e só aparece se houver extras.
  if (embutido && extras.length === 0) return null
  const Wrapper = embutido ? 'div' : Card
  return (
    <Wrapper>
      <Card.Header icon={FilePlus2} title="Custos extra — fora da Análise Financeira"
        subtitle='Registados na aba Faturas e Comprovativos com a rubrica "Custo extra", motivo e justificação'
        action={<span className="text-sm num font-bold text-danger">{EUR(total)}</span>} />

      {porMotivo.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {porMotivo.map(([motivo, v]) => (
            <Badge key={motivo} tone="red" size="sm">{motivo} · {EUR(v)}</Badge>
          ))}
        </div>
      )}

      {extras.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">Sem custos extra registados.</p>
      ) : (
        <div className="rounded-xl border border-line  overflow-hidden">
          <ScrollableTable>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line  text-xs text-ink-muted uppercase bg-surface ">
                  <th className="text-left py-2.5 px-3">Descrição</th>
                  <th className="text-left py-2.5 px-3 w-44">Motivo</th>
                  <th className="text-left py-2.5 px-3">Justificação</th>
                  <th className="text-left py-2.5 px-3 w-24">Estado</th>
                  <th className="text-right py-2.5 px-3 w-28">Valor</th>
                </tr>
              </thead>
              <tbody>
                {extras.map(d => {
                  let docs = []
                  try { docs = d.documentos ? JSON.parse(d.documentos) : [] } catch {}
                  return (
                    <tr key={d.id} className="border-b border-line  last:border-0 align-top hover:bg-surface ">
                      <td className="py-2.5 px-3">
                        <p className="font-medium text-ink ">{d.movimento}</p>
                        <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
                          {[d.fornecedor, d.data].filter(Boolean).join(' · ')}
                          {docs.map(doc => (
                            <a key={doc.id} href={doc.path} target="_blank" rel="noreferrer" title={doc.name} className="text-ink-muted hover:text-brand-gold">
                              <FileText className="w-3 h-3" />
                            </a>
                          ))}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className="px-1.5 py-0.5 bg-danger/10 text-danger dark:bg-red-900/30 dark:text-red-300 rounded">{d.motivo_extra || 'Outro'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-ink-muted  whitespace-pre-line">
                        {d.justificacao || <span className="text-warning">Sem justificação — completar na aba Faturas e Comprovativos</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge tone={d.pago ? 'green' : 'yellow'} size="sm">{d.pago ? 'Pago' : 'Pendente'}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right num font-semibold text-ink ">{EUR2(d.custo_mensal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      )}
    </Wrapper>
  )
}
