// Edge Function "webhook-landing-lead" — recepcao de candidaturas da landing page.
// Port verbatim do handler Express POST /api/webhook/landing-lead (server.js).
import { createApp } from "../_shared/hono.ts";
import { Investidores } from "../_shared/crud.ts";
import { sendEmail } from "../_shared/emailService.ts";
import pool from "../_shared/pg.ts";
import { registar, POLITICA_VERSAO } from "../_shared/consentimentos.ts";
import { emailApresentacaoInvestidor } from "../_shared/emailApresentacaoInvestidor.ts";
import { sendGmail } from "../_shared/gmailSend.ts";

const app = createApp("/webhook-landing-lead");

// Anti-spam: 5 submissões por IP/hora — mesma janela do dev (express-rate-limit
// não existe em Deno Edge Functions). Em memória por isolate: não é garantia
// global (vários isolates, reinício a cada deploy), mas sobe o custo de um
// flood trivial de zero para algo que já exige mais do que um script de uma
// linha, e este endpoint é público (verify_jwt=false) por natureza.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const _rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = _rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    _rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count++;
  return true;
}

// Campos do formulário vão para o HTML do email de notificação interna sem
// escaping — um lead malicioso podia injectar markup/scripts no cliente de
// email de quem recebe a notificação (somniumprs@gmail.com).
function escapeHtml(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

app.post("/", async (c) => {
  try {
    const ip = (c.req.header("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (!checkRateLimit(ip)) {
      return c.json({ ok: false, error: "Demasiadas submissões. Tente mais tarde." }, 429);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
    // Honeypot: se o campo "_hp" vier preenchido, descarta silenciosamente
    if (body._hp) return c.json({ ok: true, action: "ignored" });

    const nome = (body.nome || "").trim();
    const email = (body.email || "").trim();
    const telemovel = (body.telemovel || "").trim();
    if (!nome || !email) {
      return c.json({ ok: false, error: "Nome e email são obrigatórios" }, 400);
    }
    // RGPD (auditoria D4): sem consentimento não se trata o pedido.
    if (body.consentimento !== true) {
      return c.json({ ok: false, error: "É preciso aceitar a política de privacidade" }, 400);
    }

    const parseNum = (v: any): number | null => {
      if (v == null) return null;
      const n = parseFloat(String(v).replace(/[^\d.,]/g, "").replace(",", "."));
      return isNaN(n) ? null : n;
    };
    const capitalNum = parseNum(body.capital);
    const retornoNum = parseNum(body.retorno_total);
    const roiNum = parseNum(body.roi_anualizado);

    const today = new Date().toISOString().slice(0, 10);
    const submissaoNotas = [
      `Submissão Landing Page · ${new Date().toLocaleString("pt-PT")}`,
      `Objetivo: ${body.objetivo || "-"}`,
      `Experiência: ${body.experiencia || "-"}`,
      `Empreiteiro disponível: ${body.empreiteiro || "-"}`,
      `Retorno total pretendido: ${body.retorno_total || "-"}`,
      `ROI anualizado pretendido: ${body.roi_anualizado || "-"}`,
    ].join("\n");

    let action = "created";
    let investidorId: string | null = null;

    // Match por telemóvel (apenas se fornecido)
    if (telemovel) {
      const { rows } = await pool.query(
        "SELECT id, status, notas FROM investidores WHERE telemovel = $1 LIMIT 1",
        [telemovel],
      );
      if (rows.length > 0) {
        action = "updated";
        investidorId = rows[0].id;
        await Investidores.update(rows[0].id, {
          nome,
          email,
          capital_min: capitalNum,
          capital_max: capitalNum,
          roi_investidor: retornoNum,
          roi_anualizado_investidor: roiNum,
          origem: "Landing Page",
          status: rows[0].status, // mantém status existente
          data_ultimo_contacto: today,
        });
      }
    }

    if (action === "created") {
      const created = await Investidores.create({
        nome,
        email,
        telemovel: telemovel || null,
        status: "Pendente de Aprovação",
        origem: "Landing Page",
        capital_min: capitalNum,
        capital_max: capitalNum,
        roi_investidor: retornoNum,
        roi_anualizado_investidor: roiNum,
        data_ultimo_contacto: today,
      });
      investidorId = created.id;
    }
    // A submissão fica como nota na linha do tempo do investidor.
    if (investidorId) {
      const agoraIso = new Date().toISOString();
      await pool.query(
        "INSERT INTO investidor_interacoes (id, investidor_id, data_hora, canal, direcao, notas, created_at, updated_at) VALUES ($1, $2, $3, 'Nota', 'Nota', $4, $3, $3)",
        [crypto.randomUUID(), investidorId, agoraIso, submissaoNotas],
      ).catch((e: any) => console.error('[landing-lead] nota:', e.message));
      await registar(pool, {
        entidade: "investidor", id: investidorId, base_legal: "consentimento", origem: "Landing Page",
        prova: `Caixa «Autorizo a Somnium Properties a contactar-me e a tratar os meus dados, conforme a política de privacidade» assinalada no formulário /investir (política v${body.politica_versao || POLITICA_VERSAO}, ${agoraIso})`,
      }).catch((e: any) => console.error("[landing-lead] consentimento:", e.message));
    }

    // Apresentação da Somnium ao lead novo, para chegar à primeira chamada com
    // contexto. Fica na linha do tempo só se o envio correu bem.
    let apresentacaoEnviada = false;
    if (action === "created" && investidorId) {
      const ap = emailApresentacaoInvestidor({
        nome, objetivo: body.objetivo, experiencia: body.experiencia, capital: body.capital, empreiteiro: body.empreiteiro,
      });
      const r = await sendGmail({ to: email, subject: ap.subject, html: ap.html, text: ap.text });
      apresentacaoEnviada = r.ok;
      if (r.ok) {
        const agoraIso = new Date().toISOString();
        await pool.query(
          "INSERT INTO investidor_interacoes (id, investidor_id, data_hora, canal, direcao, notas, autor, created_at, updated_at) VALUES ($1, $2, $3, 'Email', 'Enviado', $4, 'Envio automático', $3, $3)",
          [crypto.randomUUID(), investidorId, agoraIso, `Email de apresentação da Somnium enviado para ${email}`],
        ).catch((e: any) => console.error("[landing-lead] nota apresentação:", e.message));
      } else {
        console.error("[landing-lead] email apresentação:", r.error);
        await pool.query(
          "INSERT INTO investidor_interacoes (id, investidor_id, data_hora, canal, direcao, notas, autor, created_at, updated_at) VALUES ($1, $2, $3, 'Nota', 'Nota', $4, 'Envio automático', $3, $3)",
          [crypto.randomUUID(), investidorId, new Date().toISOString(), `Email de apresentação NÃO enviado: ${r.error}`],
        ).catch((e: any) => console.error("[landing-lead] nota apresentação:", e.message));
      }
    }

    // Email de notificação para somniumprs@gmail.com
    const emailHtml = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
        <div style="border-top:3px solid #C9A84C;padding-top:18px;margin-bottom:18px;">
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:600;">Nova candidatura</h2>
          <p style="margin:0;color:#888;font-size:13px;">Landing Page · Investidores</p>
        </div>
        <p style="font-size:14px;color:#444;margin-bottom:18px;">${
      action === "created"
        ? "<strong>Novo lead criado</strong> no CRM com status <em>Pendente de Aprovação</em>."
        : "<strong>Lead existente actualizado</strong> (match por telemóvel)."
    }${
      action !== "created" ? ""
        : apresentacaoEnviada ? "<br>Email de apresentação enviado ao lead."
        : "<br><strong style=\"color:#b91c1c;\">Email de apresentação NÃO foi enviado</strong> (ver logs da função)."
    }</p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;">
          <tr><td style="padding:8px 14px 8px 0;color:#888;width:160px;">Nome</td><td style="font-weight:600;">${escapeHtml(nome)}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Email</td><td>${escapeHtml(email)}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Telemóvel</td><td>${escapeHtml(telemovel || "-")}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Objetivo</td><td>${escapeHtml(body.objetivo || "-")}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Experiência</td><td>${escapeHtml(body.experiencia || "-")}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Capital disponível</td><td>${escapeHtml(body.capital || "-")}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Empreiteiro disponível</td><td>${escapeHtml(body.empreiteiro || "-")}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Retorno total pretendido</td><td>${escapeHtml(body.retorno_total || "-")}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">ROI anualizado pretendido</td><td>${escapeHtml(body.roi_anualizado || "-")}</td></tr>
        </table>
        <hr style="margin:24px 0;border:0;border-top:1px solid #eee;">
        <p style="font-size:12px;color:#999;margin:0;">Submissão automática via formulário da landing page Somnium Properties.<br>Acesso ao CRM: <a href="https://somnium-properties-dashboard.vercel.app" style="color:#C9A84C;">Dashboard</a></p>
      </div>
    `;
    sendEmail(`Somnium · Nova candidatura: ${nome}`, emailHtml).catch((e: any) =>
      console.error("[landing-lead] erro email:", e.message)
    );

    return c.json({ ok: true, action, id: investidorId });
  } catch (e: any) {
    console.error("[landing-lead] erro:", e);
    return c.json({ ok: false, error: "Erro ao processar pedido" }, 500);
  }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "webhook-landing-lead" }));

Deno.serve(app.fetch);
