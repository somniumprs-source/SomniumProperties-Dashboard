// Stub Hono — esqueleto da funcao "dashboard". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/dashboard");

app.get("/_health", (c) => c.json({ ok: true, fn: "dashboard" }));

Deno.serve(app.fetch);
