// Contexto regional. Port do middleware de src/db/routes.js (regiaoFromReq).
// Header X-Regiao tem prioridade; querystring ?regiao como fallback.
import type { Context, Next } from "@hono/hono";

export const REGIOES_VALIDAS = ["Coimbra", "AMP"];

// Tabelas com coluna `regiao` directa (filtraveis por regiao).
export const TABELAS_REGIAO = new Set(["imoveis", "negocios", "despesas", "tarefas", "visitas"]);

// Tabelas onde o filtro regional e garantia de isolamento (PUT/DELETE exige match).
export const TABELAS_ISOLADAS_REGIAO = new Set(["imoveis", "consultores", "negocios", "empreiteiros"]);

export function regiaoFromRequest(c: Context): string | null {
  const h = (c.req.header("x-regiao") || c.req.query("regiao") || "").toString().trim();
  return REGIOES_VALIDAS.includes(h) ? h : null;
}

// Middleware Hono: guarda a regiao activa em c.var.regiao
export async function regiaoMiddleware(c: Context, next: Next) {
  c.set("regiao", regiaoFromRequest(c));
  await next();
}

export function getRegiao(c: Context): string | null {
  return (c.get("regiao") as string | null) ?? null;
}
