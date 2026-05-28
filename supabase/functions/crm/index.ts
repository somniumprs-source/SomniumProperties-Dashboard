// Stub Hono — esqueleto da funcao "crm". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/crm");

app.get("/_health", (c) => c.json({ ok: true, fn: "crm" }));

Deno.serve(app.fetch);
