/**
 * Autor das alterações para historico_alteracoes (trigger Postgres nas
 * entidades de negócio — ver migração 0077).
 * Equivalente a src/db/audit.js do servidor Express.
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
import { AsyncLocalStorage } from "node:async_hooks";
import pool from "./pg.ts";

type Autor = { userEmail: string | null; userNome: string | null; userId: string | null };

const auditCtx = new AsyncLocalStorage<Autor>();

// Manter em sync com a migração 0077 e com src/db/audit.js.
export const TABELAS_AUDITADAS = [
  "imoveis", "investidores", "negocios",
  "consultores", "parceiros", "empreiteiros",
  "despesas", "tarefas", "visitas", "analises", "orcamentos_obra",
  "projeto_fases", "projeto_tarefas", "projeto_investidores", "projeto_documentos", "projeto_fracoes",
  "documentos_investidor", "consultor_documentos",
  "imovel_follow_ups", "consultor_followups",
  "investidor_interacoes", "consultor_interacoes", "parceiro_interacoes",
  "users", "acessos",
];
const AUDITED_RE = new RegExp(`\\b(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(${TABELAS_AUDITADAS.join("|")})\\b`, "i");

export function withAuditUser<T>(
  userEmail: string | null | undefined,
  userNome: string | null | undefined,
  fn: () => T,
  userId?: string | null,
): T {
  return auditCtx.run({ userEmail: userEmail || null, userNome: userNome || null, userId: userId || null }, fn);
}

export function getAuditUser(): Autor {
  return auditCtx.getStore() || { userEmail: null, userNome: null, userId: null };
}

export function isAuditedQuery(text: any): boolean {
  if (!text || typeof text !== "string") return false;
  return AUDITED_RE.test(text);
}

const temAutor = (a: Autor) => !!(a.userEmail || a.userNome || a.userId);

// deno-lint-ignore no-explicit-any
async function aplicarAutor(query: (...a: any[]) => Promise<any>, a: Autor) {
  await query(
    `SELECT set_config('app.audit_user_email', $1, true), set_config('app.audit_user_nome', $2, true), set_config('app.audit_user_id', $3, true)`,
    [a.userEmail || "", a.userNome || "", a.userId || ""],
  );
}

let _installed = false;
export function installAuditedQuery(): void {
  if (_installed) return;
  _installed = true;
  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);

  // Transações abertas pelo código: o autor entra logo a seguir ao BEGIN.
  // deno-lint-ignore no-explicit-any
  (pool as any).connect = async function auditedConnect(...args: any[]) {
    if (typeof args[0] === "function") return originalConnect(...args);
    const client = await originalConnect();
    if (!client.__autorInstalado) {
      const q = client.query.bind(client);
      // deno-lint-ignore no-explicit-any
      client.query = async (...qa: any[]) => {
        const r = await q(...qa);
        const text = typeof qa[0] === "string" ? qa[0] : qa[0]?.text;
        const a = getAuditUser();
        if (temAutor(a) && typeof text === "string" && /^\s*BEGIN\b/i.test(text)) await aplicarAutor(q, a);
        return r;
      };
      client.__autorInstalado = true;
    }
    return client;
  };

  // deno-lint-ignore no-explicit-any
  (pool as any).query = async function auditedQuery(...args: any[]) {
    const a = getAuditUser();
    const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
    if (!temAutor(a) || !isAuditedQuery(text)) return originalQuery(...args);
    const client = await originalConnect();
    try {
      await client.query("BEGIN");
      await aplicarAutor(client.query.bind(client), a);
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

// ── Autor do pedido ─────────────────────────────────────────────

const _perfisCache = new Map<string, { perfis: { id: string; nome: string }[]; expires: number }>();

// Perfis ativos de uma sessão (users com este email). Mais de um = sessão partilhada.
export async function perfisDaSessao(email: string | null | undefined): Promise<{ id: string; nome: string }[]> {
  if (!email) return [];
  const chave = email.toLowerCase();
  const e = _perfisCache.get(chave);
  if (e && e.expires > Date.now()) return e.perfis;
  const { rows } = await pool.query(
    "SELECT id, nome FROM users WHERE LOWER(email) = $1 AND ativo ORDER BY nome",
    [chave],
  );
  _perfisCache.set(chave, { perfis: rows, expires: Date.now() + 60 * 1000 });
  return rows;
}

export const ERRO_PERFIL = {
  error: "Escolhe quem está a operar («Operar como…») antes de alterar dados.",
  code: "PERFIL_OBRIGATORIO",
};
const ESCRITA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Middleware Hono: define o autor do pedido para o histórico e, numa sessão
// partilhada sem perfil válido, recusa escritas. emailDoPedido devolve o
// email da sessão (null em dev ou sem sessão: segue sem autor).
// deno-lint-ignore no-explicit-any
export function auditMiddleware(emailDoPedido: (c: any) => Promise<string | null> | string | null) {
  // deno-lint-ignore no-explicit-any
  return async (c: any, next: any) => {
    let email: string | null = null;
    try { email = (await emailDoPedido(c)) || null; } catch { /* sem sessão */ }
    if (!email) return await next();
    const perfis = await perfisDaSessao(email).catch(() => []);
    let autor: { id: string; nome: string } | null = null;
    if (perfis.length > 1) {
      const pedido = c.req.header("x-user-id") || null;
      autor = perfis.find((p) => p.id === pedido) || null;
      if (!autor && ESCRITA.has(c.req.method)) return c.json(ERRO_PERFIL, 428);
    } else {
      autor = perfis[0] || null;
    }
    await withAuditUser(email, autor?.nome || null, () => next(), autor?.id || null);
  };
}
