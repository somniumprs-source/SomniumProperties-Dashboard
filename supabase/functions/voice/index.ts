// Stub Hono — esqueleto da funcao "voice". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/voice");

app.get("/_health", (c) => c.json({ ok: true, fn: "voice" }));

Deno.serve(app.fetch);
