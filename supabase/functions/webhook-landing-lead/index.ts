// Edge Function "webhook-landing-lead" — recepcao de candidaturas da landing page.
// Port verbatim do handler Express POST /api/webhook/landing-lead (server.js).
import { createApp } from "../_shared/hono.ts";
import { Investidores } from "../_shared/crud.ts";
import { sendEmail } from "../_shared/emailService.ts";
import pool from "../_shared/pg.ts";

const app = createApp("/webhook-landing-lead");

app.post("/", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
    // Honeypot: se o campo "_hp" vier preenchido, descarta silenciosamente
    if (body._hp) return c.json({ ok: true, action: "ignored" });

    const nome = (body.nome || "").trim();
    const email = (body.email || "").trim();
    const telemovel = (body.telemovel || "").trim();
    if (!nome || !email) {
      return c.json({ ok: false, error: "Nome e email são obrigatórios" }, 400);
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
        const existingNotas = rows[0].notas || "";
        const novasNotas = existingNotas
          ? `${existingNotas}\n\n--- Nova submissão Landing Page ---\n${submissaoNotas}`
          : submissaoNotas;
        await Investidores.update(rows[0].id, {
          nome,
          email,
          capital_min: capitalNum,
          capital_max: capitalNum,
          roi_investidor: retornoNum,
          roi_anualizado_investidor: roiNum,
          origem: "Landing Page",
          status: rows[0].status, // mantém status existente
          notas: novasNotas,
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
        notas: submissaoNotas,
        data_ultimo_contacto: today,
      });
      investidorId = created.id;
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
    }</p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;">
          <tr><td style="padding:8px 14px 8px 0;color:#888;width:160px;">Nome</td><td style="font-weight:600;">${nome}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Email</td><td>${email}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Telemóvel</td><td>${telemovel || "-"}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Experiência</td><td>${body.experiencia || "-"}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Capital disponível</td><td>${body.capital || "-"}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Empreiteiro disponível</td><td>${body.empreiteiro || "-"}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">Retorno total pretendido</td><td>${body.retorno_total || "-"}</td></tr>
          <tr><td style="padding:8px 14px 8px 0;color:#888;">ROI anualizado pretendido</td><td>${body.roi_anualizado || "-"}</td></tr>
        </table>
        <hr style="margin:24px 0;border:0;border-top:1px solid #eee;">
        <p style="font-size:12px;color:#999;margin:0;">Submissão automática via formulário da landing page Somnium Properties.<br>Acesso ao CRM: <a href="https://somniumproperties-dashboard.onrender.com" style="color:#C9A84C;">Dashboard</a></p>
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
