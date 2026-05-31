/**
 * Endpoints de auditoria — historico de alteracoes em imoveis, investidores,
 * negocios. Acesso restrito a admins. Triggers PG em supabase/migrations/0013_historico_alteracoes.sql.
 */
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import pool from './pg.js'
import { resolveAppUser } from './userRoutes.js'

const router = Router()

// /api/crm/* faz bypass do auth global do server.js, por isso aqui validamos
// o token directamente para popular req.user antes de chamar resolveAppUser.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null

async function requireAdmin(req, res, next) {
  // Dev sem Supabase: passa (mantem convencao deste projecto)
  if (!supabaseAdmin) return next()
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token
    if (!token) return res.status(401).json({ error: 'Nao autenticado' })
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user?.email) return res.status(401).json({ error: 'Sessao invalida' })
    req.user = user
    const u = await resolveAppUser(req)
    if (!u) return res.status(401).json({ error: 'Nao autenticado' })
    if (u.role !== 'admin') return res.status(403).json({ error: 'So administradores' })
    next()
  } catch (e) {
    console.error('[auditoria] requireAdmin', e.message)
    res.status(500).json({ error: 'Erro de autorizacao' })
  }
}

router.use(requireAdmin)

// GET /api/auditoria — lista paginada com filtros
router.get('/', async (req, res) => {
  try {
    const { entidade, entidade_id, user_email, from, to } = req.query
    const limit = Math.min(parseInt(req.query.limit) || 100, 500)
    const offset = parseInt(req.query.offset) || 0

    const where = []
    const params = []
    if (entidade) { params.push(entidade); where.push(`a.entidade = $${params.length}`) }
    if (entidade_id) { params.push(entidade_id); where.push(`a.entidade_id = $${params.length}`) }
    if (user_email) { params.push(`%${user_email}%`); where.push(`(a.user_email ILIKE $${params.length} OR a.user_nome ILIKE $${params.length})`) }
    if (from) { params.push(from); where.push(`a.created_at >= $${params.length}`) }
    if (to) { params.push(to); where.push(`a.created_at <= $${params.length}`) }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT a.id, a.entidade, a.entidade_id, a.operacao, a.user_email, a.user_nome, a.alteracoes, a.created_at,
                CASE
                  WHEN a.entidade = 'imoveis' THEN (SELECT nome FROM imoveis WHERE id = a.entidade_id)
                  WHEN a.entidade = 'investidores' THEN (SELECT nome FROM investidores WHERE id = a.entidade_id)
                  WHEN a.entidade = 'negocios' THEN (SELECT COALESCE(NULLIF(notas,''), id::text) FROM negocios WHERE id = a.entidade_id)
                END AS entidade_nome
         FROM historico_alteracoes a
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM historico_alteracoes a ${whereClause}`, params),
    ])

    res.json({ rows, total: countRows[0]?.total || 0, limit, offset })
  } catch (e) {
    console.error('[auditoria] GET /', e.message)
    // Mensagem mais util quando a migracao 0013 ainda nao correu
    const missing = /relation .*historico_alteracoes.* does not exist/i.test(e.message)
    res.status(500).json({
      error: missing
        ? 'Tabela historico_alteracoes nao existe. Correr: node scripts/run-migration-0013.mjs'
        : 'Erro: ' + e.message,
    })
  }
})

// GET /api/auditoria/utilizadores — distinct user_emails (para dropdown filtro)
router.get('/utilizadores', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT COALESCE(NULLIF(user_nome,''), user_email) AS nome FROM historico_alteracoes
       WHERE COALESCE(NULLIF(user_nome,''), user_email) IS NOT NULL ORDER BY nome`
    )
    res.json(rows.map(r => r.nome))
  } catch (e) {
    console.error('[auditoria] GET /utilizadores', e.message)
    res.status(500).json({ error: 'Erro' })
  }
})

export default router
