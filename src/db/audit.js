/**
 * Audit context para audit_log (trigger Postgres em imoveis, investidores, negocios).
 *
 * O trigger le `current_setting('app.audit_user_email', true)`. Como o pool
 * partilha connections entre requests, nao podemos fazer SET persistente.
 * Solucao: AsyncLocalStorage carrega o user_email do request actual; o wrapper
 * de pool.query (em pg.js) detecta writes nas tabelas auditadas e envolve a
 * query em BEGIN / set_config('app.audit_user_email', ..., true) / COMMIT
 * para que o GUC seja local a essa transaccao apenas.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const auditCtx = new AsyncLocalStorage()
const AUDITED_RE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(imoveis|investidores|negocios)\b/i

export function withAuditUser(userEmail, fn) {
  return auditCtx.run({ userEmail: userEmail || null }, fn)
}

export function getAuditUser() {
  return auditCtx.getStore()?.userEmail || null
}

export function isAuditedQuery(text) {
  if (!text || typeof text !== 'string') return false
  return AUDITED_RE.test(text)
}

/**
 * Wrappa pool.query: se a query for write numa tabela auditada e houver
 * userEmail no contexto, executa dentro de uma transaccao com set_config local.
 * Caso contrario, delega na query original.
 */
export function installAuditedQuery(pool) {
  const original = pool.query.bind(pool)
  pool.query = async function auditedQuery(...args) {
    const userEmail = getAuditUser()
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text
    if (!userEmail || !isAuditedQuery(text)) {
      return original(...args)
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('app.audit_user_email', $1, true)`, [userEmail])
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
