// Resolução/auto-provisionamento do registo `users` a partir de um utilizador
// de auth (id + email) — partilhado entre Edge Functions para que nenhuma
// trate "esta pessoa tem um JWT válido mas ainda não tem linha em `users`"
// de forma diferente das outras. Antes disto, "users" auto-provisionava no
// primeiro login (INSERT ... ON CONFLICT DO NOTHING) mas "crm" só fazia um
// SELECT — um utilizador cujo primeiro pedido caísse no CRM (em vez de bater
// primeiro em /api/users/me, que é quem cria a linha) via `resolveCrmUser`
// devolver null, e o guard (`if (!u) return next()`) tratava isso como "sem
// Supabase configurado (dev)" em vez de "sem linha ainda" — passava sem
// NENHUMA verificação de role.
import pool from "./pg.ts";

const OWNER_EMAILS = (Deno.env.get("OWNER_EMAILS") || "somniumprs@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function iniciaisFromNome(nome?: string | null): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A equipa pode ter vários registos com o mesmo email (sessão Supabase
// partilhada — ver CLAUDE.md). Ordem determinística: admin activo > activo >
// restantes; sem isto, qual das linhas duplicadas volta é arbitrário (ordem
// física do Postgres) — dev já tinha este ORDER BY, "users" em produção não
// (divergência encontrada ao unificar isto).
export async function getUserByEmail(email: string) {
  const r = await pool.query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1)
     ORDER BY (role='admin' AND ativo)::int DESC, ativo::int DESC, created_at ASC LIMIT 1`,
    [email],
  );
  return r.rows[0] || null;
}

// Resolve o registo `users` para {id, email}; se não existir e tivermos um id
// de auth para o criar, provisiona-o (comercial inactivo, ou admin activo se
// o email estiver em OWNER_EMAILS) — mesma regra usada no primeiro login via
// GET /api/users/me. Sem `id` (ex: só temos email de outra fonte) faz apenas
// o SELECT, sem criar nada.
export async function resolveOrProvisionUser(authUser: { id?: string; email?: string } | null | undefined) {
  if (!authUser?.email) return null;
  const email = authUser.email;
  const isOwner = OWNER_EMAILS.includes(email.toLowerCase());

  let u = await getUserByEmail(email);
  if (!u && authUser.id) {
    await pool.query(
      `INSERT INTO users (id, email, nome, iniciais, role, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [authUser.id, email, email.split("@")[0], iniciaisFromNome(email), isOwner ? "admin" : "comercial", isOwner],
    );
    u = await getUserByEmail(email);
  }
  if (u && isOwner && (u.role !== "admin" || !u.ativo)) {
    await pool.query(`UPDATE users SET role = 'admin', ativo = true, updated_at = NOW()::TEXT WHERE id = $1`, [u.id]);
    u = await getUserByEmail(email);
  }
  return u;
}
