/**
 * Audit context para historico_alteracoes (trigger Postgres em imoveis, investidores, negocios).
 *
 * O trigger le `current_setting('app.audit_user_email', true)` e
 * `current_setting('app.audit_user_nome', true)`. Como o pool partilha
 * connections entre requests, nao podemos fazer SET persistente. Solucao:
 * AsyncLocalStorage carrega o email + nome do request actual; o wrapper de
 * pool.query (em pg.js) detecta writes nas tabelas auditadas e envolve a query
 * em BEGIN / set_config / COMMIT para que os GUC sejam locais a essa transaccao.
 *
 * Nome: a equipa partilha sessao Supabase (mesmo email), por isso o frontend
 * envia X-User-Id e o middleware resolve para o nome do perfil activo.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const auditCtx = new AsyncLocalStorage()
const AUDITED_RE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(imoveis|investidores|negocios)\b/i

export function withAuditUser(userEmail, userNome, fn) {
  return auditCtx.run({ userEmail: userEmail || null, userNome: userNome || null }, fn)
}

export function getAuditUser() {
  return auditCtx.getStore() || { userEmail: null, userNome: null }
}

export function isAuditedQuery(text) {
  if (!text || typeof text !== 'string') return false
  return AUDITED_RE.test(text)
}

export function installAuditedQuery(pool) {
  const original = pool.query.bind(pool)
  pool.query = async function auditedQuery(...args) {
    const { userEmail, userNome } = getAuditUser()
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text
    if (!userEmail && !userNome) return original(...args)
    if (!isAuditedQuery(text)) return original(...args)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('app.audit_user_email', $1, true)`, [userEmail || ''])
      await client.query(`SELECT set_config('app.audit_user_nome', $1, true)`, [userNome || ''])
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
