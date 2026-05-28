// Stub Hono — esqueleto da funcao "calendar". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/calendar");

app.get("/_health", (c) => c.json({ ok: true, fn: "calendar" }));

Deno.serve(app.fetch);
