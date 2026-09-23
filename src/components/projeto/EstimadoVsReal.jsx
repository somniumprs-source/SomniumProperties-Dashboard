/**
 * Quadro "Estimado vs Real" (aba Resumo do projecto) — espelho entre a Análise Financeira
 * (valores estimados, análise activa do imóvel) e as Faturas e Comprovativos (valores reais,
 * tabela despesas do negócio). Cada factura é ligada a uma rubrica da Análise
 * via despesas.rubrica_analise; custos fora da Análise usam a rubrica 'extra'
 * e exigem motivo + justificação, para a análise final do negócio.
 * Só consulta: toda a introdução de valores é feita na aba Faturas e Comprovativos.
 *
 * Tempo real: partilha a queryKey ['projeto-faturas', id] com a aba Faturas e Comprovativos e
 * recarrega em qualquer mutação (somnium:refresh). A análise chega via /resumo,
 * que o ProjectoDetalhe já recarrega nas mesmas mutações.
 */
import { useMemo, useState } from 'react'
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

// Rubricas da Análise Financeira (calcAnalise em src/db/calcEngine.js). A soma
// dos estimados é igual ao custo_total da análise. `acumula`: rubricas que vão
// sendo faturadas ao longo do projecto (obra, custos mensais) — enquanto o
// projecto corre, o custo final previsto é max(real, estimado); nas restantes
// (pagamento único) uma factura registada é tratada como valor final.
// `semCapital`: não conta para o capital a adiantar (comissão paga pelo sinal).
const GRUPO_VENDA_DEDUCAO = 'Descontado na venda'

export const RUBRICAS = [
  // Compra = total de aquisição guardado menos os restantes custos de aquisição:
  // inclui o fee de cedência (Wholesaling), tal como calcAnalise o soma à compra.
  { key: 'compra',           grupo: 'Aquisição',      label: 'Preço de compra',            est: estCompra },
  { key: 'imt',              grupo: 'Aquisição',      label: 'IMT',                        est: a => n(a.imt) },
  { key: 'imposto_selo',     grupo: 'Aquisição',      label: 'Imposto do Selo',            est: a => n(a.imposto_selo) },
  { key: 'escritura',        grupo: 'Aquisição',      label: 'Escritura e registos',       est: a => (a.escritura == null ? 0 : n(a.escritura) || 700) },
  { key: 'cpcv_compra',      grupo: 'Aquisição',      label: 'CPCV de compra',             est: a => n(a.cpcv_compra) },
  { key: 'due_diligence',    grupo: 'Aquisição',      label: 'Due diligence',              est: a => n(a.due_diligence) },
  { key: 'financiamento',    grupo: 'Financiamento',  label: 'Custos bancários (IS, comissões, hipoteca, amortização)',
    est: a => n(a.is_financiamento) + n(a.comissoes_banco) + n(a.hipoteca) + n(a.penalizacao_amort) },
  { key: 'prestacoes',       grupo: 'Financiamento',  label: 'Prestações do crédito',      est: a => n(a.prestacao_mensal) * meses(a), acumula: true },
  { key: 'obra',             grupo: 'Obra',           label: 'Obra (c/ IVA)',              est: a => n(a.obra_com_iva), acumula: true },
  // Licenças e certificações: detalhe do subtotal licenciamento da Análise. A key
  // 'licenciamento' fica como "Outras" (residual) — compatível com facturas antigas
  // e com análises sem detalhe, e a soma das 3 é sempre igual a licenciamento.
  { key: 'lic_camara',       grupo: 'Licenças e certificações', label: 'Licenças e taxas camarárias', est: a => n(a.lic_camara) },
  { key: 'lic_aru',          grupo: 'Licenças e certificações', label: 'Certificação ARU',            est: a => n(a.lic_aru) },
  { key: 'licenciamento',    grupo: 'Licenças e certificações', label: 'Outras licenças e certidões',
    est: a => Math.max(n(a.licenciamento) - n(a.lic_camara) - n(a.lic_aru), 0) },
  { key: 'imi',              grupo: 'Detenção',       label: 'IMI proporcional',           est: a => n(a.imi_proporcional), acumula: true },
  { key: 'seguro',           grupo: 'Detenção',       label: 'Seguro',                     est: a => n(a.seguro_mensal) * meses(a), acumula: true },
  { key: 'condominio',       grupo: 'Detenção',       label: 'Condomínio',                 est: a => n(a.condominio_mensal) * meses(a), acumula: true },
  { key: 'utilidades',       grupo: 'Detenção',       label: 'Utilidades (água, luz, gás)', est: a => n(a.utilidades_mensal) * meses(a), acumula: true },
  { key: 'tranches',         grupo: 'Detenção',       label: 'Custos de tranches',         est: a => n(a.n_tranches || 1) * n(a.custo_tranche) },
  { key: 'ligacao_servicos', grupo: 'Detenção',       label: 'Ligação de serviços',        est: a => n(a.ligacao_servicos) },
  { key: 'excedente_capital',grupo: 'Detenção',       label: 'Excedente de capital (reserva)', est: a => n(a.excedente_capital) },
  // A comissão sai do preço de venda (paga no sinal do comprador): não é despesa
  // coberta pelo capital — fica num grupo próprio, mas conta para o lucro.
  { key: 'comissao_venda',   grupo: GRUPO_VENDA_DEDUCAO, label: 'Comissão de mediação (c/ IVA)', est: a => n(a.comissao_com_iva), semCapital: true },
  { key: 'cpcv_venda',       grupo: 'Venda',          label: 'CPCV de venda',              est: a => n(a.cpcv_venda) },
  { key: 'cert_energetico',  grupo: 'Venda',          label: 'Certificado energético',     est: a => n(a.cert_energetico) },
  { key: 'home_staging',     grupo: 'Venda',          label: 'Home staging',               est: a => n(a.home_staging) },
  { key: 'outros_venda',     grupo: 'Venda',          label: 'Outros custos de venda',     est: a => n(a.outros_venda) },
]
function meses(a) { return Math.max(parseInt(a.meses) || 6, 1) }
function estCompra(a) {
  const declarado = n(a.compra) + n(a.fee_cedencia)
  if (!(n(a.total_aquisicao) > 0)) return declarado
  const outros = n(a.imt) + n(a.imposto_selo) + (a.escritura == null ? 0 : n(a.escritura) || 700) + n(a.cpcv_compra) + n(a.due_diligence)
  const derivado = Math.max(n(a.total_aquisicao) - outros, 0)
  // Diferenças abaixo de 1 € são arredondamentos dos impostos guardados: usa o valor declarado.
  return Math.abs(derivado - declarado) < 1 ? declarado : derivado
}

export const RUBRICA_EXTRA = 'extra'

export const MOTIVOS_EXTRA = [
  'Imprevisto de obra',
  'Exigência legal / licenciamento',
  'Valorização do imóvel (upgrade)',
  'Omissão na estimativa',
  'Atraso / prolongamento do prazo',
  'Custos de venda adicionais',
  'Outro',
]

// Despesas pagas pelo capital primeiro; o que é descontado na venda fica no fim.
export const GRUPOS = [...new Set(RUBRICAS.map(r => r.grupo))]
  .sort((a, b) => (a === GRUPO_VENDA_DEDUCAO) - (b === GRUPO_VENDA_DEDUCAO))

// Despesas antigas sem rubrica: as registadas numa fase de obra contam como Obra.
export function rubricaDe(d) {
  if (d.rubrica_analise) return d.rubrica_analise
  if (d.fase_id) return 'obra'
  return null
}

export function labelRubrica(key) {
  if (key === RUBRICA_EXTRA) return 'Custo extra'
  return RUBRICAS.find(r => r.key === key)?.label || null
}

// Select de rubrica usado na aba Faturas e Comprovativos (criar e reclassificar faturas e comprovativos).
// A rubrica é obrigatória: a opção vazia só aparece como placeholder (desactivada),
// para facturas novas ("Escolher rubrica…") ou antigas ainda sem rubrica.
export function RubricaSelect({ value, onChange, analise, className = '', incluirExtra = true, placeholder = '— Por classificar —', ...rest }) {
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

export function QuadroEstimadoVsReal({ negocioId, analise, faturacao }) {
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

  if (despesasQuery.isPending) return <Card><p className="py-4 text-center text-sm text-gray-400">A carregar quadro Estimado vs Real…</p></Card>

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
          subtitle={`Análise Financeira espelhada com as Faturas, custo a custo${actualizado ? ` · actualizado às ${actualizado}` : ''}`}
          action={faturacao?.modeloLabel && <Badge tone="gold" size="sm">{faturacao.modeloLabel}</Badge>} />

        {semAnalise && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Sem Análise Financeira activa para o imóvel — os valores estimados ficam a zero.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <div title={calc.capitalEstimado > 0 ? `${EUR(capital)} de capital para ${EUR(calc.capitalEstimado)} a financiar` : undefined}>
            <KpiCard size="sm" icon={Landmark} tone={calc.capitalEstimado > 0 && !capitalCobre ? 'red' : 'gold'} label={faturacao?.capitalLabel || 'Capital alocado'}
              value={EUR(capital)} sub={capitalSub} className="h-full" />
          </div>
          <KpiCard size="sm" icon={TrendingUp} tone="indigo" label="Faturação expectável"
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
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-neutral-300 hover:text-brand-gold">
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
            <div className="rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <ScrollableTable>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-neutral-800 text-xs text-gray-400 uppercase bg-gray-50 dark:bg-neutral-800/50">
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
                    <tr className="border-y-2 border-gray-200 dark:border-neutral-700 font-semibold bg-white dark:bg-neutral-900">
                      <td className="py-2.5 px-4 text-gray-900 dark:text-neutral-100">Total despesas <span className="text-[11px] font-normal text-gray-400">(pagas pelo capital)</span></td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-600 dark:text-neutral-300">{EUR(calc.despesasEstimadas)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-900 dark:text-neutral-100">{EUR(calc.despesasReais)}</td>
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
                    <tr className="border-t-2 border-gray-200 dark:border-neutral-700 font-semibold">
                      <td className="py-2.5 px-4 text-gray-900 dark:text-neutral-100">Soma do desvio <span className="text-[11px] font-normal text-gray-400">(despesas + descontado na venda)</span></td>
                      <td />
                      <td />
                      <DesvioCell valor={calc.desvioTotal} custo />
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-gray-500">{fmtPctDesvio(calc.desvioTotal, calc.despesasEstimadas + calc.deducaoVendaEst)}</td>
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
            <p className="text-[11px] text-gray-400">
              Desvio positivo = gastou-se mais do que o estimado (desfavorável); negativo = poupança (favorável). Rubricas por faturar e obra/custos mensais ainda abaixo do estimado (em curso) não contam como poupança até fecharem.
            </p>

            <ListaCustosExtra extras={calc.extras} total={calc.totalExtras} embutido />
          </div>
        )}
      </Card>
    </div>
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
  if (valor == null) return <td className={`${className} text-right font-mono text-gray-300`}>—</td>
  const mau = custo ? valor > 0 : valor < 0
  const Icon = valor === 0 ? null : (valor > 0 ? TrendingUp : TrendingDown)
  return (
    <td className={`${className} text-right font-mono font-semibold whitespace-nowrap ${valor === 0 ? 'text-gray-400' : mau ? 'text-red-600' : 'text-emerald-600'}`}>
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
  const cor = delta === 0 ? 'text-gray-500' : mau ? 'text-red-600' : 'text-emerald-600'
  const borda = delta === 0 ? 'border-gray-200 dark:border-neutral-800' : mau ? 'border-red-200 dark:border-red-800/50' : 'border-emerald-200 dark:border-emerald-800/50'
  return (
    <div className={`rounded-xl border ${borda} bg-white dark:bg-neutral-900 p-3`}>
      <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">{label}</p>
      {valor != null ? (
        <p className={`text-lg font-bold font-mono ${cor}`}>{delta > 0 ? '+' : ''}{EUR(delta)}</p>
      ) : (
        <p className="text-sm font-mono mt-0.5">
          <span className="text-gray-400">{fmt(de)}</span>
          <span className="mx-1.5 text-gray-300">→</span>
          <span className="text-lg font-bold text-gray-900 dark:text-neutral-100">{fmt(para)}</span>
        </p>
      )}
      <p className={`text-[11px] mt-0.5 ${valor != null ? 'text-gray-400' : cor}`}>
        {sub || (pct ? PP(delta) : `${delta > 0 ? '+' : ''}${EUR(delta)}`)}
      </p>
    </div>
  )
}

function GrupoLinha({ label, ls, tom }) {
  const est = round2(ls.reduce((s, l) => s + l.estimado, 0))
  const real = round2(ls.reduce((s, l) => s + l.real, 0))
  const desvio = round2(ls.reduce((s, l) => s + l.desvioEfetivo, 0))
  const bg = tom === 'red' ? 'bg-red-50/60 dark:bg-red-900/10' : tom === 'amber' ? 'bg-amber-50/60 dark:bg-amber-900/10' : 'bg-gray-50/60 dark:bg-neutral-800/30'
  return (
    <tr className={`border-b border-gray-100 dark:border-neutral-800 ${bg}`}>
      <td className="py-2 px-4 text-xs font-semibold text-gray-700 dark:text-neutral-200">{label}</td>
      <td className="py-2 px-3 text-right font-mono text-xs text-gray-500">{EUR(est)}</td>
      <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-gray-700 dark:text-neutral-200">{EUR(real)}</td>
      <DesvioCell valor={desvio} custo className="py-2 px-3 text-xs" />
      <td className="py-2 px-3 text-right font-mono text-[11px] text-gray-400">{fmtPctDesvio(desvio, est)}</td>
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
    <tr className="border-b border-gray-50 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/40">
      <td className="py-2 px-4 pl-7 text-gray-700 dark:text-neutral-300">
        {l.label}
        {l.nFaturas > 0 && <span className="ml-1.5 text-[10px] text-gray-400">{l.nFaturas} doc.</span>}
      </td>
      <td className="py-2 px-3 text-right font-mono text-gray-500 dark:text-neutral-400">{EUR(l.estimado)}</td>
      <td className="py-2 px-3 text-right font-mono text-gray-800 dark:text-neutral-100">{l.temReal ? EUR(l.real) : <span className="text-gray-300">—</span>}</td>
      {l.estado === 'em_curso'
        ? <td className="py-2 px-3 text-right font-mono text-xs text-blue-600 whitespace-nowrap">faltam {EUR(l.estimado - l.real)}</td>
        : <DesvioCell valor={l.desvio} custo className="py-2 px-3" />}
      <td className={`py-2 px-3 text-right font-mono text-xs ${!contaImpacto ? 'text-gray-300' : l.desvio > 0 ? 'text-red-600' : l.desvio < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
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
        action={<span className="text-sm font-mono font-bold text-red-600">{EUR(total)}</span>} />

      {porMotivo.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {porMotivo.map(([motivo, v]) => (
            <Badge key={motivo} tone="red" size="sm">{motivo} · {EUR(v)}</Badge>
          ))}
        </div>
      )}

      {extras.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Sem custos extra registados.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <ScrollableTable>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-800 text-xs text-gray-400 uppercase bg-gray-50 dark:bg-neutral-800/50">
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
                    <tr key={d.id} className="border-b border-gray-50 dark:border-neutral-800 last:border-0 align-top hover:bg-gray-50 dark:hover:bg-neutral-800/40">
                      <td className="py-2.5 px-3">
                        <p className="font-medium text-gray-800 dark:text-neutral-100">{d.movimento}</p>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                          {[d.fornecedor, d.data].filter(Boolean).join(' · ')}
                          {docs.map(doc => (
                            <a key={doc.id} href={doc.path} target="_blank" rel="noreferrer" title={doc.name} className="text-gray-400 hover:text-brand-gold">
                              <FileText className="w-3 h-3" />
                            </a>
                          ))}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className="px-1.5 py-0.5 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded">{d.motivo_extra || 'Outro'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-600 dark:text-neutral-300 whitespace-pre-line">
                        {d.justificacao || <span className="text-amber-700">Sem justificação — completar na aba Faturas e Comprovativos</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge tone={d.pago ? 'green' : 'yellow'} size="sm">{d.pago ? 'Pago' : 'Pendente'}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-800 dark:text-neutral-100">{EUR2(d.custo_mensal)}</td>
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
