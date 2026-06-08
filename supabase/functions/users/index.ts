// Edge Function "users" — port de src/db/userRoutes.js (Express -> Hono).
// Inclui o router de utilizadores (Express /api/users) e o accessRouter
// (Express /api/acessos) registado aqui sob o prefixo /acessos.
//
// Deps: pool (pg.ts) + supabase-js (admin: getUser nao usado aqui directamente,
// mas createUser/inviteUserByEmail/generateLink/updateUserById/deleteUser sim).
//
// Os guardas de role/modulo do Express (router.use admin-only, requireRole,
// requireModule) sao replicados como middleware/verificacao no inicio dos handlers,
// preservando a semantica original (dev mode sem service key -> passa).
import { createApp } from "../_shared/hono.ts";
import pool from "../_shared/pg.ts";
import { createClient } from "@supabase/supabase-js";

// Variaveis de contexto guardadas pelos middlewares (authUser resolvido do JWT).
declare module "@hono/hono" {
  interface ContextVariableMap {
    authUser: { id?: string; email?: string };
  }
}

const app = createApp("/users");

// ── Constantes de roles/areas/modulos (port de userRoutes.js 16-47) ──
const ROLES = ["admin", "comercial", "financeiro", "operacoes", "parceiro", "investidor"];

const ROLE_AREAS: Record<string, string[]> = {
  admin: ["dashboard", "crm", "projectos", "financeiro", "operacoes", "metricas", "alertas", "admin"],
  comercial: ["dashboard", "crm", "projectos", "metricas"],
  financeiro: ["dashboard", "financeiro", "metricas"],
  operacoes: ["dashboard", "operacoes", "alertas", "metricas"],
  parceiro: ["crm", "projectos"],
  investidor: ["projectos"],
};

const ROLE_MODULES: Record<string, string[]> = {
  admin: ["crm.imoveis", "crm.investidores", "crm.consultores", "crm.empreiteiros", "crm.negocios"],
  comercial: ["crm.imoveis", "crm.investidores", "crm.consultores", "crm.empreiteiros", "crm.negocios"],
  financeiro: ["crm.negocios"],
  operacoes: [],
  parceiro: ["crm.imoveis", "crm.negocios"],
  investidor: ["crm.negocios"],
};

// Roles cujo acesso a registos e restrito pela tabela `acessos`.
const RECORD_RESTRICTED_ROLES = new Set(["parceiro", "investidor"]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://mjgusjuougzoeiyavsor.supabase.co";
const SUPABASE_SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY")) || "";
const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

// Emails que ficam SEMPRE como admin activo.
const OWNER_EMAILS = (Deno.env.get("OWNER_EMAILS") || "somniumprs@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// Cache curto (60s) de resolucao de user por email.
const _userCache = new Map<string, { user: any; expires: number }>();
const USER_CACHE_TTL_MS = 60_000;

function invalidateUserCache(email?: string | null) {
  if (email) _userCache.delete(email.toLowerCase());
  else _userCache.clear();
}

// ── Helpers ──────────────────────────────────────────────────
async function getUserByEmail(email: string) {
  const r = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
  return r.rows[0] || null;
}

async function getUserById(id: string) {
  const r = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return r.rows[0] || null;
}

// Determina o redirectTo para os links Supabase.
// Em Edge Functions nao temos req.protocol/host fiavel — usamos PUBLIC_APP_URL
// ou o host do pedido (via header) com fallback para o dominio Vercel.
function resolveRedirectTo(c: any): string {
  const publicUrl = Deno.env.get("PUBLIC_APP_URL");
  if (publicUrl) return publicUrl;
  const host = c.req.header("host");
  if (host && !host.startsWith("localhost")) {
    const proto = c.req.header("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }
  return "https://somnium-properties-dashboard.vercel.app";
}

function iniciaisFromNome(nome?: string): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Extrai o utilizador autenticado do JWT (sub/email) via supabase admin.getUser.
// Replica o req.user do middleware Express. Em dev (sem admin) devolve null.
async function getAuthUser(c: any): Promise<{ id?: string; email?: string } | null> {
  if (!supabaseAdmin) return null;
  const h = c.req.header("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7) : c.req.query("token");
  if (!token) return null;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

// Resolve o registo `users` correspondente ao utilizador autenticado.
// Port de resolveAppUser(req): usa o user do JWT em vez de req.user.
async function resolveAppUser(c: any): Promise<any | null> {
  if (!supabaseAdmin) {
    return await getUserByEmail(OWNER_EMAILS[0] || "somniumprs@gmail.com");
  }
  const authUser = c.get("authUser") ?? (await getAuthUser(c));
  if (!authUser?.email) return null;
  const email = authUser.email;
  const key = email.toLowerCase();

  const cached = _userCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.user;

  const isOwner = OWNER_EMAILS.includes(key);
  let u = await getUserByEmail(email);
  if (!u) {
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
  _userCache.set(key, { user: u, expires: Date.now() + USER_CACHE_TTL_MS });
  return u;
}

// requireRole/requireModule (port de userRoutes.js 142-181) — usados como
// verificacao inline nos handlers. Devolvem { ok, status, error, user } para
// o handler decidir o que retornar. Mantem a semantica: dev mode passa sempre.
async function requireRole(c: any, ...allowed: string[]): Promise<{ ok: boolean; status?: number; error?: string; user?: any }> {
  if (!supabaseAdmin) return { ok: true };
  try {
    const u = await resolveAppUser(c);
    if (!u) return { ok: false, status: 401, error: "Não autenticado" };
    if (!u.ativo) return { ok: false, status: 403, error: "Conta inactiva" };
    if (u.role === "admin" || allowed.includes(u.role)) return { ok: true, user: u };
    return { ok: false, status: 403, error: "Sem permissão para esta área" };
  } catch (e) {
    console.error("[requireRole]", (e as Error).message);
    // Em caso de erro inesperado, NAO bloquear (como o Express)
    return { ok: true };
  }
}

async function requireModule(c: any, module: string): Promise<{ ok: boolean; status?: number; error?: string; user?: any }> {
  if (!supabaseAdmin) return { ok: true };
  try {
    const u = await resolveAppUser(c);
    if (!u) return { ok: false, status: 401, error: "Não autenticado" };
    if (!u.ativo) return { ok: false, status: 403, error: "Conta inactiva" };
    if (u.role === "admin") return { ok: true, user: u };
    const mods = ROLE_MODULES[u.role] || [];
    if (mods.includes(module)) return { ok: true, user: u };
    return { ok: false, status: 403, error: `Sem acesso a ${module}` };
  } catch (e) {
    console.error("[requireModule]", (e as Error).message);
    return { ok: true };
  }
}

// getAccessibleIds (port de userRoutes.js 488-494) — usado pelo restrictByAccess
// no Express. Mantido como helper reutilizavel (a logica de filtro por registo
// de listagens corre no crm; aqui fica exportada a primitiva).
async function getAccessibleIds(userId: string, entidade: string): Promise<Set<string>> {
  const r = await pool.query(
    "SELECT entidade_id FROM acessos WHERE user_id = $1 AND entidade = $2",
    [userId, entidade],
  );
  return new Set(r.rows.map((x: any) => x.entidade_id));
}
void getAccessibleIds;
void RECORD_RESTRICTED_ROLES;

// ── Middleware: no-store + resolver authUser uma vez por pedido ──
app.use("*", async (c, next) => {
  const au = await getAuthUser(c);
  if (au) c.set("authUser", au);
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
});

// ── GET /users/whoami — diagnostico (port 192-205) ──
app.get("/whoami", async (c: any) => {
  try {
    const tokenPresent = !!(c.req.header("authorization") || c.req.query("token"));
    const authUser = c.get("authUser") ?? null;
    const supabaseUserEmail = authUser?.email || null;
    const u = await resolveAppUser(c);
    return c.json({
      tokenPresent,
      supabaseUserEmail,
      ownerEmails: OWNER_EMAILS,
      resolvedUser: u ? { id: u.id, email: u.email, role: u.role, ativo: u.ativo } : null,
      isOwnerEmail: supabaseUserEmail ? OWNER_EMAILS.includes(supabaseUserEmail.toLowerCase()) : false,
    });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── GET /users/me — perfil do utilizador autenticado (port 208-224) ──
app.get("/me", async (c: any) => {
  try {
    const u = await resolveAppUser(c);
    if (!u) return c.json({ error: "Não autenticado" }, 401);
    return c.json({
      id: u.id,
      email: u.email,
      nome: u.nome,
      iniciais: u.iniciais,
      cor: u.cor,
      role: u.role,
      ativo: u.ativo,
      areas: ROLE_AREAS[u.role] || [],
      modules: ROLE_MODULES[u.role] || [],
    });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Guarda admin-only para tudo abaixo (port 227-233) ──
// Replica o router.use admin-only do Express como middleware Hono que cobre
// as rotas /users (raiz), /users/:id, reset-password, magic-link e acessos.
async function requireAdmin(c: any): Promise<{ ok: boolean; user?: any }> {
  if (!supabaseAdmin) return { ok: true }; // dev mode
  const u = await resolveAppUser(c);
  if (!u || u.role !== "admin") return { ok: false };
  return { ok: true, user: u };
}

// ── GET /users — listar todos (port 236-241) ──
app.get("/", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const r = await pool.query("SELECT * FROM users ORDER BY ativo DESC, nome ASC");
    return c.json({ data: r.rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST /users — convidar novo utilizador (port 249-317) ──
app.post("/", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const { email, nome, role = "comercial", cor = "#C9A84C", password, mode } = await c.req.json().catch(() => ({}));
    if (!email || !nome) return c.json({ error: "email e nome obrigatórios" }, 400);
    if (!ROLES.includes(role)) return c.json({ error: `role inválido (${ROLES.join(", ")})` }, 400);

    let authUserId: string | null = null;
    let actionLink: string | null = null;
    let deliveryNote: string | null = null;

    if (supabaseAdmin) {
      // Investidores aterram direto na página de projectos (link mais útil).
      // Se o Supabase não tiver este redirect na allowlist, faz fallback para o
      // Site URL — autentica na raiz na mesma, nunca parte o login.
      const baseRedirect = resolveRedirectTo(c);
      const redirectTo = role === "investidor"
        ? `${(baseRedirect || "").replace(/\/$/, "")}/projectos`
        : baseRedirect;
      if (password) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) return c.json({ error: `Supabase: ${error.message}` }, 400);
        authUserId = data.user.id;
        deliveryNote = "Conta criada com password. Partilha as credenciais com a pessoa.";
      } else if (mode === "magic_link") {
        const tempPassword = `Tmp_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
        const createResult = await supabaseAdmin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
        if (createResult.error) {
          const msg = (createResult.error.message || "").toLowerCase();
          if (!msg.includes("already") && !msg.includes("registered") && !msg.includes("exist")) {
            return c.json({ error: `Criar utilizador: ${createResult.error.message}` }, 400);
          }
        } else {
          authUserId = createResult.data?.user?.id ?? null;
        }
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink", email, options: redirectTo ? { redirectTo } : undefined,
        });
        if (linkErr) return c.json({ error: `Magic link: ${linkErr.message}` }, 400);
        if (!authUserId) authUserId = linkData?.user?.id ?? null;
        actionLink = linkData?.properties?.action_link || null;
        if (!actionLink) {
          return c.json({
            error: "Supabase não devolveu action_link. Verifica que SUPABASE_SERVICE_KEY é a service_role key (não a anon).",
          }, 500);
        }
        deliveryNote = "Link de acesso gerado. Copia e envia à pessoa por email/WhatsApp.";
      } else {
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
        if (error) {
          return c.json({
            error: `Convite: ${error.message}. Sugestão: usar mode=magic_link se SMTP não estiver configurado no Supabase.`,
          }, 400);
        }
        authUserId = data.user.id;
        deliveryNote = "Convite enviado por email pelo Supabase.";
      }
    } else {
      authUserId = `local-${Date.now()}`;
      deliveryNote = "Modo dev — utilizador adicionado apenas localmente.";
    }

    const iniciais = iniciaisFromNome(nome);
    const r = await pool.query(
      `INSERT INTO users (id, email, nome, iniciais, cor, role, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, role = EXCLUDED.role, cor = EXCLUDED.cor, ativo = true
       RETURNING *`,
      [authUserId, email, nome, iniciais, cor, role],
    );
    return c.json({ ...r.rows[0], actionLink, deliveryNote }, 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── PUT /users/:id — actualizar (port 320-348) ──
app.put("/:id", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const id = c.req.param("id");
    const u = await getUserById(id);
    if (!u) return c.json({ error: "Não encontrado" }, 404);
    const { nome, role, cor, ativo } = await c.req.json().catch(() => ({}));
    if (role && !ROLES.includes(role)) return c.json({ error: `role inválido` }, 400);

    // Nao permitir despromover o ultimo admin
    if ((role && role !== "admin") || ativo === false) {
      if (u.role === "admin") {
        const r = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND ativo = true`);
        if (r.rows[0].n <= 1) return c.json({ error: "Não podes desactivar o último admin" }, 400);
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    if (nome !== undefined) {
      values.push(nome);
      fields.push(`nome = $${values.length}`);
      fields.push(`iniciais = $${values.length + 1}`);
      values.push(iniciaisFromNome(nome));
    }
    if (role !== undefined) { values.push(role); fields.push(`role = $${values.length}`); }
    if (cor !== undefined) { values.push(cor); fields.push(`cor = $${values.length}`); }
    if (ativo !== undefined) { values.push(!!ativo); fields.push(`ativo = $${values.length}`); }
    if (!fields.length) return c.json(u);
    fields.push(`updated_at = NOW()::TEXT`);
    values.push(id);
    const r = await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`, values);
    invalidateUserCache(r.rows[0]?.email);
    return c.json(r.rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE /users/:id (port 351-366) ──
app.delete("/:id", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const id = c.req.param("id");
    const u = await getUserById(id);
    if (!u) return c.json({ error: "Não encontrado" }, 404);
    if (u.role === "admin") {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND ativo = true`);
      if (r.rows[0].n <= 1) return c.json({ error: "Não podes apagar o último admin" }, 400);
    }
    if (supabaseAdmin && !u.id.startsWith("local-") && u.id !== "owner") {
      try { await supabaseAdmin.auth.admin.deleteUser(u.id); } catch (e) { console.warn("[users] supabase delete:", (e as Error).message); }
    }
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    invalidateUserCache(u.email);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST /users/:id/reset-password (port 369-381) ──
app.post("/:id/reset-password", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const u = await getUserById(c.req.param("id"));
    if (!u) return c.json({ error: "Não encontrado" }, 404);
    if (!supabaseAdmin) return c.json({ error: "Supabase não configurado" }, 503);
    const redirectTo = Deno.env.get("PUBLIC_APP_URL") || undefined;
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery", email: u.email, options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ ok: true, actionLink: data?.properties?.action_link || null });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST /users/:id/magic-link (port 384-409) ──
app.post("/:id/magic-link", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const u = await getUserById(c.req.param("id"));
    if (!u) return c.json({ error: "Não encontrado" }, 404);
    if (!supabaseAdmin) return c.json({ error: "Supabase não configurado" }, 503);
    const redirectTo = Deno.env.get("PUBLIC_APP_URL") || undefined;

    let data: any, error: any;
    ({ data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink", email: u.email, options: redirectTo ? { redirectTo } : undefined,
    }));
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("does not exist") || msg.includes("user")) {
        ({ data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "invite", email: u.email, options: redirectTo ? { redirectTo } : undefined,
        }));
      }
      if (error) return c.json({ error: error.message }, 400);
    }
    const actionLink = data?.properties?.action_link || null;
    if (!actionLink) {
      return c.json({ error: "Supabase não devolveu action_link. Verifica SUPABASE_SERVICE_KEY (deve ser a service_role key, não a anon)." }, 500);
    }
    return c.json({ ok: true, actionLink });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Acessos por registo (gestao admin) (port 414-456) ──

// GET /users/:id/acessos — listar registos a que o user tem acesso
app.get("/:id/acessos", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const r = await pool.query(
      `SELECT a.*,
        COALESCE(i.nome, n.movimento) AS nome,
        i.estado AS imovel_estado, n.fase AS negocio_fase
      FROM acessos a
      LEFT JOIN imoveis  i ON a.entidade = 'imovel'  AND i.id = a.entidade_id
      LEFT JOIN negocios n ON a.entidade = 'negocio' AND n.id = a.entidade_id
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC`,
      [c.req.param("id")],
    );
    return c.json({ data: r.rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// POST /users/:id/acessos — conceder acesso { entidade, entidade_id }
app.post("/:id/acessos", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    const { entidade, entidade_id } = await c.req.json().catch(() => ({}));
    if (!["imovel", "negocio"].includes(entidade)) return c.json({ error: "entidade inválida (imovel|negocio)" }, 400);
    if (!entidade_id) return c.json({ error: "entidade_id obrigatório" }, 400);
    const u = await getUserById(c.req.param("id"));
    if (!u) return c.json({ error: "Utilizador não encontrado" }, 404);
    const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const r = await pool.query(
      `INSERT INTO acessos (id, user_id, entidade, entidade_id, granted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, entidade, entidade_id) DO UPDATE SET created_at = NOW()::TEXT
       RETURNING *`,
      [id, u.id, entidade, entidade_id, adm.user?.id || null],
    );
    return c.json(r.rows[0], 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// DELETE /users/:userId/acessos/:acessoId — revogar
app.delete("/:userId/acessos/:acessoId", async (c: any) => {
  const adm = await requireAdmin(c);
  if (!adm.ok) return c.json({ error: "Apenas administradores" }, 403);
  try {
    await pool.query("DELETE FROM acessos WHERE id = $1 AND user_id = $2", [c.req.param("acessoId"), c.req.param("userId")]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── accessRouter (Express /api/acessos) -> /users/acessos/* (port 462-482) ──
// GET /users/acessos/:entidade/:id — quem tem acesso a um registo
app.get("/acessos/:entidade/:id", async (c: any) => {
  try {
    const entidade = c.req.param("entidade");
    const id = c.req.param("id");
    if (!["imovel", "negocio"].includes(entidade)) return c.json({ error: "entidade inválida" }, 400);
    const result = await pool.query(
      `SELECT a.id AS acesso_id, u.id AS user_id, u.nome, u.email, u.iniciais, u.cor, u.role
        FROM acessos a JOIN users u ON u.id = a.user_id
        WHERE a.entidade = $1 AND a.entidade_id = $2
        ORDER BY u.nome`,
      [entidade, id],
    );
    return c.json({ data: result.rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// Marcador: requireRole/requireModule sao usados pelo crm/dashboard quando
// integrarem os guardas; aqui sao portados para preservar a API interna.
void requireRole;
void requireModule;

app.get("/_health", (c) => c.json({ ok: true, fn: "users" }));

Deno.serve(app.fetch);
