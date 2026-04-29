/**
 * Gestão de utilizadores e roles (camadas de acesso).
 *
 * Roles disponíveis:
 *   - admin       → vê e gere tudo, incluindo /admin/utilizadores
 *   - comercial   → CRM, projectos, métricas
 *   - financeiro  → financeiro, métricas
 *   - operacoes   → operações, alertas, métricas
 *
 * Mapeamento de áreas → roles (qualquer um destes roles pode aceder):
 */
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import pool from './pg.js'

export const ROLES = ['admin', 'comercial', 'financeiro', 'operacoes']

export const ROLE_AREAS = {
  admin:      ['dashboard', 'crm', 'projectos', 'financeiro', 'operacoes', 'metricas', 'alertas', 'admin'],
  comercial:  ['dashboard', 'crm', 'projectos', 'metricas'],
  financeiro: ['dashboard', 'financeiro', 'metricas'],
  operacoes:  ['dashboard', 'operacoes', 'alertas', 'metricas'],
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null

// ── Helpers ──────────────────────────────────────────────────
async function getUserByEmail(email) {
  const r = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email])
  return r.rows[0] || null
}

async function getUserById(id) {
  const r = await pool.query('SELECT * FROM users WHERE id = $1', [id])
  return r.rows[0] || null
}

function iniciaisFromNome(nome) {
  if (!nome) return '?'
  const parts = nome.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Resolve o registo `users` correspondente ao utilizador autenticado.
 * Em dev (sem Supabase), devolve o owner.
 */
export async function resolveAppUser(req) {
  // Dev mode — sem Supabase configurado, assume admin
  if (!supabaseAdmin) {
    return await getUserByEmail('somniumprs@gmail.com')
  }
  if (!req.user?.email) return null
  let u = await getUserByEmail(req.user.email)
  if (!u) {
    // Auto-provisionar entrada inativa para que admin possa activar
    await pool.query(
      `INSERT INTO users (id, email, nome, iniciais, role, ativo)
       VALUES ($1, $2, $3, $4, 'comercial', false)
       ON CONFLICT (email) DO NOTHING`,
      [req.user.id, req.user.email, req.user.email.split('@')[0], iniciaisFromNome(req.user.email)]
    )
    u = await getUserByEmail(req.user.email)
  }
  return u
}

/**
 * Middleware: permite passar se o utilizador tiver um dos roles indicados.
 * Uso: app.use('/api/financeiro', requireRole('financeiro')) — admin passa sempre.
 */
export function requireRole(...allowed) {
  return async (req, res, next) => {
    // Dev mode — sem Supabase, deixa passar
    if (!supabaseAdmin) return next()
    try {
      const u = await resolveAppUser(req)
      if (!u || !u.ativo) return res.status(403).json({ error: 'Conta inactiva' })
      req.appUser = u
      if (u.role === 'admin') return next()
      if (allowed.includes(u.role)) return next()
      return res.status(403).json({ error: 'Sem permissão para esta área' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }
}

// ── Routes ───────────────────────────────────────────────────
const router = Router()

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  next()
})

// GET /api/users/me — perfil do utilizador autenticado
router.get('/me', async (req, res) => {
  try {
    const u = await resolveAppUser(req)
    if (!u) return res.status(401).json({ error: 'Não autenticado' })
    res.json({
      id: u.id,
      email: u.email,
      nome: u.nome,
      iniciais: u.iniciais,
      cor: u.cor,
      role: u.role,
      ativo: u.ativo,
      areas: ROLE_AREAS[u.role] || [],
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Tudo abaixo é só para admins
router.use(async (req, res, next) => {
  if (!supabaseAdmin) return next() // dev mode
  const u = await resolveAppUser(req)
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' })
  req.appUser = u
  next()
})

// GET /api/users — listar todos
router.get('/', async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM users ORDER BY ativo DESC, nome ASC')
    res.json({ data: r.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/users — convidar novo utilizador (cria em Supabase Auth + tabela users)
router.post('/', async (req, res) => {
  try {
    const { email, nome, role = 'comercial', cor = '#C9A84C', password } = req.body || {}
    if (!email || !nome) return res.status(400).json({ error: 'email e nome obrigatórios' })
    if (!ROLES.includes(role)) return res.status(400).json({ error: `role inválido (${ROLES.join(', ')})` })

    let authUserId = null
    if (supabaseAdmin) {
      // Cria utilizador em Supabase Auth (com password se fornecida, ou convite por email)
      if (password) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true,
        })
        if (error) return res.status(400).json({ error: `Supabase: ${error.message}` })
        authUserId = data.user.id
      } else {
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
        if (error) return res.status(400).json({ error: `Convite: ${error.message}` })
        authUserId = data.user.id
      }
    } else {
      authUserId = `local-${Date.now()}`
    }

    const iniciais = iniciaisFromNome(nome)
    const r = await pool.query(
      `INSERT INTO users (id, email, nome, iniciais, cor, role, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, role = EXCLUDED.role, cor = EXCLUDED.cor, ativo = true
       RETURNING *`,
      [authUserId, email, nome, iniciais, cor, role]
    )
    res.status(201).json(r.rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/users/:id — actualizar role/nome/cor/ativo
router.put('/:id', async (req, res) => {
  try {
    const u = await getUserById(req.params.id)
    if (!u) return res.status(404).json({ error: 'Não encontrado' })
    const { nome, role, cor, ativo } = req.body || {}
    if (role && !ROLES.includes(role)) return res.status(400).json({ error: `role inválido` })

    // Não permitir despromover o último admin
    if ((role && role !== 'admin') || ativo === false) {
      if (u.role === 'admin') {
        const r = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND ativo = true`)
        if (r.rows[0].n <= 1) return res.status(400).json({ error: 'Não podes desactivar o último admin' })
      }
    }

    const fields = []
    const values = []
    if (nome !== undefined) { values.push(nome); fields.push(`nome = $${values.length}`); fields.push(`iniciais = $${values.length + 1}`); values.push(iniciaisFromNome(nome)) }
    if (role !== undefined) { values.push(role); fields.push(`role = $${values.length}`) }
    if (cor !== undefined) { values.push(cor); fields.push(`cor = $${values.length}`) }
    if (ativo !== undefined) { values.push(!!ativo); fields.push(`ativo = $${values.length}`) }
    if (!fields.length) return res.json(u)
    fields.push(`updated_at = NOW()::TEXT`)
    values.push(req.params.id)
    const r = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    res.json(r.rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/users/:id — remover (Supabase Auth + tabela)
router.delete('/:id', async (req, res) => {
  try {
    const u = await getUserById(req.params.id)
    if (!u) return res.status(404).json({ error: 'Não encontrado' })
    if (u.role === 'admin') {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND ativo = true`)
      if (r.rows[0].n <= 1) return res.status(400).json({ error: 'Não podes apagar o último admin' })
    }
    if (supabaseAdmin && !u.id.startsWith('local-') && u.id !== 'owner') {
      try { await supabaseAdmin.auth.admin.deleteUser(u.id) } catch (e) { console.warn('[users] supabase delete:', e.message) }
    }
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/users/:id/reset-password — enviar link de reset
router.post('/:id/reset-password', async (req, res) => {
  try {
    const u = await getUserById(req.params.id)
    if (!u) return res.status(404).json({ error: 'Não encontrado' })
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase não configurado' })
    const { error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email: u.email })
    if (error) return res.status(400).json({ error: error.message })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
