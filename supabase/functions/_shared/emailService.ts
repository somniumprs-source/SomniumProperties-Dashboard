// Email service para Edge Functions. Port de src/db/emailService.js.
// nodemailer (SMTP) nao porta para Deno -> reescrito sobre a API HTTP do Resend,
// mantendo a MESMA assinatura: sendEmail(subject, html, textOrOpts), isConfigured().
//
// Env: RESEND_API_KEY, EMAIL_FROM (remetente verificado no Resend), EMAIL_TO (default).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "";
const EMAIL_TO = Deno.env.get("EMAIL_TO") || "";

export function isConfigured(): boolean {
  return !!(RESEND_API_KEY && EMAIL_FROM && EMAIL_TO);
}

interface Attachment {
  filename: string;
  // Resend aceita 'content' base64 (string) ou 'path' (URL publica).
  content?: string;
  path?: string;
}
interface SendOpts {
  to?: string | string[];
  text?: string;
  attachments?: Attachment[];
}

type EmailResult = { ok: boolean; messageId?: string; error?: string };

// sendEmail(subject, html) | sendEmail(subject, html, "texto") | sendEmail(subject, html, { to, text, attachments })
export async function sendEmail(
  subject: string,
  html: string,
  textOrOpts?: string | SendOpts,
): Promise<EmailResult> {
  if (!isConfigured()) {
    console.warn("[email] Resend nao configurado — email nao enviado");
    return { ok: false, error: "Resend nao configurado" };
  }

  let to: string | string[] = EMAIL_TO;
  let text: string | undefined;
  let attachments: Attachment[] | undefined;
  if (typeof textOrOpts === "string") {
    text = textOrOpts;
  } else if (textOrOpts && typeof textOrOpts === "object") {
    to = textOrOpts.to || EMAIL_TO;
    text = textOrOpts.text;
    attachments = textOrOpts.attachments;
  }

  const body: Record<string, unknown> = {
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ""),
  };
  if (attachments && attachments.length > 0) body.attachments = attachments;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j as any)?.message || `HTTP ${r.status}`;
      console.error("[email] Resend erro:", msg);
      return { ok: false, error: msg };
    }
    const messageId = (j as any)?.id;
    console.log("[email] Enviado:", subject, "->", to, messageId);
    return { ok: true, messageId };
  } catch (e) {
    console.error("[email] Erro:", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}
