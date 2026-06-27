// Factory Hono partilhada: CORS, JSON de erro consistente e basePath.
// Cada Edge Function e servida em /<nome-da-funcao>/... pelo Supabase, por isso
// usamos basePath com o nome da funcao para os sufixos baterem certo com os
// mounts Express antigos (ex: Express /api/crm/imoveis -> Hono /imoveis sob basePath /crm).
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";

export function createApp(basePath: string) {
  const app = new Hono().basePath(basePath);

  app.use("*", cors({
    origin: (origin) => origin ?? "*", // reflecte a origem (frontend fora do Supabase)
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
