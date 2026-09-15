// Factory Hono partilhada: CORS, JSON de erro consistente e basePath.
// Cada Edge Function e servida em /<nome-da-funcao>/... pelo Supabase, por isso
// usamos basePath com o nome da funcao para os sufixos baterem certo com os
// mounts Express antigos (ex: Express /api/crm/imoveis -> Hono /imoveis sob basePath /crm).
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";

// Antes reflectia QUALQUER origem (`origin ?? "*"`) com credentials:true — na
// prática inofensivo enquanto a auth for só Bearer token (sem cookies, um
// site de terceiros não tem o token da vítima para anexar), mas uma
// configuração frágil: se algum dia entrar um caminho autenticado por cookie
// (ou um browser tratar `credentials:'include'` de outra forma), deixa de
// haver rede de segurança nenhuma. Lista fixa + padrão dos previews Vercel do
// próprio projecto, com extensão opcional via env var para novos domínios
// (ex.: domínio próprio) sem precisar de novo deploy.
const STATIC_ALLOWED_ORIGINS = new Set([
  "https://somnium-properties-dashboard.vercel.app",
]);
const EXTRA_ALLOWED_ORIGINS = (Deno.env.get("CORS_ALLOWED_ORIGINS") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
for (const o of EXTRA_ALLOWED_ORIGINS) STATIC_ALLOWED_ORIGINS.add(o);
const VERCEL_PREVIEW_RE = /^https:\/\/somnium-properties-dashboard-[a-z0-9-]+\.vercel\.app$/;
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string): boolean {
  return STATIC_ALLOWED_ORIGINS.has(origin) || VERCEL_PREVIEW_RE.test(origin) || LOCALHOST_RE.test(origin);
}
// Variante sem localhost — usada para validar destinos de redirect (links de
// email de recovery/convite): um link enviado por email nunca deve apontar
// para localhost, mesmo que o pedido que o gerou tenha vindo de lá em dev.
export function isAllowedRedirectOrigin(origin: string): boolean {
  return (STATIC_ALLOWED_ORIGINS.has(origin) || VERCEL_PREVIEW_RE.test(origin)) && !LOCALHOST_RE.test(origin);
}

export function createApp(basePath: string) {
  const app = new Hono().basePath(basePath);

  app.use("*", cors({
    origin: (origin) => (origin && isAllowedOrigin(origin)) ? origin : undefined,
    allowHeaders: ["Authorization", "Content-Type", "X-Regiao", "X-Api-Key", "X-User-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400, // cacheia o preflight 24h — evita um OPTIONS por cada GET de documento/lista
  }));

  app.onError((err, c) => {
    console.error(`[${basePath}] erro:`, err?.message);
    return c.json({ error: err?.message || "Erro interno" }, 500);
  });

  return app;
}

export { Hono };
