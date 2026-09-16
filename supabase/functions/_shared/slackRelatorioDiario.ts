// Relatório diário do canal Slack — agrega as mensagens das últimas 24h
// (tabela slack_mensagens, alimentada por webhook-slack) com Claude e envia
// por email. Modelado em relatorioSemanalAggregator.ts / cronJobs.ts
// (runRelatorioSemanal), mas mais leve: sem PDF, grava na tabela genérica
// `relatorios` (tipo='diario_slack') já criada por cronJobs.ts.
import pool from "./pg.ts";
import { isConfigured as emailConfigured, sendEmail } from "./emailService.ts";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const REPORT_EMAIL_TO = "somniumprs@gmail.com";

interface Msg { user_name: string | null; texto: string; created_at: string }

export async function runRelatorioDiarioSlack() {
  const now = new Date();
  const desde = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { rows: mensagens } = await pool.query(
    "SELECT user_name, texto, created_at FROM slack_mensagens WHERE created_at >= $1 ORDER BY created_at ASC",
    [desde],
  ) as { rows: Msg[] };

  if (mensagens.length === 0) {
    return { ran: true, gerado: false, reason: "sem mensagens nas últimas 24h" };
  }

  const conteudo = ANTHROPIC_KEY ? await aggregateWithClaude(mensagens) : aggregateFallback(mensagens);

  await pool.query(
    `CREATE TABLE IF NOT EXISTS relatorios (id TEXT PRIMARY KEY, tipo TEXT, data TEXT, dados JSONB, created_at TEXT DEFAULT (NOW()::TEXT))`,
  );
  const dataStr = now.toISOString().slice(0, 10);
  await pool.query(
    "INSERT INTO relatorios (id, tipo, data, dados) VALUES ($1, $2, $3, $4)",
    [crypto.randomUUID(), "diario_slack", dataStr, JSON.stringify({ ...conteudo, total_mensagens: mensagens.length })],
  );

  if (emailConfigured()) {
    const subject = `Somnium — Relatório Diário Slack ${dataStr}`;
    const html = buildEmailHtml(conteudo, mensagens.length, dataStr);
    await sendEmail(subject, html, { to: REPORT_EMAIL_TO });
  }

  return { ran: true, gerado: true, mensagens: mensagens.length };
}

async function aggregateWithClaude(mensagens: Msg[]) {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const concat = mensagens
    .map((m) => `[${m.created_at}] ${m.user_name || "?"}: ${m.texto}`)
    .join("\n")
    .slice(0, 30000);
  const participantes = [...new Set(mensagens.map((m) => m.user_name).filter(Boolean))] as string[];

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `És analista executivo da Somnium Properties (investimento imobiliário, Coimbra/Porto). Recebes as mensagens do canal Slack interno da equipa das últimas 24h e compões uma síntese editorial curta em PT-PT formal — nunca copiar mensagens literalmente.

MENSAGENS:
${concat}

Devolve APENAS JSON válido com esta estrutura:
{
  "sumario_executivo": "2-4 frases sintetizando o dia, registo executivo PT-PT",
  "topicos": ["até 6 bullets editorializados"],
  "decisoes": ["decisões tomadas, até 5; [] se nenhuma"],
  "accoes_pendentes": [{"responsavel": "nome ou Equipa", "prazo": "data ou —", "accao": "..."}],
  "participantes": ${JSON.stringify(participantes)}
}`,
    }],
  });

  const respText = (message.content[0] as any)?.text || "{}";
  try {
    const match = respText.match(/\{[\s\S]*\}/);
    return JSON.parse(match?.[0] || respText);
  } catch {
    return aggregateFallback(mensagens);
  }
}

function aggregateFallback(mensagens: Msg[]) {
  const participantes = [...new Set(mensagens.map((m) => m.user_name).filter(Boolean))];
  return {
    sumario_executivo: `${mensagens.length} mensagens no canal Slack nas últimas 24h. Relatório gerado sem análise IA.`,
    topicos: [],
    decisoes: [],
    accoes_pendentes: [],
    participantes,
  };
}

function buildEmailHtml(conteudo: any, totalMensagens: number, dataStr: string): string {
  const topicos = (conteudo.topicos || []).map((t: string) => `<li>${t}</li>`).join("");
  const decisoes = (conteudo.decisoes || []).map((d: string) => `<li>${d}</li>`).join("");
  const accoes = (conteudo.accoes_pendentes || [])
    .map((a: any) => `<li><strong>${a.responsavel || "Equipa"}</strong> — ${a.accao} (${a.prazo || "—"})</li>`)
    .join("");
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="border-top:3px solid #C9A84C;padding-top:18px;margin-bottom:18px;">
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:600;">Relatório Diário — Canal Slack</h2>
        <p style="margin:0;color:#888;font-size:13px;">${dataStr} · ${totalMensagens} mensagens</p>
      </div>
      <p style="font-size:14px;color:#444;">${conteudo.sumario_executivo || ""}</p>
      ${topicos ? `<h3 style="font-size:15px;">Tópicos</h3><ul style="font-size:14px;color:#444;">${topicos}</ul>` : ""}
      ${decisoes ? `<h3 style="font-size:15px;">Decisões</h3><ul style="font-size:14px;color:#444;">${decisoes}</ul>` : ""}
      ${accoes ? `<h3 style="font-size:15px;">Acções pendentes</h3><ul style="font-size:14px;color:#444;">${accoes}</ul>` : ""}
      <hr style="margin:24px 0;border:0;border-top:1px solid #eee;">
      <p style="font-size:12px;color:#999;margin:0;">Gerado automaticamente a partir do canal Slack da equipa Somnium Properties.</p>
    </div>
  `;
}
