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

// Emails que ficam SEMPRE como admin activo (auto-promovidos no primeiro login).
// Configurável via env var OWNER_EMAILS (separado por vírgula). Default: somniumprs@gmail.com
const OWNER_EMAILS = (process.env.OWNER_EMAILS || 'somniumprs@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

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
 * - Em dev (sem Supabase), devolve o owner default.
 * - Emails em OWNER_EMAILS são sempre admin activos (auto-promovidos).
 * - Outros logins são auto-provisionados como `comercial` inactivo (admin tem que activar).
 */
export async function resolveAppUser(req) {
  if (!supabaseAdmin) {
    return await getUserByEmail(OWNER_EMAILS[0] || 'somniumprs@gmail.com')
  }
  if (!req.user?.email) return null
  const email = req.user.email
  const isOwner = OWNER_EMAILS.includes(email.toLowerCase())

  let u = await getUserByEmail(email)
  if (!u) {
    await pool.query(
      `INSERT INTO users (id, email, nome, iniciais, role, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [req.user.id, email, email.split('@')[0], iniciaisFromNome(email),
       isOwner ? 'admin' : 'comercial', isOwner]
    )
    u = await getUserByEmail(email)
  }
  // Garantir que owners ficam sempre admin/activo (mesmo se outro admin os tiver mexido)
  if (u && isOwner && (u.role !== 'admin' || !u.ativo)) {
    await pool.query(`UPDATE users SET role = 'admin', ativo = true, updated_at = NOW()::TEXT WHERE id = $1`, [u.id])
    u = await getUserByEmail(email)
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

// POST /api/users — convidar novo utilizador por email (cria em Supabase Auth + tabela users)
//
// Modos:
//   - sem `password` e sem `mode`: envia convite/magic link por email (requer SMTP no Supabase)
//   - mode: 'magic_link'         : gera link de magic-link e devolve-o em `actionLink` (não requer SMTP)
//   - password fornecida          : cria com password e devolve credenciais para partilhares manualmente
router.post('/', async (req, res) => {
  try {
    const { email, nome, role = 'comercial', cor = '#C9A84C', password, mode } = req.body || {}
    if (!email || !nome) return res.status(400).json({ error: 'email e nome obrigatórios' })
    if (!ROLES.includes(role)) return res.status(400).json({ error: `role inválido (${ROLES.join(', ')})` })

    let authUserId = null
    let actionLink = null
    let deliveryNote = null

    if (supabaseAdmin) {
      const redirectTo = process.env.PUBLIC_APP_URL || undefined
      if (password) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true,
        })
        if (error) return res.status(400).json({ error: `Supabase: ${error.message}` })
        authUserId = data.user.id
        deliveryNote = 'Conta criada com password. Partilha as credenciais com a pessoa.'
      } else if (mode === 'magic_link') {
        // Gera link sem depender de SMTP. Útil para partilhar manualmente (WhatsApp/Slack/Email próprio)
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink', email, options: redirectTo ? { redirectTo } : undefined,
        })
        if (error) return res.status(400).json({ error: `Magic link: ${error.message}` })
        authUserId = data.user.id
        actionLink = data.properties?.action_link || null
        deliveryNote = 'Link de acesso gerado. Copia e envia à pessoa por email/WhatsApp.'
      } else {
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined)
        if (error) return res.status(400).json({ error: `Convite: ${error.message}. Sugestão: usar mode=magic_link se SMTP não estiver configurado no Supabase.` })
        authUserId = data.user.id
        deliveryNote = 'Convite enviado por email pelo Supabase.'
      }
    } else {
      authUserId = `local-${Date.now()}`
      deliveryNote = 'Modo dev — utilizador adicionado apenas localmente.'
    }

    const iniciais = iniciaisFromNome(nome)
    const r = await pool.query(
      `INSERT INTO users (id, email, nome, iniciais, cor, role, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, role = EXCLUDED.role, cor = EXCLUDED.cor, ativo = true
       RETURNING *`,
      [authUserId, email, nome, iniciais, cor, role]
    )
    res.status(201).json({ ...r.rows[0], actionLink, deliveryNote })
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

// POST /api/users/:id/reset-password — gera link de reset (devolve sempre o action link)
router.post('/:id/reset-password', async (req, res) => {
  try {
    const u = await getUserById(req.params.id)
    if (!u) return res.status(404).json({ error: 'Não encontrado' })
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase não configurado' })
    const redirectTo = process.env.PUBLIC_APP_URL || undefined
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery', email: u.email, options: redirectTo ? { redirectTo } : undefined,
    })
    if (error) return res.status(400).json({ error: error.message })
    res.json({ ok: true, actionLink: data?.properties?.action_link || null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/users/:id/magic-link — gera magic link de acesso (não requer SMTP)
router.post('/:id/magic-link', async (req, res) => {
  try {
    const u = await getUserById(req.params.id)
    if (!u) return res.status(404).json({ error: 'Não encontrado' })
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase não configurado' })
    const redirectTo = process.env.PUBLIC_APP_URL || undefined
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink', email: u.email, options: redirectTo ? { redirectTo } : undefined,
    })
    if (error) return res.status(400).json({ error: error.message })
    res.json({ ok: true, actionLink: data?.properties?.action_link || null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
