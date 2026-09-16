// Edge Function "webhook-slack" — recepção de eventos do canal Slack da equipa.
// Port verbatim do handler Express POST /api/webhook/slack (server.js).
// Mensagens que começam por "TAREFA-..." criam uma tarefa na agenda (via
// ../_shared/voiceProcess.ts, chamado directamente — sem HTTP interno, porque
// a função "voice" exige um utilizador Supabase autenticado que este webhook
// servidor-a-servidor não tem). Todas as mensagens ficam também em
// slack_mensagens para alimentar o relatório diário (cron-relatorio-diario-slack).
import { createApp } from "../_shared/hono.ts";
import pool from "../_shared/pg.ts";
import { verifySlackSignature, resolveSlackUserName } from "../_shared/slackVerify.ts";
import { processVoiceCommand } from "../_shared/voiceProcess.ts";

const app = createApp("/webhook-slack");

const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") || "";
const SLACK_CHANNEL_ID = Deno.env.get("SLACK_CHANNEL_ID") || "";
const TRIGGER_RE = /^TAREFA[\s:\-]+(.+)$/is;

app.post("/", async (c) => {
  try {
    const rawBody = await c.req.text();
    const body = JSON.parse(rawBody || "{}");

    // Passo de configuração do Slack: responder o challenge de imediato.
    if (body.type === "url_verification") {
      return c.json({ challenge: body.challenge });
    }

    const signature = c.req.header("x-slack-signature") || "";
    const timestamp = c.req.header("x-slack-request-timestamp") || "";
    const ok = await verifySlackSignature({ signingSecret: SLACK_SIGNING_SECRET, signature, timestamp, rawBody });
    if (!ok) return c.json({ ok: false, error: "Assinatura inválida" }, 401);

    const event = body.event || {};
    if (event.type !== "message" || event.subtype || event.bot_id) {
      return c.json({ ok: true, action: "ignored" });
    }
    if (SLACK_CHANNEL_ID && event.channel !== SLACK_CHANNEL_ID) {
      return c.json({ ok: true, action: "ignored_channel" });
    }

    const texto = (event.text || "").trim();
    const userName = await resolveSlackUserName(event.user);

    const { rows: [inserted] } = await pool.query(
      `INSERT INTO slack_mensagens (id, slack_event_id, channel_id, user_id, user_name, texto, ts, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (slack_event_id) DO NOTHING
       RETURNING id`,
      [crypto.randomUUID(), body.event_id || null, event.channel, event.user, userName, texto, event.ts, new Date().toISOString()],
    );
    if (!inserted) return c.json({ ok: true, action: "duplicate" });

    const match = texto.match(TRIGGER_RE);
    if (match) {
      const result = await processVoiceCommand(match[1].trim(), { funcionario: userName });
      await pool.query(
        "UPDATE slack_mensagens SET is_trigger_tarefa = true, tarefa_id = $1 WHERE id = $2",
        [result?.tarefa_id || null, inserted.id],
      );
    }

    return c.json({ ok: true });
  } catch (e) {
    console.error("[webhook-slack] erro:", (e as Error).message);
    return c.json({ ok: false, error: "Erro ao processar evento" }, 500);
  }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "webhook-slack" }));

Deno.serve(app.fetch);
