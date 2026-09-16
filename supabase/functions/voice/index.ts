// Edge Function "voice" — port do handler app.post('/api/voice/process') de server.js.
// Interpreta comandos de voz em PT via Claude e executa a accao correspondente
// no CRM. Lógica movida para ../_shared/voiceProcess.ts para poder ser chamada
// directamente por outros pontos de entrada (ex: webhook-slack), que não têm
// um utilizador Supabase autenticado para passar pelo requireAuth abaixo.
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import { processVoiceCommand } from "../_shared/voiceProcess.ts";

const app = createApp("/voice");

// Auth em codigo: o gateway verify_jwt=true aceita a anon key (publica); requireAuth
// exige um utilizador REAL (rejeita anon), como o middleware global do Render. _health isento.
app.use("*", async (c: any, next: any) => {
  if (c.req.path.endsWith("/_health")) return await next();
  return await requireAuth(c, next);
});

// ── POST /voice/process ──
app.post("/process", async (c: any) => {
  try {
    const { text, funcionario } = await c.req.json().catch(() => ({}));
    if (!text?.trim()) return c.json({ error: "Texto vazio" }, 400);
    const result = await processVoiceCommand(text, { funcionario });
    return c.json(result);
  } catch (e) { return c.json({ ok: false, error: (e as Error).message }, 500); }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "voice" }));

Deno.serve(app.fetch);
