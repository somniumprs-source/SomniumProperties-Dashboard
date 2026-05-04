/**
 * API routes para o orçamento de obra (1 por imóvel).
 *   GET  /imoveis/:imovelId/orcamento-obra
 *   PUT  /imoveis/:imovelId/orcamento-obra
 *   GET  /imoveis/:imovelId/orcamento-obra/pdf
 *
 * O PUT recalcula totais com calcOrcamentoObra() e propaga
 * total_geral para imoveis.custo_estimado_obra. Suporta regime
 * fiscal (normal/aru/habitacao/rjru) e BDI (imprevistos + margem).
 */
import { Router } from 'express'
import pool from './pg.js'
import { calcOrcamentoObra } from './orcamentoObraEngine.js'
import { generateOrcamentoObraPDF } from './pdfOrcamentoObra.js'

const router = Router()

// ── GET ──────────────────────────────────────────────────────
router.get('/imoveis/:imovelId/orcamento-obra', async (req, res) => {
  try {
    const { rows: [imovel] } = await pool.query(
      'SELECT id, nome FROM imoveis WHERE id = $1',
      [req.params.imovelId]
    )
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const { rows: [orcamento] } = await pool.query(
      'SELECT * FROM orcamentos_obra WHERE imovel_id = $1',
      [req.params.imovelId]
    )

    if (!orcamento) {
      return res.json({
        imovel_id: req.params.imovelId,
        pisos: [],
        seccoes: {},
        notas: '',
        iva_perc: 23,
        regime_fiscal: 'normal',
        bdi: { imprevistos_perc: 0, margem_perc: 0 },
        total_obra: 0,
        total_licenciamento: 0,
        total_geral: 0,
        total_iva: 0,
        total_iva_autoliquidado: 0,
        total_retencoes_irs: 0,
        total_a_pagar: 0,
        existe: false,
      })
    }

    res.json({ ...orcamento, existe: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── PUT (upsert + recalcula + propaga) ───────────────────────
router.put('/imoveis/:imovelId/orcamento-obra', async (req, res) => {
  try {
    const imovelId = req.params.imovelId
    const { rows: [imovel] } = await pool.query('SELECT id FROM imoveis WHERE id = $1', [imovelId])
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const body = req.body || {}
    const pisos   = Array.isArray(body.pisos) ? body.pisos : []
    const seccoes = body.seccoes && typeof body.seccoes === 'object' ? body.seccoes : {}
    const ivaPerc = Number.isFinite(Number(body.iva_perc)) ? Number(body.iva_perc) : 23
    const regimeFiscal = ['normal', 'aru', 'habitacao', 'rjru'].includes(body.regime_fiscal) ? body.regime_fiscal : 'normal'
    const bdi = body.bdi && typeof body.bdi === 'object' ? body.bdi : {}
    const notas   = body.notas ?? ''
    const criadoPor = body.criado_por ?? null

    const calc = calcOrcamentoObra({
      pisos, seccoes, iva_perc: ivaPerc, regime_fiscal: regimeFiscal, bdi,
    })
    const t = calc.totais

    const now = new Date().toISOString()

    const { rows: [saved] } = await pool.query(
      `INSERT INTO orcamentos_obra
         (imovel_id, pisos, seccoes, notas, iva_perc, regime_fiscal, bdi,
          total_obra, total_licenciamento, total_geral,
          total_iva, total_iva_autoliquidado, total_retencoes_irs, total_a_pagar,
          criado_por, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7::jsonb,
               $8, $9, $10,
               $11, $12, $13, $14,
               $15, $16, $16)
       ON CONFLICT (imovel_id) DO UPDATE SET
         pisos = EXCLUDED.pisos,
         seccoes = EXCLUDED.seccoes,
         notas = EXCLUDED.notas,
         iva_perc = EXCLUDED.iva_perc,
         regime_fiscal = EXCLUDED.regime_fiscal,
         bdi = EXCLUDED.bdi,
         total_obra = EXCLUDED.total_obra,
         total_licenciamento = EXCLUDED.total_licenciamento,
         total_geral = EXCLUDED.total_geral,
         total_iva = EXCLUDED.total_iva,
         total_iva_autoliquidado = EXCLUDED.total_iva_autoliquidado,
         total_retencoes_irs = EXCLUDED.total_retencoes_irs,
         total_a_pagar = EXCLUDED.total_a_pagar,
         criado_por = COALESCE(EXCLUDED.criado_por, orcamentos_obra.criado_por),
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [imovelId, JSON.stringify(pisos), JSON.stringify(seccoes), notas, ivaPerc, regimeFiscal, JSON.stringify(bdi),
       calc.total_obra, calc.total_licenciamento, calc.total_geral,
       t.iva_geral, t.iva_autoliquidado, t.retencoes_irs, t.a_pagar,
       criadoPor, now]
    )

    // Propagar total_geral (bruto fiscal) para o imóvel.
    await pool.query(
      'UPDATE imoveis SET custo_estimado_obra = $1, updated_at = $2 WHERE id = $3',
      [calc.total_geral, now, imovelId]
    )

    res.json({ ...saved, calc, existe: true })
  } catch (e) {
    console.error('[orcamento-obra] PUT erro:', e)
    res.status(400).json({ error: e.message })
  }
})

// ── GET PDF ──────────────────────────────────────────────────
router.get('/imoveis/:imovelId/orcamento-obra/pdf', async (req, res) => {
  try {
    const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [req.params.imovelId])
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const { rows: [orcamento] } = await pool.query(
      'SELECT * FROM orcamentos_obra WHERE imovel_id = $1',
      [req.params.imovelId]
    )
    if (!orcamento) return res.status(404).json({ error: 'Orçamento ainda não preenchido' })

    const safeNome = String(imovel.nome || 'imovel').replace(/[^a-z0-9]+/gi, '_').slice(0, 40)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="orcamento_obra_${safeNome}.pdf"`)
    generateOrcamentoObraPDF(imovel, orcamento, res)
  } catch (e) {
    console.error('[orcamento-obra] PDF erro:', e)
    res.status(500).json({ error: e.message })
  }
})

export default router
