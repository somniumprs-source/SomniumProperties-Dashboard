/**
 * Cron Jobs — Follow-up automático + Relatórios com email.
 * Port de src/db/cronJobs.js para Edge Functions (Deno).
 * Todos os horários em Europe/Lisbon (a agenda passa para pg_cron; aqui só a lógica).
 */
import pool from "../_shared/pg.ts";
import { isConfigured as whatsappConfigured, sendWhatsApp } from "./whatsappAgent.ts";
import { isConfigured as emailConfigured, sendEmail } from "./emailService.ts";
import { generateRelatorioAcompanhamento } from "./pdfProjectoFixFlip.ts";
import { streamToBuffer } from "./pdfkitGuard.ts";
import { uploadPublic } from "./storage.ts";
import Anthropic from "@anthropic-ai/sdk";

// ── Follow-up config por classe ─────────────────────────────
const FOLLOWUP_RULES: Record<string, { dias: number[]; canal: string }> = {
  A: { dias: [7, 10, 15], canal: "chamada" },
  B: { dias: [10, 15], canal: "chamada" },
  C: { dias: [15], canal: "whatsapp_auto" },
  D: { dias: [15], canal: "whatsapp_auto" },
};

// ── Templates de reactivação por região ──────────────────────
const ZONAS_INTERESSE: Record<string, string> = {
  Coimbra: "concelho de Coimbra, zona central de Condeixa-a-Nova e Ventosa do Bairro (Mealhada)",
  AMP:
    "Porto (Bonfim, Campanhã, Cedofeita, Paranhos), Vila Nova de Gaia (Santa Marinha, Mafamude, Canidelo) e Santa Maria da Feira",
};
function zonasDeInteresse(regiao: string) {
  return ZONAS_INTERESSE[regiao] || ZONAS_INTERESSE.Coimbra;
}

const REACTIVATION_TEMPLATE = (nome: string, regiao = "Coimbra") => {
  const primeiroNome = nome.split(" ")[0];
  const zonaRegiao = regiao === "AMP" ? "na Área Metropolitana do Porto" : "na zona de Coimbra";
  return `Boa tarde ${primeiroNome}, sou o Alexandre Mendes da Somnium Properties.

Mudei recentemente de contacto e estou a retomar a comunicação com consultores com quem já trabalhei ou que operam ${zonaRegiao}.

Investimos em imóveis com potencial de valorização. Compramos directamente, renovamos e recolocamos no mercado. Trabalhamos com consultores como parceiros de negócio e valorizamos quem nos apresenta boas oportunidades.

*O que procuramos:*
• Imóveis com margem de negociação, construção anterior a 2000 ou que precisem de obras
• Proprietário com motivação concreta para vender (herança, emigração, divórcio, dificuldades financeiras)
• Questões de licenciamento ou documentação não são impedimento
• Zonas: ${zonasDeInteresse(regiao)}
• Valor máximo de aquisição: 250.000€

Quando encontramos o imóvel certo, avançamos com rapidez e sem burocracia.

Se cruzar com algo neste perfil, basta responder aqui. Cumprimentos.`;
};

// ── Helper Twilio (template aprovado) ────────────────────────
// O original usava o SDK twilio directo para enviar contentSid (template).
// sendWhatsApp do whatsappAgent só envia texto livre, por isso esta chamada
// REST replica o envio de template (contentSid + contentVariables) via API Twilio.
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_NUMBER = Deno.env.get("TWILIO_WHATSAPP_NUMBER") || "";

async function sendWhatsAppTemplate(to: string, contentSid: string, variables: Record<string, string>) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_NUMBER) {
    throw new Error("Twilio não configurado");
  }
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const form = new URLSearchParams();
  form.set("From", TWILIO_NUMBER.startsWith("whatsapp:") ? TWILIO_NUMBER : `whatsapp:${TWILIO_NUMBER}`);
  form.set("To", to.startsWith("whatsapp:") ? to : `whatsapp:${to.replace(/\s/g, "")}`);
  form.set("ContentSid", contentSid);
  form.set("ContentVariables", JSON.stringify(variables));
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((json as any)?.message || `Twilio HTTP ${resp.status}`);
  return (json as any).sid as string;
}

// ── JOB 1: Follow-up diário (08:00 Europe/Lisbon) ──────────
async function runFollowUp() {
  console.log("[cron] Follow-up diário — a correr");
  try {
    const { rows: consultores } = await pool.query(
      "SELECT * FROM consultores WHERE estado_avaliacao != 'Inativo' AND controlo_manual = false",
    );
    const { rows: interacoes } = await pool.query(
      "SELECT consultor_id, MAX(data_hora) as ultima FROM consultor_interacoes GROUP BY consultor_id",
    );
    const ultimaInteracao: Record<string, Date> = {};
    for (const i of interacoes) ultimaInteracao[i.consultor_id] = new Date(i.ultima);

    const now = new Date();
    let enviadosAuto = 0, tarefasCriadas = 0;

    for (const c of consultores) {
      const classe = c.classificacao || "D";
      const rules = FOLLOWUP_RULES[classe];
      if (!rules) continue;

      // Calcular dias desde último contacto
      const ultima = ultimaInteracao[c.id] || (c.updated_at ? new Date(c.updated_at) : new Date(c.created_at));
      const diasSem = Math.floor((now.getTime() - ultima.getTime()) / 86400000);

      // Verificar se está na janela de follow-up
      const needsFollowUp = rules.dias.some((d) => diasSem >= d);
      if (!needsFollowUp) continue;

      // Verificar se já houve follow-up recente (últimas 48h)
      const { rows: [recentFU] } = await pool.query(
        "SELECT id FROM consultor_interacoes WHERE consultor_id = $1 AND direcao = 'Enviado' AND data_hora > $2",
        [c.id, new Date(now.getTime() - 48 * 3600000).toISOString()],
      );
      if (recentFU) continue;

      const canal = c.canal_followup || rules.canal;

      if (canal === "whatsapp_auto" && c.contacto && whatsappConfigured()) {
        // Gerar mensagem via Claude API
        const { rows: hist } = await pool.query(
          "SELECT direcao, notas, data_hora FROM consultor_interacoes WHERE consultor_id = $1 ORDER BY data_hora DESC LIMIT 5",
          [c.id],
        );
        const histText = hist.reverse().map((h: any) => `${h.direcao}: ${h.notas}`).join("\n");

        let msg: string | undefined;
        try {
          const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
          const resp = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 300,
            system:
              `És o Alexandre da Somnium Properties. Escreve uma mensagem curta (max 3 linhas) de follow-up para um consultor imobiliário. Tom: profissional mas acessível. Objectivo: perguntar se tem imóveis novos para partilhar. Nunca "conforme" ou "relativamente". Sê directo.`,
            messages: [{
              role: "user",
              content:
                `Consultor: ${c.nome}\nÚltimo contacto: há ${diasSem} dias\nHistórico:\n${histText || "(sem histórico)"}\n\nEscreve APENAS a mensagem (sem JSON, sem explicação).`,
            }],
          });
          msg = (resp.content[0] as any)?.text?.trim();
        } catch {
          {
            const regiaoConsultor = c.regiao === "AMP" ? "no Porto, Gaia e arredores" : "em Coimbra e arredores";
            msg =
              `Olá ${c.nome}, tudo bem? Alguma novidade de imóveis que possam encaixar no nosso perfil? Estamos à procura de oportunidades com margem negocial ${regiaoConsultor}.`;
          }
        }

        // Enviar via template aprovado (necessario para primeira mensagem)
        const templateSids = {
          geral: "HXa7c0a58c493495883965a44988542916",
          reminder: "HXacd7d45a76226a7f10619a3878669c13",
          inativo: "HXac84ceb95bbd70a8d2c492c3a7f08c53",
        };
        const templateSid = diasSem > 30
          ? templateSids.inativo
          : diasSem > 15
          ? templateSids.reminder
          : templateSids.geral;
        const firstName = (c.nome || "").split(" ")[0];
        try {
          const to = c.contacto.startsWith("whatsapp:") ? c.contacto : `whatsapp:${c.contacto.replace(/\s/g, "")}`;
          await sendWhatsAppTemplate(to, templateSid, { "1": firstName });
        } catch (templateErr) {
          console.warn("[cron] Template falhou, tentando texto livre:", (templateErr as Error).message);
          await sendWhatsApp(c.contacto, msg || "");
        }
        await pool.query(
          "INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)",
          [crypto.randomUUID(), c.id, now.toISOString(), "whatsapp", "Enviado", `[FOLLOW-UP AUTO] ${msg}`],
        );
        enviadosAuto++;
      } else {
        // Criação de tarefa manual desactivada (gerava ruído no CRM com classe D
        // quando whatsappConfigured() era false). Reactivar apenas para A/B.
      }

      // Actualizar próximo follow-up
      const proximoDias = rules.dias[0];
      const proximo = new Date(now.getTime() + proximoDias * 86400000);
      await pool.query(
        "UPDATE consultores SET data_proximo_follow_up = $1, updated_at = $2 WHERE id = $3",
        [proximo.toISOString().slice(0, 10), now.toISOString(), c.id],
      );
    }

    console.log(`[cron] Follow-up: ${enviadosAuto} auto WhatsApp, ${tarefasCriadas} tarefas manuais`);
  } catch (e) {
    console.error("[cron] Erro follow-up:", (e as Error).message);
  }
}

// ── JOB 2: Relatório diário Pré-aprovação (19:00) ──────────
async function runRelatorioDiario() {
  console.log("[cron] Relatório diário Pré-aprovação — a gerar");
  try {
    const now = new Date();
    const ontem = new Date(now.getTime() - 24 * 3600000).toISOString();

    const { rows: preAprovacao } = await pool.query(
      "SELECT i.*, c.nome as consultor_nome FROM imoveis i LEFT JOIN consultores c ON LOWER(i.nome_consultor) = LOWER(c.nome) WHERE i.estado = 'Pré-aprovação' ORDER BY i.created_at DESC",
    );
    const novos = preAprovacao.filter((i: any) => i.created_at > ontem);
    const pendentes48h = preAprovacao.filter((i: any) => {
      const h = (now.getTime() - new Date(i.created_at).getTime()) / 3600000;
      return h > 48;
    });

    // Contar acumulado da semana
    const inicioSemana = new Date(now);
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    const { rows: [semana] } = await pool.query(
      "SELECT COUNT(*) as c FROM imoveis WHERE estado = 'Pré-aprovação' AND created_at >= $1",
      [inicioSemana.toISOString()],
    );

    const report = {
      tipo: "diario_pre_aprovacao",
      gerado_em: now.toISOString(),
      data: now.toISOString().slice(0, 10),
      total_pre_aprovacao: preAprovacao.length,
      novos_hoje: novos.length,
      pendentes_48h: pendentes48h.length,
      acumulado_semana: parseInt(semana.c),
      imoveis_novos: novos.map((i: any) => ({
        nome: i.nome,
        tipologia: i.tipologia,
        zona: i.zona,
        ask_price: i.ask_price,
        tipo_oportunidade: i.tipo_oportunidade,
        consultor: i.nome_consultor,
        link: i.link,
        notas: i.notas?.slice(0, 200),
        data_entrada: i.created_at,
      })),
      imoveis_pendentes_48h: pendentes48h.map((i: any) => ({
        nome: i.nome,
        horas: Math.round((now.getTime() - new Date(i.created_at).getTime()) / 3600000),
        consultor: i.nome_consultor,
      })),
    };

    // Guardar relatório na DB
    await pool.query(
      `CREATE TABLE IF NOT EXISTS relatorios (id TEXT PRIMARY KEY, tipo TEXT, data TEXT, dados JSONB, created_at TEXT DEFAULT (NOW()::TEXT))`,
    );
    await pool.query(
      "INSERT INTO relatorios (id, tipo, data, dados) VALUES ($1, $2, $3, $4)",
      [crypto.randomUUID(), "diario_pre_aprovacao", now.toISOString().slice(0, 10), JSON.stringify(report)],
    );

    // Enviar email
    if (emailConfigured()) {
      const subject = `Somnium — Relatório Pré-aprovação ${now.toISOString().slice(0, 10)}`;
      const html = `
        <h2 style="color:#C9A84C;">Relatório Diário — Pré-aprovação</h2>
        <p><strong>${novos.length}</strong> imóveis novos hoje · <strong>${preAprovacao.length}</strong> total em pré-aprovação · <strong>${pendentes48h.length}</strong> pendentes há +48h</p>
        ${
        novos.length > 0
          ? `<h3>Novos hoje:</h3><ul>${
            novos.map((i: any) =>
              `<li><strong>${i.nome}</strong> — ${i.zona || "?"} · ${i.ask_price ? i.ask_price + "€" : "?"} · ${
                i.tipo_oportunidade || "?"
              } · Consultor: ${i.nome_consultor || "?"}</li>`
            ).join("")
          }</ul>`
          : ""
      }
        ${
        pendentes48h.length > 0
          ? `<h3 style="color:red;">⚠️ Pendentes há +48h:</h3><ul>${
            pendentes48h.map((i: any) =>
              `<li>${i.nome} — ${
                Math.round((now.getTime() - new Date(i.created_at).getTime()) / 3600000)
              }h sem decisão</li>`
            ).join("")
          }</ul>`
          : ""
      }
        <p>Acumulado da semana: <strong>${semana.c}</strong></p>
        <hr><p style="font-size:11px;color:#999;">Ver relatório completo no CRM → Consultores → Relatório</p>
      `;
      await sendEmail(subject, html);
    }

    console.log(
      `[cron] Relatório diário: ${novos.length} novos, ${preAprovacao.length} total, ${pendentes48h.length} pendentes`,
    );
  } catch (e) {
    console.error("[cron] Erro relatório diário:", (e as Error).message);
  }
}

// ── JOB 3: Relatório semanal consultores (Domingo 09:00) ────
async function runRelatorioSemanal() {
  console.log("[cron] Relatório semanal consultores — a gerar");
  try {
    const now = new Date();
    const inicioSemana = new Date(now);
    inicioSemana.setDate(inicioSemana.getDate() - 7);
    const semanaStr = inicioSemana.toISOString();

    const { rows: consultores } = await pool.query("SELECT * FROM consultores");
    const { rows: imoveis } = await pool.query("SELECT * FROM imoveis");
    const { rows: interacoes } = await pool.query(
      "SELECT * FROM consultor_interacoes WHERE data_hora >= $1",
      [semanaStr],
    );

    const novosConsultores = consultores.filter((c: any) => c.created_at >= semanaStr);
    const imoveisRecebidos = imoveis.filter((i: any) => i.created_at >= semanaStr);
    const imoveisQualificados = imoveis.filter((i: any) => i.check_qualidade && i.updated_at >= semanaStr);

    // Top 3 por score
    const top3 = [...consultores].sort((a, b) => (b.score_prioridade || 0) - (a.score_prioridade || 0)).slice(0, 3);

    // Follow-ups atrasados
    const atrasados = consultores.filter((c: any) =>
      c.data_proximo_follow_up && new Date(c.data_proximo_follow_up) < now && c.estado_avaliacao !== "Inativo"
    );

    // Distribuição
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const c of consultores) dist[c.classificacao || "D"]++;

    // Taxa qualidade geral
    const comImoveis = consultores.filter((c: any) => (c.imoveis_enviados || 0) > 0);
    const mediaQualidade = comImoveis.length > 0
      ? Math.round(comImoveis.reduce((s: number, c: any) => s + (c.taxa_qualidade || 0), 0) / comImoveis.length)
      : 0;

    const report = {
      tipo: "semanal_consultores",
      gerado_em: now.toISOString(),
      semana: `${inicioSemana.toISOString().slice(0, 10)} a ${now.toISOString().slice(0, 10)}`,
      novos_consultores: novosConsultores.length,
      imoveis_recebidos: imoveisRecebidos.length,
      imoveis_qualificados: imoveisQualificados.length,
      interacoes_semana: interacoes.length,
      top3: top3.map((c: any) => ({ nome: c.nome, score: c.score_prioridade, classe: c.classificacao })),
      followup_atrasado: atrasados.length,
      distribuicao: dist,
      taxa_qualidade_geral: mediaQualidade,
    };

    // Guardar
    await pool.query(
      `CREATE TABLE IF NOT EXISTS relatorios (id TEXT PRIMARY KEY, tipo TEXT, data TEXT, dados JSONB, created_at TEXT DEFAULT (NOW()::TEXT))`,
    );
    await pool.query(
      "INSERT INTO relatorios (id, tipo, data, dados) VALUES ($1, $2, $3, $4)",
      [crypto.randomUUID(), "semanal_consultores", now.toISOString().slice(0, 10), JSON.stringify(report)],
    );

    // Email
    if (emailConfigured()) {
      const subject = `Somnium — Relatório Semanal Consultores ${now.toISOString().slice(0, 10)}`;
      const html = `
        <h2 style="color:#C9A84C;">Relatório Semanal — Rede de Consultores</h2>
        <p><strong>${report.semana}</strong></p>
        <table style="border-collapse:collapse;width:100%;max-width:500px;">
          <tr><td style="padding:4px 8px;">Novos consultores</td><td style="padding:4px 8px;font-weight:bold;">${novosConsultores.length}</td></tr>
          <tr><td style="padding:4px 8px;">Imóveis recebidos</td><td style="padding:4px 8px;font-weight:bold;">${imoveisRecebidos.length}</td></tr>
          <tr><td style="padding:4px 8px;">Imóveis qualificados</td><td style="padding:4px 8px;font-weight:bold;">${imoveisQualificados.length}</td></tr>
          <tr><td style="padding:4px 8px;">Interacções registadas</td><td style="padding:4px 8px;font-weight:bold;">${interacoes.length}</td></tr>
          <tr><td style="padding:4px 8px;">Follow-ups em atraso</td><td style="padding:4px 8px;font-weight:bold;color:${
        atrasados.length > 0 ? "red" : "green"
      };">${atrasados.length}</td></tr>
          <tr><td style="padding:4px 8px;">Taxa qualidade geral</td><td style="padding:4px 8px;font-weight:bold;">${mediaQualidade}%</td></tr>
        </table>
        <h3>Top 3:</h3>
        <ol>${
        top3.map((c: any) => `<li><strong>${c.nome}</strong> — Score ${c.score_prioridade}, Classe ${c.classificacao}</li>`)
          .join("")
      }</ol>
        <h3>Distribuição:</h3>
        <p>A: ${dist.A} · B: ${dist.B} · C: ${dist.C} · D: ${dist.D}</p>
        <hr><p style="font-size:11px;color:#999;">Ver relatório completo no CRM → Consultores → Relatório</p>
      `;
      await sendEmail(subject, html);
    }

    console.log(
      `[cron] Relatório semanal: ${novosConsultores.length} novos, ${imoveisRecebidos.length} imóveis, ${atrasados.length} atrasados`,
    );
  } catch (e) {
    console.error("[cron] Erro relatório semanal:", (e as Error).message);
  }
}

// ── JOB 4: Reclassificação semanal de investidores (Domingos 10:00) ──
async function runReclassificacaoInvestidores() {
  console.log("[cron] Reclassificação semanal de investidores — a correr");
  try {
    const { rows: investidores } = await pool.query("SELECT * FROM investidores WHERE classificacao IS NOT NULL");
    const { rows: allScorecards } = await pool.query("SELECT * FROM scorecards ORDER BY created_at DESC");
    const now = new Date();
    let reclassificados = 0;

    const RULES: Record<string, { dias_quente: number; dias_intermedio: number; dias_frio: number; pen_inter: number; pen_frio: number }> = {
      A: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 5, pen_frio: 15 },
      B: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 8, pen_frio: 20 },
      C: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 10, pen_frio: 25 },
      D: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 5, pen_frio: 10 },
    };

    for (const inv of investidores) {
      if (inv.classificacao === "D") continue;
      const ultimoSc = allScorecards.find((s: any) => s.investidor_id === inv.id);
      if (!ultimoSc) continue;

      const ultimoContacto = inv.data_ultimo_contacto || inv.data_reuniao || inv.data_primeiro_contacto;
      if (!ultimoContacto) continue;

      const diasSem = Math.floor((now.getTime() - new Date(ultimoContacto).getTime()) / 86400000);
      const rules = RULES[inv.classificacao] || RULES.C;

      let penalizacao = 0;
      let tipoFU: string | null = null;
      if (diasSem >= rules.dias_frio) {
        penalizacao = rules.pen_frio;
        tipoFU = "frio";
      } else if (diasSem >= rules.dias_intermedio) {
        penalizacao = rules.pen_inter;
        tipoFU = "intermedio";
      }

      if (penalizacao === 0) continue;

      let bonus = 0;
      if (inv.nda_assinado) bonus += 5;
      if (inv.montante_investido > 0) bonus += 10;
      if (inv.numero_negocios > 0) bonus += 10;

      const pontuacaoAjustada = Math.max(0, Math.min(100, (inv.pontuacao || 0) - penalizacao + bonus));
      const novaClasse = pontuacaoAjustada >= 88
        ? "A"
        : pontuacaoAjustada >= 72
        ? "B"
        : pontuacaoAjustada >= 56
        ? "C"
        : "D";

      if (novaClasse !== inv.classificacao) {
        const motivo = `[CRON] Reclassificação semanal — ${diasSem}d sem contacto (${tipoFU}), -${penalizacao}pts${
          bonus > 0 ? `, +${bonus}pts engagement` : ""
        }`;

        await pool.query(
          "UPDATE investidores SET classificacao = $1, pontuacao = $2, updated_at = $3 WHERE id = $4",
          [novaClasse, pontuacaoAjustada, now.toISOString(), inv.id],
        );

        await pool.query(
          `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova,
            pontuacao_anterior, pontuacao_nova, motivo, tipo, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            crypto.randomUUID(),
            inv.id,
            inv.classificacao,
            novaClasse,
            inv.pontuacao || 0,
            pontuacaoAjustada,
            motivo,
            "reclassificacao_periodica",
            now.toISOString(),
          ],
        );
        reclassificados++;
        console.log(`[cron] Reclassificado: ${inv.nome} ${inv.classificacao}→${novaClasse} (${diasSem}d)`);
      }
    }

    console.log(`[cron] Reclassificação: ${reclassificados} investidores actualizados`);
  } catch (e) {
    console.error("[cron] Erro reclassificação investidores:", (e as Error).message);
  }
}

// ── JOB 5: Auto-Inactivo (diário 07:00) ─────────────────────
// Passa investidores em "Follow Up" sem actividade > 90d para "Inactivo".
async function runAutoInactivoInvestidores() {
  console.log("[cron] Auto-Inactivo investidores — a correr");
  try {
    const { rowCount } = await pool.query(
      `UPDATE investidores SET
         status = 'Inactivo',
         motivo_inatividade = COALESCE(NULLIF(motivo_inatividade, ''), 'Sem actividade há mais de 90 dias'),
         updated_at = NOW()::TEXT
       WHERE status = 'Follow Up'
         AND COALESCE(data_ultimo_contacto, data_primeiro_contacto, created_at)
             < TO_CHAR(NOW() - INTERVAL '90 days', 'YYYY-MM-DD')`,
    );
    console.log(`[cron] Auto-Inactivo: ${rowCount} investidores movidos para Inactivo`);
  } catch (e) {
    console.error("[cron] Erro auto-Inactivo:", (e as Error).message);
  }
}

// ── JOB 6: Arquivar relatório mensal de obra (dia 1, 06:00) ──
async function runArquivoRelatoriosObra() {
  console.log("[cron] Arquivo mensal de relatórios de obra — a correr");
  try {
    // Projectos Fix and Flip activos (não vendidos)
    const { rows: negocios } = await pool.query(
      `SELECT * FROM negocios WHERE categoria = 'Fix and Flip' AND (fase IS NULL OR fase <> 'Vendido')`,
    );

    const mesIso = new Date().toISOString().slice(0, 7); // YYYY-MM

    let gerados = 0;
    for (const negocio of negocios) {
      try {
        const { rows: fases } = await pool.query(
          "SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem",
          [negocio.id],
        );
        if (fases.length === 0) continue;
        const faseIds = fases.map((f: any) => f.id);
        const { rows: tarefas } = await pool.query("SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1)", [faseIds]);
        const { rows: fotos } = await pool.query("SELECT * FROM projeto_fotos WHERE negocio_id = $1", [negocio.id]);
        let imovel: any = null;
        if (negocio.imovel_id) {
          const { rows } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [negocio.imovel_id]);
          imovel = rows[0] || null;
        }
        const orcAlocado = fases.reduce((s: number, f: any) => s + (Number(f.orcamento_alocado) || 0), 0);
        const custoReal = fases.reduce((s: number, f: any) => s + (Number(f.custo_real) || 0), 0);
        const percGlobal = Math.round(fases.reduce((s: number, f: any) => s + (Number(f.perc_execucao) || 0), 0) / fases.length);

        const doc = generateRelatorioAcompanhamento({ negocio, imovel, fases, tarefas, fotos, percGlobal, orcAlocado, custoReal });
        const buf = await streamToBuffer(doc);
        const safeNome = (negocio.movimento || "projecto").replace(/[^\w]/g, "_").slice(0, 60);
        const storagePath = `arquivo-obra/${negocio.id}__${mesIso}__${safeNome}.pdf`;
        await uploadPublic("projetos", storagePath, buf, "application/pdf");
        gerados++;
      } catch (e) {
        console.error(`[cron arquivo-obra] ${negocio.id}:`, (e as Error).message);
      }
    }
    console.log(`[cron] Arquivo mensal de obra: ${gerados} relatórios gerados em projetos/arquivo-obra (${mesIso})`);
  } catch (e) {
    console.error("[cron] Erro arquivo-obra:", (e as Error).message);
  }
}

// ── Pré-gerar a proposta da Agenda da semana seguinte ───────────
// Corre ao domingo à noite (depois de a equipa marcar disponibilidade),
// para a proposta já estar pronta na segunda-feira de manhã.
async function runGerarAgendaSemanal() {
  const { gerarCadeiasAngariacao, gerarEstudoDeMercado, gerarAnaliseDeNegocio, gerarElaboracaoProposta, gerarTarefasSinteticas, instanciarTemplatesDevidos, gerarFila } =
    await import("./agendaEngine.ts");

  // Segunda-feira da semana seguinte (Europe/Lisbon).
  const hojeLisboa = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) +
      "T00:00:00Z",
  );
  const diaSemana = (hojeLisboa.getUTCDay() + 6) % 7; // 0=Seg
  const diasAteProximaSegunda = 7 - diaSemana;
  const proximaSegunda = new Date(hojeLisboa);
  proximaSegunda.setUTCDate(proximaSegunda.getUTCDate() + diasAteProximaSegunda);
  const semanaInicio = proximaSegunda.toISOString().slice(0, 10);

  const cadeias = await gerarCadeiasAngariacao();
  const estudosMercado = await gerarEstudoDeMercado();
  const analises = await gerarAnaliseDeNegocio();
  const propostas = await gerarElaboracaoProposta();
  const sinteticas = await gerarTarefasSinteticas();
  const instanciadas = await instanciarTemplatesDevidos(semanaInicio);
  const { fila } = await gerarFila();

  console.log(
    `[cron] Fila da Agenda actualizada para a semana de ${semanaInicio}: ${fila.length} itens prontos ` +
      `(cadeias: ${cadeias.criadas}, estudos VVR: ${estudosMercado.criadas}, ` +
      `análises: ${analises.criadas}, propostas: ${propostas.criadas}, sintéticas: ${sinteticas.criadas}, templates: ${instanciadas.criadas})`,
  );
  return { semanaInicio, itensNaFila: fila.length };
}

// Exports para execução manual via API / cron functions
export {
  REACTIVATION_TEMPLATE,
  runArquivoRelatoriosObra,
  runGerarAgendaSemanal,
  runAutoInactivoInvestidores,
  runFollowUp,
  runReclassificacaoInvestidores,
  runRelatorioDiario,
  runRelatorioSemanal,
};
