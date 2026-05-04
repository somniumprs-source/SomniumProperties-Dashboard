/**
 * API routes para o orçamento de obra (1 por imóvel).
 *   GET  /imoveis/:imovelId/orcamento-obra
 *   PUT  /imoveis/:imovelId/orcamento-obra
 *   GET  /imoveis/:imovelId/orcamento-obra/pdf
 *
 * O PUT recalcula totais com calcOrcamentoObra() e propaga
 * total_geral para imoveis.custo_estimado_obra.
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
      // Sem registo ainda: devolve estrutura vazia (não cria linha)
      return res.json({
        imovel_id: req.params.imovelId,
        pisos: [],
        seccoes: {},
        notas: '',
        iva_perc: 23,
        total_obra: 0,
        total_licenciamento: 0,
        total_geral: 0,
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
    const notas   = body.notas ?? ''
    const criadoPor = body.criado_por ?? null

    const { total_obra, total_licenciamento, total_geral } = calcOrcamentoObra({
      pisos, seccoes, iva_perc: ivaPerc,
    })

    const now = new Date().toISOString()

    // Upsert
    const { rows: [saved] } = await pool.query(
      `INSERT INTO orcamentos_obra
         (imovel_id, pisos, seccoes, notas, iva_perc, total_obra, total_licenciamento, total_geral, criado_por, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $10)
       ON CONFLICT (imovel_id) DO UPDATE SET
         pisos = EXCLUDED.pisos,
         seccoes = EXCLUDED.seccoes,
         notas = EXCLUDED.notas,
         iva_perc = EXCLUDED.iva_perc,
         total_obra = EXCLUDED.total_obra,
         total_licenciamento = EXCLUDED.total_licenciamento,
         total_geral = EXCLUDED.total_geral,
         criado_por = COALESCE(EXCLUDED.criado_por, orcamentos_obra.criado_por),
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [imovelId, JSON.stringify(pisos), JSON.stringify(seccoes), notas, ivaPerc,
       total_obra, total_licenciamento, total_geral, criadoPor, now]
    )

    // Propagar para o imóvel: total_geral substitui custo_estimado_obra.
    // Se houver análise activa, esta também escreve no campo no PUT seguinte;
    // o último a guardar vence (comportamento aceite na primeira iteração).
    await pool.query(
      'UPDATE imoveis SET custo_estimado_obra = $1, updated_at = $2 WHERE id = $3',
      [total_geral, now, imovelId]
    )

    res.json({ ...saved, existe: true })
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
