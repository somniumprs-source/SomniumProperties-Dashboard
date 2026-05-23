/**
 * Recalc one-off: re-executa o motor de cálculo para todas as análises na BD.
 *
 * Necessário após os fixes que mudaram fórmulas (Fix 1: comissão fora de capital_necessario;
 * B1-B7 da auditoria). Sem isto, análises antigas mostram valores stale.
 *
 * Modo de uso:
 *   node scripts/recalc-analises.mjs            # dry-run: mostra diffs sem alterar nada
 *   node scripts/recalc-analises.mjs --apply    # aplica updates à BD
 *   node scripts/recalc-analises.mjs --apply --only-caep   # só imóveis CAEP
 *
 * Re-usa calcAnalise/calcStressTests/calcCAEP de src/db/calcEngine.js como fonte única.
 */
import 'dotenv/config'
import pg from 'pg'
import { calcAnalise, calcStressTests, calcCAEP } from '../src/db/calcEngine.js'

const APPLY = process.argv.includes('--apply')
const ONLY_CAEP = process.argv.includes('--only-caep')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// Mesmo conjunto de inputs que analiseRoutes.js INPUT_FIELDS.
const INPUT_FIELDS = [
  'nome', 'compra', 'vpt', 'finalidade', 'escritura', 'cpcv_compra', 'due_diligence',
  'perc_financiamento', 'prazo_anos', 'tan', 'tipo_taxa', 'comissoes_banco', 'hipoteca',
  'modo_obra', 'obra', 'pmo_perc', 'aru', 'ampliacao', 'licenciamento',
  'pmo_arq_perc', 'pmo_fisc_perc', 'pmo_seg_obra_perc', 'pmo_outros_perc',
  'meses', 'seguro_mensal', 'condominio_mensal', 'utilidades_mensal',
  'n_tranches', 'custo_tranche', 'taxa_imi', 'ligacao_servicos', 'excedente_capital',
  'vvr', 'comissao_perc', 'cpcv_venda', 'cert_energetico', 'home_staging', 'outros_venda',
  'regime_fiscal', 'categoria_irs', 'derrama_perc', 'perc_dividendos', 'ano_aquisicao',
  'englobamento', 'taxa_irs_marginal',
  'renda_mensal', 'vacancy_pct', 'gestao_arr_pct',
  'comparaveis', 'caep',
]

const CALC_FIELDS = [
  'imt', 'imposto_selo', 'total_aquisicao',
  'valor_financiado', 'prestacao_mensal', 'is_financiamento', 'penalizacao_amort',
  'iva_obra', 'obra_com_iva',
  'imi_proporcional', 'total_detencao',
  'comissao_com_iva', 'total_venda',
  'impostos', 'retencao_dividendos',
  'capital_necessario', 'lucro_bruto', 'lucro_liquido',
  'retorno_total', 'retorno_anualizado', 'cash_on_cash', 'break_even',
]

function eur(n) {
  if (n == null || isNaN(n)) return '—'
  return `${Number(n).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} €`
}

function pct(n) {
  if (n == null || isNaN(n)) return '—'
  return `${Number(n).toFixed(2)}%`
}

async function listarAnalises() {
  const where = ONLY_CAEP
    ? `WHERE caep IS NOT NULL AND caep::text NOT IN ('', 'null', '{}')`
    : ''
  const { rows } = await pool.query(
    `SELECT a.*, i.nome AS imovel_nome
     FROM analises a
     LEFT JOIN imoveis i ON i.id = a.imovel_id
     ${where}
     ORDER BY a.activa DESC, a.updated_at DESC`
  )
  return rows
}

function montarInputs(row) {
  const inputs = {}
  for (const f of INPUT_FIELDS) {
    inputs[f] = row[f]
  }
  return inputs
}

async function propagarParaImovel(imovelId, calculados, inputs) {
  const vvr = parseFloat(inputs.vvr) || 0
  const obraComIva = calculados.obra_com_iva || 0
  const roi = calculados.retorno_total || 0
  const roiAnualizado = calculados.retorno_anualizado || 0

  await pool.query(
    `UPDATE imoveis SET
      valor_venda_remodelado = $1,
      custo_estimado_obra = $2,
      roi = $3,
      roi_anualizado = $4,
      updated_at = $5
    WHERE id = $6`,
    [vvr, obraComIva, roi, roiAnualizado, new Date().toISOString(), imovelId]
  )

  const { rows: negocios } = await pool.query(
    'SELECT id, categoria, comissao_pct FROM negocios WHERE imovel_id = $1', [imovelId]
  )
  const lucroBruto = calculados.lucro_bruto || 0
  const now = new Date().toISOString()

  for (const neg of negocios) {
    let lucroEstimado = 0
    if (neg.categoria === 'Wholesalling') {
      const p = neg.comissao_pct || 10
      lucroEstimado = Math.round(lucroBruto * (p / 100) * 100) / 100
    } else if (neg.categoria === 'Mediação Imobiliária') {
      const p = neg.comissao_pct || 2.5
      lucroEstimado = Math.round(vvr * (p / 100) * 100) / 100
    } else if (neg.categoria === 'CAEP') {
      const caepData = typeof inputs?.caep === 'string' ? JSON.parse(inputs.caep || 'null') : inputs?.caep
      const split = Number(caepData?.perc_somnium) || parseFloat(neg.comissao_pct) || 40
      const quotaActiva = lucroBruto * (split / 100)
      lucroEstimado = Math.round(quotaActiva * (2 / 3) * 100) / 100
      if (Number(caepData?.perc_somnium) && parseFloat(neg.comissao_pct) !== split) {
        await pool.query('UPDATE negocios SET comissao_pct = $1 WHERE id = $2', [split, neg.id])
      }
    } else {
      lucroEstimado = calculados.lucro_liquido || 0
    }
    await pool.query(
      `UPDATE negocios SET lucro_estimado = $1, capital_total = 0, updated_at = $2 WHERE id = $3`,
      [lucroEstimado, now, neg.id]
    )
  }
}

async function recalcular(row) {
  const inputs = montarInputs(row)
  const calculados = calcAnalise(inputs)
  const stress = calcStressTests(inputs)
  const caepConfig = inputs.caep
    ? (typeof inputs.caep === 'string' ? JSON.parse(inputs.caep || 'null') : inputs.caep)
    : null
  const caepResult = caepConfig ? calcCAEP(inputs, caepConfig) : null

  return { calculados, stress, caepResult, inputs }
}

function diff(before, after) {
  const diffs = []
  for (const f of CALC_FIELDS) {
    const a = before[f]
    const b = after[f]
    const an = Number(a)
    const bn = Number(b)
    if (a == null && b == null) continue
    if (Math.abs((an || 0) - (bn || 0)) < 0.01) continue
    diffs.push({ field: f, antes: a, depois: b, delta: round2(bn - an) })
  }
  return diffs
}

function round2(n) { return Math.round(n * 100) / 100 }

async function main() {
  console.log(`\n${APPLY ? '🟢 MODO APPLY — vai alterar BD' : '🟡 DRY-RUN — não altera nada'}`)
  if (ONLY_CAEP) console.log('🔵 FILTRO: só análises com CAEP configurado')
  console.log()

  const rows = await listarAnalises()
  console.log(`Encontradas ${rows.length} análises.\n`)

  let totalChanged = 0
  let totalSkipped = 0
  const summary = []

  for (const row of rows) {
    const { calculados, stress, caepResult, inputs } = await recalcular(row)
    const diffs = diff(row, calculados)

    if (diffs.length === 0) {
      totalSkipped++
      continue
    }

    totalChanged++
    const capDiff = diffs.find(d => d.field === 'capital_necessario')
    const lbDiff = diffs.find(d => d.field === 'lucro_bruto')
    const llDiff = diffs.find(d => d.field === 'lucro_liquido')
    const rtDiff = diffs.find(d => d.field === 'retorno_total')
    const raDiff = diffs.find(d => d.field === 'retorno_anualizado')

    summary.push({
      imovel: row.imovel_nome || row.imovel_id,
      analise: row.nome || '(sem nome)',
      activa: row.activa,
      caep: !!caepResult,
      capital_antes: row.capital_necessario,
      capital_depois: calculados.capital_necessario,
      capital_delta: capDiff?.delta,
      rt_antes: row.retorno_total,
      rt_depois: calculados.retorno_total,
      ra_antes: row.retorno_anualizado,
      ra_depois: calculados.retorno_anualizado,
      ll_antes: row.lucro_liquido,
      ll_depois: calculados.lucro_liquido,
      n_diffs: diffs.length,
    })

    if (APPLY) {
      const updates = {
        ...calculados,
        stress_tests: JSON.stringify(stress),
        updated_at: new Date().toISOString(),
      }
      if (caepResult) updates.caep = JSON.stringify(caepResult)

      const entries = Object.entries(updates)
      const sets = entries.map(([k], i) => `${k} = $${i + 1}`)
      const params = entries.map(([, v]) => v)
      params.push(row.id)

      await pool.query(`UPDATE analises SET ${sets.join(', ')} WHERE id = $${params.length}`, params)

      if (row.activa) {
        await propagarParaImovel(row.imovel_id, calculados, inputs)
      }
    }
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log(`RESUMO: ${totalChanged} análises com diffs · ${totalSkipped} sem mudanças`)
  console.log(`${'='.repeat(80)}\n`)

  // Mostrar top 30 das mais impactadas
  const top = summary.slice(0, 30)
  for (const s of top) {
    const tags = []
    if (s.activa) tags.push('ACTIVA')
    if (s.caep) tags.push('CAEP')
    const tag = tags.length ? ` [${tags.join('·')}]` : ''
    console.log(`• ${s.imovel} → ${s.analise}${tag}`)
    console.log(`    Capital:   ${eur(s.capital_antes)} → ${eur(s.capital_depois)} (Δ ${eur(s.capital_delta)})`)
    console.log(`    LucroLiq:  ${eur(s.ll_antes)} → ${eur(s.ll_depois)}`)
    console.log(`    RT:        ${pct(s.rt_antes)} → ${pct(s.rt_depois)}`)
    console.log(`    RA:        ${pct(s.ra_antes)} → ${pct(s.ra_depois)}`)
    console.log(`    (${s.n_diffs} campos alterados no total)`)
    console.log()
  }
  if (summary.length > 30) console.log(`... (${summary.length - 30} análises mais)\n`)

  if (!APPLY && totalChanged > 0) {
    console.log('⚠️  Dry-run terminado. Para aplicar, corre:')
    console.log('    node scripts/recalc-analises.mjs --apply\n')
  } else if (APPLY) {
    console.log('✅ Updates aplicados à BD.\n')
  }

  await pool.end()
}

main().catch(e => { console.error('💥', e); process.exit(1) })
