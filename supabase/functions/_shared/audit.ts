/**
 * Audit context para historico_alteracoes (trigger Postgres em imoveis, investidores, negocios).
 * Equivalente a src/db/audit.js do servidor Express.
 *
 * Em Deno usamos AsyncLocalStorage tambem (disponivel via node:async_hooks).
 * O trigger PG le current_setting('app.audit_user_email', true) e
 * current_setting('app.audit_user_nome', true). Quando a query for write numa
 * tabela auditada, envolvemos em BEGIN / set_config local / COMMIT.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import pool from "./pg.ts";

const auditCtx = new AsyncLocalStorage<{ userEmail: string | null; userNome: string | null }>();
const AUDITED_RE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(imoveis|investidores|negocios)\b/i;

export function withAuditUser<T>(
  userEmail: string | null | undefined,
  userNome: string | null | undefined,
  fn: () => T,
): T {
  return auditCtx.run({ userEmail: userEmail || null, userNome: userNome || null }, fn);
}

export function getAuditUser(): { userEmail: string | null; userNome: string | null } {
  return auditCtx.getStore() || { userEmail: null, userNome: null };
}

export function isAuditedQuery(text: any): boolean {
  if (!text || typeof text !== "string") return false;
  return AUDITED_RE.test(text);
}

let _installed = false;
export function installAuditedQuery(): void {
  if (_installed) return;
  _installed = true;
  const original = pool.query.bind(pool);
  // deno-lint-ignore no-explicit-any
  (pool as any).query = async function auditedQuery(...args: any[]) {
    const { userEmail, userNome } = getAuditUser();
    const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
    if (!userEmail && !userNome) return original(...args);
    if (!isAuditedQuery(text)) return original(...args);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.audit_user_email', $1, true)`, [userEmail || ""]);
      await client.query(`SELECT set_config('app.audit_user_nome', $1, true)`, [userNome || ""]);
      // deno-lint-ignore no-explicit-any
      const result = await (client.query as any)(...args);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  };
}

installAuditedQuery();
