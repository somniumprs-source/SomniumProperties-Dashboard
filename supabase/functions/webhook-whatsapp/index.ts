// Edge Function "webhook-whatsapp" — recepcao Twilio (WhatsApp) + status do agente.
// Port dos handlers Express POST /api/webhook/whatsapp e GET .../status (server.js).
import { createApp } from "../_shared/hono.ts";
import { handleInboundMessage, isConfigured, validateTwilioSignature } from "../_shared/whatsappAgent.ts";

const app = createApp("/webhook-whatsapp");

// Tracking do ultimo pedido recebido no webhook (por isolate).
let lastWebhookReceived: { timestamp: string; from: string } | null = null;

// Webhook POST / (recepcao Twilio — com validacao de assinatura).
app.post("/", async (c) => {
  const p = await c.req.parseBody();
  lastWebhookReceived = { timestamp: new Date().toISOString(), from: String(p.From || "?") };

  // Validar assinatura Twilio (se configurada).
  const sig = c.req.header("x-twilio-signature");
  const webhookUrl = Deno.env.get("TWILIO_WEBHOOK_URL");
  if (webhookUrl && sig) {
    if (!(await validateTwilioSignature(webhookUrl, p as Record<string, any>, sig))) {
      console.warn("[whatsapp] Assinatura Twilio invalida — pedido rejeitado");
      return c.body("<Response></Response>", 403, { "Content-Type": "text/xml" });
    }
  }

  const from = String(p.From || "");
  let body = String(p.Body || "");
  const numMedia = parseInt(String(p.NumMedia || "0"));

  // Detectar media (audios, fotos, ficheiros) e pedir texto ao consultor.
  if (numMedia > 0) {
    const mediaType = String(p.MediaContentType0 || "");
    if (mediaType.startsWith("audio/")) {
      body = body
        ? `${body}\n[ÁUDIO RECEBIDO — pedir ao consultor para enviar por escrito]`
        : "[ÁUDIO RECEBIDO — pedir ao consultor para enviar por escrito]";
    } else if (mediaType.startsWith("image/")) {
      body = body
        ? `${body}\n[IMAGEM RECEBIDA — pedir dados por escrito ao consultor]`
        : "[IMAGEM RECEBIDA — pedir dados por escrito ao consultor]";
    } else if (!body) {
      body = "[FICHEIRO RECEBIDO — pedir dados por escrito ao consultor]";
    }
  }

  // Processar em background: responder 200 TwiML vazio ao Twilio de imediato.
  if (from && body) {
    const wu = (globalThis as any).EdgeRuntime?.waitUntil?.bind((globalThis as any).EdgeRuntime);
    const task = handleInboundMessage(from, body, true).catch((e: any) =>
      console.error("[whatsapp] Erro handleInboundMessage:", e?.message)
    );
    if (wu) wu(task);
    else await task; // local (sem EdgeRuntime): aguarda antes de responder
  }

  return c.body("<Response></Response>", 200, { "Content-Type": "text/xml" });
});

// Endpoint de status do agente WhatsApp.
app.get("/status", (c) => {
  const webhookUrl = Deno.env.get("TWILIO_WEBHOOK_URL");
  const googleConfigured = !!(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_REFRESH_TOKEN"));
  return c.json({
    agente_activo: isConfigured(),
    twilio: {
      sid: !!Deno.env.get("TWILIO_ACCOUNT_SID"),
      token: !!Deno.env.get("TWILIO_AUTH_TOKEN"),
      number: Deno.env.get("TWILIO_WHATSAPP_NUMBER") || null,
      webhook_url: webhookUrl || "NAO CONFIGURADO — definir TWILIO_WEBHOOK_URL",
    },
    anthropic: !!Deno.env.get("ANTHROPIC_API_KEY"),
    google_oauth: googleConfigured,
    ultimo_webhook: lastWebhookReceived || "Nenhum pedido recebido desde o ultimo restart",
    instrucoes: !webhookUrl
      ? "Configurar no Twilio Console: Sandbox Settings → When a message comes in → https://somniumproperties-dashboard.onrender.com/api/webhook/whatsapp (HTTP POST)"
      : null,
  });
});

app.get("/_health", (c) => c.json({ ok: true, fn: "webhook-whatsapp" }));

Deno.serve(app.fetch);
