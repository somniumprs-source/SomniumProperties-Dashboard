/**
 * Autor das alterações para historico_alteracoes (trigger Postgres nas
 * entidades de negócio — ver migração 0077).
 * Espelho: supabase/functions/_shared/audit.ts (manter em sync).
 *
 * O trigger lê app.audit_user_email, app.audit_user_nome e app.audit_user_id.
 * O pool partilha ligações entre pedidos, por isso nada é SET de sessão: o
 * AsyncLocalStorage guarda o autor do pedido e os valores entram com
 * set_config(..., true), locais à transação:
 *   - pool.query numa tabela auditada → envolvida em BEGIN / set_config / COMMIT;
 *   - transações abertas pelo código (pool.connect + BEGIN) → set_config logo
 *     a seguir ao BEGIN.
 *
 * Autor: a equipa partilha uma sessão Supabase (vários users com o mesmo
 * email). Nesse caso o autor é o perfil enviado em X-User-Id, que tem de ser
 * um desses users; sem perfil escolhido o servidor recusa escritas
 * (PERFIL_OBRIGATORIO). Com sessão própria o autor é o dono da sessão.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const auditCtx = new AsyncLocalStorage()

// Manter em sync com a migração 0077 e com supabase/functions/_shared/audit.ts.
export const TABELAS_AUDITADAS = [
  'imoveis', 'investidores', 'negocios',
  'consultores', 'parceiros', 'empreiteiros',
  'despesas', 'tarefas', 'visitas', 'analises', 'orcamentos_obra',
  'projeto_fases', 'projeto_tarefas', 'projeto_investidores', 'projeto_documentos', 'projeto_fracoes',
  'documentos_investidor', 'consultor_documentos',
  'imovel_follow_ups', 'consultor_followups',
  'investidor_interacoes', 'consultor_interacoes', 'parceiro_interacoes',
  'users', 'acessos',
]
const AUDITED_RE = new RegExp(`\\b(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(${TABELAS_AUDITADAS.join('|')})\\b`, 'i')

export function withAuditUser(userEmail, userNome, fn, userId = null) {
  return auditCtx.run({ userEmail: userEmail || null, userNome: userNome || null, userId: userId || null }, fn)
}

export function getAuditUser() {
  return auditCtx.getStore() || { userEmail: null, userNome: null, userId: null }
}

export function isAuditedQuery(text) {
  if (!text || typeof text !== 'string') return false
  return AUDITED_RE.test(text)
}

const temAutor = a => !!(a.userEmail || a.userNome || a.userId)

async function aplicarAutor(query, a) {
  await query(
    `SELECT set_config('app.audit_user_email', $1, true), set_config('app.audit_user_nome', $2, true), set_config('app.audit_user_id', $3, true)`,
    [a.userEmail || '', a.userNome || '', a.userId || ''],
  )
}

let _pool = null

export function installAuditedQuery(pool) {
  _pool = pool
  const originalQuery = pool.query.bind(pool)
  const originalConnect = pool.connect.bind(pool)

  // Transações abertas pelo código: o autor entra logo a seguir ao BEGIN.
  pool.connect = async function auditedConnect(...args) {
    if (typeof args[0] === 'function') return originalConnect(...args)
    const client = await originalConnect()
    if (!client.__autorInstalado) {
      const q = client.query.bind(client)
      client.query = async (...qa) => {
        const r = await q(...qa)
        const text = typeof qa[0] === 'string' ? qa[0] : qa[0]?.text
        const a = getAuditUser()
        if (temAutor(a) && typeof text === 'string' && /^\s*BEGIN\b/i.test(text)) await aplicarAutor(q, a)
        return r
      }
      client.__autorInstalado = true
    }
    return client
  }

  pool.query = async function auditedQuery(...args) {
    const a = getAuditUser()
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text
    if (!temAutor(a) || !isAuditedQuery(text)) return originalQuery(...args)
    const client = await originalConnect()
    try {
      await client.query('BEGIN')
      await aplicarAutor(client.query.bind(client), a)
      const result = await client.query(...args)
      await client.query('COMMIT')
      return result
    } catch (e) {
      try { await client.query('ROLLBACK') } catch {}
      throw e
    } finally {
      client.release()
    }
  }
  return pool
}

// ── Autor do pedido ─────────────────────────────────────────────

const _perfisCache = new Map()

// Perfis ativos de uma sessão (users com este email). Mais de um = sessão partilhada.
export async function perfisDaSessao(email) {
  if (!email || !_pool) return []
  const chave = email.toLowerCase()
  const e = _perfisCache.get(chave)
  if (e && e.expires > Date.now()) return e.perfis
  const { rows } = await _pool.query(
    'SELECT id, nome FROM users WHERE LOWER(email) = $1 AND ativo ORDER BY nome',
    [chave],
  )
  _perfisCache.set(chave, { perfis: rows, expires: Date.now() + 60 * 1000 })
  return rows
}

export const ERRO_PERFIL = {
  error: 'Escolhe quem está a operar («Operar como…») antes de alterar dados.',
  code: 'PERFIL_OBRIGATORIO',
}
const ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Middleware Express: define o autor do pedido para o histórico e, numa sessão
// partilhada sem perfil válido, recusa escritas. Sem sessão (dev) segue sem autor.
export function auditMiddleware() {
  return async (req, res, next) => {
    const email = req.user?.email || null
    if (!email) return next()
    const perfis = await perfisDaSessao(email).catch(() => [])
    let autor = null
    if (perfis.length > 1) {
      const pedido = req.headers['x-user-id'] || null
      autor = perfis.find(p => p.id === pedido) || null
      if (!autor && ESCRITA.has(req.method)) return res.status(428).json(ERRO_PERFIL)
    } else {
      autor = perfis[0] || null
    }
    withAuditUser(email, autor?.nome || null, () => next(), autor?.id || null)
  }
}
