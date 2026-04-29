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

export const ROLES = ['admin', 'comercial', 'financeiro', 'operacoes', 'parceiro']

export const ROLE_AREAS = {
  admin:      ['dashboard', 'crm', 'projectos', 'financeiro', 'operacoes', 'metricas', 'alertas', 'admin'],
  comercial:  ['dashboard', 'crm', 'projectos', 'metricas'],
  financeiro: ['dashboard', 'financeiro', 'metricas'],
  operacoes:  ['dashboard', 'operacoes', 'alertas', 'metricas'],
  // Parceiro externo: vê CRM (só tab Imóveis) e Projectos.
  // Dentro destes, só vê os registos partilhados com ele (filtro pela tabela `acessos`).
  parceiro:   ['crm', 'projectos'],
}

// Sub-módulos dentro de cada área. Usado para filtrar tabs/secções no frontend
// e para proteger endpoints específicos no backend.
// Se uma role não estiver listada num módulo, NÃO tem acesso a esse módulo.
// Parceiros têm acesso a 'crm.imoveis' e 'crm.negocios' MAS sujeito a filtro
// por registo (tabela `acessos`) — só vêem os imóveis/negócios partilhados com eles.
export const ROLE_MODULES = {
  admin:      ['crm.imoveis', 'crm.investidores', 'crm.consultores', 'crm.empreiteiros', 'crm.negocios'],
  comercial:  ['crm.imoveis', 'crm.investidores', 'crm.consultores', 'crm.empreiteiros', 'crm.negocios'],
  financeiro: ['crm.negocios'],
  operacoes:  [],
  parceiro:   ['crm.imoveis', 'crm.negocios'],
}

// Roles cujo acesso a registos é restrito pela tabela `acessos`.
// Outros roles (admin, comercial, etc.) vêem tudo.
export const RECORD_RESTRICTED_ROLES = new Set(['parceiro'])

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null

// Emails que ficam SEMPRE como admin activo (auto-promovidos no primeiro login).
// Configurável via env var OWNER_EMAILS (separado por vírgula). Default: somniumprs@gmail.com
const OWNER_EMAILS = (process.env.OWNER_EMAILS || 'somniumprs@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

// Cache curto (60s) de resolução de user por email — evita 1 query DB por pedido.
// Chave: email lowercase. Invalidada manualmente em update/delete.
const _userCache = new Map() // email -> { user, expires }
const USER_CACHE_TTL_MS = 60_000

function invalidateUserCache(email) {
  if (email) _userCache.delete(email.toLowerCase())
  else _userCache.clear()
}

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
  const key = email.toLowerCase()

  // Cache hit
  const cached = _userCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.user

  const isOwner = OWNER_EMAILS.includes(key)
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
  if (u && isOwner && (u.role !== 'admin' || !u.ativo)) {
    await pool.query(`UPDATE users SET role = 'admin', ativo = true, updated_at = NOW()::TEXT WHERE id = $1`, [u.id])
    u = await getUserByEmail(email)
  }
  _userCache.set(key, { user: u, expires: Date.now() + USER_CACHE_TTL_MS })
  return u
}

/**
 * Middleware: permite passar se o utilizador tiver um dos roles indicados.
 * Uso: app.use('/api/financeiro', requireRole('financeiro')) — admin passa sempre.
 */
export function requireRole(...allowed) {
  return async (req, res, next) => {
    if (!supabaseAdmin) return next()
    try {
      const u = await resolveAppUser(req)
      if (!u) return res.status(401).json({ error: 'Não autenticado' })
      if (!u.ativo) return res.status(403).json({ error: 'Conta inactiva' })
      req.appUser = u
      if (u.role === 'admin' || allowed.includes(u.role)) return next()
      return res.status(403).json({ error: 'Sem permissão para esta área' })
    } catch (e) {
      console.error('[requireRole]', req.path, e.message)
      // Em caso de erro inesperado, NÃO bloquear — log e deixa passar para não derrubar a app
      return next()
    }
  }
}

/**
 * Middleware: permite passar se o utilizador tiver acesso ao módulo indicado.
 * Uso: app.use('/api/crm/investidores', requireModule('crm.investidores'))
 */
export function requireModule(module) {
  return async (req, res, next) => {
    if (!supabaseAdmin) return next()
    try {
      const u = await resolveAppUser(req)
      if (!u) return res.status(401).json({ error: 'Não autenticado' })
      if (!u.ativo) return res.status(403).json({ error: 'Conta inactiva' })
      req.appUser = u
      if (u.role === 'admin') return next()
      const mods = ROLE_MODULES[u.role] || []
      if (mods.includes(module)) return next()
      return res.status(403).json({ error: `Sem acesso a ${module}` })
    } catch (e) {
      console.error('[requireModule]', req.path, e.message)
      return next()
    }
  }
}

// ── Routes ───────────────────────────────────────────────────
const router = Router()

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  next()
})

// GET /api/users/whoami — endpoint de diagnóstico (debug)
router.get('/whoami', async (req, res) => {
  try {
    const tokenPresent = !!(req.headers.authorization || req.query.token)
    const supabaseUserEmail = req.user?.email || null
    const u = await resolveAppUser(req)
    res.json({
      tokenPresent,
      supabaseUserEmail,
      ownerEmails: OWNER_EMAILS,
      resolvedUser: u ? { id: u.id, email: u.email, role: u.role, ativo: u.ativo } : null,
      isOwnerEmail: supabaseUserEmail ? OWNER_EMAILS.includes(supabaseUserEmail.toLowerCase()) : false,
    })
  } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }) }
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
      modules: ROLE_MODULES[u.role] || [],
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
        // 1. Tenta INVITE (cria user novo + gera link). Se já existir, falla por isso.
        let data, error
        ;({ data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite', email, options: redirectTo ? { redirectTo } : undefined,
        }))
        if (error) {
          const msg = (error.message || '').toLowerCase()
          // Se utilizador já existe, gera magiclink em vez disso
          if (msg.includes('already') || msg.includes('exist') || msg.includes('registered')) {
            ;({ data, error } = await supabaseAdmin.auth.admin.generateLink({
              type: 'magiclink', email, options: redirectTo ? { redirectTo } : undefined,
            }))
          }
          if (error) return res.status(400).json({ error: `Link: ${error.message}` })
        }
        authUserId = data?.user?.id
        actionLink = data?.properties?.action_link || null
        if (!actionLink) return res.status(500).json({ error: 'Supabase não devolveu action_link. Verifica permissões da SUPABASE_SERVICE_KEY.' })
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
    invalidateUserCache(r.rows[0]?.email)
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
    invalidateUserCache(u.email)
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

    // Tenta magiclink (user existente). Se falhar por não existir, tenta invite (cria + gera link).
    let data, error
    ;({ data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink', email: u.email, options: redirectTo ? { redirectTo } : undefined,
    }))
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('user')) {
        ;({ data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite', email: u.email, options: redirectTo ? { redirectTo } : undefined,
        }))
      }
      if (error) return res.status(400).json({ error: error.message })
    }
    const actionLink = data?.properties?.action_link || null
    if (!actionLink) return res.status(500).json({ error: 'Supabase não devolveu action_link. Verifica SUPABASE_SERVICE_KEY (deve ser a service_role key, não a anon).' })
    res.json({ ok: true, actionLink })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Acessos por registo (gestão admin) ───────────────────────

// GET /api/users/:id/acessos — listar registos a que o user tem acesso (com nome do registo)
router.get('/:id/acessos', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT a.*,
        COALESCE(i.nome, n.movimento) AS nome,
        i.estado AS imovel_estado, n.fase AS negocio_fase
      FROM acessos a
      LEFT JOIN imoveis  i ON a.entidade = 'imovel'  AND i.id = a.entidade_id
      LEFT JOIN negocios n ON a.entidade = 'negocio' AND n.id = a.entidade_id
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC
    `, [req.params.id])
    res.json({ data: r.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/users/:id/acessos — conceder acesso { entidade, entidade_id }
router.post('/:id/acessos', async (req, res) => {
  try {
    const { entidade, entidade_id } = req.body || {}
    if (!['imovel', 'negocio'].includes(entidade)) return res.status(400).json({ error: 'entidade inválida (imovel|negocio)' })
    if (!entidade_id) return res.status(400).json({ error: 'entidade_id obrigatório' })
    const u = await getUserById(req.params.id)
    if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' })
    const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const r = await pool.query(
      `INSERT INTO acessos (id, user_id, entidade, entidade_id, granted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, entidade, entidade_id) DO UPDATE SET created_at = NOW()::TEXT
       RETURNING *`,
      [id, u.id, entidade, entidade_id, req.appUser?.id || null]
    )
    res.status(201).json(r.rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/users/:userId/acessos/:acessoId — revogar
router.delete('/:userId/acessos/:acessoId', async (req, res) => {
  try {
    await pool.query('DELETE FROM acessos WHERE id = $1 AND user_id = $2', [req.params.acessoId, req.params.userId])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router

// ── Endpoints e helpers de acesso por registo ─────────────────

export const accessRouter = (() => {
  const r = Router()
  r.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

  // Quem tem acesso a um registo (lista de users, para o modal de partilha)
  // GET /api/acessos/:entidade/:id
  r.get('/:entidade/:id', async (req, res) => {
    try {
      const { entidade, id } = req.params
      if (!['imovel', 'negocio'].includes(entidade)) return res.status(400).json({ error: 'entidade inválida' })
      const result = await pool.query(`
        SELECT a.id AS acesso_id, u.id AS user_id, u.nome, u.email, u.iniciais, u.cor, u.role
        FROM acessos a JOIN users u ON u.id = a.user_id
        WHERE a.entidade = $1 AND a.entidade_id = $2
        ORDER BY u.nome
      `, [entidade, id])
      res.json({ data: result.rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  return r
})()

/**
 * Devolve a lista de IDs (entidade) a que um user tem acesso.
 * Usado no middleware restrictByAccess.
 */
async function getAccessibleIds(userId, entidade) {
  const r = await pool.query(
    'SELECT entidade_id FROM acessos WHERE user_id = $1 AND entidade = $2',
    [userId, entidade]
  )
  return new Set(r.rows.map(x => x.entidade_id))
}

/**
 * Middleware: para roles restritos por registo (parceiro), filtra
 * listagens e bloqueia operações em registos a que não tem acesso.
 *
 * - GET /              → mantém handler, depois filtra response.data por IDs com acesso
 * - GET /:id, PUT /:id, sub-paths → 403 se não tem acesso ao :id
 * - POST / (criar)     → 403 (parceiros não criam registos novos)
 * - DELETE /:id (raiz) → 403 (parceiros não apagam)
 */
export function restrictByAccess(entidade) {
  return async (req, res, next) => {
    if (!supabaseAdmin) return next()
    try {
      let u = req.appUser
      if (!u) {
        try { u = await resolveAppUser(req); req.appUser = u } catch {}
      }
      if (!u) {
        console.log(`[restrictByAccess:${entidade}] sem user → next (path=${req.path})`)
        return next()
      }
      if (u.role === 'admin' || !RECORD_RESTRICTED_ROLES.has(u.role)) {
        // Admin/comercial/etc — passam sem filtro
        return next()
      }
      console.log(`[restrictByAccess:${entidade}] role=${u.role} email=${u.email} → vai filtrar`)

    // Extrair ID do registo na primeira parte do path (ex: /abc-123, /abc-123/fotos)
    const m = req.path.match(/^\/([^/]+)/)
    const firstSeg = m ? m[1] : null
    const restPath = m ? req.path.slice(m[0].length) : ''
    // Segmentos especiais que NÃO são IDs de registos
    const NON_ID_SEGS = new Set(['stats', 'enriched', 'find-or-create', 'lookup', 'checklist', 'relatorio'])
    const isRecordPath = firstSeg && !NON_ID_SEGS.has(firstSeg)

    // Criação: POST sem ID na URL
    if (req.method === 'POST' && !isRecordPath) {
      return res.status(403).json({ error: 'Parceiros não podem criar novos registos' })
    }
    // Apagar registo inteiro: DELETE /:id (sem sub-path)
    if (req.method === 'DELETE' && isRecordPath && !restPath) {
      return res.status(403).json({ error: 'Parceiros não podem apagar registos' })
    }

    // Acesso a registo individual (qualquer método)
    if (isRecordPath) {
      const r = await pool.query(
        'SELECT 1 FROM acessos WHERE user_id = $1 AND entidade = $2 AND entidade_id = $3',
        [u.id, entidade, firstSeg]
      )
      if (r.rowCount === 0) return res.status(403).json({ error: 'Sem acesso a este registo' })
      return next()
    }

    // Listagem (GET /) — filtrar response por IDs com acesso
    if (req.method === 'GET') {
      const ids = await getAccessibleIds(u.id, entidade)
      const origJson = res.json.bind(res)
      res.json = (body) => {
        try {
          if (body && Array.isArray(body.data)) {
            body.data = body.data.filter(item => ids.has(item.id))
            if (typeof body.total === 'number') body.total = body.data.length
          } else if (Array.isArray(body)) {
            body = body.filter(item => ids.has(item.id))
          }
        } catch (e) { console.error('[restrictByAccess.json]', e.message) }
        return origJson(body)
      }
    }
    next()
    } catch (e) {
      console.error('[restrictByAccess]', req.path, e.message)
      return next()
    }
  }
}
