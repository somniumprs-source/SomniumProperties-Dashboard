/**
 * API multi-região: catálogo, mercado de referência, matching, compliance,
 * lead 360 e P&L regional. Montada como sub-router em /api/crm/regiao/*.
 */
import { Router } from 'express'
import { randomUUID } from 'crypto'
import pool from './pg.js'

const router = Router()

const REGIOES = ['Coimbra', 'AMP']
const CONCELHOS_POR_REGIAO = {
  Coimbra: ['Coimbra', 'Condeixa-a-Nova', 'Mealhada', 'Cantanhede', 'Montemor-o-Velho', 'Penacova', 'Miranda do Corvo', 'Lousã'],
  AMP: ['Porto', 'Vila Nova de Gaia'],
}

// ── Catálogo de regiões e concelhos ──────────────────────────
router.get('/regiao/catalog', (_req, res) => {
  res.json({ regioes: REGIOES, concelhos: CONCELHOS_POR_REGIAO })
})

// ── KPIs por região (resumo executivo) ───────────────────────
router.get('/regiao/kpis', async (req, res) => {
  try {
    const regiao = req.regiaoActiva || req.query.regiao
    if (!regiao) return res.status(400).json({ error: 'X-Regiao em falta' })

    // Imóveis
    const imv = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE regiao = $1) AS total,
         COUNT(*) FILTER (WHERE regiao = $1 AND estado IN ('Wholesaling','Negócio em Curso')) AS em_pipeline,
         COUNT(*) FILTER (WHERE regiao = $1 AND estado IN ('Nao interessa','Não interessa','Descartado')) AS descartados,
         AVG(roi_anualizado) FILTER (WHERE regiao = $1 AND roi_anualizado > 0) AS roi_medio
       FROM imoveis`, [regiao])

    // Investidores (pool unificado via array)
    const inv = await pool.query(
      `SELECT COUNT(*) AS total
       FROM investidores
       WHERE regioes_preferidas LIKE $1`, [`%"${regiao}"%`])

    // Negocios
    const neg = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE regiao = $1) AS total,
         COUNT(*) FILTER (WHERE regiao = $1 AND fase = 'Vendido') AS vendidos,
         COALESCE(SUM(lucro_real) FILTER (WHERE regiao = $1 AND fase = 'Vendido'), 0) AS receita_real,
         COALESCE(SUM(lucro_estimado) FILTER (WHERE regiao = $1), 0) AS receita_estimada
       FROM negocios
       WHERE COALESCE(deleted_at, NULL) IS NULL`, [regiao])

    // Despesas (anual e mensal)
    const desp = await pool.query(
      `SELECT
         COALESCE(SUM(custo_mensal), 0) AS mensal,
         COALESCE(SUM(custo_anual), 0) AS anual,
         COUNT(*) AS total
       FROM despesas
       WHERE regiao = $1`, [regiao])

    // Consultores
    const cons = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE regiao = $1) AS total,
         COUNT(*) FILTER (WHERE regiao = $1 AND estado_avaliacao = 'Ativo') AS ativos
       FROM consultores`, [regiao])

    const margem = Number(neg.rows[0].receita_estimada) - Number(desp.rows[0].anual)

    res.json({
      regiao,
      imoveis: {
        total: Number(imv.rows[0].total),
        em_pipeline: Number(imv.rows[0].em_pipeline),
        descartados: Number(imv.rows[0].descartados),
        roi_medio: imv.rows[0].roi_medio != null ? Number(imv.rows[0].roi_medio) : null,
      },
      investidores: { total: Number(inv.rows[0].total) },
      negocios: {
        total: Number(neg.rows[0].total),
        vendidos: Number(neg.rows[0].vendidos),
        receita_real: Number(neg.rows[0].receita_real),
        receita_estimada: Number(neg.rows[0].receita_estimada),
      },
      despesas: {
        total: Number(desp.rows[0].total),
        mensal: Number(desp.rows[0].mensal),
        anual: Number(desp.rows[0].anual),
      },
      consultores: {
        total: Number(cons.rows[0].total),
        ativos: Number(cons.rows[0].ativos),
      },
      margem_estimada: margem,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Mercado de referência ────────────────────────────────────
router.get('/regiao/mercado', async (req, res) => {
  try {
    const regiao = req.regiaoActiva || req.query.regiao
    const { concelho, tipologia } = req.query
    let q = `SELECT * FROM mercado_referencia WHERE 1=1`
    const params = []
    if (regiao) { params.push(regiao); q += ` AND regiao = $${params.length}` }
    if (concelho) { params.push(concelho); q += ` AND concelho = $${params.length}` }
    if (tipologia) { params.push(tipologia); q += ` AND tipologia = $${params.length}` }
    q += ` ORDER BY concelho, tipologia`
    const { rows } = await pool.query(q, params)
    res.json({ data: rows, total: rows.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/regiao/mercado', async (req, res) => {
  try {
    const id = randomUUID()
    const { regiao, concelho, freguesia, tipologia, eur_m2_compra, eur_m2_venda, tempo_medio_venda_dias, taxa_absorcao_pct, fonte, data_referencia, notas } = req.body
    if (!regiao || !concelho) return res.status(400).json({ error: 'regiao e concelho obrigatórios' })
    await pool.query(
      `INSERT INTO mercado_referencia (id, regiao, concelho, freguesia, tipologia, eur_m2_compra, eur_m2_venda, tempo_medio_venda_dias, taxa_absorcao_pct, fonte, data_referencia, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, regiao, concelho, freguesia || null, tipologia || null, eur_m2_compra || null, eur_m2_venda || null, tempo_medio_venda_dias || null, taxa_absorcao_pct || null, fonte || null, data_referencia || null, notas || null])
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

router.put('/regiao/mercado/:id', async (req, res) => {
  try {
    const { regiao, concelho, freguesia, tipologia, eur_m2_compra, eur_m2_venda, tempo_medio_venda_dias, taxa_absorcao_pct, fonte, data_referencia, notas } = req.body
    await pool.query(
      `UPDATE mercado_referencia SET regiao=$2, concelho=$3, freguesia=$4, tipologia=$5,
       eur_m2_compra=$6, eur_m2_venda=$7, tempo_medio_venda_dias=$8, taxa_absorcao_pct=$9,
       fonte=$10, data_referencia=$11, notas=$12, updated_at=NOW() WHERE id=$1`,
      [req.params.id, regiao, concelho, freguesia || null, tipologia || null, eur_m2_compra || null, eur_m2_venda || null, tempo_medio_venda_dias || null, taxa_absorcao_pct || null, fonte || null, data_referencia || null, notas || null])
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

router.delete('/regiao/mercado/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM mercado_referencia WHERE id=$1`, [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Matching investidor↔imóvel ──────────────────────────────
// Algoritmo de score 0-100:
//  · 30 pts: capital — capital_max do investidor ≥ valor_proposta do imóvel
//  · 25 pts: região — regiao do imovel ∈ regioes_preferidas
//  · 20 pts: tipologia — tipo_imovel_preferido contém tipologia
//  · 15 pts: ROI — roi_pretendido alinhado com roi_anualizado
//  · 10 pts: estratégia — estrategia inclui modelo_negocio
router.get('/regiao/match/imovel/:id', async (req, res) => {
  try {
    const imRes = await pool.query(`SELECT * FROM imoveis WHERE id=$1`, [req.params.id])
    if (!imRes.rows[0]) return res.status(404).json({ error: 'Imóvel não encontrado' })
    const im = imRes.rows[0]

    const invs = await pool.query(`SELECT * FROM investidores WHERE status NOT IN ('Não qualificado','Inactivo')`)
    const valor = im.valor_proposta || im.ask_price || 0
    const roi = im.roi_anualizado || 0
    const tipologia = im.tipologia || ''
    const modelo = im.modelo_negocio || ''
    const regiao = im.regiao || 'Coimbra'

    const scored = invs.rows.map(inv => {
      let score = 0
      const reasons = []

      // Capital (30 pts)
      if (valor > 0 && inv.capital_max && Number(inv.capital_max) >= valor) {
        score += 30
        reasons.push(`Capital máx € ${Math.round(inv.capital_max).toLocaleString('pt-PT')}`)
      } else if (valor > 0 && inv.capital_max && Number(inv.capital_max) >= valor * 0.7) {
        score += 15
        reasons.push('Capital próximo (70-100%)')
      }

      // Região (25 pts)
      let regs = []
      try { regs = JSON.parse(inv.regioes_preferidas || '[]') } catch {}
      if (regs.includes(regiao)) {
        score += 25
        reasons.push(`Região ${regiao} preferida`)
      }

      // Tipologia (20 pts)
      if (tipologia && (inv.tipo_imovel_preferido || '').includes(tipologia)) {
        score += 20
        reasons.push(`Tipologia ${tipologia} preferida`)
      }

      // ROI (15 pts) — match aproximado por faixa
      const roiTxt = inv.roi_pretendido || ''
      if (roi >= 20 && /20|>25/.test(roiTxt)) { score += 15; reasons.push('ROI alinhado (>20%)') }
      else if (roi >= 15 && /15|20/.test(roiTxt)) { score += 12; reasons.push('ROI alinhado (15-20%)') }
      else if (roi >= 10 && /10|15/.test(roiTxt)) { score += 8; reasons.push('ROI alinhado (10-15%)') }

      // Estratégia (10 pts)
      if (modelo && (inv.estrategia || '').toLowerCase().includes(modelo.toLowerCase())) {
        score += 10
        reasons.push(`Estratégia ${modelo}`)
      }

      // Campos em falta: nunca excluir um investidor do matching por falta de
      // dados — sinalizar quais critérios não puderam ser avaliados, em vez
      // de o fazer desaparecer silenciosamente da lista.
      const camposEmFalta = []
      if (!inv.capital_max) camposEmFalta.push('capital_max')
      if (regs.length === 0) camposEmFalta.push('regioes_preferidas')
      if (!inv.tipo_imovel_preferido) camposEmFalta.push('tipo_imovel_preferido')
      if (!inv.roi_pretendido) camposEmFalta.push('roi_pretendido')
      if (!inv.estrategia) camposEmFalta.push('estrategia')

      return {
        id: inv.id,
        nome: inv.nome,
        classificacao: inv.classificacao,
        capital_min: inv.capital_min,
        capital_max: inv.capital_max,
        roi_pretendido: inv.roi_pretendido,
        tipo_imovel_preferido: inv.tipo_imovel_preferido,
        regioes_preferidas: regs,
        score,
        reasons,
        campos_em_falta: camposEmFalta,
      }
    }).sort((a, b) => b.score - a.score)

    res.json({ imovel_id: im.id, regiao, total: scored.length, top: scored })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Compliance regional ──────────────────────────────────────
router.get('/regiao/compliance', async (req, res) => {
  try {
    const regiao = req.regiaoActiva || req.query.regiao
    const concelho = req.query.concelho
    let q = `SELECT * FROM compliance_regional WHERE 1=1`
    const params = []
    if (regiao) { params.push(regiao); q += ` AND regiao = $${params.length}` }
    if (concelho) { params.push(concelho); q += ` AND concelho = $${params.length}` }
    q += ` ORDER BY concelho`
    const { rows } = await pool.query(q, params)
    res.json({ data: rows, total: rows.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/regiao/compliance/:concelho', async (req, res) => {
  try {
    const { regiao, imt_perc_base, imi_perc, aimi_perc, zona_aru, notas_legais, contactos_uteis } = req.body
    const id = `compl-${(req.params.concelho || '').toLowerCase().replace(/\s+/g, '-')}`
    await pool.query(
      `INSERT INTO compliance_regional (id, regiao, concelho, imt_perc_base, imi_perc, aimi_perc, zona_aru, notas_legais, contactos_uteis)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (concelho) DO UPDATE SET
         regiao=EXCLUDED.regiao, imt_perc_base=EXCLUDED.imt_perc_base,
         imi_perc=EXCLUDED.imi_perc, aimi_perc=EXCLUDED.aimi_perc,
         zona_aru=EXCLUDED.zona_aru, notas_legais=EXCLUDED.notas_legais,
         contactos_uteis=EXCLUDED.contactos_uteis, updated_at=NOW()`,
      [id, regiao || 'Coimbra', req.params.concelho, imt_perc_base || null, imi_perc || null, aimi_perc || null, zona_aru || false, notas_legais || null, contactos_uteis || null])
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Lead 360 — interacções unificadas ────────────────────────
router.get('/regiao/lead-360/:entidade/:id', async (req, res) => {
  try {
    const { entidade, id } = req.params
    const { rows } = await pool.query(
      `SELECT * FROM lead_interactions
       WHERE entidade_tipo = $1 AND entidade_id = $2
       ORDER BY data_hora DESC LIMIT 200`, [entidade, id])
    res.json({ data: rows, total: rows.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/regiao/lead-360', async (req, res) => {
  try {
    const id = randomUUID()
    const { entidade_tipo, entidade_id, canal, direcao, assunto, conteudo, regiao, utilizador, metadata } = req.body
    if (!entidade_tipo || !entidade_id || !canal) return res.status(400).json({ error: 'entidade_tipo, entidade_id e canal obrigatórios' })
    await pool.query(
      `INSERT INTO lead_interactions (id, entidade_tipo, entidade_id, canal, direcao, assunto, conteudo, regiao, utilizador, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, entidade_tipo, entidade_id, canal, direcao || null, assunto || null, conteudo || null, regiao || req.regiaoActiva || null, utilizador || null, metadata ? JSON.stringify(metadata) : '{}'])
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Benchmarking de consultores na região ────────────────────
router.get('/regiao/benchmarking/consultores', async (req, res) => {
  try {
    const regiao = req.regiaoActiva || req.query.regiao
    const { rows } = await pool.query(
      `SELECT c.id, c.nome, c.classificacao, c.score_prioridade, c.taxa_qualidade,
              c.tempo_medio_resposta, c.lucro_gerado, c.imoveis_enviados, c.meta_mensal_leads,
              c.estatuto, c.regiao,
              (SELECT COUNT(*) FROM imoveis i WHERE i.nome_consultor = c.nome AND i.regiao = c.regiao) AS imoveis_no_pipeline
       FROM consultores c
       WHERE c.regiao = $1
       ORDER BY c.score_prioridade DESC NULLS LAST, c.lucro_gerado DESC NULLS LAST`,
      [regiao])
    res.json({ data: rows, total: rows.length, regiao })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Hot zones — agregação por concelho (para mapa) ──────────
router.get('/regiao/hot-zones', async (req, res) => {
  try {
    const regiao = req.regiaoActiva || req.query.regiao
    const { rows } = await pool.query(
      `SELECT
         COALESCE(concelho, '— sem concelho —') AS concelho,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE estado IN ('Wholesaling','Negócio em Curso','Enviar proposta ao investidor')) AS oportunidades,
         AVG(roi_anualizado) FILTER (WHERE roi_anualizado > 0) AS roi_medio,
         AVG(valor_proposta) FILTER (WHERE valor_proposta > 0) AS ticket_medio
       FROM imoveis
       WHERE regiao = $1
       GROUP BY concelho
       ORDER BY total DESC`,
      [regiao])
    res.json({ regiao, data: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
