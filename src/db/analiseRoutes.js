/**
 * API routes para análises de rentabilidade (calculadora integrada).
 * Cada imóvel pode ter N análises, 1 activa (alimenta KPIs).
 */
import { Router } from 'express'
import { randomUUID } from 'crypto'
import pool from './pg.js'
import { calcAnalise, calcStressTests, calcCAEP, quickCheck } from './calcEngine.js'

const router = Router()

// Campos de input (enviados pelo frontend)
const INPUT_FIELDS = new Set([
  'nome', 'compra', 'vpt', 'finalidade', 'escritura', 'cpcv_compra', 'due_diligence',
  'perc_financiamento', 'prazo_anos', 'tan', 'tipo_taxa', 'comissoes_banco', 'hipoteca',
  'modo_obra', 'obra', 'pmo_perc', 'aru', 'ampliacao', 'licenciamento',
  'meses', 'seguro_mensal', 'condominio_mensal', 'utilidades_mensal',
  'n_tranches', 'custo_tranche', 'taxa_imi', 'ligacao_servicos', 'excedente_capital',
  'vvr', 'comissao_perc', 'cpcv_venda', 'cert_energetico', 'home_staging', 'outros_venda',
  'regime_fiscal', 'derrama_perc', 'perc_dividendos', 'ano_aquisicao', 'englobamento', 'taxa_irs_marginal',
  'comparaveis', 'caep', 'criado_por',
])

// Campos calculados pelo motor
const CALC_FIELDS = new Set([
  'imt', 'imposto_selo', 'total_aquisicao',
  'valor_financiado', 'prestacao_mensal', 'is_financiamento', 'penalizacao_amort',
  'iva_obra', 'obra_com_iva',
  'imi_proporcional', 'total_detencao',
  'comissao_com_iva', 'total_venda',
  'impostos', 'retencao_dividendos',
  'capital_necessario', 'lucro_bruto', 'lucro_liquido',
  'retorno_total', 'retorno_anualizado', 'cash_on_cash', 'break_even',
  'stress_tests',
])

// ── Listar análises de um imóvel ─────────────────────────────
router.get('/imoveis/:imovelId/analises', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM analises WHERE imovel_id = $1 ORDER BY activa DESC, updated_at DESC',
      [req.params.imovelId]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Criar nova análise para um imóvel ────────────────────────
router.post('/imoveis/:imovelId/analises', async (req, res) => {
  try {
    const imovelId = req.params.imovelId
    // Verificar que o imóvel existe
    const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [imovelId])
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const id = randomUUID()
    const now = new Date().toISOString()
    const body = req.body || {}

    // Se é a primeira análise, fica activa
    const { rows: existentes } = await pool.query('SELECT id FROM analises WHERE imovel_id = $1', [imovelId])
    const activa = existentes.length === 0

    // Pré-preencher com dados do imóvel se não vier input
    const inputs = {
      compra: body.compra ?? imovel.ask_price ?? 0,
      obra: body.obra ?? imovel.custo_estimado_obra ?? 0,
      vvr: body.vvr ?? imovel.valor_venda_remodelado ?? 0,
      meses: body.meses ?? 6,
      ...body,
    }

    // Calcular
    const calculados = calcAnalise(inputs)
    const stress = calcStressTests(inputs)
    const caepResult = inputs.caep ? calcCAEP(inputs, typeof inputs.caep === 'string' ? JSON.parse(inputs.caep) : inputs.caep) : null

    // Montar dados para insert
    const data = {
      ...inputs,
      ...calculados,
      stress_tests: JSON.stringify(stress),
    }
    if (caepResult) data.caep = JSON.stringify(caepResult)

    // Filtrar apenas colunas válidas
    const SYSTEM = new Set(['id', 'imovel_id', 'activa', 'versao', 'created_at', 'updated_at'])
    const ALL_FIELDS = new Set([...INPUT_FIELDS, ...CALC_FIELDS, 'stress_tests'])
    const entries = Object.entries(data).filter(([k]) => ALL_FIELDS.has(k) && !SYSTEM.has(k))

    const cols = ['id', 'imovel_id', 'activa', 'versao', ...entries.map(([k]) => k), 'created_at', 'updated_at']
    const vals = cols.map((_, i) => `$${i + 1}`)
    const params = [id, imovelId, activa, 1, ...entries.map(([, v]) => typeof v === 'object' ? JSON.stringify(v) : v), now, now]

    await pool.query(`INSERT INTO analises (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params)

    // Se activa, propagar para imóvel
    if (activa) await propagarParaImovel(imovelId, calculados, inputs)

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (tabela, registo_id, acao, dados_novos) VALUES ($1, $2, $3, $4)',
      ['analises', id, 'INSERT', JSON.stringify({ id, imovel_id: imovelId, nome: inputs.nome || 'Cenário Base' })]
    )

    const { rows: [created] } = await pool.query('SELECT * FROM analises WHERE id = $1', [id])
    res.status(201).json(created)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Obter análise por ID ─────────────────────────────────────
router.get('/analises/:id', async (req, res) => {
  try {
    const { rows: [analise] } = await pool.query('SELECT * FROM analises WHERE id = $1', [req.params.id])
    if (!analise) return res.status(404).json({ error: 'Análise não encontrada' })
    res.json(analise)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Actualizar análise (recalcula server-side) ───────────────
router.put('/analises/:id', async (req, res) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT * FROM analises WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Análise não encontrada' })

    const now = new Date().toISOString()
    const body = req.body || {}

    // Merge inputs existentes com novos
    const merged = {}
    for (const f of INPUT_FIELDS) {
      if (f === 'comparaveis' || f === 'caep') {
        merged[f] = body[f] !== undefined ? body[f] : existing[f]
      } else {
        merged[f] = body[f] !== undefined ? body[f] : existing[f]
      }
    }

    // Recalcular
    const calculados = calcAnalise(merged)
    const stress = calcStressTests(merged)
    const caepConfig = merged.caep ? (typeof merged.caep === 'string' ? JSON.parse(merged.caep) : merged.caep) : null
    const caepResult = caepConfig ? calcCAEP(merged, caepConfig) : null

    // Montar SET
    const updates = { ...merged, ...calculados, stress_tests: stress, versao: (existing.versao || 1) + 1, updated_at: now }
    if (caepResult) updates.caep = caepResult

    const SKIP = new Set(['id', 'imovel_id', 'activa', 'created_at'])
    const entries = Object.entries(updates).filter(([k]) => !SKIP.has(k))
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`)
    const params = entries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v)
    params.push(req.params.id)

    await pool.query(`UPDATE analises SET ${sets.join(', ')} WHERE id = $${params.length}`, params)

    // Se activa, propagar
    if (existing.activa) await propagarParaImovel(existing.imovel_id, calculados, merged)

    // Audit
    await pool.query(
      'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)',
      ['analises', req.params.id, 'UPDATE',
        JSON.stringify({ lucro_liquido: existing.lucro_liquido, retorno_anualizado: existing.retorno_anualizado }),
        JSON.stringify({ lucro_liquido: calculados.lucro_liquido, retorno_anualizado: calculados.retorno_anualizado })]
    )

    const { rows: [updated] } = await pool.query('SELECT * FROM analises WHERE id = $1', [req.params.id])
    res.json(updated)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Apagar análise ───────────────────────────────────────────
router.delete('/analises/:id', async (req, res) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT * FROM analises WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Análise não encontrada' })

    await pool.query('DELETE FROM analises WHERE id = $1', [req.params.id])

    await pool.query(
      'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores) VALUES ($1, $2, $3, $4)',
      ['analises', req.params.id, 'DELETE', JSON.stringify({ nome: existing.nome, imovel_id: existing.imovel_id })]
    )

    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Activar análise (desactiva as outras) ────────────────────
router.post('/analises/:id/activar', async (req, res) => {
  try {
    const { rows: [analise] } = await pool.query('SELECT * FROM analises WHERE id = $1', [req.params.id])
    if (!analise) return res.status(404).json({ error: 'Análise não encontrada' })

    // Desactivar todas do mesmo imóvel
    await pool.query('UPDATE analises SET activa = false WHERE imovel_id = $1', [analise.imovel_id])
    // Activar esta
    await pool.query('UPDATE analises SET activa = true, updated_at = $1 WHERE id = $2', [new Date().toISOString(), req.params.id])

    // Propagar para imóvel
    await propagarParaImovel(analise.imovel_id, analise, analise)

    res.json({ ok: true, analise_id: req.params.id })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Duplicar análise ─────────────────────────────────────────
router.post('/analises/:id/duplicar', async (req, res) => {
  try {
    const { rows: [original] } = await pool.query('SELECT * FROM analises WHERE id = $1', [req.params.id])
    if (!original) return res.status(404).json({ error: 'Análise não encontrada' })

    const id = randomUUID()
    const now = new Date().toISOString()
    const nome = req.body.nome || `${original.nome} (cópia)`

    // Copiar todas as colunas excepto sistema
    const SKIP = new Set(['id', 'activa', 'versao', 'created_at', 'updated_at'])
    const entries = Object.entries(original).filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined)

    // Override nome
    const nomeIdx = entries.findIndex(([k]) => k === 'nome')
    if (nomeIdx >= 0) entries[nomeIdx][1] = nome

    const cols = ['id', 'activa', 'versao', ...entries.map(([k]) => k), 'created_at', 'updated_at']
    const vals = cols.map((_, i) => `$${i + 1}`)
    const params = [id, false, 1, ...entries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v), now, now]

    await pool.query(`INSERT INTO analises (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params)

    const { rows: [created] } = await pool.query('SELECT * FROM analises WHERE id = $1', [id])
    res.status(201).json(created)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Stress Tests on-demand ───────────────────────────────────
router.get('/analises/:id/stress', async (req, res) => {
  try {
    const { rows: [analise] } = await pool.query('SELECT * FROM analises WHERE id = $1', [req.params.id])
    if (!analise) return res.status(404).json({ error: 'Análise não encontrada' })
    res.json(calcStressTests(analise))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Quick Check ──────────────────────────────────────────────
router.post('/analises/quick-check', async (req, res) => {
  try {
    const result = quickCheck(req.body)
    if (!result) return res.status(400).json({ error: 'Compra e VVR são obrigatórios' })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── KPIs agregados de análises activas ───────────────────────
router.get('/analises-kpis', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, i.nome as imovel_nome, i.estado as imovel_estado
      FROM analises a
      JOIN imoveis i ON i.id = a.imovel_id
      WHERE a.activa = true
    `)

    const total = rows.length
    if (total === 0) return res.json({ total: 0 })

    const somaLucro = rows.reduce((s, r) => s + (r.lucro_liquido || 0), 0)
    const somaCapital = rows.reduce((s, r) => s + (r.capital_necessario || 0), 0)
    const mediaRA = rows.reduce((s, r) => s + (r.retorno_anualizado || 0), 0) / total
    const mediaRT = rows.reduce((s, r) => s + (r.retorno_total || 0), 0) / total
    const comRisco = rows.filter(r => {
      const st = typeof r.stress_tests === 'string' ? JSON.parse(r.stress_tests) : r.stress_tests
      return st?.pior?.lucro_liquido < 0
    }).length

    res.json({
      total,
      pipeline_lucro_liquido: Math.round(somaLucro * 100) / 100,
      pipeline_capital: Math.round(somaCapital * 100) / 100,
      media_retorno_anualizado: Math.round(mediaRA * 100) / 100,
      media_retorno_total: Math.round(mediaRT * 100) / 100,
      imoveis_com_risco: comRisco,
      analises: rows.map(r => ({
        id: r.id,
        imovel_id: r.imovel_id,
        imovel_nome: r.imovel_nome,
        imovel_estado: r.imovel_estado,
        lucro_liquido: r.lucro_liquido,
        retorno_anualizado: r.retorno_anualizado,
        capital_necessario: r.capital_necessario,
        vvr: r.vvr,
        compra: r.compra,
      })),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Propagação: análise activa → imóvel + negócio ────────────
async function propagarParaImovel(imovelId, calculados, inputs) {
  try {
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

    // Actualizar negócios associados (respeitando modelo de negócio)
    const { rows: negocios } = await pool.query('SELECT id, categoria, comissao_pct FROM negocios WHERE imovel_id = $1', [imovelId])
    const lucroBruto = calculados.lucro_bruto || 0
    const now = new Date().toISOString()

    for (const neg of negocios) {
      let lucroEstimado = 0

      if (neg.categoria === 'Wholesalling') {
        // Wholesaling: fee = % do lucro bruto F&F (default 10%)
        const pct = neg.comissao_pct || 10
        lucroEstimado = Math.round(lucroBruto * (pct / 100) * 100) / 100
      } else if (neg.categoria === 'Mediação Imobiliária') {
        // Mediação: comissão % sobre valor de venda
        const pct = neg.comissao_pct || 2.5
        lucroEstimado = Math.round(vvr * (pct / 100) * 100) / 100
      } else if (neg.categoria === 'CAEP') {
        // CAEP: 2/3 da quota activa (split definido no negócio)
        const split = parseFloat(neg.comissao_pct) || 40
        const quotaActiva = lucroBruto * (split / 100)
        lucroEstimado = Math.round(quotaActiva * (2 / 3) * 100) / 100
      } else {
        lucroEstimado = calculados.lucro_liquido || 0
      }

      await pool.query(
        `UPDATE negocios SET lucro_estimado = $1, capital_total = 0, updated_at = $2 WHERE id = $3`,
        [lucroEstimado, now, neg.id]
      )
    }
  } catch (e) {
    console.error('[analise] Erro ao propagar para imóvel:', e.message)
  }
}

export default router
