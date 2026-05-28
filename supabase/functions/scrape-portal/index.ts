// Stub Hono — esqueleto da funcao "scrape-portal". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/scrape-portal");

app.get("/_health", (c) => c.json({ ok: true, fn: "scrape-portal" }));

Deno.serve(app.fetch);
