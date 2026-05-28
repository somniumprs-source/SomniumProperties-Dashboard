// Stub Hono — esqueleto da funcao "users". Rotas reais entram nas fases seguintes.
import { createApp } from "../_shared/hono.ts";

const app = createApp("/users");

app.get("/_health", (c) => c.json({ ok: true, fn: "users" }));

Deno.serve(app.fetch);
