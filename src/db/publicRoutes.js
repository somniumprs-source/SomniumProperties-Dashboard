/**
 * Rotas públicas (sem login) para partilha de projectos com investidores.
 * Validação via token na URL. Vista filtrada — apenas dados relevantes ao investidor.
 */
import { Router } from 'express'
import pool from './pg.js'
import {
  generateFichaAcompanhamento,
  generateRelatorioAcompanhamento,
} from './pdfProjectoFixFlip.js'

const router = Router()

// Helper: validar token + carregar dados do projeto
async function validarToken(token, pinFornecido) {
  const { rows } = await pool.query(
    `SELECT * FROM projeto_share_tokens WHERE token = $1 AND ativo = true
     AND (expira_em IS NULL OR expira_em > NOW())`,
    [token]
  )
  if (!rows.length) return { erro: 'invalido' }
  const share = rows[0]
  // Se o token tem PIN definido, exigir match
  if (share.pin && share.pin !== pinFornecido) {
    return { erro: 'pin', precisaPin: true }
  }
  // Tracking de visitas
  pool.query(
    `UPDATE projeto_share_tokens SET ultima_visita = NOW(), visitas = visitas + 1 WHERE token = $1`,
    [token]
  ).catch(() => {})
  return { share }
}

async function loadProjetoPublico(negocioId) {
  const { rows: negRows } = await pool.query(
    `SELECT id, movimento, categoria, fase, data_compra, data_estimada_venda, data_venda,
            lucro_estimado, lucro_real, custo_real_obra, capital_total, n_investidores, notas, imovel_id
     FROM negocios WHERE id = $1`,
    [negocioId]
  )
  if (!negRows.length) return null
  const negocio = negRows[0]

  let imovel = null
  if (negocio.imovel_id) {
    const { rows } = await pool.query(
      `SELECT id, nome, zona, tipologia, fotos FROM imoveis WHERE id = $1`,
      [negocio.imovel_id]
    )
    imovel = rows[0] || null
  }

  const { rows: fases } = await pool.query(
    `SELECT id, fase_key, nome, ordem, estado, perc_execucao,
            data_inicio_prevista, data_fim_prevista, data_inicio_real, data_fim_real,
            notas
     FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`,
    [negocioId]
  )

  const faseIds = fases.map(f => f.id)
  const tarefas = faseIds.length > 0
    ? (await pool.query(
        `SELECT id, fase_id, descricao, concluida, deadline FROM projeto_tarefas
         WHERE fase_id = ANY($1) ORDER BY ordem`, [faseIds]
      )).rows
    : []
  const fotos = faseIds.length > 0
    ? (await pool.query(
        `SELECT pf.id, pf.url, pf.legenda, pf.tipo, pf.created_at, pf.fase_id,
                f.fase_key, f.nome AS fase_nome, f.ordem AS fase_ordem
         FROM projeto_fotos pf
         JOIN projeto_fases f ON pf.fase_id = f.id
         WHERE pf.negocio_id = $1 ORDER BY f.ordem, pf.created_at`,
        [negocioId]
      )).rows
    : []

  const percGlobal = fases.length > 0
    ? Math.round(fases.reduce((s, f) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
    : 0

  // Vista investidor: omite custos internos (custo_real_obra desnecessário; só mostra capital e expectativa)
  return {
    negocio: {
      movimento: negocio.movimento,
      categoria: negocio.categoria,
      data_compra: negocio.data_compra,
      data_estimada_venda: negocio.data_estimada_venda,
      data_venda: negocio.data_venda,
      lucro_estimado: negocio.lucro_estimado,
      capital_total: negocio.capital_total,
      n_investidores: negocio.n_investidores,
    },
    imovel: imovel ? {
      nome: imovel.nome,
      zona: imovel.zona,
      tipologia: imovel.tipologia,
    } : null,
    fases: fases.map(f => ({
      ...f,
      tarefas: tarefas.filter(t => t.fase_id === f.id),
      tarefas_total: tarefas.filter(t => t.fase_id === f.id).length,
      tarefas_concluidas: tarefas.filter(t => t.fase_id === f.id && t.concluida).length,
      fotos_count: fotos.filter(p => p.fase_id === f.id).length,
    })),
    fotos,
    percGlobal,
  }
}

// GET vista pública do projeto (precisa PIN se definido)
router.get('/projetos/:token', async (req, res) => {
  try {
    const pin = req.query.pin || req.headers['x-investidor-pin']
    const v = await validarToken(req.params.token, pin)
    if (v.erro === 'invalido') return res.status(404).json({ error: 'Link inválido ou expirado' })
    if (v.erro === 'pin') return res.status(401).json({ error: 'PIN obrigatório', precisaPin: true })
    const data = await loadProjetoPublico(v.share.negocio_id)
    if (!data) return res.status(404).json({ error: 'Projecto não encontrado' })
    res.set('Cache-Control', 'no-store')
    res.json(data)
  } catch (e) { console.error('[public/projeto]', e.message); res.status(500).json({ error: e.message }) }
})

// PDF público (relatório de acompanhamento)
router.get('/projetos/:token/pdf/relatorio', async (req, res) => {
  try {
    const v = await validarToken(req.params.token, req.query.pin)
    if (v.erro) return res.status(401).send('Acesso negado')
    const share = v.share
    // Carregar dados completos (com nomes de fase/imovel mas sem internos sensíveis)
    const { rows: negRows } = await pool.query('SELECT * FROM negocios WHERE id = $1', [share.negocio_id])
    if (!negRows.length) return res.status(404).send('Não encontrado')
    const negocio = negRows[0]
    let imovel = null
    if (negocio.imovel_id) {
      const { rows } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [negocio.imovel_id])
      imovel = rows[0] || null
    }
    const { rows: fases } = await pool.query('SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem', [share.negocio_id])
    const faseIds = fases.map(f => f.id)
    const tarefas = faseIds.length > 0
      ? (await pool.query('SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1)', [faseIds])).rows
      : []
    const fotos = faseIds.length > 0
      ? (await pool.query('SELECT * FROM projeto_fotos WHERE negocio_id = $1', [share.negocio_id])).rows
      : []
    const orcAlocado = fases.reduce((s, f) => s + (Number(f.orcamento_alocado) || 0), 0)
    const custoReal = fases.reduce((s, f) => s + (Number(f.custo_real) || 0), 0)
    const percGlobal = fases.length > 0
      ? Math.round(fases.reduce((s, f) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
      : 0

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="relatorio-${negocio.movimento.replace(/[^\w]/g, '_')}.pdf"`)
    const doc = generateRelatorioAcompanhamento({ negocio, imovel, fases, tarefas, fotos, percGlobal, orcAlocado, custoReal })
    doc.pipe(res)
  } catch (e) { console.error('[public/pdf]', e.message); res.status(500).send('Erro') }
})

export default router
