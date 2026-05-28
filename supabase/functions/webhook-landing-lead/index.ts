// Stub Hono — esqueleto da funcao "webhook-landing-lead". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/webhook-landing-lead");

app.get("/_health", (c) => c.json({ ok: true, fn: "webhook-landing-lead" }));

Deno.serve(app.fetch);
