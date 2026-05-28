// Auth Supabase JWT para Edge Functions. Sem cache em memoria entre isolates:
// verificacao local com jose (HS256 contra o JWT secret) e, em fallback, getUser.
// Replica o comportamento do middleware Express de server.js:
//  - token via header Authorization: Bearer OU ?token= (PDFs em nova janela)
//  - se nao houver service key/secret configurado, deixa passar (dev mode)
import type { Context, Next } from "@hono/hono";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://mjgusjuougzoeiyavsor.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET") || "";

const secretKey = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;
const admin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

function tokenFrom(c: Context): string | null {
  const h = c.req.header("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return c.req.query("token") || null;
}

export async function verifyToken(token: string): Promise<any | null> {
  // 1) Verificacao local rapida (HS256 com o JWT secret do projecto)
  if (secretKey) {
    try {
      const { payload } = await jwtVerify(token, secretKey);
      return payload;
    } catch { /* cai para o fallback */ }
  }
  // 2) Fallback: validar via Supabase Auth (cobre chaves de assinatura novas)
  if (admin) {
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (!error && user) return user;
  }
  return null;
}

// Middleware Hono que exige JWT valido (para dashboard, users, etc.).
export async function requireAuth(c: Context, next: Next) {
  // Dev mode: sem service key nem secret, deixa passar (como o Express)
  if (!admin && !secretKey) { await next(); return; }
  const token = tokenFrom(c);
  if (!token) return c.json({ error: "Autenticação necessária" }, 401);
  const user = await verifyToken(token);
  if (!user) return c.json({ error: "Sessão inválida" }, 401);
  c.set("user", user);
  await next();
}

// Guarda por INTERNAL_API_KEY (crons/templates/relatorios).
export function requireInternalKey(c: Context): boolean {
  const key = Deno.env.get("INTERNAL_API_KEY");
  if (!key) return true; // dev: sem key, passa
  return c.req.header("x-api-key") === key;
}
