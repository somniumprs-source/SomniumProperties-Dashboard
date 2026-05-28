// Stub Hono — esqueleto da funcao "webhook-whatsapp". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/webhook-whatsapp");

app.get("/_health", (c) => c.json({ ok: true, fn: "webhook-whatsapp" }));

Deno.serve(app.fetch);
