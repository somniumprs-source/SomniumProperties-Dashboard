// Edge Function "crm" — port de src/db/routes.js (Express -> Hono).
// Traducao MECANICA: a logica dos handlers que so dependem dos CRUDs (crud.ts),
// do pool (pg.ts) e das queries (queries.ts) e portada na integra. Os handlers
// que dependem de modulos ainda nao portados (PDF, upload/multer, Drive, Gmail,
// Fireflies, Forms, scraping, reunioes IA, projetos-fases, relatorios, estudo
// de localizacao, Notion-sync, audit/descreverMudanca, leitura de disco)
// devolvem 501 (porting em curso) preservando metodo e path exactos.
//
// A ordem dos registos segue o ficheiro original linha-a-linha — Hono faz
// first-match-wins tal como o Express, por isso os endpoints especificos
// continuam registados ANTES dos crudRoutes/:id correspondentes.
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import pool from "../_shared/pg.ts";
import { withAuditUser } from "../_shared/audit.ts";
import {
  Imoveis, Investidores, Consultores, Negocios, Despesas, Tarefas,
  ConsultorInteracoes, ConsultorFollowups, DocumentosInvestidor, Visitas,
  Empreiteiros, getDashboardStats, ensureColumn,
} from "../_shared/crud.ts";
import { getVisitasEnriquecidas, syncDataVisitaDerivada, getFichaVisitaParaImovel } from "../_shared/queries.ts";
import {
  generateDoc, getDocsForEstado, docEmbedeLocalizacao, generateCompiledReport,
} from "../_shared/pdfImovelDocs.ts";
import { onImovelCreated, persistDocumento, listDocumentos } from "../_shared/documentLifecycle.ts";
import { generateImovelPDF } from "../_shared/pdfReport.ts";
import { generateMeetingPDF } from "../_shared/pdfMeetingReport.ts";
import { analyzeReuniao, autoFillConsultor, autoFillInvestidor } from "../_shared/meetingAnalysis.ts";
import { isConfigured as firefliesConfigured, syncFireflies } from "../_shared/firefliesSync.ts";
import { isConfigured as formsConfigured, syncForms } from "../_shared/formsSync.ts";
import { runEstudoLocalizacao } from "../_shared/estudoLocalizacao.ts";
import { streamToBuffer } from "../_shared/pdfkitGuard.ts";
import { removeFromStorage, supabase, uploadPublic } from "../_shared/storage.ts";
import { scrapePhotosFromLink } from "../_shared/linkScraper.ts";
import { syncAllFromNotion, syncFromNotion, syncToNotion } from "../_shared/sync.ts";
import {
  createImovelFolder, isConfigured as driveConfigured, listImovelFiles,
  moveImovelFolder, uploadDocToFolder, downloadDriveFile,
} from "../_shared/driveSync.ts";
import {
  autoOrganize, ensureLabels, isConfigured as gmailConfigured, organizeBatch, organizeMessage,
} from "../_shared/gmailSync.ts";
import Anthropic from "@anthropic-ai/sdk";
import { registerRegiaoRoutes } from "./regiaoRoutes.ts";
import { registerAnaliseRoutes } from "./analiseRoutes.ts";
import { registerOrcamentoRoutes } from "./orcamentoRoutes.ts";
// ── Subsistema PROJETOS (Fix and Flip) ─────────────────────────
import {
  FASES_POR_CATEGORIA, getTemplateFases, getFaseConfigGlobal,
} from "../_shared/fasesFixFlip.ts";
import {
  generateFichaAcompanhamento, generateRelatorioAcompanhamento,
  generateMemoriaDescritiva, generateRelatorioSaida,
} from "../_shared/pdfProjectoFixFlip.ts";
import { exportProjetoExcel } from "../_shared/projetoExcelExport.ts";
import { audit } from "../_shared/projetoAuditLog.ts";
import { gerarResumoProjeto, isConfigured as aiConfigured } from "../_shared/projetoAiAssistant.ts";
import { sendEmail, isConfigured as emailConfigured } from "../_shared/emailService.ts";
import { sendWhatsApp } from "../_shared/whatsappAgent.ts";
// ── Subsistema RELATORIOS / EXPORTS / AUTOMATION (ultimo lote de stubs) ──
import {
  autoGerarRelatoriosSemanaisPendentes, gerarRelatorioSemanal,
} from "../_shared/relatorioSemanalAggregator.ts";
import { generateRelatorioSemanalPDF } from "../_shared/pdfRelatorioSemanal.ts";
import { generateRelatorioExpansaoGaia } from "../_shared/pdfRelatorioExpansaoGaia.ts";
import { DADOS_EXPANSAO_GAIA } from "../_shared/expansaoGaiaData.ts";
import { exportDepartment } from "../_shared/excelExport.ts";
import { generateDocx, getAvailableTypes } from "../_shared/docxGenerator.ts";
import { CHECKLIST_TEMPLATES } from "../_shared/checklistTemplates.ts";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

// Variavel de contexto guardada pelos middlewares (port de req.regiaoActiva).
declare module "@hono/hono" {
  interface ContextVariableMap {
    regiaoActiva: string;
  }
}

const app = createApp("/crm");

// Notion sync agora real (de ../_shared/sync.ts). No-op gracioso sem NOTION_API_KEY.

const REGIOES_VALIDAS = new Set(["Coimbra", "AMP"]);
const TABELAS_ISOLADAS_REGIAO = new Set(["imoveis", "consultores", "negocios", "empreiteiros"]);
const PATH_TO_TABLE: Record<string, string> = {
  imoveis: "imoveis", consultores: "consultores", negocios: "negocios",
  empreiteiros: "empreiteiros", despesas: "despesas", tarefas: "tarefas", investidores: "investidores",
};

// ── Resolucao de utilizador para o CRM (port de routes.js resolveCrmUser) ──
// O CRM bypassa o auth global mas precisa do user para filtros (acessos,
// roles restritos, audit, notificacoes in-app). Sem service key (dev) ou sem
// token -> null (o handler devolve tudo / age como admin, igual ao Express).
const RECORD_RESTRICTED_ROLES = new Set(["parceiro", "investidor"]);
const _crmAuthClient = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY"))
  ? createClient(
    Deno.env.get("SUPABASE_URL") || "https://mjgusjuougzoeiyavsor.supabase.co",
    (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY"))!,
  )
  : null;

async function resolveCrmUser(c: any): Promise<any | null> {
  if (!_crmAuthClient) return null;
  const h = c.req.header("authorization");
  const token = (h?.startsWith("Bearer ") ? h.slice(7) : null) || c.req.query("token");
  if (!token) return null;
  try {
    const { data: { user }, error } = await _crmAuthClient.auth.getUser(token);
    if (error || !user?.email) return null;
    // Resolver o app-user a partir do email (port de resolveAppUser, simplificado).
    const { rows } = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [user.email]);
    return rows[0] || null;
  } catch { return null; }
}

// ── Auto-criar fases+tarefas conforme o template da categoria (port de routes.js criarFasesProjecto) ──
async function criarFasesProjecto(negocioId: string, categoria: string): Promise<void> {
  const template = getTemplateFases(categoria);
  if (!template) return; // categoria sem workflow

  const { rows: existentes } = await pool.query("SELECT id FROM projeto_fases WHERE negocio_id = $1 LIMIT 1", [negocioId]);
  if (existentes.length > 0) return; // idempotente

  const { rows: negRows } = await pool.query("SELECT tipo_projeto FROM negocios WHERE id = $1", [negocioId]);
  const tipoProjeto = negRows[0]?.tipo_projeto || "fracao_unica";

  let fracaoId: string | null = null;
  if (tipoProjeto === "fracao_unica") {
    // Reutilizar fração existente: o INSERT ... DO NOTHING não devolve nada
    // quando há conflito, deixando-nos com um UUID órfão que rebenta a FK de
    // projeto_fases. Procurar primeiro, inserir só se faltar.
    const { rows: existeFrac } = await pool.query(
      `SELECT id FROM projeto_fracoes WHERE negocio_id = $1 AND nome = $2 LIMIT 1`,
      [negocioId, "Fração Única"],
    );
    if (existeFrac.length > 0) {
      fracaoId = existeFrac[0].id;
    } else {
      fracaoId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO projeto_fracoes (id, negocio_id, nome, tipo, ordem)
         VALUES ($1, $2, $3, 'fracao', 0)`,
        [fracaoId, negocioId, "Fração Única"],
      );
    }
  }

  for (let i = 0; i < template.length; i++) {
    const fase = template[i];
    const faseId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO projeto_fases (id, negocio_id, fracao_id, fase_key, nome, ordem, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [faseId, negocioId, fracaoId, fase.key, fase.nome, i, i === 0 ? "em_curso" : "pendente"],
    );
    for (let j = 0; j < fase.tarefas.length; j++) {
      await pool.query(
        `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), faseId, fase.tarefas[j], j],
      );
    }
  }
}
const criarFasesFixFlip = (negocioId: string) => criarFasesProjecto(negocioId, "Fix and Flip");

// ── Notificacao in-app (port de routes.js criarNotificacao) ──
async function criarNotificacao(userId: string, { tipo, titulo, mensagem, link }: any): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notificacoes (id, user_id, tipo, titulo, mensagem, link) VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), userId, tipo, titulo, mensagem || null, link || null],
    );
  } catch (e) { console.error("[notif]", (e as Error).message); }
}

// ── Carregar dados completos do projecto (port de routes.js loadProjetoCompleto) ──
// As fotos sao pre-carregadas como buffers (_data) para o gerador PDF, ja que
// `/public/uploads` nao existe nos isolates (URLs Supabase obtidas por fetch).
async function fetchFotoBuffer(url: string): Promise<Buffer | null> {
  try {
    if (!url) return null;
    const target = /^https?:\/\//i.test(url) ? url : null;
    if (!target) return null; // paths de disco do servidor antigo nao existem
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(target, { signal: ctrl.signal });
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    } finally { clearTimeout(timer); }
  } catch { return null; }
}

async function loadProjetoCompleto(negocioId: string): Promise<any | null> {
  const { rows: negRows } = await pool.query("SELECT * FROM negocios WHERE id = $1", [negocioId]);
  if (!negRows.length) return null;
  const negocio = negRows[0];

  let imovel = null;
  if (negocio.imovel_id) {
    const { rows } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [negocio.imovel_id]);
    imovel = rows[0] || null;
  }

  const { rows: fases } = await pool.query("SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem", [negocioId]);
  const faseIds = fases.map((f: any) => f.id);
  const tarefas = faseIds.length > 0
    ? (await pool.query("SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1) ORDER BY ordem", [faseIds])).rows
    : [];
  const fotos = faseIds.length > 0
    ? (await pool.query(
      `SELECT pf.*, f.fase_key, f.nome AS fase_nome FROM projeto_fotos pf
         JOIN projeto_fases f ON pf.fase_id = f.id
         WHERE pf.negocio_id = $1 ORDER BY f.ordem, pf.created_at`,
      [negocioId],
    )).rows
    : [];
  // Preload buffers das fotos (max 6 por documento; o gerador faz slice tambem).
  for (const foto of fotos.slice(0, 12)) {
    foto._data = await fetchFotoBuffer(foto.url);
  }

  let orcamento = null;
  if (negocio.imovel_id) {
    const { rows } = await pool.query("SELECT * FROM orcamentos_obra WHERE imovel_id = $1 LIMIT 1", [negocio.imovel_id]).catch(() => ({ rows: [] }));
    orcamento = rows?.[0] || null;
    if (orcamento?.seccoes && typeof orcamento.seccoes === "string") {
      try { orcamento.seccoes = JSON.parse(orcamento.seccoes); } catch { /* ignore */ }
    }
  }

  const orcAlocado = fases.reduce((s: number, f: any) => s + (Number(f.orcamento_alocado) || 0), 0);
  const custoReal = fases.reduce((s: number, f: any) => s + (Number(f.custo_real) || 0), 0);
  const percGlobal = fases.length > 0
    ? Math.round(fases.reduce((s: number, f: any) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
    : 0;

  return { negocio, imovel, fases, tarefas, fotos, orcamento, orcAlocado, custoReal, percGlobal };
}

// ── Notificar investidores quando uma fase muda (port de routes.js, best-effort) ──
async function notificarInvestidoresMudancaFase(negocioId: string, novaFaseKey: string): Promise<void> {
  try {
    if (!emailConfigured()) return;
    const { rows: negs } = await pool.query("SELECT * FROM negocios WHERE id = $1", [negocioId]);
    if (!negs.length) return;
    const negocio = negs[0];

    let invIds: any[] = [];
    try { invIds = typeof negocio.investidor_ids === "string" ? JSON.parse(negocio.investidor_ids || "[]") : (negocio.investidor_ids || []); } catch { /* ignore */ }
    if (invIds.length === 0) return;

    const regiaoNegocio = negocio.regiao || "Coimbra";
    const { rows: invs } = await pool.query(
      `SELECT id, nome, email, telemovel, canal_notificacao, regioes_preferidas FROM investidores
       WHERE id = ANY($1) AND (canal_notificacao IS NULL OR canal_notificacao <> 'nenhum')`,
      [invIds],
    );
    const invsFiltered = invs.filter((inv: any) => {
      let prefs: any[] = [];
      try { prefs = typeof inv.regioes_preferidas === "string" ? JSON.parse(inv.regioes_preferidas || "[]") : (inv.regioes_preferidas || []); } catch { /* ignore */ }
      if (!Array.isArray(prefs) || prefs.length === 0) return true;
      return prefs.includes(regiaoNegocio);
    });
    if (invsFiltered.length === 0) return;

    const faseConfig = getFaseConfigGlobal(novaFaseKey);
    const faseNome = faseConfig?.nome || novaFaseKey;
    const faseIcon = faseConfig?.icon || "🛠️";

    const baseUrl = Deno.env.get("PUBLIC_URL") || "https://somnium-properties-dashboard.vercel.app";
    const link = `${baseUrl}/projectos/${negocioId}`;
    const subject = `${faseIcon} ${negocio.movimento}: nova fase de obra — ${faseNome}`;
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff;">
        <div style="background: #0d0d0d; padding: 24px; border-radius: 12px; color: white; text-align: center;">
          <p style="color: #C9A84C; font-size: 11px; letter-spacing: 1px; margin: 0; text-transform: uppercase;">SOMNIUM PROPERTIES</p>
          <h1 style="color: #C9A84C; margin: 8px 0 0; font-size: 22px;">${negocio.movimento}</h1>
        </div>
        <div style="padding: 24px 0;">
          <p style="font-size: 15px; color: #1f2937; line-height: 1.6;">Tem uma atualização do projeto <strong>${negocio.movimento}</strong>.</p>
          <div style="background: #f9fafb; border-left: 3px solid #C9A84C; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Nova fase iniciada</p>
            <p style="margin: 6px 0 0; font-size: 18px; font-weight: bold; color: #0d0d0d;">${faseIcon} ${faseNome}</p>
          </div>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${link}" style="background: #0d0d0d; color: #C9A84C; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Ver projeto</a>
          </p>
        </div>
      </div>`;
    const textoWhatsApp = `🏗️ *Somnium Properties*\n\n${negocio.movimento}: nova fase iniciada\n\n${faseIcon} *${faseNome}*\n\nConsulta o cronograma e fotos no portal: ${link}`;

    const { rows: invsComUser } = await pool.query(
      `SELECT id, user_id FROM investidores WHERE id = ANY($1) AND user_id IS NOT NULL`, [invIds],
    );
    const userIdsPorInv = Object.fromEntries(invsComUser.map((i: any) => [i.id, i.user_id]));

    for (const inv of invsFiltered) {
      const canal = inv.canal_notificacao || "email";
      if ((canal === "email" || canal === "ambos") && inv.email) {
        sendEmail(subject, html, { to: inv.email }).catch((e) => console.error(`[notif-fase] email ${inv.email}:`, e.message));
      }
      if ((canal === "whatsapp" || canal === "ambos") && inv.telemovel) {
        try { await sendWhatsApp(inv.telemovel, textoWhatsApp); } catch (e) { console.error(`[notif-fase] whatsapp ${inv.telemovel}:`, (e as Error).message); }
      }
      const userId = userIdsPorInv[inv.id];
      if (userId) {
        await criarNotificacao(userId, {
          tipo: "fase_mudou",
          titulo: `${negocio.movimento}: ${faseNome}`,
          mensagem: `Nova fase iniciada — ${faseIcon} ${faseNome}`,
          link: `/projectos/${negocioId}`,
        });
      }
    }
  } catch (e) { console.error("[notif-fase]", (e as Error).message); }
}

// ── Hook automatico quando todas as fracoes sao vendidas (port de routes.js disparoVendaFracaoAutomatico) ──
async function disparoVendaFracaoAutomatico(fracaoId: string): Promise<void> {
  try {
    const { rows: fracs } = await pool.query("SELECT * FROM projeto_fracoes WHERE id = $1", [fracaoId]);
    if (!fracs.length || fracs[0].estado !== "vendido") return;
    const negocioId = fracs[0].negocio_id;

    const { rows: todas } = await pool.query("SELECT estado FROM projeto_fracoes WHERE negocio_id = $1 AND tipo = 'fracao'", [negocioId]);
    const todasVendidas = todas.every((f: any) => f.estado === "vendido");
    if (!todasVendidas) return;

    if (!emailConfigured()) return;
    const { rows: negs } = await pool.query("SELECT * FROM negocios WHERE id = $1", [negocioId]);
    const negocio = negs[0];
    let invIds: any[] = [];
    try { invIds = typeof negocio.investidor_ids === "string" ? JSON.parse(negocio.investidor_ids || "[]") : (negocio.investidor_ids || []); } catch { /* ignore */ }
    if (invIds.length === 0) return;

    const { rows: invs } = await pool.query("SELECT id, nome, email FROM investidores WHERE id = ANY($1) AND email IS NOT NULL", [invIds]);
    if (invs.length === 0) return;

    const data = await loadProjetoCompleto(negocioId);
    if (!data) return;
    const { rows: projInv } = await pool.query(
      `SELECT pi.capital, pi.percentagem, i.nome FROM projeto_investidores pi
       JOIN investidores i ON pi.investidor_id = i.id WHERE pi.negocio_id = $1`,
      [negocioId],
    );
    const investidores = projInv.length > 0
      ? projInv.map((p: any) => ({ nome: p.nome, capital: Number(p.capital) || 0 }))
      : invs.map((i: any) => ({ nome: i.nome, capital: (Number(negocio.capital_total) || 0) / invs.length }));

    const pdfBuffer = await streamToBuffer(generateRelatorioSaida({ ...data, investidores }));
    const subject = `${negocio.movimento}: Relatório de Saída CAEP`;
    const html = `<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: #0d0d0d; padding: 24px; border-radius: 12px; color: white; text-align: center;">
        <p style="color: #C9A84C; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin: 0;">SOMNIUM PROPERTIES</p>
        <h1 style="color: #C9A84C; margin: 8px 0 0;">${negocio.movimento}</h1>
      </div>
      <p style="font-size: 15px; color: #1f2937; line-height: 1.6;">O projecto foi vendido. Em anexo está o relatório final com a distribuição CAEP.</p>
    </div>`;
    for (const inv of invs) {
      sendEmail(subject, html, {
        to: inv.email,
        attachments: [{ filename: `saida-caep-${negocio.movimento.replace(/[^\w]/g, "_")}.pdf`, content: Buffer.from(pdfBuffer).toString("base64") }],
      }).catch((e) => console.error(`[venda-auto] ${inv.email}:`, e.message));
    }
  } catch (e) { console.error("[venda-auto]", (e as Error).message); }
}

// Regenera a imagem do estudo de localizacao se estiver desactualizada
// (gerada antes da ultima recolha de distancias, ou legacy sem marca de
// geracao). Preserva highlights/destaque/modo guardados. Nunca lanca: em
// erro devolve o imovel original (o relatorio usa a imagem em cache).
// So corre quando ha GOOGLE_MAPS_API_KEY + Supabase Storage. Port de
// routes.js 475-501.
async function refreshEstudoLocalizacaoSeNecessario(imovel: any): Promise<any> {
  try {
    if (!imovel?.localizacao_imagem) return imovel;
    if (!Deno.env.get("GOOGLE_MAPS_API_KEY") || !supabase) return imovel;
    const p = imovel.pois_distancias || {};
    const genMs = p.imagem_gerada_em ? new Date(p.imagem_gerada_em).getTime() : 0;
    const poisMs = imovel.pois_atualizado_em ? new Date(imovel.pois_atualizado_em).getTime() : 0;
    // Desactualizada: sem marca (legacy) ou dados de POIs mudaram >1s depois da imagem.
    const stale = !genMs || (poisMs - genMs > 1000);
    if (!stale) return imovel;
    await runEstudoLocalizacao({
      pool,
      supabaseStorage: supabase,
      imovelId: imovel.id,
      destinos: undefined, // usa os guardados em pois_distancias
      mode: p.mode || "driving",
      highlights: Array.isArray(p.highlights) ? p.highlights : [],
      destaque: p.destaque || null,
      origem: p.origem || imovel.morada || null,
    });
    const fresco = await Imoveis.getById(imovel.id);
    return fresco || imovel;
  } catch (e) {
    console.error(`[estudo-refresh imovel=${imovel?.id}] falhou, usa imagem em cache:`, (e as Error).message);
    return imovel;
  }
}

// ── Auth: crm tem verify_jwt=false no gateway (para o fallback ?token= dos PDFs),
// por isso a validacao e em codigo: exige Bearer OU ?token=. _health isento.
// (Substitui a proteccao do middleware global do Express no Render.) ──
app.use("*", async (c, next) => {
  if (c.req.path.endsWith("/_health")) return await next();
  return await requireAuth(c, next);
});

// ── Middleware no-store (port de routes.js 123-128) ──────────────
app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
});

// ── Middleware audit: injecta user_email no AsyncLocalStorage para audit_log.
app.use("*", async (c, next) => {
  let email: string | null = null;
  try {
    const u = await resolveCrmUser(c);
    email = u?.email || null;
  } catch { /* best-effort */ }
  await withAuditUser(email, () => next());
});

// ── Middleware regional (port de routes.js 149-167) ──────────────
app.use("*", async (c, next) => {
  const r = c.req.header("x-regiao");
  if (r && REGIOES_VALIDAS.has(r)) c.set("regiaoActiva", r);
  await next();
});

// ── Middleware de isolamento regional (port de routes.js 172-194) — 403 em edicao cruzada ──
app.use("*", async (c, next) => {
  try {
    const method = c.req.method;
    if (!["PUT", "PATCH", "DELETE"].includes(method)) return await next();
    const regiaoActiva = c.get("regiaoActiva");
    if (!regiaoActiva) return await next();
    const suffix = c.req.path.replace(/^\/crm/, "");
    const m = suffix.match(/^\/(\w+)\/([^/]+)$/);
    if (!m) return await next();
    const tabela = PATH_TO_TABLE[m[1]];
    if (!tabela || !TABELAS_ISOLADAS_REGIAO.has(tabela)) return await next();
    const { rows } = await pool.query(`SELECT regiao FROM ${tabela} WHERE id = $1`, [m[2]]);
    if (!rows[0]) return await next();
    const regiaoRegisto = rows[0].regiao;
    if (regiaoRegisto && regiaoRegisto !== regiaoActiva) {
      return c.json({
        error: `Acesso negado: registo pertence à região "${regiaoRegisto}" mas operação está em "${regiaoActiva}". Troque de região e tente de novo.`,
        registo_regiao: regiaoRegisto, regiao_activa: regiaoActiva,
      }, 403);
    }
    return await next();
  } catch { return await next(); }
});

// ── Mapa de qualidade por estado do pipeline (port de routes.js 199-215) ──
const ESTADO_QUALIDADE: Record<string, number> = {
  "Adicionado": 0, "Chamada Não Atendida": 0, "Pendentes": 0,
  "Não interessa": 0, "Nao interessa": 0, "Descartado": 0,
  "Pré-aprovação": 0.25,
  "Necessidade de Visita": 0.25, "Follow UP": 0.25,
  "Visita Marcada": 0.50, "Estudo de VVR": 0.50,
  "Em negociação": 0.75, "Proposta aceite": 0.75, "Enviar proposta ao investidor": 0.75, "Follow Up após proposta": 0.75,
  "Criar Proposta ao Proprietário": 1.0, "Enviar proposta ao Proprietário": 1.0,
  "Wholesaling": 1.0, "CAEP": 1.0, "Fix and Flip": 1.0, "Negócio em Curso": 1.0,
};
const CLASSE_POR_SCORE = (score: number) => score >= 80 ? "A" : score >= 60 ? "B" : score >= 30 ? "C" : "D";
const CLASSE_LABEL: Record<string, string> = { A: "Parceiro", B: "Activo", C: "Em desenvolvimento", D: "Novo" };
function qualidadeImovel(estado: string): number {
  const clean = (estado || "").replace(/^\d+-\s*/, "").trim();
  return ESTADO_QUALIDADE[clean] ?? 0;
}

// ── Generic CRUD route factory (port de routes.js 218-276) ───────
// hooks onCreate/onUpdate ligados (PDF/drive/scrape/fases); syncToNotion real (no-op gracioso sem NOTION_API_KEY).
function crudRoutes(
  path: string,
  crud: any,
  hooks: { onCreate?: (item: any) => Promise<void>; onUpdate?: (item: any, body: any) => Promise<void> } = {},
) {
  const table = path.slice(1);
  app.get(path, async (c: any) => {
    try {
      const q = c.req.query();
      const { limit = "100", offset = "0", sort, search, ...filter } = q;
      const regiaoActiva = c.get("regiaoActiva");
      if (regiaoActiva && filter.regiao === undefined) filter.regiao = regiaoActiva;
      if (search) {
        const data = await crud.search(search, +limit, { regiao: regiaoActiva });
        return c.json({ data, total: data.length });
      }
      return c.json(await crud.list({ limit: +limit, offset: +offset, sort, filter }));
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });
  app.get(`${path}/stats`, async (c: any) => {
    try { return c.json(await crud.stats({ regiao: c.get("regiaoActiva") })); }
    catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });
  app.get(`${path}/:id`, async (c: any) => {
    try {
      const item = await crud.getById(c.req.param("id"));
      if (!item) return c.json({ error: "Não encontrado" }, 404);
      return c.json(item);
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });
  app.post(path, async (c: any) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const regiaoActiva = c.get("regiaoActiva");
      if (regiaoActiva) {
        if (table === "investidores") { if (body.regioes_preferidas === undefined) body.regioes_preferidas = JSON.stringify([regiaoActiva]); }
        else if (body.regiao === undefined) body.regiao = regiaoActiva;
      }
      const item = await crud.create(body, { regiaoActiva });
      syncToNotion(table, item.id);
      hooks.onCreate?.(item).catch((e: any) => console.error(`[hook] create ${table}:`, e.message));
      return c.json(item, 201);
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.put(`${path}/:id`, async (c: any) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const regiaoActiva = c.get("regiaoActiva");
      if (regiaoActiva) {
        if (table === "investidores") { if (body.regioes_preferidas === undefined) body.regioes_preferidas = JSON.stringify([regiaoActiva]); }
        else if (body.regiao === undefined) body.regiao = regiaoActiva;
      }
      const item = await crud.update(c.req.param("id"), body, { regiaoActiva });
      if (!item) return c.json({ error: "Não encontrado" }, 404);
      syncToNotion(table, c.req.param("id"));
      hooks.onUpdate?.(item, body).catch((e: any) => console.error(`[hook] update ${table}:`, e.message));
      return c.json(item);
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  app.delete(`${path}/:id`, async (c: any) => {
    try {
      const ok = await crud.delete(c.req.param("id"), { regiaoActiva: c.get("regiaoActiva") });
      if (!ok) return c.json({ error: "Não encontrado" }, 404);
      return c.json({ ok: true });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });
}

// Mapa estado do imóvel → categoria de negocio (port de routes.js 280-285)
// Nota: o estado no CRM aparece como "Wholesaling" (1 L) mas a categoria de negocio é "Wholesalling" (2 Ls)
const ESTADO_IMOVEL_PARA_CATEGORIA: Record<string, string> = {
  "Wholesaling": "Wholesalling",
  "Wholesalling": "Wholesalling",
  "CAEP": "CAEP",
  "Fix and Flip": "Fix and Flip",
};

// Port de routes.js 287-332 (autoCriarNegocioDeImovel).
async function autoCriarNegocioDeImovel(imovel: any, novoEstado: string): Promise<string | undefined> {
  const categoria = ESTADO_IMOVEL_PARA_CATEGORIA[novoEstado];
  if (!categoria) return; // estado não é um modelo de negócio

  // Idempotência: skipar se já existir negocio activo para este imóvel
  const { rows: existentes } = await pool.query(
    `SELECT id FROM negocios WHERE imovel_id = $1 AND (deleted_at IS NULL) LIMIT 1`,
    [imovel.id],
  );
  if (existentes.length > 0) {
    console.log(`[auto-negocio] Skip — já existe negocio para imóvel ${imovel.nome || imovel.id}`);
    return;
  }

  const negocioId = crypto.randomUUID();
  const capital = Number(imovel.valor_proposta) > 0 ? Number(imovel.valor_proposta) : (Number(imovel.ask_price) || 0);
  const lucroEst = Number(imovel.valor_venda_remodelado) > 0 && Number(imovel.custo_estimado_obra) >= 0 && capital > 0
    ? Math.max(0, Number(imovel.valor_venda_remodelado) - capital - Number(imovel.custo_estimado_obra || 0))
    : 0;
  const movimento = imovel.nome || `Projecto ${categoria}`;
  const notas = `Auto-criado a partir do imóvel "${imovel.nome || imovel.id}" (estado: ${novoEstado})`;

  await pool.query(
    `INSERT INTO negocios (id, movimento, categoria, fase, capital_total, lucro_estimado, imovel_id, data, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      negocioId,
      movimento,
      categoria,
      "Fase de obras",
      capital,
      lucroEst,
      imovel.id,
      new Date().toISOString().slice(0, 10),
      notas,
    ],
  );

  // Auto-criar fases conforme template da categoria
  if ((FASES_POR_CATEGORIA as any)[categoria]) {
    await criarFasesProjecto(negocioId, categoria).catch((e) => console.error("[auto-negocio] criarFases:", e.message));
  }

  console.log(`[auto-negocio] Criado negocio ${negocioId} (${categoria}) para imóvel ${imovel.nome || imovel.id}`);
  return negocioId;
}

// Hooks dos imóveis ligados (port de routes.js 334-428). req.user?.email -> "system" (sem req nos hooks).
crudRoutes("/imoveis", Imoveis, {
  onCreate: async (item: any) => {
    if (driveConfigured()) {
      await createImovelFolder(item.id, item.nome || "Sem nome", item.estado || "Adicionado");
    }
    // Auto-gerar Ficha do Imóvel v1 (persiste em Storage + documentos_imovel)
    onImovelCreated(item).catch((e: any) => console.error("[docs] onCreate ficha:", e.message));
    // Se o imóvel é criado já num estado de modelo de negócio, auto-criar projecto
    if (ESTADO_IMOVEL_PARA_CATEGORIA[item.estado]) {
      autoCriarNegocioDeImovel(item, item.estado).catch((e: any) => console.error("[auto-negocio] onCreate:", e.message));
    }
    // Auto-scrape fotos do link do anuncio
    if (item.link && item.link.startsWith("http")) {
      scrapePhotosFromLink(item.link, item.id).then(async (photos: any[]) => {
        if (photos.length > 0) {
          const existing = item.fotos ? JSON.parse(item.fotos) : [];
          existing.push(...photos);
          await Imoveis.update(item.id, { fotos: JSON.stringify(existing) });
          console.log(`[scraper] ${photos.length} fotos extraidas automaticamente para ${item.nome || item.id}`);
        }
      }).catch((e: any) => console.error(`[scraper] Erro auto-scrape:`, e.message));
    }
  },
  onUpdate: async (item: any, body: any) => {
    // Auto-scrape fotos quando link e adicionado ou alterado
    if (body.link && body.link.startsWith("http")) {
      const existingFotos = item.fotos ? JSON.parse(item.fotos) : [];
      const alreadyScraped = existingFotos.some((f: any) =>
        f.source === "scraper" && f.source_url?.includes(new URL(body.link).hostname)
      );
      if (!alreadyScraped) {
        scrapePhotosFromLink(body.link, item.id).then(async (photos: any[]) => {
          if (photos.length > 0) {
            const current = await Imoveis.getById(item.id);
            const fotos = current?.fotos ? JSON.parse(current.fotos) : [];
            fotos.push(...photos);
            await Imoveis.update(item.id, { fotos: JSON.stringify(fotos) });
            console.log(`[scraper] ${photos.length} fotos extraidas de link actualizado para ${item.nome || item.id}`);
          }
        }).catch((e: any) => console.error(`[scraper] Erro auto-scrape update:`, e.message));
      }
    }
    if (body.estado) {
      // Mover pasta no Drive
      if (driveConfigured()) {
        await moveImovelFolder(item.id, body.estado);
      }
      // Auto-criar projecto quando estado é um modelo de negócio.
      // A idempotência interna de autoCriarNegocioDeImovel garante zero duplicados —
      // não comparamos com o estado anterior porque o item devolvido pelo crud.update
      // já vem merged com body, tornando a comparação sempre falsa.
      if (ESTADO_IMOVEL_PARA_CATEGORIA[body.estado]) {
        autoCriarNegocioDeImovel({ ...item, ...body }, body.estado).catch((e: any) =>
          console.error("[auto-negocio] onUpdate:", e.message)
        );
      }
      // Gerar documentos da fase: persistir em Supabase Storage + DB e upload ao Drive
      const docs = getDocsForEstado(body.estado);
      for (const tipo of docs) {
        try {
          let analise: any = null;
          try {
            const { rows: [a] } = await pool.query("SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1", [item.id]);
            analise = a;
          } catch { /* ignore */ }
          if (tipo === "ficha_visita") { try { item._fichaVisita = await getFichaVisitaParaImovel(item.id); } catch { /* ignore */ } }
          await persistDocumento(item, tipo, { trigger: `estado:${body.estado}`, generatedBy: "system", analise });
          if (driveConfigured()) {
            const pdfDoc = await generateDoc(tipo, item, analise);
            if (pdfDoc) await uploadDocToFolder(item.id, pdfDoc, `${tipo}.pdf`);
          }
        } catch (e) { console.error(`[docs] Erro ${tipo}:`, (e as Error).message); }
      }
    }
    // Wholesaling: se mudou valor_proposta, recompor lucro dos negocios de wholesaling deste imovel
    if (body.valor_proposta !== undefined) {
      await recomputeLucroWholesalingPorImovel(item.id).catch((e: any) => console.error("[wholesaling/recompute imovel]", (e as Error).message));
    }
    // Auto-complete checklist: verificar campos preenchidos
    try {
      const merged = { ...item, ...body };
      const { rows: pending } = await pool.query(
        "SELECT * FROM checklist_imovel WHERE imovel_id = $1 AND concluida = false AND campo_crm IS NOT NULL",
        [item.id],
      );
      const now = new Date().toISOString();
      const toComplete: any[] = [];
      for (const cl of pending) {
        if (/^(analise:|negocio:|doc:|tarefa calendario)/.test(cl.campo_crm)) continue;
        const fields = cl.campo_crm.split(",").map((f: string) => f.trim()).filter((f: string) => f !== "notas" && f !== "fotos");
        if (fields.length === 0) continue;
        const allFilled = fields.every((f: string) => {
          const v = merged[f];
          return v !== null && v !== undefined && v !== "" && v !== 0;
        });
        if (allFilled) toComplete.push(cl.id);
      }
      if (toComplete.length > 0) {
        await pool.query(
          `UPDATE checklist_imovel SET concluida = true, concluida_em = $1, concluida_por = 'auto', updated_at = $1
           WHERE id = ANY($2)`,
          [now, toComplete],
        );
        console.log(`[checklist] Auto-completadas ${toComplete.length} tarefas para ${item.nome || item.id}`);
      }
    } catch (e) { console.error("[checklist] Erro auto-complete:", (e as Error).message); }
  },
});

// ── Listagem dos documentos persistidos do imovel (listDocumentos) ──
app.get("/imoveis/:id/documentos-persistidos", async (c: any) => {
  try { return c.json(await listDocumentos(c.req.param("id"))); }
  catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Regenerar (cria nova versao e persiste) — port de routes.js 438-451 ──
app.post("/imoveis/:id/documentos/:tipo/regenerar", async (c: any) => {
  const id = c.req.param("id");
  const tipo = c.req.param("tipo");
  try {
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);
    let analise: any = null;
    try { const { rows: [a] } = await pool.query("SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1", [imovel.id]); analise = a; } catch { /* ignore */ }
    const out = await persistDocumento(imovel, tipo, { trigger: "manual:regenerar", generatedBy: c.get("user")?.email || "manual", analise });
    if (!out) return c.json({ error: "Tipo inválido" }, 400);
    const { buffer: _b, ...meta } = out;
    return c.json(meta);
  } catch (e) {
    console.error(`[regenerar ${tipo} imovel=${id}] FALHOU:`, (e as Error).message, "\n", (e as Error).stack);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Lookups (dropdowns dinamicos) — port de routes.js 454-468 ──
app.get("/lookups/:categoria", async (c: any) => {
  try {
    const r = await pool.query("SELECT valor, ordem FROM lookups WHERE categoria = $1 AND ativo = true ORDER BY ordem, valor", [c.req.param("categoria")]);
    return c.json(r.rows.map((x: any) => x.valor));
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/lookups", async (c: any) => {
  try {
    const r = await pool.query("SELECT categoria, valor, ordem FROM lookups WHERE ativo = true ORDER BY categoria, ordem, valor");
    const out: Record<string, string[]> = {};
    r.rows.forEach((x: any) => { (out[x.categoria] ||= []).push(x.valor); });
    return c.json(out);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Documento PDF por fase do imovel — port de routes.js 512-568 ──
//
// Estrategia: se ja existe pdf_path persistido e fresco, redireccionar para a
// URL Supabase (instantaneo). So gera o PDF quando ainda nao existe ou esta
// desactualizado. Para forcar regeneracao, ?refresh=1 ou POST .../regenerar.
app.get("/imoveis/:id/documento/:tipo", async (c: any) => {
  const id = c.req.param("id");
  const tipo = c.req.param("tipo");
  try {
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    // ?refresh=1 (ou refresh=true) forca regeneracao mesmo que exista PDF em cache.
    const refresh = ["1", "true", "yes"].includes(String(c.req.query("refresh") || "").toLowerCase());

    // Analise activa — necessaria para gerar e para detectar desactualizacao.
    let analise: any = null;
    try {
      const { rows: [a] } = await pool.query("SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1", [imovel.id]);
      analise = a;
    } catch { /* ignore */ }

    // Regenerar a imagem do estudo se desactualizada (so docs que a embutem).
    let im = imovel;
    if (docEmbedeLocalizacao(tipo)) im = await refreshEstudoLocalizacaoSeNecessario(imovel);

    // Servir PDF em cache APENAS se ainda reflecte os dados actuais. Regenera
    // quando o imovel ou a analise mudaram depois da ultima geracao.
    if (!refresh) {
      try {
        const { rows: [doc] } = await pool.query(
          `SELECT pdf_path, generated_at, frozen FROM documentos_imovel
             WHERE imovel_id = $1 AND tipo = $2
             ORDER BY frozen DESC, version DESC LIMIT 1`,
          [im.id, tipo],
        );
        if (doc?.pdf_path && /^https?:\/\//i.test(doc.pdf_path)) {
          const genMs = doc.generated_at ? new Date(doc.generated_at).getTime() : 0;
          const upImovel = im.updated_at ? new Date(im.updated_at).getTime() : 0;
          const upAnalise = analise?.updated_at ? new Date(analise.updated_at).getTime() : 0;
          // Frozen = snapshot imutavel (intencional). Vivo = so se ainda fresco.
          const fresco = doc.frozen || genMs >= Math.max(upImovel, upAnalise);
          if (fresco) return c.redirect(doc.pdf_path, 302);
          // senao: dados mudaram desde a geracao → cai para regeneracao
        }
      } catch { /* cai para geracao */ }
    }

    const out = await persistDocumento(im, tipo, {
      trigger: refresh ? "view:refresh" : "view:auto",
      generatedBy: c.get("user")?.email || "system",
      analise,
    });
    if (!out) return c.json({ error: "Tipo de documento inválido" }, 400);

    const nome = (imovel.nome || "doc").replace(/[^a-zA-Z0-9À-ú ]/g, "").replace(/\s+/g, "_");
    return c.body(out.buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${tipo}_${nome}.pdf"`,
    });
  } catch (e) {
    console.error(`[documento ${tipo} imovel=${id}] FALHOU:`, (e as Error).message, "\n", (e as Error).stack);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Re-sincronizacao global: analise activa → campos derivados do imovel ──
// port de routes.js 576-598
app.post("/sync-derivados", async (c: any) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE imoveis i SET
         roi = COALESCE(a.retorno_total, 0),
         roi_anualizado = COALESCE(a.retorno_anualizado, 0),
         valor_venda_remodelado = COALESCE(a.vvr, 0),
         custo_estimado_obra = COALESCE(a.obra_com_iva, 0),
         updated_at = $1
       FROM analises a
       WHERE a.imovel_id = i.id AND a.activa = true
         AND (i.roi IS DISTINCT FROM COALESCE(a.retorno_total, 0)
           OR i.roi_anualizado IS DISTINCT FROM COALESCE(a.retorno_anualizado, 0)
           OR i.valor_venda_remodelado IS DISTINCT FROM COALESCE(a.vvr, 0)
           OR i.custo_estimado_obra IS DISTINCT FROM COALESCE(a.obra_com_iva, 0))`,
      [new Date().toISOString()],
    );
    return c.json({ ok: true, sincronizados: rowCount });
  } catch (e) {
    console.error("[sync-derivados]", (e as Error).message);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Relatorio PDF do imovel — port de routes.js 600-622 ──
app.get("/imoveis/:id/relatorio", async (c: any) => {
  const id = c.req.param("id");
  try {
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    // Buscar analise activa se existir
    const { rows: [analise] } = await pool.query(
      "SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1", [imovel.id],
    ).catch(() => ({ rows: [] }));

    const nome = (imovel.nome || "imovel").replace(/[^a-zA-Z0-9À-ú ]/g, "").replace(/\s+/g, "_");
    const buffer = await streamToBuffer(generateImovelPDF(imovel, analise || null));
    return c.body(buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Relatorio_${nome}.pdf"`,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Relatorio compilado para investidor — port de routes.js 625-650 ──
app.get("/imoveis/:id/relatorio-investidor", async (c: any) => {
  const id = c.req.param("id");
  try {
    let imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);
    const { rows: [analise] } = await pool.query(
      "SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1", [imovel.id],
    ).catch(() => ({ rows: [] }));

    // Garante que o estudo de localizacao embutido reflecte os dados actuais.
    imovel = await refreshEstudoLocalizacaoSeNecessario(imovel);

    const seccoes = (c.req.query("seccoes") || "investimento,comparaveis,caep,stress_tests").split(",").filter(Boolean);
    const nome = (imovel.nome || "imovel").replace(/[^a-zA-Z0-9À-ú ]/g, "").replace(/\s+/g, "_");
    const doc = await generateCompiledReport(imovel, analise || null, seccoes);
    const buffer = await streamToBuffer(doc);
    return c.body(buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Dossier_Investimento_${nome}.pdf"`,
    });
  } catch (e) {
    console.error(`[relatorio-investidor imovel=${id}] FALHOU:`, (e as Error).message, "\n", (e as Error).stack);
    return c.json({ error: (e as Error).message }, 500);
  }
});

crudRoutes("/investidores", Investidores);

// ── Documentos enviados a investidores (historico) — port de routes.js 655-693 ──
app.get("/investidores/:id/documentos", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, i.nome as imovel_nome
       FROM documentos_investidor d
       LEFT JOIN imoveis i ON i.id = d.imovel_id
       WHERE d.investidor_id = $1
       ORDER BY d.created_at DESC`,
      [c.req.param("id")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/investidores/:id/documentos", async (c: any) => {
  try {
    const { tipo, nome, imovel_id, notas } = await c.req.json().catch(() => ({}));
    if (!tipo || !nome) return c.json({ error: "tipo e nome são obrigatórios" }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO documentos_investidor (id, investidor_id, imovel_id, tipo, nome, notas, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, c.req.param("id"), imovel_id || null, tipo, nome, notas || null, now],
    );
    return c.json({ id, investidor_id: c.req.param("id"), imovel_id, tipo, nome, notas, created_at: now }, 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.delete("/investidores/:id/documentos/:docId", async (c: any) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM documentos_investidor WHERE id = $1 AND investidor_id = $2",
      [c.req.param("docId"), c.req.param("id")],
    );
    if (rowCount === 0) return c.json({ error: "Não encontrado" }, 404);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Endpoints especificos de consultores (ANTES do crudRoutes) ──

// Find-or-create consultor (dedup por nome/contacto) — port de routes.js 698-727
app.post("/consultores/find-or-create", async (c: any) => {
  try {
    const { nome, imobiliaria, contacto } = await c.req.json().catch(() => ({}));
    if (!nome?.trim()) return c.json({ error: "Nome é obrigatório" }, 400);

    if (contacto?.trim()) {
      const { rows } = await pool.query(
        "SELECT * FROM consultores WHERE contacto = $1 LIMIT 1", [contacto.trim()],
      );
      if (rows[0]) return c.json({ ...rows[0], _matched: "contacto" });
    }

    const { rows: byName } = await pool.query(
      "SELECT * FROM consultores WHERE LOWER(nome) = LOWER($1) LIMIT 1", [nome.trim()],
    );
    if (byName[0]) return c.json({ ...byName[0], _matched: "nome" });

    const item = await Consultores.create({
      nome: nome.trim(),
      estatuto: "Cold Call",
      estado_avaliacao: "Em avaliação",
      imobiliaria: imobiliaria || null,
      contacto: contacto || null,
    });
    return c.json(item, 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

// Sugestoes de tags (imobiliaria/zonas) — port de routes.js 733-763
const _sugestoesCache = new Map<string, { data: any; exp: number }>();
app.get("/consultores/sugestoes-tags", async (c: any) => {
  try {
    const regiaoActiva = c.get("regiaoActiva");
    const regiao = regiaoActiva || "all";
    const cacheKey = `tags:${regiao}`;
    const now = Date.now();
    const cached = _sugestoesCache.get(cacheKey);
    if (cached && now < cached.exp) return c.json(cached.data);
    const where = regiaoActiva ? "WHERE regiao = $1" : "";
    const params = regiaoActiva ? [regiaoActiva] : [];
    const { rows } = await pool.query(`SELECT imobiliaria, zonas FROM consultores ${where}`, params);
    const imobiliarias = new Set<string>();
    const zonas = new Set<string>();
    for (const r of rows) {
      try {
        const arr = typeof r.imobiliaria === "string" ? JSON.parse(r.imobiliaria || "[]") : (r.imobiliaria || []);
        if (Array.isArray(arr)) arr.forEach((x: any) => { const s = String(x || "").trim(); if (s) imobiliarias.add(s); });
      } catch { /* ignore */ }
      try {
        const arr = typeof r.zonas === "string" ? JSON.parse(r.zonas || "[]") : (r.zonas || []);
        if (Array.isArray(arr)) arr.forEach((x: any) => { const s = String(x || "").trim(); if (s) zonas.add(s); });
      } catch { /* ignore */ }
    }
    const data = {
      imobiliarias: [...imobiliarias].sort((a, b) => a.localeCompare(b, "pt")),
      zonas: [...zonas].sort((a, b) => a.localeCompare(b, "pt")),
    };
    _sugestoesCache.set(cacheKey, { data, exp: now + 60_000 });
    return c.json(data);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// Lista enriquecida de consultores (com metricas e alertas inline) — port de routes.js 765-840
app.get("/consultores/enriched", async (c: any) => {
  try {
    const regiao = c.get("regiaoActiva");
    const consultoresWhere = regiao ? "WHERE regiao = $1" : "";
    const imoveisWhere = regiao ? "WHERE nome_consultor IS NOT NULL AND regiao = $1" : "WHERE nome_consultor IS NOT NULL";
    const params = regiao ? [regiao] : [];
    const [resConsultores, resImoveis, resInteracoes, resFollowupAgg] = await Promise.all([
      pool.query(`SELECT * FROM consultores ${consultoresWhere} ORDER BY score_prioridade DESC NULLS LAST, updated_at DESC`, params),
      pool.query(`SELECT nome_consultor, estado, check_qualidade, data_adicionado FROM imoveis ${imoveisWhere}`, params),
      pool.query("SELECT consultor_id, data_hora, direcao FROM consultor_interacoes ORDER BY data_hora DESC"),
      pool.query("SELECT consultor_id, MIN(data) AS primeiro_followup, MAX(data) AS ultimo_followup FROM consultor_followups GROUP BY consultor_id"),
    ]);
    const consultores = resConsultores.rows;
    const imoveis = resImoveis.rows;
    const interacoes = resInteracoes.rows;
    const followupAgg = resFollowupAgg.rows;
    const followupsByConsultor = new Map(followupAgg.map((f: any) => [f.consultor_id, f]));

    const now = Date.now();
    const enriched = consultores.map((cn: any) => {
      const meusImoveis = imoveis.filter((i: any) => i.nome_consultor?.trim().toLowerCase() === cn.nome?.trim().toLowerCase());
      const imoveisEntregues = meusImoveis.filter((im: any) => (im.estado || "").replace(/^\d+-\s*/, "").trim() !== "Pré-aprovação");
      const totalImoveis = imoveisEntregues.length;
      const imoveisAvancados = imoveisEntregues.filter((im: any) => qualidadeImovel(im.estado) >= 0.75).length;

      const minhasInteracoes = interacoes.filter((i: any) => i.consultor_id === cn.id);
      const ultimaInteracao = minhasInteracoes[0]?.data_hora;
      const followupAggC: any = followupsByConsultor.get(cn.id);
      const ultimoFollowup = followupAggC?.ultimo_followup || null;
      const ultimoContactoCandidatos = [ultimaInteracao, ultimoFollowup, cn.data_follow_up].filter(Boolean);
      const ultimoContacto = ultimoContactoCandidatos.length
        ? ultimoContactoCandidatos.reduce((max, d) => (new Date(d) > new Date(max) ? d : max))
        : null;
      const diasSemContacto = ultimoContacto ? Math.floor((now - new Date(ultimoContacto).getTime()) / 86400000) : null;
      const temContacto = minhasInteracoes.length > 0 || !!cn.data_primeira_call || !!followupAggC;

      const ultimoImovel = [...meusImoveis].sort((a: any, b: any) => (b.data_adicionado || "").localeCompare(a.data_adicionado || ""))[0];
      const dataUltimoImovel = ultimoImovel?.data_adicionado;

      const horasCriado = (now - new Date(cn.created_at).getTime()) / 3600000;
      let alertStatus: string | null = null;
      const avancadoRecente = meusImoveis.some((i: any) =>
        qualidadeImovel(i.estado) >= 0.75 && i.data_adicionado && (now - new Date(i.data_adicionado).getTime()) / 86400000 <= 30
      );
      if (avancadoRecente) {
        alertStatus = "green";
      } else if (horasCriado > 48 && !temContacto) {
        alertStatus = "red";
      } else if (diasSemContacto !== null && diasSemContacto > 15) {
        const imovelDepoisContacto = dataUltimoImovel && ultimoContacto && new Date(dataUltimoImovel) > new Date(ultimoContacto);
        if (!imovelDepoisContacto) alertStatus = "orange";
      }

      const imobs = (() => { try { return JSON.parse(cn.imobiliaria || "[]"); } catch { return []; } })();

      return {
        ...cn,
        _totalImoveis: totalImoveis,
        _imoveisAvancados: imoveisAvancados,
        _diasSemContacto: diasSemContacto,
        _alertStatus: alertStatus,
        _agencia: imobs.join(", ") || "—",
      };
    });

    return c.json({ data: enriched, total: enriched.length });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

crudRoutes("/consultores", Consultores);

// Wholesaling: lucro esperado = valor_cedencia_posicao − imovel.valor_proposta.
// Persistido em negocios.lucro_estimado para os KPIs do portfolio (SUM) reflectirem.
async function recomputeLucroWholesaling(negocioId: string) {
  await ensureColumn("negocios", "valor_cedencia_posicao REAL");
  const { rows } = await pool.query(
    `SELECT n.valor_cedencia_posicao, im.valor_proposta
       FROM negocios n
       LEFT JOIN imoveis im ON im.id = n.imovel_id
      WHERE n.id = $1 AND n.categoria = 'Wholesalling'`,
    [negocioId],
  );
  if (!rows[0]) return;
  const ced = Number(rows[0].valor_cedencia_posicao);
  const compra = Number(rows[0].valor_proposta);
  if (!Number.isFinite(ced) || !Number.isFinite(compra)) return;
  await pool.query(
    `UPDATE negocios SET lucro_estimado = $1, updated_at = NOW()::TEXT WHERE id = $2`,
    [Math.max(0, ced - compra), negocioId],
  );
}

async function recomputeLucroWholesalingPorImovel(imovelId: string) {
  await ensureColumn("negocios", "valor_cedencia_posicao REAL");
  const { rows } = await pool.query(
    `SELECT id FROM negocios WHERE imovel_id = $1 AND categoria = 'Wholesalling'`,
    [imovelId],
  );
  for (const r of rows) {
    await recomputeLucroWholesaling(r.id).catch((e) => console.error("[wholesaling/recompute]", (e as Error).message));
  }
}

// Middleware: garante a coluna valor_cedencia_posicao antes de qualquer POST/PUT
// em /negocios — evita drop silencioso do campo no primeiro save quando a
// coluna ainda nao existe em producao (migracoes nao sao auto-aplicadas).
app.use("/negocios", async (c: any, next: any) => {
  if (c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH") {
    await ensureColumn("negocios", "valor_cedencia_posicao REAL");
  }
  await next();
});
app.use("/negocios/*", async (c: any, next: any) => {
  if (c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH") {
    await ensureColumn("negocios", "valor_cedencia_posicao REAL");
  }
  await next();
});

// Hooks dos negócios ligados — auto-criar fases conforme template (port de routes.js 904-916).
crudRoutes("/negocios", Negocios, {
  onCreate: async (item: any) => {
    if ((FASES_POR_CATEGORIA as any)[item.categoria]) {
      await criarFasesProjecto(item.id, item.categoria).catch((e) => console.error("[fases] auto-criar:", e.message));
    }
    if (item.categoria === "Wholesalling") {
      await recomputeLucroWholesaling(item.id).catch((e) => console.error("[wholesaling/recompute]", (e as Error).message));
    }
  },
  onUpdate: async (item: any, body: any) => {
    // Se categoria suporta template, criar fases (idempotente)
    if ((FASES_POR_CATEGORIA as any)[body.categoria]) {
      await criarFasesProjecto(item.id, body.categoria).catch((e) => console.error("[fases] auto-criar update:", e.message));
    }
    if (item.categoria === "Wholesalling" || body.categoria === "Wholesalling") {
      await recomputeLucroWholesaling(item.id).catch((e) => console.error("[wholesaling/recompute]", (e as Error).message));
    }
  },
});

// Recovery: criar fases para negócios cuja categoria tem template mas ficaram
// sem fases (ex: mudança de categoria que falhou pelo bug antigo do fracaoId).
app.post("/negocios/recover-fases", async (c: any) => {
  try {
    const categorias = Object.keys(FASES_POR_CATEGORIA);
    const { rows } = await pool.query(
      `SELECT n.id, n.movimento, n.categoria
         FROM negocios n
         LEFT JOIN projeto_fases f ON f.negocio_id = n.id
        WHERE n.categoria = ANY($1)
          AND n.deleted_at IS NULL
          AND f.id IS NULL`,
      [categorias],
    );
    const resultados: any[] = [];
    for (const n of rows) {
      try {
        await criarFasesProjecto(n.id, n.categoria);
        resultados.push({ id: n.id, movimento: n.movimento, categoria: n.categoria, ok: true });
      } catch (e) {
        resultados.push({ id: n.id, movimento: n.movimento, categoria: n.categoria, ok: false, error: (e as Error).message });
      }
    }
    return c.json({ total: rows.length, criados: resultados.filter((r) => r.ok).length, resultados });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// UX12 — Soft delete (lixeira) — port de routes.js 919-934
app.delete("/negocios/:id", async (c: any) => {
  try {
    const hard = c.req.query("hard") === "1";
    if (hard) {
      const { rows } = await pool.query("DELETE FROM negocios WHERE id = $1 RETURNING id", [c.req.param("id")]);
      if (!rows.length) return c.json({ error: "Não encontrado" }, 404);
      return c.json({ ok: true, hard: true });
    }
    const { rows } = await pool.query(
      `UPDATE negocios SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [c.req.param("id")],
    );
    if (!rows.length) return c.json({ error: "Não encontrado ou já apagado" }, 404);
    return c.json({ ok: true, soft_deleted: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// Restaurar projecto da lixeira — port de routes.js 937-946
app.post("/negocios/:id/restaurar", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `UPDATE negocios SET deleted_at = NULL WHERE id = $1 RETURNING *`,
      [c.req.param("id")],
    );
    if (!rows.length) return c.json({ error: "Não encontrado" }, 404);
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// Lista lixeira — port de routes.js 949-956
app.get("/negocios-lixeira", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM negocios WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`,
    );
    return c.json({ data: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Confirmar pagamento de tranche — port de routes.js 959-994 ──
app.put("/negocios/:id/confirmar-pagamento", async (c: any) => {
  try {
    const { trancheIndex } = await c.req.json().catch(() => ({}));
    if (trancheIndex == null) return c.json({ error: "trancheIndex obrigatório" }, 400);

    const { rows } = await pool.query("SELECT * FROM negocios WHERE id = $1", [c.req.param("id")]);
    if (!rows.length) return c.json({ error: "Negócio não encontrado" }, 404);
    const neg = rows[0];

    let pags: any[] = [];
    try { pags = typeof neg.pagamentos_faseados === "string" ? JSON.parse(neg.pagamentos_faseados || "[]") : (neg.pagamentos_faseados || []); } catch { pags = []; }
    if (trancheIndex < 0 || trancheIndex >= pags.length) return c.json({ error: "Índice de tranche inválido" }, 400);

    pags[trancheIndex].recebido = true;

    const totalRecebido = pags.filter((p) => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    const todasRecebidas = pags.every((p) => p.recebido);
    const updates: Record<string, any> = {
      pagamentos_faseados: JSON.stringify(pags),
      lucro_real: Math.round(totalRecebido * 100) / 100,
    };
    if (todasRecebidas) {
      updates.pagamento_em_falta = 0;
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = Object.values(updates);
    await pool.query(`UPDATE negocios SET ${setClauses}, updated_at = NOW() WHERE id = $1`, [c.req.param("id"), ...values]);

    syncToNotion("negocios", c.req.param("id"));
    return c.json({ ok: true, todasRecebidas, pagamentos: pags });
  } catch (e) {
    console.error("[confirmar-pagamento]", (e as Error).message);
    return c.json({ error: (e as Error).message }, 500);
  }
});

crudRoutes("/despesas", Despesas);

// Contagem rapida de tarefas atrasadas — port de routes.js 1003-1012
// IMPORTANTE: registar ANTES de crudRoutes('/tarefas') senao /tarefas/:id apanha "count-atrasadas".
let _countAtrasadasCache = { exp: 0, n: 0 };
app.get("/tarefas/count-atrasadas", async (c: any) => {
  try {
    const now = Date.now();
    if (now < _countAtrasadasCache.exp) return c.json({ atrasadas: _countAtrasadasCache.n });
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM tarefas WHERE status = 'Atrasada'`);
    const n = rows[0]?.n ?? 0;
    _countAtrasadasCache = { exp: now + 30_000, n };
    return c.json({ atrasadas: n });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

crudRoutes("/tarefas", Tarefas);
crudRoutes("/consultor-interacoes", ConsultorInteracoes);
crudRoutes("/empreiteiros", Empreiteiros);

// ── Visitas — CRUD com sync de imoveis.data_visita — port de routes.js 1021-1060 ──
app.get("/visitas", async (c: any) => {
  try {
    const items = await getVisitasEnriquecidas({ imovelId: c.req.query("imovel_id") });
    return c.json(items);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/imoveis/:id/visitas", async (c: any) => {
  try {
    const items = await getVisitasEnriquecidas({ imovelId: c.req.param("id") });
    return c.json(items);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/visitas", async (c: any) => {
  try {
    const item: any = await Visitas.create(await c.req.json().catch(() => ({})));
    await syncDataVisitaDerivada(item.imovel_id);
    return c.json(item, 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

app.put("/visitas/:id", async (c: any) => {
  try {
    await ensureColumn("visitas", "ficha JSONB");
    const item = await Visitas.update(c.req.param("id"), await c.req.json().catch(() => ({})));
    if (!item) return c.json({ error: "Não encontrado" }, 404);
    await syncDataVisitaDerivada(item.imovel_id);
    return c.json(item);
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

app.delete("/visitas/:id", async (c: any) => {
  try {
    const existing = await Visitas.getById(c.req.param("id"));
    if (!existing) return c.json({ error: "Não encontrado" }, 404);
    await Visitas.delete(c.req.param("id"));
    await syncDataVisitaDerivada(existing.imovel_id);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Historico de follow-ups por consultor — port de routes.js 1063-1139 ──
app.get("/consultores/:id/followups", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM consultor_followups WHERE consultor_id = $1 ORDER BY data DESC, created_at DESC`,
      [c.req.param("id")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/consultores/:id/followups", async (c: any) => {
  try {
    const consultorId = c.req.param("id");
    const { data, motivo, proximo_follow_up } = await c.req.json().catch(() => ({}));
    if (!data) return c.json({ error: "Data do follow-up é obrigatória" }, 400);

    const item = await ConsultorFollowups.create({
      consultor_id: consultorId,
      data,
      motivo: motivo || null,
      proximo_follow_up: proximo_follow_up || null,
    });

    const { rows } = await pool.query(
      `SELECT data, motivo, proximo_follow_up FROM consultor_followups
       WHERE consultor_id = $1 ORDER BY data DESC, created_at DESC LIMIT 1`,
      [consultorId],
    );
    if (rows[0]) {
      await Consultores.update(consultorId, {
        data_follow_up: rows[0].data,
        motivo_follow_up: rows[0].motivo,
        data_proximo_follow_up: rows[0].proximo_follow_up,
      });
    }

    const { rows: cur } = await pool.query(
      `SELECT data_primeira_call FROM consultores WHERE id = $1`,
      [consultorId],
    );
    if (cur[0] && (cur[0].data_primeira_call == null || cur[0].data_primeira_call === "")) {
      const { rows: oldest } = await pool.query(
        `SELECT data FROM consultor_followups
         WHERE consultor_id = $1 ORDER BY data ASC, created_at ASC LIMIT 1`,
        [consultorId],
      );
      if (oldest[0]?.data) {
        await Consultores.update(consultorId, { data_primeira_call: oldest[0].data });
      }
    }

    return c.json(item, 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

app.delete("/consultores/:id/followups/:followupId", async (c: any) => {
  try {
    const ok = await ConsultorFollowups.delete(c.req.param("followupId"));
    if (!ok) return c.json({ error: "Follow-up não encontrado" }, 404);

    const { rows } = await pool.query(
      `SELECT data, motivo, proximo_follow_up FROM consultor_followups
       WHERE consultor_id = $1 ORDER BY data DESC, created_at DESC LIMIT 1`,
      [c.req.param("id")],
    );
    await Consultores.update(c.req.param("id"), {
      data_follow_up: rows[0]?.data || null,
      motivo_follow_up: rows[0]?.motivo || null,
      data_proximo_follow_up: rows[0]?.proximo_follow_up || null,
    });

    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Interaccoes por consultor — port de routes.js 1142-1152 ──
app.get("/consultores/:id/interacoes", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT ci.*, i.nome as imovel_nome FROM consultor_interacoes ci
       LEFT JOIN imoveis i ON i.id = ci.imovel_id
       WHERE ci.consultor_id = $1 ORDER BY ci.data_hora DESC`,
      [c.req.param("id")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Interaccoes por imovel — port de routes.js 1155-1165 ──
app.get("/imoveis/:id/interacoes", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT ci.*, c.nome as consultor_nome FROM consultor_interacoes ci
       LEFT JOIN consultores c ON c.id = ci.consultor_id
       WHERE ci.imovel_id = $1 ORDER BY ci.data_hora DESC`,
      [c.req.param("id")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Extrair fotos de link (scrapePhotosFromLink) — port de routes.js 1168-1185 ──
app.post("/imoveis/:id/scrape-fotos", async (c: any) => {
  const id = c.req.param("id");
  try {
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const url = body.url || imovel.link;
    if (!url) return c.json({ error: 'Nenhum link fornecido. Enviar { url: "..." } ou preencher o campo link do imóvel.' }, 400);

    const scraped = await scrapePhotosFromLink(url, id);
    if (scraped.length === 0) return c.json({ ok: true, fotos: [], message: "Nenhuma foto encontrada no link." });

    const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : [];
    fotos.push(...scraped);
    await Imoveis.update(id, { fotos: JSON.stringify(fotos) });

    return c.json({ ok: true, extraidas: scraped.length, fotos });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Upload de fotos (multer/Supabase Storage) — port de routes.js 1188-1228 ──
// Multipart (multer array 'fotos', 20) → Hono formData + uploadPublic.
app.post("/imoveis/:id/fotos", async (c: any) => {
  const id = c.req.param("id");
  try {
    const form = await c.req.formData();
    const files = form.getAll("fotos").filter((f: any): f is File => f instanceof File);
    if (!files.length) return c.json({ error: "Nenhum ficheiro válido (JPG, PNG, WEBP até 15MB)" }, 400);
    const folder = form.get("folder") === "documentos" ? "documentos" : undefined;
    // Slot opcional: liga o ficheiro a um item da checklist canónica de
    // documentação. Quando vem slot, removemos entradas anteriores desse slot
    // (efeito "substituir" sem deixar duplicados).
    const slotRaw = form.get("slot");
    const slot = typeof slotRaw === "string" && slotRaw.trim() ? slotRaw.trim() : undefined;
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    let fotos = imovel.fotos ? JSON.parse(imovel.fotos) : [];
    if (slot) fotos = fotos.filter((f: any) => f?.slot !== slot);
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const storagePath = `imoveis/${id}/${crypto.randomUUID()}_${file.name}`;
      const filePath = await uploadPublic("Imoveis", storagePath, bytes, file.type || "application/octet-stream");
      fotos.push({
        id: crypto.randomUUID(),
        name: file.name,
        path: filePath,
        type: file.type,
        size: file.size,
        uploaded_at: new Date().toISOString(),
        ...(folder ? { folder } : {}),
        ...(slot ? { slot } : {}),
      });
    }
    await Imoveis.update(id, { fotos: JSON.stringify(fotos) });
    return c.json({ ok: true, fotos });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Análise documental por IA (Claude) — port de routes.js 1235-1370 ──
// Analisa um documento legal e devolve JSON estruturado. Persiste a análise
// no array imoveis.documentacao_analise (upsert por doc_id).
const DOC_MEDIA: Record<string, { kind: string; media: string }> = {
  ".pdf": { kind: "document", media: "application/pdf" },
  ".jpg": { kind: "image", media: "image/jpeg" },
  ".jpeg": { kind: "image", media: "image/jpeg" },
  ".png": { kind: "image", media: "image/png" },
  ".webp": { kind: "image", media: "image/webp" },
};
// Fallback por mimetype quando a extensão do nome/path não é fiável.
const CT_MEDIA: Record<string, { kind: string; media: string }> = {
  "application/pdf": { kind: "document", media: "application/pdf" },
  "image/jpeg": { kind: "image", media: "image/jpeg" },
  "image/jpg": { kind: "image", media: "image/jpeg" },
  "image/png": { kind: "image", media: "image/png" },
  "image/webp": { kind: "image", media: "image/webp" },
};
// Resolve o bloco de media (kind/media_type) por extensão ou, em alternativa, por mimetype.
function resolveDocMedia(ext: string, ...contentTypes: (string | null)[]) {
  if (ext && DOC_MEDIA[ext]) return DOC_MEDIA[ext];
  for (const ct of contentTypes) {
    const norm = String(ct || "").split(";")[0].trim().toLowerCase();
    if (CT_MEDIA[norm]) return CT_MEDIA[norm];
  }
  return null;
}
// A IA pode devolver valido como string; normaliza para true|false|'warning'.
function normalizarValido(v: any): boolean | "warning" {
  if (v === true || v === "true") return true;
  if (v === "warning") return "warning";
  return false;
}

function buildDocPrompt(tipoImovel: string): string {
  const tipo = (tipoImovel || "").toLowerCase().includes("morad") ? "MORADIA" : ((tipoImovel || "").trim() ? "APARTAMENTO" : "NÃO ESPECIFICADO");
  return `És um especialista jurídico e imobiliário português ao serviço da Somnium Properties.

Contexto: documento associado a um imóvel (tipo: ${tipo}).

Identifica que documento é (qualquer tipo, não apenas documentos de escritura) e analisa-o com lente jurídica/imobiliária portuguesa. Devolve APENAS um JSON válido, sem markdown, sem texto extra:

{
  "tipo_documento": "Nome do tipo de documento que identificaste (ex: Certidão Permanente, Caderneta Predial, Contrato, Fatura, Planta, etc.)",
  "valido": true | false | "warning",
  "campos": [
    { "label": "Campo extraído", "valor": "Valor" }
  ],
  "dados_chave": {
    "morada": "...",
    "freguesia": "...",
    "concelho": "...",
    "artigo_matricial": "...",
    "fracao": "...",
    "area": "...",
    "vpt": "...",
    "titular": "...",
    "data_documento": "...",
    "validade": "..."
  },
  "flags": [
    {
      "severity": "critical | warning | info",
      "titulo": "Título da flag",
      "descricao": "Descrição detalhada"
    }
  ],
  "resumo": "Resumo em 2-3 frases sobre o documento.",
  "pontos_verificar": ["Ponto 1", "Ponto 2"]
}

Instruções para dados_chave:
- Inclui APENAS as chaves cujo valor consegues extrair do documento; omite as restantes.
- Usa os valores tal como aparecem no documento (estes campos servem para cruzar dados entre documentos).
- area em m2; vpt em euros.

Regras de validação (aplica as que forem relevantes ao documento):
- Certidão Permanente: flag crítica se tiver ónus, penhoras ou hipotecas
- Caderneta Predial: verificar VPT, área, tipologia; flag se área inconsistente
- Licença de Utilização: obrigatória para imóveis após 07/08/1951; flag crítica se ausente ou uso não-habitacional
- Ficha Técnica: obrigatória para obras após 30/03/2004; verificar assinatura técnica
- Certificado Energético: verificar validade (10 anos); flag se classe abaixo de D
- Guia de Impostos: verificar se IMT e IS foram pagos e valores corretos
- Declaração de Condomínio: flag crítica se existirem dívidas em atraso
- Para outros documentos: assinala datas vencidas, valores em falta, assinaturas ausentes ou qualquer pormenor relevante
- Se não conseguires ler o documento, indica nas flags`;
}

// Resolve os bytes + extensão do documento, vindo do form (File) ou de um path/url.
// Versao Hono: aceita File do form OU body.path (url http -> fetch; paths de
// disco sao ignorados, ja nao existem em Edge Functions).
async function resolveDocBuffer(
  file: File | null,
  bodyPath: string | null,
  bodyName: string | null,
): Promise<{ bytes: Uint8Array; ext: string; name: string; contentType: string | null } | null> {
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = (file.name?.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
    return { bytes, ext, name: file.name, contentType: file.type || null };
  }
  const p = bodyPath;
  if (!p) return null;
  const ext = ((bodyName || p).split("?")[0].match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  if (/^https?:\/\//i.test(p)) {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`Não foi possível obter o ficheiro (${r.status})`);
    return { bytes: new Uint8Array(await r.arrayBuffer()), ext, name: bodyName || p.split("/").pop() || "documento", contentType: r.headers.get("content-type") };
  }
  // Paths de disco do servidor antigo nao existem nas Edge Functions.
  throw new Error("Caminho inválido (apenas File do upload ou URL http são suportados)");
}

app.post("/imoveis/:id/documentos/analise", async (c: any) => {
  const id = c.req.param("id");
  try {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return c.json({ error: "Análise por IA indisponível (ANTHROPIC_API_KEY não configurada)." }, 503);
    }
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    // O frontend envia JSON (analise por path); multipart e suportado como fallback.
    let file: File | null = null;
    let bodyPath: string | null = null;
    let bodyName: string | null = null;
    let bodyFotoId: string | null = null;
    let bodyTipoImovel: string | null = null;
    let bodyType: string | null = null;
    let bodyDriveFileId: string | null = null;
    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await c.req.json().catch(() => ({}));
      bodyPath = typeof body.path === "string" ? body.path : null;
      bodyName = typeof body.name === "string" ? body.name : null;
      bodyFotoId = typeof body.fotoId === "string" ? body.fotoId : null;
      bodyTipoImovel = typeof body.tipoImovel === "string" ? body.tipoImovel : null;
      bodyType = typeof body.type === "string" ? body.type : null;
      bodyDriveFileId = typeof body.driveFileId === "string" ? body.driveFileId : null;
    } else {
      const form = await c.req.formData();
      const fichRaw = form.get("ficheiro");
      file = fichRaw instanceof File ? fichRaw : null;
      bodyPath = typeof form.get("path") === "string" ? form.get("path") as string : null;
      bodyName = typeof form.get("name") === "string" ? form.get("name") as string : null;
      bodyFotoId = typeof form.get("fotoId") === "string" ? form.get("fotoId") as string : null;
      bodyTipoImovel = typeof form.get("tipoImovel") === "string" ? form.get("tipoImovel") as string : null;
      bodyType = typeof form.get("type") === "string" ? form.get("type") as string : null;
      bodyDriveFileId = typeof form.get("driveFileId") === "string" ? form.get("driveFileId") as string : null;
    }

    let doc;
    if (bodyDriveFileId) {
      // Documento que vive no Google Drive — download autenticado (o link público não serve).
      try {
        const df = await downloadDriveFile(bodyDriveFileId);
        const ext = (df.name?.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
        doc = { bytes: df.bytes, ext, name: df.name || bodyName || "documento", contentType: df.mimeType };
      } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    } else {
      try { doc = await resolveDocBuffer(file, bodyPath, bodyName); }
      catch (e) { return c.json({ error: (e as Error).message }, 400); }
    }
    if (!doc?.bytes?.length) return c.json({ error: "Nenhum documento para analisar (PDF, JPG ou PNG)." }, 400);

    const meta = resolveDocMedia(doc.ext, bodyType, doc.contentType);
    if (!meta) return c.json({ error: "Formato não suportado. Usa PDF, JPG, JPEG, PNG ou WEBP." }, 400);
    if (doc.bytes.length > 15 * 1024 * 1024) return c.json({ error: "Ficheiro demasiado grande (máx. 15MB)." }, 400);

    let bin = "";
    for (let i = 0; i < doc.bytes.length; i++) bin += String.fromCharCode(doc.bytes[i]);
    const base64 = btoa(bin);
    const fileBlock = meta.kind === "document"
      ? { type: "document", source: { type: "base64", media_type: meta.media, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: meta.media, data: base64 } };

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const tipoImovel = bodyTipoImovel || imovel.predio_tipo || imovel.tipologia || "";

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: buildDocPrompt(tipoImovel) }] as any }],
    });

    const respText = (response.content?.[0] as any)?.text || "{}";
    let parsed: any;
    try {
      const jsonMatch = respText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || respText);
    } catch {
      return c.json({ error: "A IA devolveu uma resposta ilegível. Tenta novamente." }, 502);
    }

    const entry = {
      fotoId: bodyFotoId || null,
      nome_ficheiro: doc.name,
      tipo_documento: parsed.tipo_documento || "Documento",
      valido: normalizarValido(parsed.valido),
      campos: Array.isArray(parsed.campos) ? parsed.campos.slice(0, 6) : [],
      dados_chave: (parsed.dados_chave && typeof parsed.dados_chave === "object") ? parsed.dados_chave : {},
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      resumo: parsed.resumo || "",
      pontos_verificar: Array.isArray(parsed.pontos_verificar) ? parsed.pontos_verificar : [],
      analyzed_at: new Date().toISOString(),
    };

    // Upsert por fotoId (uma análise por ficheiro carregado).
    await ensureColumn("imoveis", "documentacao_analise JSONB DEFAULT '[]'");
    const atual = Array.isArray(imovel.documentacao_analise) ? imovel.documentacao_analise : [];
    const next = [...atual.filter((a: any) => !(entry.fotoId && a.fotoId === entry.fotoId)), entry];
    await Imoveis.update(id, { documentacao_analise: JSON.stringify(next) }, { regiaoActiva: c.get("regiaoActiva") });

    return c.json({ ok: true, analise: entry, documentacao_analise: next });
  } catch (e) {
    console.error(`[documentos/analise imovel=${id}] FALHOU:`, (e as Error).message);
    return c.json({ error: (e as Error).message || "Falha na análise do documento." }, 500);
  }
});

// ── Remover analise documental (Imoveis CRUD + JSON) — port de routes.js 1373-1382 ──
app.delete("/imoveis/:id/documentos/analise/:fotoId", async (c: any) => {
  try {
    const imovel = await Imoveis.getById(c.req.param("id"));
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);
    await ensureColumn("imoveis", "documentacao_analise JSONB DEFAULT '[]'");
    const atual = Array.isArray(imovel.documentacao_analise) ? imovel.documentacao_analise : [];
    const next = atual.filter((a: any) => a.fotoId !== c.req.param("fotoId"));
    await Imoveis.update(c.req.param("id"), { documentacao_analise: JSON.stringify(next) }, { regiaoActiva: c.get("regiaoActiva") });
    return c.json({ ok: true, documentacao_analise: next });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Mover ficheiro entre categorias (fotos <-> documentos) — port de routes.js 1385-1397 ──
app.put("/imoveis/:id/fotos/:fotoId/mover", async (c: any) => {
  try {
    const imovel = await Imoveis.getById(c.req.param("id"));
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);
    const { folder } = await c.req.json().catch(() => ({}));
    if (!["fotos", "documentos"].includes(folder)) return c.json({ error: "Pasta inválida" }, 400);

    const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : [];
    const updated = fotos.map((f: any) => f.id === c.req.param("fotoId") ? { ...f, folder } : f);
    await Imoveis.update(c.req.param("id"), { fotos: JSON.stringify(updated) });
    return c.json({ ok: true, fotos: updated });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Upload da imagem de localizacao — port de routes.js 1400-1422 ──
// Multipart (multer single 'imagem') → Hono parseBody + uploadPublic.
app.post("/imoveis/:id/localizacao", async (c: any) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.parseBody();
    const file = body["imagem"] as File | undefined;
    if (!file || typeof file === "string") {
      return c.json({ error: "Nenhum ficheiro válido (JPG, PNG, WEBP até 15MB)" }, 400);
    }
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    const ext = (file.name?.match(/\.[a-z0-9]+$/i)?.[0] || ".png");
    const storagePath = `imoveis/${id}/localizacao_${Date.now()}${ext}`;
    const filePath = await uploadPublic(
      "Imoveis", storagePath, new Uint8Array(await file.arrayBuffer()), file.type || "image/png",
    );
    await Imoveis.update(id, { localizacao_imagem: filePath });
    return c.json({ ok: true, localizacao_imagem: filePath });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Apagar imagem de localizacao — port de routes.js 1424-1436 ──
app.delete("/imoveis/:id/localizacao", async (c: any) => {
  const id = c.req.param("id");
  try {
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);
    const url = imovel.localizacao_imagem;
    if (url && supabase && url.includes("supabase.co/storage/")) {
      const match = url.match(/\/storage\/v1\/object\/public\/Imoveis\/(.+)$/);
      if (match) await supabase.storage.from("Imoveis").remove([match[1]]).catch(() => {});
    }
    await Imoveis.update(id, { localizacao_imagem: null });
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Apagar foto (Supabase Storage remove + JSON) — port de routes.js 1438-1458 ──
app.delete("/imoveis/:id/fotos/:fotoId", async (c: any) => {
  const id = c.req.param("id");
  const fotoId = c.req.param("fotoId");
  try {
    const imovel = await Imoveis.getById(id);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : [];
    const foto = fotos.find((f: any) => f.id === fotoId);

    // Apagar do Supabase Storage se for URL do Supabase
    if (foto && foto.path?.includes("supabase.co/storage/")) {
      const match = foto.path.match(/\/storage\/v1\/object\/public\/Imoveis\/(.+)$/);
      if (match) await removeFromStorage("Imoveis", match[1]);
    }

    const filtered = fotos.filter((f: any) => f.id !== fotoId);
    await Imoveis.update(id, { fotos: JSON.stringify(filtered) });
    return c.json({ ok: true, fotos: filtered });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Listar ficheiros do Google Drive do imovel (port routes.js ~1461) ──
app.get("/imoveis/:id/drive-files", async (c: any) => {
  try {
    const imovel = await Imoveis.getById(c.req.param("id"));
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);
    if (!imovel.drive_folder_id) return c.json({ files: [], fotos: [], documentos: [], configured: false });
    if (!driveConfigured()) return c.json({ files: [], fotos: [], documentos: [], configured: false });
    return c.json(await listImovelFiles(imovel.drive_folder_id));
  } catch (e) {
    console.error("[drive] list files error:", (e as Error).message);
    return c.json({ files: [], fotos: [], documentos: [], configured: false, error: (e as Error).message });
  }
});

// ── Upload de documentos para despesas (multer/Storage) — port de routes.js 1523-1542 ──
// Multipart (multer single 'file') → Hono formData + uploadPublic (bucket "despesas").
app.post("/despesas/:id/upload", async (c: any) => {
  const id = c.req.param("id");
  try {
    const form = await c.req.formData();
    const fRaw = form.get("file");
    const file = fRaw instanceof File ? fRaw : null;
    if (!file) return c.json({ error: "Ficheiro inválido (PDF, JPG, PNG até 10MB)" }, 400);
    const despesa = await Despesas.getById(id);
    if (!despesa) return c.json({ error: "Despesa não encontrada" }, 404);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const storagePath = `despesas/${id}/${crypto.randomUUID()}_${file.name}`;
    const filePath = await uploadPublic("despesas", storagePath, bytes, file.type || "application/octet-stream");

    const docs = despesa.documentos ? JSON.parse(despesa.documentos) : [];
    docs.push({
      id: crypto.randomUUID(),
      name: file.name,
      path: filePath,
      type: file.type,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    });
    await Despesas.update(id, { documentos: JSON.stringify(docs) });
    return c.json({ ok: true, documentos: docs });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Apagar documento de despesa (Despesas CRUD + JSON) — port de routes.js 1544-1555 ──
app.delete("/despesas/:id/upload/:docId", async (c: any) => {
  try {
    const id = c.req.param("id");
    const docId = c.req.param("docId");
    const despesa = await Despesas.getById(id);
    if (!despesa) return c.json({ error: "Despesa não encontrada" }, 404);

    const docs = despesa.documentos ? JSON.parse(despesa.documentos) : [];
    const filtered = docs.filter((d: any) => d.id !== docId);
    await Despesas.update(id, { documentos: JSON.stringify(filtered) });
    return c.json({ ok: true, documentos: filtered });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Dashboard stats — port de routes.js 1557-1560 ──
app.get("/stats", async (c: any) => {
  try { return c.json(await getDashboardStats({ regiao: c.get("regiaoActiva") })); }
  catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Reunioes (Fireflies) — port de routes.js 1563-1593 ──
app.get("/reunioes", async (c: any) => {
  try {
    const entidade_tipo = c.req.query("entidade_tipo");
    const entidade_id = c.req.query("entidade_id");
    const limit = c.req.query("limit") ?? "50";
    let query = "SELECT id, fireflies_id, titulo, data, duracao_min, participantes, resumo, keywords, action_items, entidade_tipo, entidade_id, organizador, created_at FROM reunioes";
    const params: any[] = [];
    if (entidade_tipo && entidade_id) {
      query += " WHERE entidade_tipo = $1 AND entidade_id = $2";
      params.push(entidade_tipo, entidade_id);
    }
    query += ` ORDER BY data DESC LIMIT $${params.length + 1}`;
    params.push(+limit);
    const { rows } = await pool.query(query, params);
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/reunioes/:id", async (c: any) => {
  try {
    const { rows: [reuniao] } = await pool.query("SELECT * FROM reunioes WHERE id = $1", [c.req.param("id")]);
    if (!reuniao) return c.json({ error: "Reunião não encontrada" }, 404);
    return c.json(reuniao);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/reunioes/:id/transcricao", async (c: any) => {
  try {
    const { rows: [reuniao] } = await pool.query("SELECT titulo, transcricao FROM reunioes WHERE id = $1", [c.req.param("id")]);
    if (!reuniao) return c.json({ error: "Reunião não encontrada" }, 404);
    return c.json({ titulo: reuniao.titulo, transcricao: reuniao.transcricao });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Relatorio PDF reuniao — port de routes.js 1595-1626 ──
app.get("/reunioes/:id/relatorio", async (c: any) => {
  const id = c.req.param("id");
  try {
    const { rows: [reuniao] } = await pool.query("SELECT * FROM reunioes WHERE id = $1", [id]);
    if (!reuniao) return c.json({ error: "Reunião não encontrada" }, 404);

    // Usar analise_completa guardada se existir, senão fallback para análise por padrões
    let analise: any;
    if (reuniao.analise_completa) {
      try { analise = JSON.parse(reuniao.analise_completa); } catch { analise = await analyzeReuniao(id); }
    } else {
      analise = await analyzeReuniao(id);
    }

    let investidor: any = null;
    if (reuniao.entidade_id && reuniao.entidade_tipo === "investidores") {
      const { rows: [inv] } = await pool.query("SELECT * FROM investidores WHERE id = $1", [reuniao.entidade_id]);
      investidor = inv;
    }

    const nome = (reuniao.titulo || "reuniao").replace(/[^a-zA-Z0-9À-ú ]/g, "").replace(/\s+/g, "_");
    const buffer = await streamToBuffer(generateMeetingPDF(reuniao, analise, investidor));
    return c.body(buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Relatorio_Reuniao_${nome}.pdf"`,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Actualizar reuniao — port de routes.js 1628-1640 ──
app.put("/reunioes/:id", async (c: any) => {
  try {
    const { analise_completa, entidade_tipo, entidade_id } = await c.req.json().catch(() => ({}));
    const sets = ["updated_at = $1"];
    const params: any[] = [new Date().toISOString()];
    if (analise_completa !== undefined) { params.push(analise_completa); sets.push(`analise_completa = $${params.length}`); }
    if (entidade_tipo !== undefined) { params.push(entidade_tipo); sets.push(`entidade_tipo = $${params.length}`); }
    if (entidade_id !== undefined) { params.push(entidade_id); sets.push(`entidade_id = $${params.length}`); }
    params.push(c.req.param("id"));
    await pool.query(`UPDATE reunioes SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Analisar reuniao — port de routes.js 1642-1652 ──
app.post("/reunioes/:id/analisar", async (c: any) => {
  const id = c.req.param("id");
  try {
    const { rows: [r] } = await pool.query("SELECT entidade_tipo FROM reunioes WHERE id = $1", [id]);
    if (!r) return c.json({ error: "Reunião não encontrada" }, 404);
    const result = r.entidade_tipo === "consultores"
      ? await autoFillConsultor(id)
      : await autoFillInvestidor(id);
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Marcar reuniao vista — port de routes.js 1654-1662 ──
app.post("/reunioes/:id/marcar-vista", async (c: any) => {
  try {
    await pool.query(
      "UPDATE reunioes SET analise_vista = true, updated_at = $1 WHERE id = $2",
      [new Date().toISOString(), c.req.param("id")],
    );
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Fireflies sync — port de routes.js 1664-1684 ──
app.post("/fireflies/sync", async (c: any) => {
  try {
    if (!firefliesConfigured()) return c.json({ error: "FIREFLIES_API_KEY não configurada" }, 503);
    const result: any = await syncFireflies();

    // Auto-analisar e preencher investidores para reuniões novas
    if (result.created > 0) {
      const { rows: novas } = await pool.query(
        "SELECT id FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id IS NOT NULL ORDER BY created_at DESC LIMIT $1",
        [result.created],
      );
      for (const r of novas) {
        try { await autoFillInvestidor(r.id); } catch { /* ignora falhas individuais */ }
      }
      result.analyzed = novas.length;
    }

    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Google Forms sync — port de routes.js 1687-1693 ──
app.post("/forms/sync", async (c: any) => {
  try {
    if (!formsConfigured()) return c.json({ error: "Google Forms não configurado" }, 503);
    const result = await syncForms();
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Gmail (port routes.js ~1695-1729) ──
app.get("/gmail/labels", async (c: any) => {
  try {
    if (!gmailConfigured()) {
      return c.json({ error: "Gmail não configurado. Correr: node scripts/auth-google.js" }, 503);
    }
    const labels = await ensureLabels();
    return c.json({ labels });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/gmail/organize", async (c: any) => {
  try {
    if (!gmailConfigured()) return c.json({ error: "Gmail não configurado" }, 503);
    const { messageId, label, markRead } = await c.req.json();
    if (!messageId || !label) return c.json({ error: "messageId e label obrigatórios" }, 400);
    const result = await organizeMessage(messageId, label, markRead !== false);
    return c.json(result);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/gmail/organize-batch", async (c: any) => {
  try {
    if (!gmailConfigured()) return c.json({ error: "Gmail não configurado" }, 503);
    const { messages } = await c.req.json();
    if (!Array.isArray(messages)) return c.json({ error: "messages deve ser um array" }, 400);
    const results = await organizeBatch(messages);
    return c.json({ results });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/gmail/auto-organize", async (c: any) => {
  try {
    if (!gmailConfigured()) return c.json({ error: "Gmail não configurado" }, 503);
    const result = await autoOrganize();
    return c.json(result);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Excel Export por departamento — port de routes.js 1732-1744 ──
// exportDepartment devolve { buffer, fileName, driveFile }. Por defeito faz
// download do xlsx (download !== "false"); upload p/ Drive so se driveFolderId.
app.get("/export/:dept", async (c: any) => {
  try {
    const dept = c.req.param("dept");
    const driveFolderId = c.req.query("driveFolderId") || null;
    const { buffer, fileName, driveFile } = await exportDepartment(dept, driveFolderId);
    if (c.req.query("download") !== "false") {
      return c.body(new Uint8Array(buffer), 200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      });
    }
    return c.json({ fileName, driveFile });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DOCX — documentos Word — port de routes.js 1747-1754 ──
app.get("/imoveis/:id/docx/:tipo", async (c: any) => {
  try {
    const { buffer, fileName } = await generateDocx(c.req.param("tipo"), c.req.param("id"));
    return c.body(new Uint8Array(buffer), 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DOCX tipos disponiveis — port de routes.js 1756-1758 ──
app.get("/docx/tipos", (c: any) => c.json({ tipos: getAvailableTypes() }));

// ── CSV Export — port de routes.js 1761-1783 ──
app.get("/export-csv/:entity", async (c: any) => {
  try {
    const entity = c.req.param("entity");
    const allowed = ["imoveis", "investidores", "consultores", "negocios", "despesas", "tarefas"];
    if (!allowed.includes(entity)) return c.json({ error: `Entidade invalida. Usar: ${allowed.join(", ")}` }, 400);
    const { rows } = await pool.query(`SELECT * FROM ${entity} ORDER BY created_at DESC`);
    if (rows.length === 0) return c.json({ error: "Sem dados" }, 404);
    const headers = Object.keys(rows[0]);
    const csvRows = [headers.join(",")];
    for (const row of rows) {
      csvRows.push(headers.map((h) => {
        let v = row[h];
        if (v == null) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        v = String(v).replace(/"/g, '""');
        return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
      }).join(","));
    }
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${entity}_${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body("﻿" + csvRows.join("\n"));
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── CSV Import — port de routes.js 1786-1803 ──
app.post("/import-csv/:entity", async (c: any) => {
  try {
    const entity = c.req.param("entity");
    const allowed = ["investidores", "consultores", "despesas"];
    if (!allowed.includes(entity)) return c.json({ error: `Import permitido para: ${allowed.join(", ")}` }, 400);
    const { rows: data } = await c.req.json().catch(() => ({ rows: undefined }));
    if (!Array.isArray(data) || data.length === 0) return c.json({ error: "Body deve conter { rows: [...] }" }, 400);
    let imported = 0;
    for (const row of data) {
      const keys = Object.keys(row).filter((k) => k !== "id" && k !== "created_at" && k !== "updated_at");
      if (keys.length === 0) continue;
      const vals = keys.map((_, i) => `$${i + 1}`);
      await pool.query(`INSERT INTO ${entity} (${keys.join(",")}) VALUES (${vals.join(",")})`, keys.map((k) => row[k] || null));
      imported++;
    }
    return c.json({ imported, total: data.length });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Pesquisa global — port de routes.js 1806-1825 ──
app.get("/search", async (c: any) => {
  try {
    const q = c.req.query("q");
    if (!q || q.length < 2) return c.json({ results: [] });
    const term = `%${q}%`;
    const [imoveis, investidores, consultores, negocios] = await Promise.all([
      pool.query("SELECT id, nome, zona, estado, 'imovel' as tipo FROM imoveis WHERE nome ILIKE $1 OR zona ILIKE $1 OR notas ILIKE $1 LIMIT 10", [term]),
      pool.query("SELECT id, nome, email, status, 'investidor' as tipo FROM investidores WHERE nome ILIKE $1 OR email ILIKE $1 OR telemovel ILIKE $1 LIMIT 10", [term]),
      pool.query("SELECT id, nome, email, estatuto, 'consultor' as tipo FROM consultores WHERE nome ILIKE $1 OR email ILIKE $1 OR contacto ILIKE $1 LIMIT 10", [term]),
      pool.query("SELECT id, movimento, categoria, fase, 'negocio' as tipo FROM negocios WHERE movimento ILIKE $1 OR categoria ILIKE $1 LIMIT 10", [term]),
    ]);
    return c.json({
      results: [
        ...imoveis.rows, ...investidores.rows,
        ...consultores.rows, ...negocios.rows,
      ],
      total: imoveis.rowCount + investidores.rowCount + consultores.rowCount + negocios.rowCount,
    });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Sync Notion <-> CRM (port routes.js ~1828-1836) ──
app.post("/sync", async (c: any) => {
  try { return c.json({ ok: true, results: await syncAllFromNotion() }); }
  catch (e) { return c.json({ error: (e as Error).message }, 500); }
});
app.post("/sync/:table", async (c: any) => {
  try { return c.json(await syncFromNotion(c.req.param("table"))); }
  catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Ficha de detalhe do imovel com relacoes — port de routes.js 1839-1895 ──
app.get("/imoveis/:id/full", async (c: any) => {
  try {
    const { rows: [imovel] } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [c.req.param("id")]);
    if (!imovel) return c.json({ error: "Não encontrado" }, 404);
    const { rows: negocios } = await pool.query("SELECT * FROM negocios WHERE imovel_id = $1", [imovel.id]);
    const { rows: consultores } = imovel.nome_consultor
      ? await pool.query("SELECT id, nome, estatuto, classificacao, contacto, email FROM consultores WHERE nome ILIKE $1", [`%${imovel.nome_consultor}%`])
      : { rows: [] };
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${imovel.nome}%`]);
    const { rows: analises } = await pool.query("SELECT * FROM analises WHERE imovel_id = $1 ORDER BY activa DESC, updated_at DESC", [imovel.id]);
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [imovel.id]);
    const { rows: checklist } = await pool.query("SELECT * FROM checklist_imovel WHERE imovel_id = $1 ORDER BY estado, ordem", [imovel.id]);
    const now = new Date().toISOString();
    const autoCompleteIds: any[] = [];
    for (const item of checklist) {
      if (item.concluida) continue;
      if (!item.campo_crm) continue;
      if (/^(analise:|negocio:|doc:|tarefa calendario)/.test(item.campo_crm)) continue;
      const fields = item.campo_crm.split(",").map((f: string) => f.trim()).filter((f: string) => f !== "notas" && f !== "fotos");
      if (fields.length === 0) continue;
      const allFilled = fields.every((f: string) => {
        const v = imovel[f];
        return v !== null && v !== undefined && v !== "" && v !== 0;
      });
      if (allFilled) {
        autoCompleteIds.push(item.id);
        item.concluida = true;
        item.concluida_em = now;
        item.concluida_por = "auto";
      }
    }
    if (autoCompleteIds.length > 0) {
      await pool.query(
        `UPDATE checklist_imovel SET concluida = true, concluida_em = $1, concluida_por = 'auto', updated_at = $1
         WHERE id = ANY($2) AND concluida = false`,
        [now, autoCompleteIds],
      );
    }
    const { rows: interacoes } = await pool.query(
      `SELECT ci.*, c.nome as consultor_nome FROM consultor_interacoes ci
       LEFT JOIN consultores c ON c.id = ci.consultor_id
       WHERE ci.imovel_id = $1 ORDER BY ci.data_hora DESC`,
      [imovel.id],
    );
    return c.json({ ...imovel, negocios, consultores, tarefas, analises, timeline, checklist, interacoes });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/investidores/:id/full", async (c: any) => {
  try {
    const { rows: [inv] } = await pool.query("SELECT * FROM investidores WHERE id = $1", [c.req.param("id")]);
    if (!inv) return c.json({ error: "Não encontrado" }, 404);
    const { rows: negocios } = await pool.query("SELECT * FROM negocios WHERE investidor_ids LIKE $1", [`%${inv.notion_id ?? inv.id}%`]);
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${inv.nome}%`]);
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [inv.id]);
    const { rows: documentos } = await pool.query(
      `SELECT d.*, i.nome as imovel_nome FROM documentos_investidor d LEFT JOIN imoveis i ON i.id = d.imovel_id WHERE d.investidor_id = $1 ORDER BY d.created_at DESC`,
      [inv.id],
    );
    return c.json({ ...inv, negocios, tarefas, timeline, documentos });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/consultores/:id/full", async (c: any) => {
  try {
    const { rows: [cons] } = await pool.query("SELECT * FROM consultores WHERE id = $1", [c.req.param("id")]);
    if (!cons) return c.json({ error: "Não encontrado" }, 404);
    const { rows: imoveis } = await pool.query("SELECT id, nome, estado, tipologia, ask_price, zona, tipo_oportunidade, check_qualidade, check_ouro, data_adicionado FROM imoveis WHERE nome_consultor ILIKE $1", [`%${cons.nome}%`]);
    const { rows: negocios } = await pool.query("SELECT * FROM negocios WHERE consultor_ids LIKE $1", [`%${cons.notion_id ?? cons.id}%`]);
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${cons.nome}%`]);
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [cons.id]);
    const { rows: interacoes } = await pool.query(
      `SELECT ci.*, i.nome as imovel_nome FROM consultor_interacoes ci
       LEFT JOIN imoveis i ON i.id = ci.imovel_id
       WHERE ci.consultor_id = $1 ORDER BY ci.data_hora DESC`,
      [cons.id],
    );
    const totalImoveis = imoveis.length;
    const somaQualidade = imoveis.reduce((sum: number, im: any) => sum + qualidadeImovel(im.estado), 0);
    const taxaQualidade = totalImoveis > 0 ? Math.round(somaQualidade / totalImoveis * 100) : 0;
    const imoveisAvancados = imoveis.filter((im: any) => qualidadeImovel(im.estado) >= 0.75).length;
    let tempoMedio: number | null = null;
    const sortedInteracoes = [...interacoes].sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
    const tempos: number[] = [];
    for (let i = 0; i < sortedInteracoes.length; i++) {
      if (sortedInteracoes[i].direcao === "Enviado") {
        const resposta = sortedInteracoes.slice(i + 1).find((x: any) => x.direcao === "Resposta");
        if (resposta) {
          const horas = (new Date(resposta.data_hora).getTime() - new Date(sortedInteracoes[i].data_hora).getTime()) / 3600000;
          if (horas >= 0) tempos.push(horas);
        }
      }
    }
    if (tempos.length > 0) tempoMedio = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length * 10) / 10;
    return c.json({ ...cons, imoveis, negocios, tarefas, timeline, interacoes, _totalImoveis: totalImoveis, _imoveisAvancados: imoveisAvancados, _taxaQualidade: taxaQualidade, _tempoMedioResposta: tempoMedio });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── KPIs rapidos por tab — port de routes.js 1955-2025 ──
app.get("/kpis/:tab", async (c: any) => {
  try {
    const tab = c.req.param("tab");
    const regiao = c.get("regiaoActiva");
    const wReg = regiao ? `WHERE regiao = $1` : "";
    const params = regiao ? [regiao] : [];
    const wInv = regiao ? `WHERE regioes_preferidas LIKE $1` : "";
    const paramsInv = regiao ? [`%"${regiao}"%`] : [];
    if (tab === "imoveis") {
      const { rows } = await pool.query(`
        SELECT estado, COUNT(*) as count, COALESCE(SUM(ask_price),0) as valor
        FROM imoveis ${wReg} GROUP BY estado ORDER BY count DESC
      `, params);
      const { rows: [totals] } = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COALESCE(
            AVG(NULLIF(i.roi, 0)) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM negocios n
                WHERE n.imovel_id = i.id
                  AND n.deleted_at IS NULL
                  AND n.categoria IN ('CAEP', 'Fix and Flip')
              )
            ),
            0
          ) AS roi_medio
        FROM imoveis i
        ${regiao ? "WHERE i.regiao = $1" : ""}
      `, params);
      return c.json({ byEstado: rows, total: parseInt(totals.total), roiMedio: parseFloat(totals.roi_medio).toFixed(1) });
    } else if (tab === "investidores") {
      // Excluir cópias duplicadas (Ativo/Passivo) — só contam pessoas únicas.
      // Origens auto-referenciadas (duplicado_de = id) ficam dentro.
      const dupGuard = "(duplicado_de IS NULL OR duplicado_de = id)";
      const wInvDup = wInv ? `${wInv} AND ${dupGuard}` : `WHERE ${dupGuard}`;
      const { rows } = await pool.query(`SELECT status, COUNT(*) as count FROM investidores ${wInvDup} GROUP BY status ORDER BY count DESC`, paramsInv);
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COUNT(CASE WHEN classificacao IN ('A','B') THEN 1 END) as ab,
          COALESCE(SUM(capital_max),0) as capital
        FROM investidores ${wInvDup}
      `, paramsInv);
      return c.json({ byStatus: rows, total: parseInt(totals.total), classAB: parseInt(totals.ab), capitalTotal: parseFloat(totals.capital) });
    } else if (tab === "consultores") {
      const { rows } = await pool.query(`SELECT estatuto, COUNT(*) as count FROM consultores ${wReg} GROUP BY estatuto ORDER BY count DESC`, params);
      const { rows: [totals] } = await pool.query(`SELECT COUNT(*) as total FROM consultores ${wReg}`, params);
      return c.json({ byEstatuto: rows, total: parseInt(totals.total) });
    } else if (tab === "negocios") {
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total, COALESCE(SUM(lucro_estimado),0) as lucro_est,
          COALESCE(SUM(lucro_real),0) as lucro_real,
          COUNT(CASE WHEN fase = 'Vendido' THEN 1 END) as vendidos
        FROM negocios ${wReg}
      `, params);
      return c.json(totals);
    } else if (tab === "despesas") {
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COALESCE(SUM(CASE WHEN timing = 'Mensalmente' THEN custo_mensal ELSE 0 END),0) as burn_rate,
          COALESCE(SUM(custo_anual),0) as total_anual
        FROM despesas ${wReg}
      `, params);
      return c.json(totals);
    } else {
      return c.json({ error: "Tab not found" }, 404);
    }
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Tarefas automaticas por mudanca de fase — port de routes.js 2028-2091 ──
// Imoveis: gera checklist a partir de CHECKLIST_TEMPLATES (de _shared, nao disco).
// Investidores/consultores: cria 1 tarefa conforme TASK_MAP. randomUUID via crypto global.
app.post("/auto-task", async (c: any) => {
  try {
    const { entity, entityId, entityName, newPhase } = await c.req.json();

    // Para imoveis: gerar checklist automaticamente
    if (entity === "imoveis" && entityId) {
      const templates = (CHECKLIST_TEMPLATES as any)[newPhase];
      if (templates && templates.length > 0) {
        const now = new Date().toISOString();
        let created = 0;
        for (let i = 0; i < templates.length; i++) {
          const t = templates[i];
          const id = crypto.randomUUID();
          try {
            await pool.query(
              `INSERT INTO checklist_imovel (id, imovel_id, estado, template_key, titulo, campo_crm, categoria, tempo_estimado, obrigatoria, ordem, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               ON CONFLICT (imovel_id, template_key) DO NOTHING`,
              [id, entityId, newPhase, t.key, t.titulo, t.campo_crm, t.categoria, t.tempo_estimado, t.obrigatoria, i + 1, now, now],
            );
            created++;
          } catch { /* duplicado, ignorar */ }
        }
        console.log(`[checklist] ${created} items gerados para ${entityName} → ${newPhase}`);
        return c.json({ ok: true, created: true, count: created });
      }
    }

    // Fallback para investidores/consultores: manter auto-task antigo
    const TASK_MAP: Record<string, Record<string, string>> = {
      investidores: {
        // Comuns
        "Pendente de Aprovação": "Aprovar lead {name}",
        "Potencial Investidor": "Marcar 1ª call com {name}",
        "Marcar call": "Marcar call com investidor {name}",
        "Call marcada": "Preparar apresentação para {name}",
        "Follow Up": "Follow-up com investidor {name}",
        // Passivo
        "Investidor Qualificado em Carteira": "Procurar deal compatível para {name}",
        "Investidor em parceria": "Preparar onboarding de {name}",
        // Activo
        "Negociação de Deal": "Acompanhar negociação de deal com {name}",
        "Investidor Ativo": "Preparar próximo deal para {name}",
      },
      consultores: {
        "Follow up": "Follow-up com consultor {name}",
        "Aberto Parcerias": "Formalizar parceria com {name}",
      },
    };
    const taskTemplates = TASK_MAP[entity] ?? {};
    const template = taskTemplates[newPhase];
    if (!template) return c.json({ ok: true, created: false, reason: "No task for this phase" });

    const tarefa = template.replace("{name}", entityName);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await pool.query(
      "INSERT INTO tarefas (id, tarefa, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
      [id, tarefa, "A fazer", now, now],
    );
    return c.json({ ok: true, created: true, tarefa, id });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Checklist de imoveis — port de routes.js 2094-2165 ──
app.get("/checklist/progress-batch", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT imovel_id, estado,
              COUNT(*) FILTER (WHERE obrigatoria) as total,
              COUNT(*) FILTER (WHERE obrigatoria AND concluida) as done
       FROM checklist_imovel
       GROUP BY imovel_id, estado`,
    );
    const map: Record<string, any> = {};
    for (const r of rows) {
      if (!map[r.imovel_id]) map[r.imovel_id] = {};
      map[r.imovel_id][r.estado] = { done: parseInt(r.done), total: parseInt(r.total) };
    }
    return c.json(map);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/checklist/:imovelId", async (c: any) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM checklist_imovel WHERE imovel_id = $1 ORDER BY estado, ordem",
      [c.req.param("imovelId")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.put("/checklist/:itemId", async (c: any) => {
  try {
    const { concluida, notas, concluida_por } = await c.req.json().catch(() => ({}));
    const now = new Date().toISOString();
    const sets = ["updated_at = $2"];
    const vals: any[] = [c.req.param("itemId"), now];
    let idx = 3;
    if (concluida !== undefined) {
      sets.push(`concluida = $${idx}`);
      vals.push(concluida);
      idx++;
      sets.push(`concluida_em = $${idx}`);
      vals.push(concluida ? now : null);
      idx++;
      sets.push(`concluida_por = $${idx}`);
      vals.push(concluida ? (concluida_por || null) : null);
      idx++;
    }
    if (notas !== undefined) {
      sets.push(`notas = $${idx}`);
      vals.push(notas);
      idx++;
    }
    const { rows: [item] } = await pool.query(
      `UPDATE checklist_imovel SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      vals,
    );
    return c.json(item);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/checklist/:imovelId/progress", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT estado,
              COUNT(*) FILTER (WHERE obrigatoria) as total,
              COUNT(*) FILTER (WHERE obrigatoria AND concluida) as done
       FROM checklist_imovel WHERE imovel_id = $1
       GROUP BY estado`,
      [c.req.param("imovelId")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Relation lookups (dropdowns) — port de routes.js 2170-2213 ──
const _lookupCache = new Map<string, { data: any; exp: number }>();
function lookupCacheGet(key: string) {
  const e = _lookupCache.get(key);
  if (e && Date.now() < e.exp) return e.data;
  if (e) _lookupCache.delete(key);
  return null;
}
function lookupCacheSet(key: string, data: any, ttl = 120_000) {
  _lookupCache.set(key, { data, exp: Date.now() + ttl });
}
async function serveLookup(key: string, sql: string, c: any) {
  try {
    const cached = lookupCacheGet(key);
    if (cached) return c.json(cached);
    const { rows } = await pool.query(sql);
    lookupCacheSet(key, rows);
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
}
app.get("/lookup/imoveis", (c: any) =>
  serveLookup("imoveis", "SELECT id, nome, estado FROM imoveis ORDER BY nome", c));
app.get("/lookup/investidores", (c: any) =>
  serveLookup("investidores", "SELECT id, nome, status FROM investidores ORDER BY nome", c));
app.get("/lookup/consultores", (c: any) => {
  const regiao = c.get("regiaoActiva");
  if (regiao) {
    const key = `consultores:${regiao}`;
    const sql = `SELECT id, nome, estatuto FROM consultores WHERE regiao = '${regiao.replace(/'/g, "''")}' ORDER BY nome`;
    return serveLookup(key, sql, c);
  }
  return serveLookup("consultores", "SELECT id, nome, estatuto, regiao FROM consultores ORDER BY nome", c);
});

// ── Scorecard helper (port de routes.js 2560-2664) ──
const PESOS_SCORECARD: Record<string, Record<string, number>> = {
  Passivo: { c1: 0.20, c2: 0.10, c3: 0.30, c4: 0.20, c5: 0.20 },
  Ativo: { c1: 0.25, c2: 0.30, c3: 0.20, c4: 0.15, c5: 0.10 },
};
const CRITERIOS_LABELS: Record<string, string> = {
  c1: "Capacidade Financeira",
  c2: "Experiência Imobiliária",
  c3: "Alinhamento Estratégico",
  c4: "Estabilidade e Credibilidade",
  c5: "Disponibilidade e Compromisso",
};
const RUBRICA: Record<string, Record<string, any[]>> = {
  Passivo: {
    c1: [
      { min: 1, max: 1, desc: "Sem capital mobilizável ou < €30.000" },
      { min: 2, max: 2, desc: "€30.000–€49.999, mobilização > 60 dias" },
      { min: 3, max: 3, desc: "€50.000–€99.999, mobilizável em 30 dias" },
      { min: 4, max: 4, desc: "€100.000–€199.999, conta corrente/depósito" },
      { min: 5, max: 5, desc: "≥ €200.000, capital exclusivo, mobilização imediata" },
    ],
    c2: [
      { min: 1, max: 1, desc: "Sem experiência de investimento" },
      { min: 2, max: 2, desc: "Experiência em depósitos/certificados apenas" },
      { min: 3, max: 3, desc: "Investimentos diversificados (ações, fundos)" },
      { min: 4, max: 4, desc: "Investimento imobiliário indireto (fundos, REITs)" },
      { min: 5, max: 5, desc: "Investimentos imobiliários diretos anteriores" },
    ],
    c3: [
      { min: 1, max: 1, desc: "Expectativas irrealistas ou quer controlo operacional" },
      { min: 2, max: 2, desc: "ROI esperado acima do mercado, pouca flexibilidade" },
      { min: 3, max: 3, desc: "ROI realista mas baixa tolerância a imprevistos" },
      { min: 4, max: 4, desc: "Alinhado com modelo Somnium, aceita volatilidade" },
      { min: 5, max: 5, desc: "Totalmente alinhado, delega operação, foco longo prazo" },
    ],
    c4: [
      { min: 1, max: 1, desc: "Incoerências graves entre Forms e entrevista" },
      { min: 2, max: 2, desc: "Resistente a documentação KYC" },
      { min: 3, max: 3, desc: "Coerente mas sem documentação imediata" },
      { min: 4, max: 4, desc: "Coerente, KYC parcial, origem capital clara" },
      { min: 5, max: 5, desc: "Totalmente coerente, KYC completo, referências" },
    ],
    c5: [
      { min: 1, max: 1, desc: "Sem data de decisão, apenas curiosidade" },
      { min: 2, max: 2, desc: "Interessado mas com impedimentos indefinidos" },
      { min: 3, max: 3, desc: "Decisão em 60–90 dias, capital parcialmente reservado" },
      { min: 4, max: 4, desc: "Decisão em 30 dias, capital reservado" },
      { min: 5, max: 5, desc: "Pronto para investir, capital disponível, sem impedimentos" },
    ],
  },
  Ativo: {
    c1: [
      { min: 1, max: 1, desc: "Sem capital ou < €100.000" },
      { min: 2, max: 2, desc: "€100.000–€149.999, sem reserva contingência" },
      { min: 3, max: 3, desc: "€150.000–€199.999, cobre aquisição mas não obra" },
      { min: 4, max: 4, desc: "€200.000–€299.999, cobre aquisição + obra" },
      { min: 5, max: 5, desc: "≥ €300.000, com reserva contingência, sem pressão liquidez" },
    ],
    c2: [
      { min: 1, max: 1, desc: "Sem experiência em gestão de obra" },
      { min: 2, max: 2, desc: "1 obra gerida, sem empreiteiro fixo" },
      { min: 3, max: 3, desc: "2-3 obras, empreiteiro ocasional, conhece preços" },
      { min: 4, max: 4, desc: "3-5 obras, empreiteiro de confiança, gestão sólida" },
      { min: 5, max: 5, desc: "5+ obras, equipa própria, estimativas precisas" },
    ],
    c3: [
      { min: 1, max: 1, desc: "Quer fazer à sua maneira, não aceita modelo Somnium" },
      { min: 2, max: 2, desc: "Aceita parceria mas com muitas condições" },
      { min: 3, max: 3, desc: "Alinhado parcialmente, necessita alinhamento" },
      { min: 4, max: 4, desc: "Aceita modelo Somnium, experiência com parcerias" },
      { min: 5, max: 5, desc: "Totalmente alinhado, historial de parcerias bem-sucedidas" },
    ],
    c4: [
      { min: 1, max: 1, desc: "Sem historial verificável, incoerências" },
      { min: 2, max: 2, desc: "Historial parcial, recusa documentação" },
      { min: 3, max: 3, desc: "Coerente, historial parcialmente verificável" },
      { min: 4, max: 4, desc: "Historial sólido, KYC parcial, sem litígios" },
      { min: 5, max: 5, desc: "Historial exemplar, KYC completo, referências verificadas" },
    ],
    c5: [
      { min: 1, max: 1, desc: "Sem equipa, sem agenda, sem capital imediato" },
      { min: 2, max: 2, desc: "Capital OK mas sem empreiteiro disponível" },
      { min: 3, max: 3, desc: "Capital + empreiteiro em 60 dias" },
      { min: 4, max: 4, desc: "Capital + empreiteiro em 30 dias, agenda livre" },
      { min: 5, max: 5, desc: "Tudo pronto: capital, empreiteiro, agenda, foco total" },
    ],
  },
};
function calcularScorecard(scores: any, tipo: string) {
  const pesos = PESOS_SCORECARD[tipo] || PESOS_SCORECARD.Passivo;
  const total = (scores.c1 || 0) + (scores.c2 || 0) + (scores.c3 || 0) + (scores.c4 || 0) + (scores.c5 || 0);
  const ponderado = (
    (scores.c1 || 0) * pesos.c1 +
    (scores.c2 || 0) * pesos.c2 +
    (scores.c3 || 0) * pesos.c3 +
    (scores.c4 || 0) * pesos.c4 +
    (scores.c5 || 0) * pesos.c5
  ) * 20; // normalizar para 0-100
  const classificacao = ponderado >= 88 ? "A" : ponderado >= 72 ? "B" : ponderado >= 56 ? "C" : "D";
  return { total, ponderado: Math.round(ponderado * 100) / 100, classificacao };
}

// ── Automacoes PostgreSQL — port de routes.js 2216-2276 ──
app.post("/automation/score-investidores", async (c: any) => {
  try {
    const { rows } = await pool.query("SELECT * FROM investidores");
    const { rows: allScorecards } = await pool.query("SELECT * FROM scorecards ORDER BY created_at DESC");
    const updated: any[] = [];
    const now = new Date().toISOString();

    for (const inv of rows) {
      const ultimoSc = allScorecards.find((s: any) => s.investidor_id === inv.id);
      if (ultimoSc) {
        if (inv.classificacao !== ultimoSc.classificacao || Math.abs((inv.pontuacao || 0) - ultimoSc.pontuacao_ponderada) > 1) {
          await pool.query("UPDATE investidores SET pontuacao = $1, classificacao = $2, updated_at = $3 WHERE id = $4",
            [ultimoSc.pontuacao_ponderada, ultimoSc.classificacao, now, inv.id]);
          updated.push({ nome: inv.nome, score: ultimoSc.pontuacao_ponderada, classificacao: ultimoSc.classificacao, fonte: "scorecard" });
        }
        continue;
      }

      let tipo = "Passivo";
      try { if (JSON.parse(inv.tipo_investidor || "[]").includes("Ativo")) tipo = "Ativo"; } catch { /* ignore */ }

      const capital = Math.max(inv.capital_min || 0, inv.capital_max || 0);
      const limiteMin = tipo === "Ativo" ? 200000 : 50000;
      const c1 = capital >= limiteMin * 4 ? 5 : capital >= limiteMin * 2 ? 4 : capital >= limiteMin ? 3 : capital > 0 ? 2 : 1;

      const estrategia = inv.estrategia ? JSON.parse(inv.estrategia) : [];
      const c2 = estrategia.length >= 3 ? 4 : estrategia.length >= 1 ? 3 : inv.data_reuniao ? 2 : 1;

      const c3 = inv.data_reuniao && inv.nda_assinado ? 5
        : inv.data_reuniao ? 4
        : inv.data_primeiro_contacto ? 3
        : (inv.telemovel || inv.email) ? 2 : 1;

      const c4 = inv.nda_assinado && inv.perfil_risco ? 4
        : inv.nda_assinado || inv.perfil_risco ? 3
        : (inv.telemovel && inv.email) ? 2 : 1;

      const c5 = inv.montante_investido > 0 ? 5
        : inv.numero_negocios > 0 ? 4
        : inv.data_reuniao ? 3
        : inv.data_primeiro_contacto ? 2 : 1;

      const { ponderado, classificacao } = calcularScorecard({ c1, c2, c3, c4, c5 }, tipo);

      if (Math.abs((inv.pontuacao || 0) - ponderado) > 1 || inv.classificacao !== classificacao) {
        await pool.query("UPDATE investidores SET pontuacao = $1, classificacao = $2, updated_at = $3 WHERE id = $4",
          [ponderado, classificacao, now, inv.id]);
        updated.push({ nome: inv.nome, score: ponderado, classificacao, fonte: "perfil", criterios: { c1, c2, c3, c4, c5 } });
      }
    }
    return c.json({ ok: true, atualizados: updated.length, detalhes: updated });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// port de routes.js 2278-2317 — NB: referencia verbatim `imoveisEntregues` nao definido (bug original preservado)
app.post("/automation/score-consultores", async (c: any) => {
  try {
    const { rows: consultores } = await pool.query("SELECT * FROM consultores");
    const { rows: imoveis } = await pool.query("SELECT nome_consultor, estado FROM imoveis WHERE nome_consultor IS NOT NULL");
    const updated: any[] = [];
    for (const cn of consultores) {
      let score = 0;
      const meusImoveis = imoveis.filter((i: any) => i.nome_consultor?.trim().toLowerCase() === cn.nome?.trim().toLowerCase());
      const leads = meusImoveis.length;
      // Bug original preservado verbatim: `imoveisEntregues` nao esta definido neste
      // handler (so existe em score-prioridade). Em runtime lanca ReferenceError,
      // apanhado pelo try/catch -> 500, tal como no Express. @ts-ignore so para esta linha.
      // @ts-ignore preservacao do comportamento original (identificador inexistente)
      const imoveisAvancados = imoveisEntregues.filter((im: any) => qualidadeImovel(im.estado) >= 0.75).length;
      const imoveisMedios = meusImoveis.filter((im: any) => qualidadeImovel(im.estado) >= 0.5).length;

      score += Math.min(leads * 3, 30);
      score += Math.min((cn.imoveis_off_market || 0) * 10, 30);
      if (cn.data_proximo_follow_up && new Date(cn.data_proximo_follow_up) >= new Date()) score += 15;
      if (cn.email) score += 5;
      const imobs = cn.imobiliaria ? JSON.parse(cn.imobiliaria) : [];
      if (imobs.length > 0) score += 5;
      const zonas = cn.zonas ? JSON.parse(cn.zonas) : [];
      if (zonas.length > 0) score += 5;
      if (leads > 0) score += 10;
      score += Math.min(imoveisAvancados * 8, 20);
      score += Math.min(imoveisMedios * 3, 10);

      const classificacao = CLASSE_POR_SCORE(score);
      const needsUpdate = cn.classificacao !== classificacao || (cn.imoveis_enviados || 0) !== leads;
      if (needsUpdate) {
        await pool.query(
          "UPDATE consultores SET classificacao = $1, imoveis_enviados = $2, updated_at = $3 WHERE id = $4",
          [classificacao, leads, new Date().toISOString(), cn.id],
        );
        updated.push({ nome: cn.nome, score, classificacao, imoveisReais: leads, imoveisAvancados });
      }
    }
    return c.json({ ok: true, atualizados: updated.length, detalhes: updated });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// port de routes.js 2319-2342
app.post("/automation/calc-roi", async (c: any) => {
  try {
    const { rows } = await pool.query("SELECT * FROM imoveis WHERE ask_price > 0");
    const updated: any[] = [];
    for (const im of rows) {
      const custoTotal = im.ask_price + (im.custo_estimado_obra || 0);
      if (custoTotal <= 0) continue;
      let roi: number | null = null;
      if (im.valor_venda_remodelado > 0) {
        roi = Math.round((im.valor_venda_remodelado - custoTotal) / custoTotal * 10000) / 100;
      } else if (im.valor_proposta > 0 && im.valor_proposta < im.ask_price) {
        roi = Math.round((im.ask_price - im.valor_proposta) / im.ask_price * 10000) / 100;
      }
      if (roi === null) continue;
      const roiAnualizado = Math.round(roi * 2 * 100) / 100;
      if (Math.abs((im.roi || 0) - roi) > 0.1) {
        await pool.query("UPDATE imoveis SET roi = $1, roi_anualizado = $2, updated_at = $3 WHERE id = $4",
          [roi, roiAnualizado, new Date().toISOString(), im.id]);
        updated.push({ nome: im.nome, roi, roiAnualizado });
      }
    }
    return c.json({ ok: true, atualizados: updated.length, detalhes: updated });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// port de routes.js 2344-2461
app.post("/automation/score-prioridade-consultores", async (c: any) => {
  try {
    const { rows: consultores } = await pool.query("SELECT * FROM consultores");
    const { rows: imoveis } = await pool.query("SELECT nome_consultor, estado, check_qualidade, check_ouro FROM imoveis WHERE nome_consultor IS NOT NULL");
    const { rows: interacoes } = await pool.query("SELECT consultor_id, data_hora, direcao FROM consultor_interacoes ORDER BY data_hora ASC");
    const now = Date.now();

    const leadCounts = consultores.map((cn: any) =>
      imoveis.filter((i: any) => i.nome_consultor?.trim().toLowerCase() === cn.nome?.trim().toLowerCase()).length
    );
    const maxLeads = Math.max(...leadCounts, 1);

    const updated: any[] = [];
    const relatorio: any = { total: consultores.length, reclassificados: 0, semDados: 0, inativos: 0, distribuicao: { A: 0, B: 0, C: 0, D: 0 }, top5: [], mudancas: [], semDadosList: [] };

    for (const cn of consultores) {
      const meusImoveis = imoveis.filter((i: any) => i.nome_consultor?.trim().toLowerCase() === cn.nome?.trim().toLowerCase());
      const imoveisEntregues = meusImoveis.filter((im: any) => (im.estado || "").replace(/^\d+-\s*/, "").trim() !== "Pré-aprovação");
      const totalImoveis = imoveisEntregues.length;
      const classeAnterior = cn.classificacao;

      const diasSemUpdate = Math.floor((now - new Date(cn.updated_at || cn.created_at).getTime()) / 86400000);
      const ultimaInteracao = interacoes.filter((i: any) => i.consultor_id === cn.id).sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())[0];
      const diasSemActividade = ultimaInteracao
        ? Math.floor((now - new Date(ultimaInteracao.data_hora).getTime()) / 86400000)
        : diasSemUpdate;
      const isInativo = diasSemActividade >= 60 && totalImoveis === 0;

      if (isInativo) {
        const needsUpdate = cn.estado_avaliacao !== "Inativo";
        if (needsUpdate) {
          await pool.query("UPDATE consultores SET estado_avaliacao = $1, score_prioridade = 0, classificacao = NULL, updated_at = $2 WHERE id = $3",
            ["Inativo", new Date().toISOString(), cn.id]);
        }
        relatorio.inativos++;
        continue;
      }

      if (totalImoveis === 0) {
        relatorio.distribuicao.D++;
        if (cn.score_prioridade !== 0 || cn.classificacao !== "D") {
          await pool.query("UPDATE consultores SET score_prioridade = 0, taxa_qualidade = 0, classificacao = $1, imoveis_enviados = 0, updated_at = $2 WHERE id = $3",
            ["D", new Date().toISOString(), cn.id]);
          if (classeAnterior && classeAnterior !== "D") relatorio.mudancas.push({ nome: cn.nome, de: classeAnterior, para: "D", score: 0 });
          relatorio.reclassificados++;
        }
        relatorio.semDados++;
        relatorio.semDadosList.push({ nome: cn.nome, motivo: "Sem imóveis associados" });
        continue;
      }

      const somaQualidade = imoveisEntregues.reduce((sum: number, im: any) => sum + qualidadeImovel(im.estado), 0);
      const taxaQualidade = Math.round(somaQualidade / totalImoveis * 100);

      const volumeNorm = Math.min(Math.round(totalImoveis / maxLeads * 100), 100);

      const minhasInteracoes = interacoes.filter((i: any) => i.consultor_id === cn.id);
      const tempos: number[] = [];
      for (let i = 0; i < minhasInteracoes.length; i++) {
        if (minhasInteracoes[i].direcao === "Enviado") {
          const resp = minhasInteracoes.slice(i + 1).find((x: any) => x.direcao === "Resposta");
          if (resp) {
            const horas = (new Date(resp.data_hora).getTime() - new Date(minhasInteracoes[i].data_hora).getTime()) / 3600000;
            if (horas >= 0) tempos.push(horas);
          }
        }
      }
      const tempoMedio = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length * 10) / 10 : null;
      const speedScore = tempoMedio != null ? Math.max(0, Math.min(100, Math.round(100 - tempoMedio * 2))) : 50;

      const scorePrioridade = Math.round(taxaQualidade * 0.5 + volumeNorm * 0.3 + speedScore * 0.2);
      const classificacao = CLASSE_POR_SCORE(scorePrioridade);
      relatorio.distribuicao[classificacao]++;

      const imoveisAvancados = imoveisEntregues.filter((im: any) => qualidadeImovel(im.estado) >= 0.75).length;

      const changed = Math.abs((cn.score_prioridade || 0) - scorePrioridade) > 0.5 ||
        Math.abs((cn.taxa_qualidade || 0) - taxaQualidade) > 0.5 ||
        (cn.tempo_medio_resposta || null) !== tempoMedio ||
        cn.classificacao !== classificacao ||
        (cn.imoveis_enviados || 0) !== totalImoveis;

      if (changed) {
        await pool.query(
          `UPDATE consultores SET score_prioridade = $1, taxa_qualidade = $2, tempo_medio_resposta = $3,
           classificacao = $4, imoveis_enviados = $5, updated_at = $6 WHERE id = $7`,
          [scorePrioridade, taxaQualidade, tempoMedio, classificacao, totalImoveis, new Date().toISOString(), cn.id],
        );
        relatorio.reclassificados++;
        if (classeAnterior && classeAnterior !== classificacao) {
          relatorio.mudancas.push({ nome: cn.nome, de: classeAnterior, para: classificacao, score: scorePrioridade });
        }
      }

      if (tempoMedio === null) {
        relatorio.semDadosList.push({ nome: cn.nome, motivo: "Sem log de interacções (velocidade = 50 neutro)" });
      }

      updated.push({ nome: cn.nome, scorePrioridade, taxaQualidade, tempoMedio, classificacao, classeAnterior, imoveisReais: totalImoveis, imoveisAvancados });
    }

    relatorio.top5 = updated.sort((a, b) => b.scorePrioridade - a.scorePrioridade).slice(0, 5).map((u) => ({
      nome: u.nome, score: u.scorePrioridade, classe: u.classificacao, imoveis: u.imoveisReais, qualidade: u.taxaQualidade,
    }));

    return c.json({ ok: true, atualizados: relatorio.reclassificados, relatorio, detalhes: updated });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Relatorio semanal de investidores — port de routes.js 2464-2555 ──
// Exclui cópias duplicadas (Ativo/Passivo) — só contam pessoas únicas.
app.get("/relatorio/investidores", async (c: any) => {
  try {
    const { rows: investidores } = await pool.query("SELECT * FROM investidores WHERE duplicado_de IS NULL OR duplicado_de = id ORDER BY pontuacao DESC NULLS LAST");
    const { rows: negocios } = await pool.query("SELECT * FROM negocios");
    const { rows: reunioes } = await pool.query("SELECT id, entidade_id, data, duracao_min FROM reunioes WHERE entidade_tipo = 'investidores'");
    const now = new Date();

    const statusOrder = ["Pendente de Aprovação", "Potencial Investidor", "Marcar call", "Call marcada", "Follow Up", "Investidor Qualificado em Carteira", "Negociação de Deal", "Investidor em parceria", "Investidor Ativo", "Não qualificado", "Inactivo"];

    const report: any = {
      gerado_em: now.toISOString(),
      semana: `${now.toISOString().slice(0, 10)} (Semana ${Math.ceil(now.getDate() / 7)})`,
      total_investidores: investidores.length,
      distribuicao: { A: 0, B: 0, C: 0, D: 0, "Sem classificação": 0 },
      por_status: {},
      top5: [],
      investidores_detalhados: [],
      alertas: { sem_contacto_30d: 0, sem_reuniao: 0, sem_capital: 0, sem_classificacao: 0, nda_pendente: 0 },
      metricas_globais: {
        capital_total: 0, capital_investido: 0, media_capital: 0,
        com_reuniao: 0, com_nda: 0, em_parceria: 0,
        taxa_conversao: 0, ticket_medio: 0,
      },
    };

    for (const s of statusOrder) report.por_status[s] = 0;

    let somaCapital = 0, comCapital = 0;

    for (const inv of investidores) {
      const classe = inv.classificacao || "Sem classificação";
      if (report.distribuicao[classe] !== undefined) report.distribuicao[classe]++;
      else report.distribuicao["Sem classificação"]++;

      const status = inv.status || "?";
      if (report.por_status[status] !== undefined) report.por_status[status]++;
      else report.por_status[status] = (report.por_status[status] || 0) + 1;

      const capitalMax = inv.capital_max || 0;
      const montante = inv.montante_investido || 0;
      const meusNegocios = negocios.filter((n: any) => (n.investidor_ids || "").includes(inv.id));
      const minhasReunioes = reunioes.filter((r: any) => r.entidade_id === inv.id);

      const diasSemContacto = inv.data_ultimo_contacto
        ? Math.floor((now.getTime() - new Date(inv.data_ultimo_contacto).getTime()) / 86400000)
        : null;

      if (!inv.data_ultimo_contacto || (diasSemContacto !== null && diasSemContacto > 30)) report.alertas.sem_contacto_30d++;
      if (minhasReunioes.length === 0) report.alertas.sem_reuniao++;
      if (!capitalMax) report.alertas.sem_capital++;
      if (!inv.classificacao) report.alertas.sem_classificacao++;
      if (!inv.nda_assinado && ["Investidor Qualificado em Carteira", "Investidor em parceria", "Negociação de Deal", "Investidor Ativo"].includes(status)) report.alertas.nda_pendente++;

      if (capitalMax > 0) { somaCapital += capitalMax; comCapital++; }
      report.metricas_globais.capital_total += capitalMax;
      report.metricas_globais.capital_investido += montante;
      if (minhasReunioes.length > 0) report.metricas_globais.com_reuniao++;
      if (inv.nda_assinado) report.metricas_globais.com_nda++;
      if (status === "Investidor em parceria" || status === "Investidor Ativo") report.metricas_globais.em_parceria++;

      let estrategias: any[] = [];
      try { estrategias = JSON.parse(inv.estrategia || "[]"); } catch { /* ignore */ }

      report.investidores_detalhados.push({
        id: inv.id, nome: inv.nome, status, classificacao: inv.classificacao || null,
        pontuacao: inv.pontuacao || 0, capitalMax, montanteInvestido: montante,
        email: inv.email, telemovel: inv.telemovel,
        estrategias, perfilRisco: inv.perfil_risco,
        ndaAssinado: !!inv.nda_assinado,
        reunioes: minhasReunioes.length, negocios: meusNegocios.length,
        diasSemContacto, proximaAcao: inv.proxima_acao, dataProximaAcao: inv.data_proxima_acao,
        dataReuniao: inv.data_reuniao, dataPrimeiroContacto: inv.data_primeiro_contacto,
      });
    }

    report.metricas_globais.media_capital = comCapital > 0 ? Math.round(somaCapital / comCapital) : 0;
    report.metricas_globais.taxa_conversao = investidores.length > 0
      ? Math.round(report.metricas_globais.em_parceria / investidores.length * 100) : 0;
    report.metricas_globais.ticket_medio = report.metricas_globais.em_parceria > 0
      ? Math.round(report.metricas_globais.capital_investido / report.metricas_globais.em_parceria) : 0;

    report.top5 = report.investidores_detalhados
      .filter((i: any) => i.capitalMax > 0)
      .sort((a: any, b: any) => b.capitalMax - a.capitalMax)
      .slice(0, 5)
      .map((i: any) => ({ nome: i.nome, classificacao: i.classificacao, capital: i.capitalMax, status: i.status, reunioes: i.reunioes }));

    return c.json(report);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Scorecards Discovery Call (SOP 2) — port de routes.js 2667-2737 ──
app.get("/scorecards/rubrica", (c: any) => {
  return c.json({ pesos: PESOS_SCORECARD, criterios: CRITERIOS_LABELS, rubrica: RUBRICA });
});

app.get("/scorecards/:investidorId", async (c: any) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM scorecards WHERE investidor_id = $1 ORDER BY created_at DESC",
      [c.req.param("investidorId")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/scorecards", async (c: any) => {
  try {
    const { investidor_id, reuniao_id, tipo_investidor, c1_score, c2_score, c3_score, c4_score, c5_score,
      c1_notas, c2_notas, c3_notas, c4_notas, c5_notas, avaliador, fonte } = await c.req.json().catch(() => ({}));

    if (!investidor_id) return c.json({ error: "investidor_id obrigatório" }, 400);

    const tipo = tipo_investidor || "Passivo";
    const scores = { c1: +c1_score || 0, c2: +c2_score || 0, c3: +c3_score || 0, c4: +c4_score || 0, c5: +c5_score || 0 };
    const { total, ponderado, classificacao } = calcularScorecard(scores, tipo);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO scorecards (id, investidor_id, reuniao_id, tipo_investidor,
        c1_score, c2_score, c3_score, c4_score, c5_score,
        c1_notas, c2_notas, c3_notas, c4_notas, c5_notas,
        pontuacao_total, pontuacao_ponderada, classificacao,
        avaliador, fonte, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
      [id, investidor_id, reuniao_id || null, tipo,
        scores.c1, scores.c2, scores.c3, scores.c4, scores.c5,
        c1_notas || null, c2_notas || null, c3_notas || null, c4_notas || null, c5_notas || null,
        total, ponderado, classificacao,
        avaliador || "Sistema", fonte || "manual", now],
    );

    const { rows: [inv] } = await pool.query("SELECT classificacao, pontuacao FROM investidores WHERE id = $1", [investidor_id]);

    await pool.query(
      `UPDATE investidores SET classificacao = $1, pontuacao = $2,
        status = CASE WHEN status IN ('Call marcada','Follow Up') THEN 'Investidor Qualificado em Carteira' ELSE status END,
        updated_at = $3 WHERE id = $4`,
      [classificacao, ponderado, now, investidor_id],
    );

    await pool.query(
      `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova,
        pontuacao_anterior, pontuacao_nova, motivo, tipo, scorecard_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(), investidor_id, inv?.classificacao || null, classificacao,
        inv?.pontuacao || 0, ponderado, "Scorecard Discovery Call", fonte || "manual", id, now],
    );

    return c.json({
      ok: true, id, classificacao, pontuacao_ponderada: ponderado, pontuacao_total: total,
      classificacao_anterior: inv?.classificacao || null,
    });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Historico de classificacao — port de routes.js 2740-2748 ──
app.get("/classificacao-historico/:investidorId", async (c: any) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM classificacao_historico WHERE investidor_id = $1 ORDER BY created_at DESC",
      [c.req.param("investidorId")],
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Duplicar investidor (Ativo <-> Passivo) — port de routes.js 2751-2812 ──
app.post("/investidores/:id/duplicar", async (c: any) => {
  try {
    const { tipo_principal } = await c.req.json().catch(() => ({}));
    if (!tipo_principal || !["Ativo", "Passivo"].includes(tipo_principal)) {
      return c.json({ error: 'tipo_principal deve ser "Ativo" ou "Passivo"' }, 400);
    }

    const { rows: [original] } = await pool.query("SELECT * FROM investidores WHERE id = $1", [c.req.param("id")]);
    if (!original) return c.json({ error: "Investidor não encontrado" }, 404);

    if (original.tipo_principal === tipo_principal) {
      return c.json({ error: `Investidor já é ${tipo_principal}` }, 400);
    }

    const { rows: existente } = await pool.query(
      "SELECT id FROM investidores WHERE duplicado_de = $1 AND tipo_principal = $2",
      [original.duplicado_de || original.id, tipo_principal],
    );
    if (existente.length > 0) {
      return c.json({ error: `Já existe duplicado ${tipo_principal} (ID: ${existente[0].id})`, duplicado_id: existente[0].id }, 400);
    }

    const novoId = crypto.randomUUID();
    const now = new Date().toISOString();
    const origemId = original.duplicado_de || original.id;

    await pool.query(
      `INSERT INTO investidores (id, nome, status, origem, telemovel, email,
        capital_min, capital_max, perfil_risco, nda_assinado,
        data_primeiro_contacto, data_ultimo_contacto, data_reuniao,
        tipo_principal, duplicado_de, tipo_investidor, notas,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)`,
      [novoId,
        `${original.nome} (${tipo_principal})`,
        "Potencial Investidor",
        original.origem,
        original.telemovel,
        original.email,
        original.capital_min || 0,
        original.capital_max || 0,
        original.perfil_risco,
        original.nda_assinado || 0,
        original.data_primeiro_contacto,
        original.data_ultimo_contacto,
        original.data_reuniao,
        tipo_principal,
        origemId,
        JSON.stringify([tipo_principal]),
        `Duplicado de "${original.nome}" (${original.tipo_principal || "Passivo"}) — perfil ${tipo_principal}`,
        now],
    );

    if (!original.duplicado_de) {
      await pool.query("UPDATE investidores SET duplicado_de = $1 WHERE id = $1", [original.id]);
    }

    return c.json({ ok: true, id: novoId, nome: `${original.nome} (${tipo_principal})`, tipo_principal });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Reclassificacao periodica — port de routes.js 2816-2912 ──
const FOLLOWUP_INVESTIDOR_RULES: Record<string, any> = {
  A: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 5, penalizacao_frio: 15 },
  B: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 8, penalizacao_frio: 20 },
  C: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 10, penalizacao_frio: 25 },
  D: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 5, penalizacao_frio: 10 },
};

app.post("/automation/reclassificar-investidores", async (c: any) => {
  try {
    const { rows: investidores } = await pool.query("SELECT * FROM investidores");
    const { rows: allScorecards } = await pool.query("SELECT * FROM scorecards ORDER BY created_at DESC");
    const now = new Date();
    const updated: any[] = [];
    const alertas: any = { promovidos: [], despromovidos: [], follow_up_urgente: [], arquivo: [] };

    for (const inv of investidores) {
      if (!inv.classificacao || inv.classificacao === "D") continue;

      const ultimoScorecard = allScorecards.find((s: any) => s.investidor_id === inv.id);
      if (!ultimoScorecard) continue;

      const ultimoContacto = inv.data_ultimo_contacto || inv.data_reuniao || inv.data_primeiro_contacto;
      if (!ultimoContacto) continue;

      const diasSem = Math.floor((now.getTime() - new Date(ultimoContacto).getTime()) / 86400000);
      const rules = FOLLOWUP_INVESTIDOR_RULES[inv.classificacao] || FOLLOWUP_INVESTIDOR_RULES.C;

      let penalizacao = 0;
      let tipoFollowUp: string | null = null;

      if (diasSem >= rules.dias_frio) {
        penalizacao = rules.penalizacao_frio;
        tipoFollowUp = "frio";
      } else if (diasSem >= rules.dias_intermedio) {
        penalizacao = rules.penalizacao_intermedio;
        tipoFollowUp = "intermedio";
      } else if (diasSem >= rules.dias_quente) {
        penalizacao = rules.penalizacao_quente;
        tipoFollowUp = "quente";
      }

      if (penalizacao === 0) continue;

      let bonus = 0;
      if (inv.nda_assinado) bonus += 5;
      if (inv.montante_investido > 0) bonus += 10;
      if (inv.numero_negocios > 0) bonus += 10;

      const pontuacaoAjustada = Math.max(0, Math.min(100, (inv.pontuacao || 0) - penalizacao + bonus));
      const novaClassificacao = pontuacaoAjustada >= 88 ? "A" : pontuacaoAjustada >= 72 ? "B" : pontuacaoAjustada >= 56 ? "C" : "D";

      if (novaClassificacao !== inv.classificacao || Math.abs(pontuacaoAjustada - (inv.pontuacao || 0)) > 1) {
        const motivo = `Reclassificação periódica — ${diasSem}d sem contacto (follow-up ${tipoFollowUp}), penalização ${penalizacao}pts` +
          (bonus > 0 ? `, bónus engagement +${bonus}pts` : "");

        await pool.query(
          "UPDATE investidores SET classificacao = $1, pontuacao = $2, data_follow_up = $3, updated_at = $3 WHERE id = $4",
          [novaClassificacao, pontuacaoAjustada, now.toISOString(), inv.id],
        );

        await pool.query(
          `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova,
            pontuacao_anterior, pontuacao_nova, motivo, tipo, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [crypto.randomUUID(), inv.id, inv.classificacao, novaClassificacao,
            inv.pontuacao || 0, pontuacaoAjustada, motivo, "reclassificacao_periodica", now.toISOString()],
        );

        const mudanca = {
          nome: inv.nome, de: inv.classificacao, para: novaClassificacao,
          pontuacao_de: inv.pontuacao || 0, pontuacao_para: pontuacaoAjustada, diasSem, tipoFollowUp,
        };
        updated.push(mudanca);

        if (novaClassificacao > inv.classificacao) alertas.despromovidos.push(mudanca);
        else alertas.promovidos.push(mudanca);

        if (novaClassificacao === "C" || novaClassificacao === "D") {
          const primContacto = inv.data_primeiro_contacto ? new Date(inv.data_primeiro_contacto) : null;
          if (primContacto && Math.floor((now.getTime() - primContacto.getTime()) / 86400000) > 180) {
            alertas.arquivo.push({ nome: inv.nome, classificacao: novaClassificacao, diasTotal: Math.floor((now.getTime() - primContacto.getTime()) / 86400000) });
          }
        }
      }

      if (tipoFollowUp === "intermedio" && novaClassificacao === inv.classificacao) {
        alertas.follow_up_urgente.push({ nome: inv.nome, classificacao: inv.classificacao, diasSem, proximoLimite: rules.dias_frio });
      }
    }

    return c.json({ ok: true, atualizados: updated.length, detalhes: updated, alertas });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Relatorio semanal de consultores — port de routes.js 2915-2997 ──
app.get("/relatorio/consultores", async (c: any) => {
  try {
    const { rows: consultores } = await pool.query("SELECT * FROM consultores ORDER BY score_prioridade DESC NULLS LAST");
    const { rows: imoveis } = await pool.query("SELECT nome_consultor, estado, check_qualidade FROM imoveis WHERE nome_consultor IS NOT NULL");
    const { rows: interacoes } = await pool.query("SELECT consultor_id, data_hora, direcao FROM consultor_interacoes");
    const now = new Date();

    const leadCounts = consultores.map((cn: any) =>
      imoveis.filter((i: any) => i.nome_consultor?.trim().toLowerCase() === cn.nome?.trim().toLowerCase()).length
    );
    const maxLeads = Math.max(...leadCounts, 1);

    const report: any = {
      gerado_em: now.toISOString(),
      semana: `${now.toISOString().slice(0, 10)} (Semana ${Math.ceil((now.getDate()) / 7)})`,
      total_consultores: consultores.length,
      distribuicao: { A: 0, B: 0, C: 0, D: 0, Inativo: 0 },
      top5: [],
      consultores_detalhados: [],
      alertas: { sem_contacto_48h: 0, inativos_15d: 0, inativos_60d: 0 },
      metricas_globais: { media_score: 0, media_qualidade: 0, total_imoveis: imoveis.length, consultores_com_imoveis: 0, consultores_com_interacoes: 0 },
    };

    let somaScore = 0, somaQual = 0, comImoveis = 0;

    for (const cn of consultores) {
      const meusImoveis = imoveis.filter((i: any) => i.nome_consultor?.trim().toLowerCase() === cn.nome?.trim().toLowerCase());
      const totalIm = meusImoveis.length;
      const minhasInt = interacoes.filter((i: any) => i.consultor_id === cn.id);

      const somaQ = meusImoveis.reduce((sum: number, im: any) => sum + qualidadeImovel(im.estado), 0);
      const tq = totalIm > 0 ? Math.round(somaQ / totalIm * 100) : 0;
      const vol = Math.min(Math.round(totalIm / maxLeads * 100), 100);

      const tempos: number[] = [];
      for (let i = 0; i < minhasInt.length; i++) {
        if (minhasInt[i].direcao === "Enviado") {
          const resp = minhasInt.slice(i + 1).find((x: any) => x.direcao === "Resposta");
          if (resp) { const h = (new Date(resp.data_hora).getTime() - new Date(minhasInt[i].data_hora).getTime()) / 3600000; if (h >= 0) tempos.push(h); }
        }
      }
      const tmr = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length * 10) / 10 : null;
      const sp = tempos.length > 0 ? Math.max(0, Math.min(100, Math.round(100 - (tmr as number) * 2))) : 50;

      const score = totalIm > 0 ? Math.round(tq * 0.5 + vol * 0.3 + sp * 0.2) : 0;
      const classe = totalIm > 0 ? CLASSE_POR_SCORE(score) : "D";

      const diasCriado = Math.floor((now.getTime() - new Date(cn.created_at).getTime()) / 86400000);
      const ultimaInt = minhasInt.sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())[0];
      const diasSemContacto = ultimaInt ? Math.floor((now.getTime() - new Date(ultimaInt.data_hora).getTime()) / 86400000) : null;

      report.distribuicao[classe]++;
      if (totalIm > 0) { comImoveis++; somaScore += score; somaQual += tq; }
      if (minhasInt.length > 0) report.metricas_globais.consultores_com_interacoes++;
      if (diasCriado > 2 && minhasInt.length === 0) report.alertas.sem_contacto_48h++;
      if (diasSemContacto !== null && diasSemContacto > 15) report.alertas.inativos_15d++;
      if ((diasSemContacto !== null && diasSemContacto > 60) || (diasSemContacto === null && diasCriado > 60)) report.alertas.inativos_60d++;

      const imoveisDetalhe = meusImoveis.map((im: any) => ({
        nome: im.nome_consultor, estado: (im.estado || "").replace(/^\d+-\s*/, ""),
        qualidade: Math.round(qualidadeImovel(im.estado) * 100),
      }));

      report.consultores_detalhados.push({
        nome: cn.nome, score, classe, classeLabel: CLASSE_LABEL[classe] || classe,
        taxaQualidade: tq, volume: totalIm, tempoResposta: tmr,
        estatuto: cn.estatuto, agencia: (() => { try { return JSON.parse(cn.imobiliaria || "[]").join(", "); } catch { return ""; } })(),
        contacto: cn.contacto, email: cn.email,
        diasSemContacto, proximoFollowUp: cn.data_proximo_follow_up,
        imoveis: imoveisDetalhe, interacoes: minhasInt.length,
      });
    }

    report.metricas_globais.consultores_com_imoveis = comImoveis;
    report.metricas_globais.media_score = comImoveis > 0 ? Math.round(somaScore / comImoveis) : 0;
    report.metricas_globais.media_qualidade = comImoveis > 0 ? Math.round(somaQual / comImoveis) : 0;
    report.top5 = report.consultores_detalhados.filter((cn: any) => cn.score > 0).slice(0, 5).map((cn: any) => ({
      nome: cn.nome, score: cn.score, classe: cn.classe, imoveis: cn.volume, qualidade: cn.taxaQualidade,
    }));

    return c.json(report);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Run-all automacoes — port de routes.js 2999-3011 ──
// O Express fazia fetch interno aos seus proprios /api/crm/automation/<ep>.
// Em Hono dispatchamos internamente via app.request() (basePath /crm) para os
// handlers ja portados — mesmo conjunto, mesma ordem, mesma forma de resultado.
app.post("/automation/run-all", async (c: any) => {
  try {
    const results: Record<string, any> = {};
    for (const ep of ["score-investidores", "score-consultores", "score-prioridade-consultores", "calc-roi"]) {
      try {
        const r = await app.request(`/crm/automation/${ep}`, { method: "POST" });
        results[ep] = await r.json();
      } catch (e) { results[ep] = { error: (e as Error).message }; }
    }
    return c.json({ ok: true, results });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Audit log — port de routes.js 3014-3025 ──
app.get("/audit", async (c: any) => {
  try {
    const limit = c.req.query("limit") ?? "50";
    const tabela = c.req.query("tabela");
    let query = "SELECT * FROM audit_log";
    const params: any[] = [];
    if (tabela) { query += " WHERE tabela = $1"; params.push(tabela); }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(+limit);
    const { rows } = await pool.query(query, params);
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Undo (reverter alteracao via audit log) — port de routes.js 3028-3078 ──
app.post("/undo/:auditId", async (c: any) => {
  try {
    const { rows } = await pool.query("SELECT * FROM audit_log WHERE id = $1", [c.req.param("auditId")]);
    if (!rows[0]) return c.json({ error: "Entrada não encontrada" }, 404);
    const entry = rows[0];
    const tabela = entry.tabela;
    const registoId = entry.registo_id;

    if (entry.acao === "UPDATE" && entry.dados_anteriores) {
      const anterior = JSON.parse(entry.dados_anteriores);
      const SKIP = new Set(["id", "created_at", "notion_id"]);
      const fields = Object.entries(anterior).filter(([k]) => !SKIP.has(k));
      const sets = fields.map(([k], i) => `${k} = $${i + 1}`);
      const params = [...fields.map(([, v]) => v), registoId];
      await pool.query(`UPDATE ${tabela} SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
      await pool.query(
        "INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)",
        [tabela, registoId, "UNDO", entry.dados_novos, entry.dados_anteriores],
      );
      return c.json({ ok: true, action: "restored", tabela, registoId });
    } else if (entry.acao === "DELETE" && entry.dados_anteriores) {
      const anterior = JSON.parse(entry.dados_anteriores);
      const fields = Object.entries(anterior).filter(([, v]) => v !== undefined && v !== null);
      const cols = fields.map(([k]) => k);
      const vals = fields.map((_, i) => `$${i + 1}`);
      const params = fields.map(([, v]) => v);
      await pool.query(`INSERT INTO ${tabela} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT (id) DO NOTHING`, params);
      await pool.query(
        "INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)",
        [tabela, registoId, "UNDO_DELETE", null, entry.dados_anteriores],
      );
      return c.json({ ok: true, action: "restored_deleted", tabela, registoId });
    } else if (entry.acao === "INSERT") {
      await pool.query(`DELETE FROM ${tabela} WHERE id = $1`, [registoId]);
      await pool.query(
        "INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)",
        [tabela, registoId, "UNDO_INSERT", entry.dados_novos, null],
      );
      return c.json({ ok: true, action: "deleted_created", tabela, registoId });
    } else {
      return c.json({ error: "Não é possível reverter esta ação" }, 400);
    }
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Backup — port de routes.js 3081-3243 ──
const BACKUP_TABLES = ["imoveis", "investidores", "consultores", "negocios", "despesas", "tarefas"];

app.get("/backup", async (c: any) => {
  try {
    const backup: any = {};
    let total = 0;
    for (const t of BACKUP_TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`);
      backup[t] = rows;
      total += rows.length;
    }
    const { rows: audit } = await pool.query("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500");
    backup.audit_log = audit;
    backup.exported_at = new Date().toISOString();
    backup.total = total;
    if (c.req.query("download") === "true") {
      c.header("Content-Type", "application/json");
      c.header("Content-Disposition", `attachment; filename=somnium-backup-${new Date().toISOString().slice(0, 10)}.json`);
    }
    return c.json(backup);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/backup/auto", async (c: any) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backups (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        total_registos INT DEFAULT 0,
        created_at TEXT DEFAULT (NOW()::TEXT)
      )
    `);
    const backup: any = {};
    let total = 0;
    for (const t of BACKUP_TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`);
      backup[t] = rows;
      total += rows.length;
    }
    await pool.query(
      "INSERT INTO backups (data, total_registos, created_at) VALUES ($1, $2, $3)",
      [JSON.stringify(backup), total, new Date().toISOString()],
    );
    await pool.query(`DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT 30)`);
    return c.json({ ok: true, total, timestamp: new Date().toISOString() });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/backup/list", async (c: any) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS backups (id SERIAL PRIMARY KEY, data JSONB NOT NULL, total_registos INT DEFAULT 0, created_at TEXT DEFAULT (NOW()::TEXT))`);
    const { rows } = await pool.query("SELECT id, total_registos, created_at FROM backups ORDER BY created_at DESC LIMIT 30");
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/backup/restore/:id", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { rows } = await pool.query("SELECT * FROM backups WHERE id = $1", [c.req.param("id")]);
    if (!rows[0]) return c.json({ error: "Backup não encontrado" }, 404);

    const restoreRegiao = (body?.regiao === "AMP" || body?.regiao === "Coimbra") ? body.regiao : null;
    const confirmPerdaAmp = body?.confirm_perda_amp === true;

    const backup = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
    const backupTemAmp = (backup.imoveis || []).some((r: any) => r.regiao === "AMP")
      || (backup.consultores || []).some((r: any) => r.regiao === "AMP")
      || (backup.negocios || []).some((r: any) => r.regiao === "AMP");
    const { rows: ampActual } = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM imoveis WHERE regiao = 'AMP') AS imoveis,
              (SELECT COUNT(*)::int FROM consultores WHERE regiao = 'AMP') AS consultores,
              (SELECT COUNT(*)::int FROM negocios WHERE regiao = 'AMP') AS negocios`,
    );
    const totalAmpAtual = (ampActual[0]?.imoveis || 0) + (ampActual[0]?.consultores || 0) + (ampActual[0]?.negocios || 0);
    if (!restoreRegiao && !backupTemAmp && totalAmpAtual > 0 && !confirmPerdaAmp) {
      return c.json({
        error: "Restore bloqueado: backup é anterior à expansão AMP e existem " + totalAmpAtual +
          ' registos AMP que seriam perdidos. Reenvie com {"confirm_perda_amp":true} para forçar, ' +
          'ou {"regiao":"Coimbra"} para restaurar só Coimbra preservando AMP.',
        amp_atual: ampActual[0],
        backup_tem_amp: backupTemAmp,
      }, 409);
    }

    const currentBackup: any = {};
    let currentTotal = 0;
    for (const t of BACKUP_TABLES) {
      const { rows: current } = await pool.query(`SELECT * FROM ${t}`);
      currentBackup[t] = current;
      currentTotal += current.length;
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS backups (id SERIAL PRIMARY KEY, data JSONB NOT NULL, total_registos INT DEFAULT 0, created_at TEXT DEFAULT (NOW()::TEXT))`);
    await pool.query(
      "INSERT INTO backups (data, total_registos, created_at) VALUES ($1, $2, $3)",
      [JSON.stringify(currentBackup), currentTotal, new Date().toISOString() + "_pre_restore"],
    );

    let restored = 0;
    for (const t of BACKUP_TABLES) {
      if (!backup[t]?.length) continue;
      if (restoreRegiao) {
        const colsCheck = await pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='regiao' LIMIT 1`, [t]);
        const hasRegiao = (colsCheck.rowCount ?? 0) > 0;
        if (hasRegiao) {
          await pool.query(`DELETE FROM ${t} WHERE regiao = $1`, [restoreRegiao]);
        } else {
          continue;
        }
        for (const row of backup[t]) {
          if ((row.regiao || "Coimbra") !== restoreRegiao) continue;
          const fields = Object.entries(row).filter(([, v]) => v !== undefined && v !== null);
          const cols = fields.map(([k]) => k);
          const vals = fields.map((_, i) => `$${i + 1}`);
          await pool.query(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT (id) DO NOTHING`, fields.map(([, v]) => v));
          restored++;
        }
      } else {
        await pool.query(`DELETE FROM ${t}`);
        for (const row of backup[t]) {
          const fields = Object.entries(row).filter(([, v]) => v !== undefined && v !== null);
          const cols = fields.map(([k]) => k);
          const vals = fields.map((_, i) => `$${i + 1}`);
          await pool.query(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT (id) DO NOTHING`, fields.map(([, v]) => v));
          restored++;
        }
      }
    }
    return c.json({ ok: true, restored, fromBackup: rows[0].created_at, regiao: restoreRegiao || "global" });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/backup/:id/download", async (c: any) => {
  try {
    const { rows } = await pool.query("SELECT * FROM backups WHERE id = $1", [c.req.param("id")]);
    if (!rows[0]) return c.json({ error: "Backup não encontrado" }, 404);
    const data = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
    data.exported_at = rows[0].created_at;
    data.total = rows[0].total_registos;
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename=somnium-backup-${rows[0].created_at.slice(0, 10)}.json`);
    return c.json(data);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── WhatsApp unread counts + mark-seen — port de routes.js 3246-3274 ──
app.get("/whatsapp/unread-counts", async (c: any) => {
  try {
    const { rows } = await pool.query(`
      SELECT ci.consultor_id, COUNT(*)::int as unread
      FROM consultor_interacoes ci
      LEFT JOIN whatsapp_last_seen ls ON ls.consultor_id = ci.consultor_id
      WHERE ci.canal = 'whatsapp'
        AND ci.direcao = 'Recebido'
        AND ci.data_hora > COALESCE(ls.last_seen_at, '1970-01-01')
      GROUP BY ci.consultor_id
      HAVING COUNT(*) > 0
    `);
    const result: Record<string, number> = {};
    for (const r of rows) result[r.consultor_id] = r.unread;
    return c.json(result);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/whatsapp/mark-seen/:id", async (c: any) => {
  try {
    await pool.query(
      `INSERT INTO whatsapp_last_seen (consultor_id, last_seen_at)
       VALUES ($1, $2)
       ON CONFLICT (consultor_id) DO UPDATE SET last_seen_at = $2`,
      [c.req.param("id"), new Date().toISOString()],
    );
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Estudo de localizacao: POIs sugeridos — port de routes.js 3279-3292 ──
const POIS_SUGERIDOS = [
  { categoria: "Mercearia/Supermercado", icone: "🛒" },
  { categoria: "Hospital", icone: "🏥" },
  { categoria: "Farmácia", icone: "💊" },
  { categoria: "Escola Básica", icone: "🏫" },
  { categoria: "Estação de Comboios", icone: "🚆" },
  { categoria: "Centro Comercial", icone: "🛍️" },
  { categoria: "Restaurante", icone: "🍽️" },
  { categoria: "Ginásio", icone: "🏋️" },
  { categoria: "Acesso A1/A8", icone: "🛣️" },
  { categoria: "Aeroporto", icone: "✈️" },
];

app.get("/imoveis/pois/sugeridos", (c: any) => c.json(POIS_SUGERIDOS));

// ── Distancias: Distance Matrix API (Google Maps + UPDATE imoveis) — port de routes.js 3294-3374 ──
app.post("/imoveis/:id/distancias", async (c: any) => {
  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) return c.json({ error: "GOOGLE_MAPS_API_KEY não configurada" }, 500);

    const { rows: [imovel] } = await pool.query("SELECT id, nome, morada, zona FROM imoveis WHERE id = $1", [c.req.param("id")]);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const origem = (body?.origem || imovel.morada || imovel.zona || "").trim();
    if (!origem) return c.json({ error: "Indica morada/origem do imóvel (ou preenche o campo morada)." }, 400);

    const destinos = Array.isArray(body?.destinos) ? body.destinos.filter((d: any) => d?.endereco?.trim()) : [];
    if (destinos.length === 0) return c.json({ error: "Lista de destinos vazia." }, 400);
    if (destinos.length > 25) return c.json({ error: "Máximo 25 destinos por chamada (limite Distance Matrix)." }, 400);

    const mode = body?.mode === "walking" ? "walking" : body?.mode === "bicycling" ? "bicycling" : body?.mode === "transit" ? "transit" : "driving";
    const region = "pt";

    async function matrixFor(modeX: string) {
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", origem);
      url.searchParams.set("destinations", destinos.map((d: any) => d.endereco).join("|"));
      url.searchParams.set("mode", modeX);
      url.searchParams.set("region", region);
      url.searchParams.set("language", "pt");
      url.searchParams.set("key", apiKey!);
      const resp = await fetch(url.toString());
      const j = await resp.json();
      if (j.status !== "OK") {
        const err: any = new Error(`Distance Matrix (${modeX}): ${j.status}${j.error_message ? " — " + j.error_message : ""}`);
        err.detalhe = j.error_message || null;
        throw err;
      }
      return j;
    }

    const [jCar, jWalk] = await Promise.all([matrixFor("driving"), matrixFor("walking")]);
    const carEls = jCar.rows?.[0]?.elements || [];
    const walkEls = jWalk.rows?.[0]?.elements || [];
    const pick = (el: any) => ({
      distancia_metros: el?.status === "OK" ? el.distance?.value ?? null : null,
      distancia_texto: el?.status === "OK" ? el.distance?.text ?? null : null,
      duracao_segundos: el?.status === "OK" ? el.duration?.value ?? null : null,
      duracao_texto: el?.status === "OK" ? el.duration?.text ?? null : null,
      status: el?.status || "UNKNOWN",
    });

    const resultados = destinos.map((d: any, i: number) => {
      const carro = pick(carEls[i]);
      const pe = pick(walkEls[i]);
      return {
        categoria: d.categoria || null,
        icone: d.icone || null,
        endereco: d.endereco,
        carro,
        pe,
        ...carro,
      };
    });

    const payload = {
      origem,
      mode,
      origem_resolvida: jCar.origin_addresses?.[0] || jWalk.origin_addresses?.[0] || null,
      atualizado_em: new Date().toISOString(),
      resultados,
    };

    await pool.query(
      `UPDATE imoveis SET pois_distancias = $1::jsonb, pois_atualizado_em = NOW(), morada = COALESCE(NULLIF($2,''), morada), updated_at = NOW()::text WHERE id = $3`,
      [JSON.stringify(payload), origem, imovel.id],
    );

    return c.json(payload);
  } catch (e) {
    console.error("[distancias]", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Estudo de localizacao auto — port de routes.js 3377-3395 ──
app.post("/imoveis/:id/estudo-localizacao", async (c: any) => {
  try {
    if (!supabase) return c.json({ error: "Supabase Storage não configurado" }, 500);
    const reqBody = await c.req.json().catch(() => ({}));
    const r = await runEstudoLocalizacao({
      pool,
      supabaseStorage: supabase,
      imovelId: c.req.param("id"),
      destinos: reqBody?.destinos,
      mode: reqBody?.mode || "driving",
      highlights: Array.isArray(reqBody?.highlights) ? reqBody.highlights : [],
      destaque: reqBody?.destaque || null,
      origem: reqBody?.origem || null,
    });
    return c.json(r);
  } catch (e) {
    console.error("[estudo-localizacao]", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── GET distancias gravadas — port de routes.js 3397-3407 ──
app.get("/imoveis/:id/distancias", async (c: any) => {
  try {
    const { rows: [imovel] } = await pool.query("SELECT pois_distancias, pois_atualizado_em, morada FROM imoveis WHERE id = $1", [c.req.param("id")]);
    if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);
    return c.json({
      morada: imovel.morada || null,
      atualizado_em: imovel.pois_atualizado_em,
      payload: imovel.pois_distancias || null,
    });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Relatorios Semanais Administracao — port de routes.js 3410-3510 ──
app.get("/relatorios-semanais", async (c: any) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, semana_iso, data_inicio, data_fim, titulo, subtitulo, reuniao_ids, notas, created_at, updated_at FROM relatorios_semanais ORDER BY data_inicio DESC",
    );
    return c.json(rows);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/relatorios-semanais/:id", async (c: any) => {
  try {
    const { rows: [r] } = await pool.query("SELECT * FROM relatorios_semanais WHERE id = $1", [c.req.param("id")]);
    if (!r) return c.json({ error: "Relatório não encontrado" }, 404);
    return c.json(r);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── PDF relatorio semanal — port de routes.js 3427-3460 ──
// O Express servia um pdf_original_path do disco quando existia; em Deno (isolate
// sem FS persistente, sem streamPdfToResAndPersist) geramos sempre do template e
// devolvemos inline via streamToBuffer.
app.get("/relatorios-semanais/:id/pdf", async (c: any) => {
  try {
    const { rows: [r] } = await pool.query("SELECT * FROM relatorios_semanais WHERE id = $1", [c.req.param("id")]);
    if (!r) return c.json({ error: "Relatório não encontrado" }, 404);
    const doc = generateRelatorioSemanalPDF(r);
    const buffer = await streamToBuffer(doc);
    return c.body(buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Relatorio_Semanal_${r.semana_iso}.pdf"`,
    });
  } catch (e) { console.error("[relatorios-semanais/pdf]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── Gerar relatorio semanal — port de routes.js 3462-3472 ──
app.post("/relatorios-semanais/gerar", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { semana_iso, data_inicio, data_fim, regenerar } = body || {};
    const result = await gerarRelatorioSemanal({ semana_iso, data_inicio, data_fim, regenerar });
    return c.json(result);
  } catch (e) { console.error("[relatorios-semanais/gerar]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── Auto-gerar relatorios semanais — port de routes.js 3474-3484 ──
app.post("/relatorios-semanais/auto-gerar", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const apenas_pendentes = body?.apenas_pendentes ?? c.req.query("apenas_pendentes") === "true";
    const r = await autoGerarRelatoriosSemanaisPendentes({ apenas_pendentes: !!apenas_pendentes });
    return c.json(r);
  } catch (e) { console.error("[relatorios-semanais/auto-gerar]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

app.delete("/relatorios-semanais/:id", async (c: any) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM relatorios_semanais WHERE id = $1", [c.req.param("id")]);
    if (rowCount === 0) return c.json({ error: "Não encontrado" }, 404);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.put("/relatorios-semanais/:id", async (c: any) => {
  try {
    const { titulo, subtitulo, conteudo_json, notas } = await c.req.json().catch(() => ({}));
    const sets = ["updated_at = $1"];
    const params: any[] = [new Date().toISOString()];
    if (titulo !== undefined) { params.push(titulo); sets.push(`titulo = $${params.length}`); }
    if (subtitulo !== undefined) { params.push(subtitulo); sets.push(`subtitulo = $${params.length}`); }
    if (conteudo_json !== undefined) {
      params.push(typeof conteudo_json === "string" ? conteudo_json : JSON.stringify(conteudo_json));
      sets.push(`conteudo_json = $${params.length}`);
    }
    if (notas !== undefined) { params.push(notas); sets.push(`notas = $${params.length}`); }
    params.push(c.req.param("id"));
    await pool.query(`UPDATE relatorios_semanais SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ════════════════════════════════════════════════════════════════
// PROJETOS FIX AND FLIP — Fases, Tarefas, Fotos
// ════════════════════════════════════════════════════════════════

// ── GET lista de projectos — port de routes.js 3519-3543 ──
app.get("/projetos/meus", async (c: any) => {
  try {
    const u = await resolveCrmUser(c);
    if (!u) {
      const { rows } = await pool.query(`SELECT n.*, i.nome AS imovel_nome FROM negocios n LEFT JOIN imoveis i ON n.imovel_id = i.id ORDER BY n.created_at DESC LIMIT 200`);
      return c.json({ data: rows, role: "admin" });
    }
    const isRestricted = RECORD_RESTRICTED_ROLES.has(u.role);
    if (!isRestricted) {
      const { rows } = await pool.query(`SELECT n.*, i.nome AS imovel_nome FROM negocios n LEFT JOIN imoveis i ON n.imovel_id = i.id WHERE n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT 200`);
      return c.json({ data: rows, role: u.role });
    }
    const { rows } = await pool.query(
      `SELECT n.*, i.nome AS imovel_nome FROM negocios n
       JOIN acessos a ON a.entidade = 'negocio' AND a.entidade_id = n.id
       LEFT JOIN imoveis i ON n.imovel_id = i.id
       WHERE a.user_id = $1 AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC`,
      [u.id],
    );
    return c.json({ data: rows, role: u.role });
  } catch (e) { console.error("[projetos/meus]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── GET fases + tarefas + fotos — port de routes.js 3546-3583 ──
app.get("/projetos/:negocioId/fases", async (c: any) => {
  try {
    const { rows: fases } = await pool.query(
      `SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`,
      [c.req.param("negocioId")],
    );
    const ids = fases.map((f: any) => f.id);
    let tarefas: any[] = [];
    let fotosCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const { rows: tarefasRows } = await pool.query(
        `SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1) ORDER BY ordem`,
        [ids],
      );
      tarefas = tarefasRows;
      const { rows: fotosRows } = await pool.query(
        `SELECT fase_id, COUNT(*)::int AS c FROM projeto_fotos WHERE fase_id = ANY($1) GROUP BY fase_id`,
        [ids],
      );
      fotosCounts = Object.fromEntries(fotosRows.map((r: any) => [r.fase_id, r.c]));
    }
    const enriched = fases.map((f: any) => {
      const fts = tarefas.filter((t) => t.fase_id === f.id);
      const concluidas = fts.filter((t) => t.concluida).length;
      const total = fts.length;
      const percTarefas = total > 0 ? Math.round((concluidas / total) * 100) : 0;
      return {
        ...f,
        tarefas: fts,
        tarefas_total: total,
        tarefas_concluidas: concluidas,
        perc_tarefas: percTarefas,
        fotos_count: fotosCounts[f.id] || 0,
      };
    });
    return c.json({ fases: enriched });
  } catch (e) { console.error("[projetos/fases]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── POST inicializar fases — usa categoria do negócio (port de routes.js 3586-3591) ──
app.post("/projetos/:negocioId/fases/inicializar", async (c: any) => {
  try {
    const negocioId = c.req.param("negocioId");
    const { rows } = await pool.query("SELECT categoria FROM negocios WHERE id = $1", [negocioId]);
    if (!rows.length) return c.json({ error: "Negócio não encontrado" }, 404);
    const categoria = rows[0].categoria;
    if (!(FASES_POR_CATEGORIA as any)[categoria]) {
      return c.json({ error: `Categoria "${categoria || "—"}" não tem workflow de fases.` }, 400);
    }
    await criarFasesProjecto(negocioId, categoria);
    return c.json({ ok: true, categoria });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── PUT fase — port de routes.js 3594-3636 ──
app.put("/projetos/fases/:faseId", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { rows: antes } = await pool.query("SELECT estado, fase_key, negocio_id FROM projeto_fases WHERE id = $1", [c.req.param("faseId")]);
    const estadoAntes = antes[0]?.estado;

    const allowed = ["estado", "perc_execucao", "data_inicio_prevista", "data_fim_prevista", "data_inicio_real", "data_fim_real", "orcamento_alocado", "custo_real", "responsavel", "notas"];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        params.push(body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) return c.json({ error: "Sem campos para atualizar" }, 400);
    sets.push(`updated_at = NOW()`);
    params.push(c.req.param("faseId"));
    const { rows } = await pool.query(`UPDATE projeto_fases SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return c.json({ error: "Fase não encontrada" }, 404);

    if (body.estado === "em_curso" && estadoAntes !== "em_curso") {
      notificarInvestidoresMudancaFase(rows[0].negocio_id, rows[0].fase_key).catch(() => {});
    }

    const user = await resolveCrmUser(c).catch(() => null);
    for (const k of Object.keys(body)) {
      audit({
        negocioId: rows[0].negocio_id, entidade: "fase", entidadeId: rows[0].id,
        acao: "update", campo: k, valorDepois: body[k],
        descricao: `Fase "${rows[0].nome}": ${k} = ${body[k]}`,
        user,
      });
    }
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST nova tarefa numa fase — port de routes.js 3639-3652 ──
app.post("/projetos/fases/:faseId/tarefas", async (c: any) => {
  try {
    const { descricao, responsavel, deadline, notas } = await c.req.json().catch(() => ({}));
    if (!descricao?.trim()) return c.json({ error: "descricao obrigatória" }, 400);
    const { rows: maxOrdem } = await pool.query("SELECT COALESCE(MAX(ordem), -1) AS m FROM projeto_tarefas WHERE fase_id = $1", [c.req.param("faseId")]);
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem, responsavel, deadline, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, c.req.param("faseId"), descricao.trim(), maxOrdem[0].m + 1, responsavel || null, deadline || null, notas || null],
    );
    return c.json(rows[0], 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── PUT tarefa — port de routes.js 3655-3694 ──
app.put("/projetos/tarefas/:tarefaId", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const allowed = ["descricao", "concluida", "responsavel", "deadline", "notas"];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        params.push(body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (body.concluida !== undefined) {
      params.push(body.concluida ? new Date().toISOString() : null);
      sets.push(`concluida_em = $${params.length}`);
    }
    if (sets.length === 0) return c.json({ error: "Sem campos" }, 400);
    params.push(c.req.param("tarefaId"));
    const { rows } = await pool.query(`UPDATE projeto_tarefas SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return c.json({ error: "Tarefa não encontrada" }, 404);

    if (body.concluida !== undefined) {
      const { rows: faseRows } = await pool.query("SELECT negocio_id FROM projeto_fases WHERE id = $1", [rows[0].fase_id]);
      const negId = faseRows[0]?.negocio_id;
      if (negId) {
        const user = await resolveCrmUser(c).catch(() => null);
        audit({
          negocioId: negId, entidade: "tarefa", entidadeId: rows[0].id,
          acao: "status_change",
          descricao: `Tarefa "${rows[0].descricao}" ${body.concluida ? "concluída" : "reaberta"}`,
          user,
        });
      }
    }
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE tarefa — port de routes.js 3696-3701 ──
app.delete("/projetos/tarefas/:tarefaId", async (c: any) => {
  try {
    await pool.query("DELETE FROM projeto_tarefas WHERE id = $1", [c.req.param("tarefaId")]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── GET fotos do projecto — port de routes.js 3716-3728 ──
app.get("/projetos/:negocioId/fotos", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT pf.*, f.fase_key, f.nome AS fase_nome, f.ordem AS fase_ordem
       FROM projeto_fotos pf
       JOIN projeto_fases f ON pf.fase_id = f.id
       WHERE pf.negocio_id = $1
       ORDER BY f.ordem, pf.created_at`,
      [c.req.param("negocioId")],
    );
    return c.json({ fotos: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST fotos da fase — port de routes.js 3730-3750 ──
// Multipart (multer array 'fotos', 20) → Hono formData + uploadPublic (bucket "projetos").
app.post("/projetos/fases/:faseId/fotos", async (c: any) => {
  try {
    const { rows: faseRows } = await pool.query("SELECT negocio_id FROM projeto_fases WHERE id = $1", [c.req.param("faseId")]);
    if (!faseRows.length) return c.json({ error: "Fase não encontrada" }, 404);
    const negocioId = faseRows[0].negocio_id;
    const form = await c.req.formData();
    const files = form.getAll("fotos").filter((f: any): f is File => f instanceof File);
    const tipo = (typeof form.get("tipo") === "string" ? form.get("tipo") as string : "") || "durante";
    const legenda = (typeof form.get("legenda") === "string" ? form.get("legenda") as string : "") || "";
    const inserted: any[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const storagePath = `fotos/${negocioId}/${crypto.randomUUID()}_${file.name}`;
      const url = await uploadPublic("projetos", storagePath, bytes, file.type || "application/octet-stream");
      const { rows } = await pool.query(
        `INSERT INTO projeto_fotos (id, fase_id, negocio_id, url, legenda, tipo)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, c.req.param("faseId"), negocioId, url, legenda, tipo],
      );
      inserted.push(rows[0]);
    }
    return c.json({ fotos: inserted }, 201);
  } catch (e) { console.error("[projetos/fotos] upload", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── PUT foto — port de routes.js 3752-3772 ──
app.put("/projetos/fotos/:fotoId", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const allowed = ["legenda", "tipo", "ordem"];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        params.push(body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) return c.json({ error: "Sem campos" }, 400);
    params.push(c.req.param("fotoId"));
    const { rows } = await pool.query(
      `UPDATE projeto_fotos SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!rows.length) return c.json({ error: "Foto não encontrada" }, 404);
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE foto — port de routes.js 3774-3783 (unlink disco → removeFromStorage) ──
app.delete("/projetos/fotos/:fotoId", async (c: any) => {
  try {
    const { rows } = await pool.query("DELETE FROM projeto_fotos WHERE id = $1 RETURNING url", [c.req.param("fotoId")]);
    const url = rows[0]?.url;
    if (url && url.includes("supabase.co/storage/")) {
      const match = url.match(/\/storage\/v1\/object\/public\/projetos\/(.+)$/);
      if (match) await removeFromStorage("projetos", match[1]);
    }
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── PDF: Ficha de Acompanhamento (por fase) — port de routes.js 3832-3846 ──
app.get("/projetos/:negocioId/pdf/ficha/:faseId", async (c: any) => {
  try {
    const data = await loadProjetoCompleto(c.req.param("negocioId"));
    if (!data) return c.json({ error: "Projecto não encontrado" }, 404);
    const fase = data.fases.find((f: any) => f.id === c.req.param("faseId"));
    if (!fase) return c.json({ error: "Fase não encontrada" }, 404);
    const tarefas = data.tarefas.filter((t: any) => t.fase_id === fase.id);
    const fotos = data.fotos.filter((f: any) => f.fase_id === fase.id);
    const buf = await streamToBuffer(generateFichaAcompanhamento({ negocio: data.negocio, imovel: data.imovel, fase, tarefas, fotos }));
    return c.body(buf, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ficha-${fase.fase_key}-${data.negocio.movimento.replace(/[^\w]/g, "_")}.pdf"`,
    });
  } catch (e) { console.error("[pdf/ficha]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── PDF: Relatório de Acompanhamento (executivo) — port de routes.js 3849-3858 ──
app.get("/projetos/:negocioId/pdf/relatorio", async (c: any) => {
  try {
    const data = await loadProjetoCompleto(c.req.param("negocioId"));
    if (!data) return c.json({ error: "Projecto não encontrado" }, 404);
    const buf = await streamToBuffer(generateRelatorioAcompanhamento(data));
    return c.body(buf, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-obra-${data.negocio.movimento.replace(/[^\w]/g, "_")}.pdf"`,
    });
  } catch (e) { console.error("[pdf/relatorio]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── PDF: Memória Descritiva de Acabamentos — port de routes.js 3861-3870 ──
app.get("/projetos/:negocioId/pdf/memoria", async (c: any) => {
  try {
    const data = await loadProjetoCompleto(c.req.param("negocioId"));
    if (!data) return c.json({ error: "Projecto não encontrado" }, 404);
    const buf = await streamToBuffer(generateMemoriaDescritiva(data));
    return c.body(buf, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="memoria-acabamentos-${data.negocio.movimento.replace(/[^\w]/g, "_")}.pdf"`,
    });
  } catch (e) { console.error("[pdf/memoria]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── PDF: Relatório de Saída CAEP — port de routes.js 3873-3905 ──
app.get("/projetos/:negocioId/pdf/saida", async (c: any) => {
  try {
    const data = await loadProjetoCompleto(c.req.param("negocioId"));
    if (!data) return c.json({ error: "Projecto não encontrado" }, 404);

    let investidores: any[] = [];
    const { rows: projInv } = await pool.query(
      `SELECT pi.capital, pi.percentagem, i.nome
       FROM projeto_investidores pi
       JOIN investidores i ON pi.investidor_id = i.id
       WHERE pi.negocio_id = $1
       ORDER BY pi.capital DESC`,
      [c.req.param("negocioId")],
    );
    if (projInv.length > 0) {
      investidores = projInv.map((p: any) => ({ nome: p.nome, capital: Number(p.capital) || 0 }));
    } else {
      let invIds: any[] = [];
      try { invIds = typeof data.negocio.investidor_ids === "string" ? JSON.parse(data.negocio.investidor_ids || "[]") : (data.negocio.investidor_ids || []); } catch { /* ignore */ }
      if (invIds.length > 0) {
        const { rows } = await pool.query("SELECT id, nome FROM investidores WHERE id = ANY($1)", [invIds]);
        const capitalPorInv = (Number(data.negocio.capital_total) || 0) / invIds.length;
        investidores = rows.map((r: any) => ({ id: r.id, nome: r.nome, capital: capitalPorInv }));
      }
    }
    const buf = await streamToBuffer(generateRelatorioSaida({ ...data, investidores }));
    return c.body(buf, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="saida-caep-${data.negocio.movimento.replace(/[^\w]/g, "_")}.pdf"`,
    });
  } catch (e) { console.error("[pdf/saida]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── Relatorio Executivo Expansao Gaia — port de routes.js 3910-3920 ──
// O Express fazia doc.pipe(res); em Deno geramos os bytes via streamToBuffer e
// devolvemos inline. Dataset injectado explicitamente (default do gerador).
app.get("/relatorios/expansao-gaia", async (c: any) => {
  try {
    const doc = generateRelatorioExpansaoGaia(DADOS_EXPANSAO_GAIA);
    const buffer = await streamToBuffer(doc);
    return c.body(buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="relatorio-expansao-gaia.pdf"',
    });
  } catch (e) { console.error("[pdf/expansao-gaia]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── Mover negocio entre fases (drag&drop) — port de routes.js 3923-3981 ──
app.put("/projetos/:negocioId/mover-fase", async (c: any) => {
  try {
    const negocioId = c.req.param("negocioId");
    const { faseKey } = await c.req.json().catch(() => ({}));
    if (!faseKey) return c.json({ error: "faseKey obrigatório" }, 400);
    let { rows: fases } = await pool.query("SELECT id, fase_key, ordem FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem", [negocioId]);
    if (fases.length === 0) {
      const { rows: negs } = await pool.query("SELECT categoria FROM negocios WHERE id = $1", [negocioId]);
      const categoria = negs[0]?.categoria;
      if (!(FASES_POR_CATEGORIA as any)[categoria]) {
        return c.json({ error: `Categoria "${categoria || "—"}" não tem workflow de fases.` }, 400);
      }
      await criarFasesProjecto(negocioId, categoria);
      const reload = await pool.query("SELECT id, fase_key, ordem FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem", [negocioId]);
      fases = reload.rows;
      if (fases.length === 0) return c.json({ error: "Falha a inicializar fases" }, 500);
    }

    const novaFase = fases.find((f: any) => f.fase_key === faseKey);
    if (!novaFase) return c.json({ error: "Fase inválida" }, 400);

    for (const f of fases) {
      let estado, perc;
      if (f.ordem < novaFase.ordem) { estado = "concluida"; perc = 100; }
      else if (f.ordem === novaFase.ordem) { estado = "em_curso"; perc = Math.max(1, Math.min(99, 50)); }
      else { estado = "pendente"; perc = 0; }
      await pool.query(
        `UPDATE projeto_fases SET estado = $1,
           perc_execucao = CASE WHEN $2 = 100 THEN 100 WHEN $2 = 0 THEN 0 ELSE perc_execucao END,
           ${f.ordem === novaFase.ordem ? "data_inicio_real = COALESCE(data_inicio_real, $4)," : ""}
           updated_at = NOW()
         WHERE id = $3`,
        f.ordem === novaFase.ordem
          ? [estado, perc, f.id, new Date().toISOString().slice(0, 10)]
          : [estado, perc, f.id],
      );
    }
    notificarInvestidoresMudancaFase(negocioId, faseKey).catch(() => {});

    const user = await resolveCrmUser(c).catch(() => null);
    audit({
      negocioId, entidade: "negocio", entidadeId: negocioId,
      acao: "status_change", campo: "fase_atual", valorDepois: faseKey,
      descricao: `Projecto movido para fase "${faseKey}"`,
      user,
    });
    return c.json({ ok: true, faseKey });
  } catch (e) { console.error("[mover-fase]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── GET documentos do projecto — port de routes.js 4108-4120 ──
app.get("/projetos/:negocioId/documentos", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT pd.*, f.fase_key, f.nome AS fase_nome, f.ordem AS fase_ordem
       FROM projeto_documentos pd
       LEFT JOIN projeto_fases f ON pd.fase_id = f.id
       WHERE pd.negocio_id = $1
       ORDER BY COALESCE(f.ordem, 999), pd.created_at DESC`,
      [c.req.param("negocioId")],
    );
    return c.json({ documentos: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST documentos do projecto — port de routes.js 4122-4138 ──
// Multipart (multer array 'files', 10) → Hono formData + uploadPublic (bucket "projetos").
app.post("/projetos/:negocioId/documentos", async (c: any) => {
  try {
    const negocioId = c.req.param("negocioId");
    const form = await c.req.formData();
    const files = form.getAll("files").filter((f: any): f is File => f instanceof File);
    const faseId = typeof form.get("faseId") === "string" ? form.get("faseId") as string : null;
    const tipo = typeof form.get("tipo") === "string" ? form.get("tipo") as string : null;
    const notas = typeof form.get("notas") === "string" ? form.get("notas") as string : null;
    const inserted: any[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const storagePath = `docs/${negocioId}/${crypto.randomUUID()}_${file.name}`;
      const url = await uploadPublic("projetos", storagePath, bytes, file.type || "application/octet-stream");
      const { rows } = await pool.query(
        `INSERT INTO projeto_documentos (id, fase_id, negocio_id, url, nome, tipo, tamanho, mime, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, faseId || null, negocioId, url, file.name, tipo || "outro", file.size, file.type, notas || null],
      );
      inserted.push(rows[0]);
    }
    return c.json({ documentos: inserted }, 201);
  } catch (e) { console.error("[projetos/documentos] upload", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── PUT documento do projecto — port de routes.js 4140-4157 ──
app.put("/projetos/documentos/:docId", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const allowed = ["fase_id", "tipo", "nome", "notas"];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        params.push(body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) return c.json({ error: "Sem campos" }, 400);
    params.push(c.req.param("docId"));
    const { rows } = await pool.query(`UPDATE projeto_documentos SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return c.json({ error: "Documento não encontrado" }, 404);
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE documento do projecto — port de routes.js 4159-4168 (unlink → removeFromStorage) ──
app.delete("/projetos/documentos/:docId", async (c: any) => {
  try {
    const { rows } = await pool.query("DELETE FROM projeto_documentos WHERE id = $1 RETURNING url", [c.req.param("docId")]);
    const url = rows[0]?.url;
    if (url && url.includes("supabase.co/storage/")) {
      const match = url.match(/\/storage\/v1\/object\/public\/projetos\/(.+)$/);
      if (match) await removeFromStorage("projetos", match[1]);
    }
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── GET despesas por fase — port de routes.js 4171-4183 ──
app.get("/projetos/:negocioId/despesas", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, f.fase_key, f.nome AS fase_nome, f.ordem AS fase_ordem
       FROM despesas d
       LEFT JOIN projeto_fases f ON d.fase_id = f.id
       WHERE d.negocio_id = $1
       ORDER BY COALESCE(f.ordem, 999), d.data DESC NULLS LAST`,
      [c.req.param("negocioId")],
    );
    return c.json({ despesas: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST despesa por fase — port de routes.js 4185-4214 ──
app.post("/projetos/:negocioId/despesas", async (c: any) => {
  try {
    const negocioId = c.req.param("negocioId");
    const { fase_id, fracao_id, movimento, valor, data, categoria, fornecedor, notas, comprovativo_url, comprovativo_nome } = await c.req.json().catch(() => ({}));
    if (!movimento?.trim()) return c.json({ error: "movimento obrigatório" }, 400);
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO despesas (id, movimento, categoria, custo_mensal, custo_anual, timing, data, notas, negocio_id, fase_id, fracao_id, fornecedor, comprovativo_url, comprovativo_nome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [id, movimento.trim(), categoria || "Obra", Number(valor) || 0, 0, "Único", data || null, notas || null,
        negocioId, fase_id || null, fracao_id || null,
        fornecedor || null, comprovativo_url || null, comprovativo_nome || null],
    );
    if (fase_id) {
      await pool.query(
        `UPDATE projeto_fases SET custo_real = (SELECT COALESCE(SUM(custo_mensal), 0) FROM despesas WHERE fase_id = $1), updated_at = NOW() WHERE id = $1`,
        [fase_id],
      );
    }
    const user = await resolveCrmUser(c).catch(() => null);
    audit({
      negocioId, entidade: "despesa", entidadeId: id,
      acao: "create", valorDepois: `${movimento.trim()} (${Number(valor) || 0}€)`,
      descricao: `Despesa registada: ${movimento.trim()} — ${Number(valor) || 0}€${fornecedor ? ` · ${fornecedor}` : ""}`,
      user,
    });
    return c.json(rows[0], 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST comprovativo de despesa — port de routes.js 4229-4240 ──
// Multipart (multer single 'comprovativo') → Hono formData + uploadPublic (bucket "projetos").
app.post("/projetos/despesas/:despesaId/comprovativo", async (c: any) => {
  try {
    const despesaId = c.req.param("despesaId");
    const form = await c.req.formData();
    const fRaw = form.get("comprovativo");
    const file = fRaw instanceof File ? fRaw : null;
    if (!file) return c.json({ error: "Sem ficheiro" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storagePath = `comprovativos/${despesaId}/${crypto.randomUUID()}_${file.name}`;
    const url = await uploadPublic("projetos", storagePath, bytes, file.type || "application/octet-stream");
    const { rows } = await pool.query(
      `UPDATE despesas SET comprovativo_url = $1, comprovativo_nome = $2 WHERE id = $3 RETURNING *`,
      [url, file.name, despesaId],
    );
    if (!rows.length) return c.json({ error: "Despesa não encontrada" }, 404);
    return c.json(rows[0]);
  } catch (e) { console.error("[comprovativo]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE despesa do projecto — port de routes.js 4242-4253 ──
app.delete("/projetos/despesas/:despesaId", async (c: any) => {
  try {
    const { rows } = await pool.query("DELETE FROM despesas WHERE id = $1 RETURNING fase_id", [c.req.param("despesaId")]);
    if (rows[0]?.fase_id) {
      await pool.query(
        `UPDATE projeto_fases SET custo_real = (SELECT COALESCE(SUM(custo_mensal), 0) FROM despesas WHERE fase_id = $1), updated_at = NOW() WHERE id = $1`,
        [rows[0].fase_id],
      );
    }
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── GET investidores por projecto — port de routes.js 4256-4268 ──
app.get("/projetos/:negocioId/investidores", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT pi.*, i.nome AS investidor_nome, i.email AS investidor_email
       FROM projeto_investidores pi
       JOIN investidores i ON pi.investidor_id = i.id
       WHERE pi.negocio_id = $1
       ORDER BY pi.capital DESC NULLS LAST`,
      [c.req.param("negocioId")],
    );
    return c.json({ investidores: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST investidor ao projecto — port de routes.js 4270-4285 ──
app.post("/projetos/:negocioId/investidores", async (c: any) => {
  try {
    const { investidor_id, capital, percentagem, notas } = await c.req.json().catch(() => ({}));
    if (!investidor_id) return c.json({ error: "investidor_id obrigatório" }, 400);
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO projeto_investidores (id, negocio_id, investidor_id, capital, percentagem, notas)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (negocio_id, investidor_id) DO UPDATE
         SET capital = EXCLUDED.capital, percentagem = EXCLUDED.percentagem, notas = EXCLUDED.notas
       RETURNING *`,
      [id, c.req.param("negocioId"), investidor_id, Number(capital) || 0, Number(percentagem) || 0, notas || null],
    );
    return c.json(rows[0], 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── PUT investidor do projecto — port de routes.js 4287-4304 ──
app.put("/projetos/investidores/:linkId", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const allowed = ["capital", "percentagem", "notas"];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        params.push(body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) return c.json({ error: "Sem campos" }, 400);
    params.push(c.req.param("linkId"));
    const { rows } = await pool.query(`UPDATE projeto_investidores SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return c.json({ error: "Ligação não encontrada" }, 404);
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE investidor do projecto — port de routes.js 4306-4311 ──
app.delete("/projetos/investidores/:linkId", async (c: any) => {
  try {
    await pool.query("DELETE FROM projeto_investidores WHERE id = $1", [c.req.param("linkId")]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── GET fracoes do projecto — port de routes.js 4316-4330 ──
app.get("/projetos/:negocioId/fracoes", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*,
              (SELECT COUNT(*) FROM projeto_fases WHERE fracao_id = f.id) AS num_fases,
              (SELECT COALESCE(AVG(perc_execucao), 0) FROM projeto_fases WHERE fracao_id = f.id) AS perc_global,
              (SELECT COALESCE(SUM(custo_real), 0) FROM projeto_fases WHERE fracao_id = f.id) AS custo_total
       FROM projeto_fracoes f
       WHERE f.negocio_id = $1
       ORDER BY f.ordem, f.nome`,
      [c.req.param("negocioId")],
    );
    return c.json({ fracoes: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST fracao — port de routes.js 4332-4380 ──
app.post("/projetos/:negocioId/fracoes", async (c: any) => {
  try {
    const { nome, tipo, categoria_comum, tipologia, andar, area_m2, estado, valor_venda_estimado, data_venda_estimada, notas, duplicarFases } = await c.req.json().catch(() => ({}));
    if (!nome?.trim()) return c.json({ error: "nome obrigatório" }, 400);
    const tipoVal = tipo === "area_comum" ? "area_comum" : "fracao";
    const id = crypto.randomUUID();
    const { rows: maxOrdem } = await pool.query("SELECT COALESCE(MAX(ordem), -1) AS m FROM projeto_fracoes WHERE negocio_id = $1", [c.req.param("negocioId")]);
    const { rows } = await pool.query(
      `INSERT INTO projeto_fracoes (id, negocio_id, nome, tipo, categoria_comum, tipologia, andar, area_m2, estado, valor_venda_estimado, data_venda_estimada, notas, ordem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [id, c.req.param("negocioId"), nome.trim(), tipoVal, tipoVal === "area_comum" ? (categoria_comum || null) : null,
        tipoVal === "fracao" ? (tipologia || null) : null, andar || null,
        Number(area_m2) || null, estado || "em_obra", Number(valor_venda_estimado) || 0,
        data_venda_estimada || null, notas || null, maxOrdem[0].m + 1],
    );

    if (duplicarFases) {
      const { rows: fasesComuns } = await pool.query(
        `SELECT * FROM projeto_fases WHERE negocio_id = $1 AND fracao_id IS NULL ORDER BY ordem`,
        [c.req.param("negocioId")],
      );
      for (const f of fasesComuns) {
        const novaFaseId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO projeto_fases (id, negocio_id, fracao_id, fase_key, nome, ordem, estado)
           VALUES ($1, $2, $3, $4, $5, $6, 'pendente')`,
          [novaFaseId, c.req.param("negocioId"), id, f.fase_key, `${f.nome} · ${nome.trim()}`, f.ordem],
        );
        const { rows: tarefas } = await pool.query(
          `SELECT descricao, ordem FROM projeto_tarefas WHERE fase_id = $1 ORDER BY ordem`,
          [f.id],
        );
        for (const t of tarefas) {
          await pool.query(
            `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem) VALUES ($1, $2, $3, $4)`,
            [crypto.randomUUID(), novaFaseId, t.descricao, t.ordem],
          );
        }
      }
    }

    return c.json(rows[0], 201);
  } catch (e) {
    if ((e as any).code === "23505") return c.json({ error: "Já existe uma fração com esse nome no projecto" }, 400);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── PUT fracao — port de routes.js 4382-4416 ──
app.put("/projetos/fracoes/:fracaoId", async (c: any) => {
  try {
    const fracaoId = c.req.param("fracaoId");
    const body = await c.req.json().catch(() => ({}));
    const { rows: antes } = await pool.query("SELECT estado, negocio_id, nome FROM projeto_fracoes WHERE id = $1", [fracaoId]);
    const estadoAntes = antes[0]?.estado;

    const allowed = ["nome", "tipo", "categoria_comum", "tipologia", "andar", "area_m2", "estado", "valor_venda_estimado", "valor_venda_real", "data_venda_estimada", "data_venda_real", "comprador", "notas", "ordem"];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        params.push(body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) return c.json({ error: "Sem campos" }, 400);
    sets.push(`updated_at = NOW()`);
    params.push(fracaoId);
    const { rows } = await pool.query(`UPDATE projeto_fracoes SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return c.json({ error: "Fração não encontrada" }, 404);

    if (body.estado === "vendido" && estadoAntes !== "vendido") {
      disparoVendaFracaoAutomatico(fracaoId).catch(() => {});
      const user = await resolveCrmUser(c).catch(() => null);
      audit({
        negocioId: rows[0].negocio_id, entidade: "fracao", entidadeId: rows[0].id,
        acao: "status_change",
        descricao: `Fração "${rows[0].nome}" marcada como Vendida`,
        user,
      });
    }
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE fracao — port de routes.js 4418-4427 ──
app.delete("/projetos/fracoes/:fracaoId", async (c: any) => {
  try {
    await pool.query("UPDATE projeto_fases SET fracao_id = NULL WHERE fracao_id = $1", [c.req.param("fracaoId")]);
    await pool.query("UPDATE projeto_fotos SET fracao_id = NULL WHERE fracao_id = $1", [c.req.param("fracaoId")]);
    await pool.query("UPDATE despesas SET fracao_id = NULL WHERE fracao_id = $1", [c.req.param("fracaoId")]);
    await pool.query("DELETE FROM projeto_fracoes WHERE id = $1", [c.req.param("fracaoId")]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── Export Excel completo do projecto — port de routes.js 4430-4439 ──
// O modulo devolve { workbook, filename }; geramos o buffer via xlsx.writeBuffer().
app.get("/projetos/:negocioId/export-excel", async (c: any) => {
  try {
    const result = await exportProjetoExcel(c.req.param("negocioId"));
    if (!result) return c.json({ error: "Projecto não encontrado" }, 404);
    const buf = await result.workbook.xlsx.writeBuffer();
    return c.body(new Uint8Array(buf), 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    });
  } catch (e) { console.error("[export-excel]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── Forecast de tesouraria — port de routes.js 4443-4533 ──
app.get("/projetos/:negocioId/forecast", async (c: any) => {
  try {
    const { rows: negs } = await pool.query("SELECT * FROM negocios WHERE id = $1", [c.req.param("negocioId")]);
    if (!negs.length) return c.json({ error: "Projecto não encontrado" }, 404);
    const negocio = negs[0];

    const { rows: fases } = await pool.query(
      `SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`, [c.req.param("negocioId")],
    );

    const outflows: any[] = [];
    for (const f of fases) {
      if (f.estado === "concluida") continue;
      const orc = Number(f.orcamento_alocado) || 0;
      const gasto = Number(f.custo_real) || 0;
      const restante = Math.max(0, orc - gasto);
      if (restante === 0) continue;
      const dataFim = f.data_fim_prevista || negocio.data_estimada_venda || new Date().toISOString().slice(0, 10);
      outflows.push({
        data: dataFim,
        descricao: `Outflow previsto: ${f.nome}`,
        valor: -restante,
        tipo: "despesa_prevista",
      });
    }

    let pags: any[] = [];
    try { pags = typeof negocio.pagamentos_faseados === "string" ? JSON.parse(negocio.pagamentos_faseados || "[]") : (negocio.pagamentos_faseados || []); } catch { /* ignore */ }
    const inflows: any[] = pags.filter((p) => !p.recebido).map((p) => ({
      data: p.data || negocio.data_estimada_venda || new Date().toISOString().slice(0, 10),
      descricao: `Tranche: ${p.descricao || "Pagamento"}`,
      valor: Number(p.valor) || 0,
      tipo: "tranche_prevista",
    }));

    if (!negocio.data_venda && negocio.data_estimada_venda && (Number(negocio.lucro_estimado) || 0) > 0) {
      const totalTranches = pags.reduce((s, p) => s + (Number(p.valor) || 0), 0);
      const lucroEsp = Number(negocio.lucro_estimado) || 0;
      const valorVenda = lucroEsp + (Number(negocio.capital_total) || 0) + (Number(negocio.custo_real_obra) || 0);
      const naoCobertoPorTranches = Math.max(0, valorVenda - totalTranches);
      if (naoCobertoPorTranches > 0) {
        inflows.push({
          data: negocio.data_estimada_venda,
          descricao: "Venda esperada (líquido de tranches definidas)",
          valor: naoCobertoPorTranches,
          tipo: "venda_prevista",
        });
      }
    }

    const eventos = [...outflows, ...inflows].sort((a, b) => (a.data || "").localeCompare(b.data || ""));

    let saldo = 0;
    const cashflow = eventos.map((e) => {
      saldo += e.valor;
      return { ...e, saldo_acumulado: saldo };
    });

    const totalOut = outflows.reduce((s, e) => s + Math.abs(e.valor), 0);
    const totalIn = inflows.reduce((s, e) => s + e.valor, 0);
    const saldoFinal = totalIn - totalOut;

    const FACTOR_CUSTO = 1.20;
    const FACTOR_RECEITA = 0.90;
    const cenarioPessimista = {
      outflow: totalOut * FACTOR_CUSTO,
      inflow: totalIn * FACTOR_RECEITA,
      saldo_previsto: (totalIn * FACTOR_RECEITA) - (totalOut * FACTOR_CUSTO),
    };
    const atrasoHistorico = fases.filter((f: any) => f.data_fim_real && f.data_fim_prevista && new Date(f.data_fim_real) > new Date(f.data_fim_prevista)).length;
    const factorRisco = atrasoHistorico >= 2 ? "alto" : atrasoHistorico === 1 ? "medio" : "baixo";

    return c.json({
      eventos: cashflow,
      totais: { outflow: totalOut, inflow: totalIn, saldo_previsto: saldoFinal },
      cenario_pessimista: cenarioPessimista,
      factor_risco: factorRisco,
      observacao: `Cenário pessimista aplica +20% custos e -10% receita. Factor de risco actual: ${factorRisco} (${atrasoHistorico} fase${atrasoHistorico !== 1 ? "s" : ""} com atraso histórico)`,
    });
  } catch (e) { console.error("[forecast]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── IA preditiva de portfolio — port de routes.js 4611-4689 ──
let _predicoesCache: any = null;
let _predicoesExpires = 0;
app.get("/projetos/portfolio/ia-predicoes", async (c: any) => {
  try {
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_KEY) return c.json({ error: "AI não configurada" }, 503);
    if (c.req.query("fresh") !== "1" && _predicoesCache && _predicoesExpires > Date.now()) {
      return c.json({ ..._predicoesCache, cached: true });
    }
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const { rows: projectos } = await pool.query(
      `SELECT n.id, n.movimento, n.categoria, n.data_compra, n.data_estimada_venda
       FROM negocios n
       WHERE n.categoria = 'Fix and Flip' AND (n.fase IS NULL OR n.fase <> 'Vendido')`,
    );

    const contextos: any[] = [];
    for (const p of projectos) {
      const { rows: fases } = await pool.query(
        `SELECT nome, estado, perc_execucao, data_fim_prevista FROM projeto_fases
         WHERE negocio_id = $1 ORDER BY ordem`, [p.id],
      );
      if (fases.length === 0) continue;
      contextos.push({
        id: p.id,
        nome: p.movimento,
        venda_estimada: p.data_estimada_venda,
        fases: fases.map((f: any) => `${f.nome}: ${f.estado} ${f.perc_execucao || 0}% ${f.data_fim_prevista ? `(prev. ${f.data_fim_prevista})` : ""}`),
      });
    }

    if (contextos.length === 0) return c.json({ predicoes: [] });

    const prompt = `És um consultor de obra experiente. Analisa o estado destes projectos Fix and Flip e identifica os que estão em RISCO de atraso ou desvio orçamental significativo.

Hoje é ${new Date().toLocaleDateString("pt-PT")}.

PROJECTOS:
${contextos.map((ctx) => `\n--- ${ctx.nome} (venda esperada ${ctx.venda_estimada || "—"}) ---\n${ctx.fases.join("\n")}`).join("\n")}

Devolve JSON estrito:
{
  "predicoes": [
    { "projeto_id": "id-do-projecto", "projeto_nome": "nome", "risco": "alto"|"medio"|"baixo", "razao": "1 frase curta", "acao_recomendada": "1 acção concreta" }
  ]
}

Regras:
- Considera "alto" risco quando há fase em curso com data prevista a menos de 30 dias mas <50% executada, ou venda esperada nos próximos 60 dias com obra incompleta.
- "medio" se há sinais preocupantes mas ainda há margem.
- Apenas inclui projectos onde haja efectivamente risco. NÃO listes projectos saudáveis.
- Máximo 10 entradas. Devolve APENAS o JSON, sem texto à volta.`;

    const t0 = Date.now();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (response.content[0] as any)?.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed;
    try { parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text); }
    catch { return c.json({ error: "Resposta IA inválida" }, 500); }

    const result = {
      predicoes: parsed.predicoes || [],
      gerado_em: new Date().toISOString(),
      ms: Date.now() - t0,
      modelo: "claude-sonnet-4-6",
      total_analisados: contextos.length,
    };
    _predicoesCache = result;
    _predicoesExpires = Date.now() + 30 * 60 * 1000;
    return c.json(result);
  } catch (e) { console.error("[ia-predicoes]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── F15 — Assinaturas digitais in-house — port de routes.js 4696-4745 ──
app.post("/projetos/:negocioId/assinaturas", async (c: any) => {
  try {
    const { documento_tipo, documento_hash, investidor_id, investidor_nome, investidor_email } = await c.req.json().catch(() => ({}));
    if (!documento_tipo || !documento_hash) return c.json({ error: "documento_tipo e documento_hash obrigatórios" }, 400);
    const id = crypto.randomUUID();
    const token = crypto.randomUUID().replace(/-/g, "");
    const { rows } = await pool.query(
      `INSERT INTO projeto_assinaturas (id, negocio_id, documento_tipo, documento_hash, token, investidor_id, investidor_nome, investidor_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, c.req.param("negocioId"), documento_tipo, documento_hash, token, investidor_id || null, investidor_nome || null, investidor_email || null],
    );
    return c.json({ ...rows[0], link_aceitacao: `/aceitar/${token}` }, 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/projetos/:negocioId/assinaturas", async (c: any) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM projeto_assinaturas WHERE negocio_id = $1 ORDER BY created_at DESC",
      [c.req.param("negocioId")],
    );
    return c.json({ assinaturas: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/assinaturas/:token/validar", async (c: any) => {
  try {
    const { rows } = await pool.query("SELECT * FROM projeto_assinaturas WHERE token = $1", [c.req.param("token")]);
    if (!rows.length) return c.json({ error: "Pedido não encontrado" }, 404);
    return c.json(rows[0]);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/assinaturas/:token/aceitar", async (c: any) => {
  try {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const ua = c.req.header("user-agent") || "unknown";
    const { rows } = await pool.query(
      `UPDATE projeto_assinaturas
       SET aceite_em = NOW(), aceite_ip = $1, aceite_user_agent = $2
       WHERE token = $3 AND aceite_em IS NULL
       RETURNING *`,
      [ip.slice(0, 45), ua.slice(0, 250), c.req.param("token")],
    );
    if (!rows.length) return c.json({ error: "Pedido inválido ou já aceite" }, 404);
    return c.json({ ok: true, aceitacao: rows[0] });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── F18 — Track de visita do investidor — port de routes.js 4750-4763 ──
app.post("/projetos/:negocioId/track", async (c: any) => {
  try {
    const u = await resolveCrmUser(c).catch(() => null);
    if (!u) return c.json({ ok: true, skipped: true });
    const body = await c.req.json().catch(() => ({}));
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const ua = c.req.header("user-agent") || "";
    await pool.query(
      `INSERT INTO investidor_acessos (id, user_id, negocio_id, pagina, tab, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), u.id, c.req.param("negocioId"), body?.pagina || null, body?.tab || null, ip.slice(0, 45), ua.slice(0, 250)],
    );
    return c.json({ ok: true });
  } catch (e) { return c.json({ ok: false, error: (e as Error).message }); }
});

// ── GET analytics do projecto — port de routes.js 4765-4785 ──
app.get("/projetos/:negocioId/analytics", async (c: any) => {
  try {
    const { rows: visitas } = await pool.query(
      `SELECT user_id, COUNT(*)::int AS num_visitas, MAX(created_at) AS ultima_visita,
              COUNT(DISTINCT DATE(created_at))::int AS dias_distintos
       FROM investidor_acessos WHERE negocio_id = $1 GROUP BY user_id ORDER BY ultima_visita DESC`,
      [c.req.param("negocioId")],
    );
    const userIds = visitas.map((v: any) => v.user_id);
    let users: any[] = [];
    if (userIds.length > 0) {
      const { rows } = await pool.query("SELECT id, nome, email FROM users WHERE id = ANY($1)", [userIds]);
      users = rows;
    }
    const enriched = visitas.map((v: any) => ({
      ...v,
      user: users.find((u) => u.id === v.user_id) || { nome: "Desconhecido" },
    }));
    return c.json({ analytics: enriched });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── F19 — Notificacoes in-app — port de routes.js 4790-4827 ──
app.get("/notificacoes", async (c: any) => {
  try {
    const u = await resolveCrmUser(c).catch(() => null);
    if (!u) return c.json({ notificacoes: [], unread: 0 });
    const { rows } = await pool.query("SELECT * FROM notificacoes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30", [u.id]);
    const { rows: unreadRows } = await pool.query("SELECT COUNT(*)::int AS c FROM notificacoes WHERE user_id = $1 AND lida = false", [u.id]);
    return c.json({ notificacoes: rows, unread: unreadRows[0]?.c || 0 });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get("/notificacoes/count", async (c: any) => {
  try {
    const u = await resolveCrmUser(c).catch(() => null);
    if (!u) return c.json({ unread: 0 });
    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM notificacoes WHERE user_id = $1 AND lida = false", [u.id]);
    return c.json({ unread: rows[0]?.c || 0 });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/notificacoes/marcar-lidas", async (c: any) => {
  try {
    const u = await resolveCrmUser(c).catch(() => null);
    if (!u) return c.json({ ok: false });
    await pool.query("UPDATE notificacoes SET lida = true WHERE user_id = $1", [u.id]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── F16 — Templates de obra — port de routes.js 4842-4869 ──
app.get("/projetos/templates", async (c: any) => {
  try {
    const u = await resolveCrmUser(c).catch(() => null);
    const { rows } = await pool.query("SELECT * FROM projeto_templates WHERE publico = true OR created_by = $1 ORDER BY nome", [u?.id || ""]);
    const defaults = [
      { id: "__default_ff__", nome: "Fix and Flip (default)", descricao: "8 fases padrão para reabilitação em PT", fases_json: JSON.stringify(FASES_POR_CATEGORIA["Fix and Flip"]) },
      { id: "__default_caep__", nome: "CAEP (default)", descricao: "8 fases (igual ao Fix and Flip)", fases_json: JSON.stringify(FASES_POR_CATEGORIA["CAEP"]) },
      { id: "__default_whs__", nome: "Wholesalling (default)", descricao: "7 fases — prospecção a fee recebido", fases_json: JSON.stringify(FASES_POR_CATEGORIA["Wholesalling"]) },
      { id: "__default_med__", nome: "Mediação Imobiliária (default)", descricao: "7 fases — captação a escritura", fases_json: JSON.stringify(FASES_POR_CATEGORIA["Mediação Imobiliária"]) },
    ].map((t) => ({ ...t, publico: true, created_at: null }));
    return c.json({ templates: [...defaults, ...rows] });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.post("/projetos/templates", async (c: any) => {
  try {
    const { nome, descricao, fases_json } = await c.req.json().catch(() => ({}));
    if (!nome?.trim() || !fases_json) return c.json({ error: "nome e fases_json obrigatórios" }, 400);
    const id = crypto.randomUUID();
    const u = await resolveCrmUser(c).catch(() => null);
    const { rows } = await pool.query(
      `INSERT INTO projeto_templates (id, nome, descricao, fases_json, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, nome.trim(), descricao || null, typeof fases_json === "string" ? fases_json : JSON.stringify(fases_json), u?.id || null],
    );
    return c.json(rows[0], 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE template — port de routes.js 4871-4876 ──
app.delete("/projetos/templates/:id", async (c: any) => {
  try {
    await pool.query("DELETE FROM projeto_templates WHERE id = $1", [c.req.param("id")]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── P4.1: GET audit log do projecto — port de routes.js 4879-4888 ──
app.get("/projetos/:negocioId/audit", async (c: any) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit")) || 100, 500);
    const { rows } = await pool.query(
      `SELECT * FROM projeto_audit WHERE negocio_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [c.req.param("negocioId"), limit],
    );
    return c.json({ eventos: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── P4.3: GET comentarios por fase — port de routes.js 4891-4899 ──
app.get("/projetos/fases/:faseId/comentarios", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM projeto_comentarios WHERE fase_id = $1 ORDER BY created_at ASC`,
      [c.req.param("faseId")],
    );
    return c.json({ comentarios: rows });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── POST comentario por fase — port de routes.js 4901-4915 ──
app.post("/projetos/fases/:faseId/comentarios", async (c: any) => {
  try {
    const faseId = c.req.param("faseId");
    const { texto } = await c.req.json().catch(() => ({}));
    if (!texto?.trim()) return c.json({ error: "texto obrigatório" }, 400);
    const { rows: faseRows } = await pool.query("SELECT negocio_id FROM projeto_fases WHERE id = $1", [faseId]);
    if (!faseRows.length) return c.json({ error: "Fase não encontrada" }, 404);
    const user = await resolveCrmUser(c).catch(() => null);
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO projeto_comentarios (id, fase_id, negocio_id, autor_id, autor_nome, texto)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, faseId, faseRows[0].negocio_id, user?.id || null, user?.nome || user?.email || "Sistema", texto.trim()],
    );
    return c.json(rows[0], 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── DELETE comentario — port de routes.js 4918-4923 ──
app.delete("/projetos/comentarios/:comentarioId", async (c: any) => {
  try {
    await pool.query("DELETE FROM projeto_comentarios WHERE id = $1", [c.req.param("comentarioId")]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

// ── P3.16 — Calendario: deadlines de fases e tarefas — port de routes.js 4928-4971 ──
app.get("/projetos/calendario", async (c: any) => {
  try {
    const qFrom = c.req.query("from");
    const qTo = c.req.query("to");
    const from = qFrom ? new Date(qFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = qTo ? new Date(qTo) : new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    const u = await resolveCrmUser(c);
    const isRestricted = u && RECORD_RESTRICTED_ROLES.has(u.role);
    const filtro = isRestricted
      ? `n.id IN (SELECT entidade_id FROM acessos WHERE entidade = 'negocio' AND user_id = $3)`
      : `1=1`;
    const params = isRestricted ? [fromStr, toStr, u.id] : [fromStr, toStr];

    const { rows: fases } = await pool.query(
      `SELECT f.id, f.nome AS titulo, f.data_fim_prevista AS data, f.estado, f.fase_key,
              n.id AS negocio_id, n.movimento AS projeto
       FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE f.data_fim_prevista IS NOT NULL
         AND f.data_fim_prevista::date BETWEEN $1::date AND $2::date
         AND ${filtro}`,
      params,
    );
    const { rows: tarefas } = await pool.query(
      `SELECT t.id, t.descricao AS titulo, t.deadline AS data, t.concluida, t.responsavel,
              f.fase_key, f.nome AS fase,
              n.id AS negocio_id, n.movimento AS projeto
       FROM projeto_tarefas t
       JOIN projeto_fases f ON t.fase_id = f.id
       JOIN negocios n ON n.id = f.negocio_id
       WHERE t.deadline IS NOT NULL
         AND t.deadline::date BETWEEN $1::date AND $2::date
         AND ${filtro}`,
      params,
    );

    const eventos = [
      ...fases.map((f: any) => ({ ...f, tipo: "fase" })),
      ...tarefas.map((t: any) => ({ ...t, tipo: "tarefa" })),
    ];
    return c.json({ eventos, from: fromStr, to: toStr });
  } catch (e) { console.error("[calendario]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── P3.18 — AI assistant: resumo do projecto — port de routes.js 4974-4982 ──
app.get("/projetos/:negocioId/ai-resumo", async (c: any) => {
  try {
    if (!aiConfigured()) return c.json({ error: "AI não configurada (ANTHROPIC_API_KEY)" }, 503);
    const ignorarCache = c.req.query("fresh") === "1";
    const r = await gerarResumoProjeto(c.req.param("negocioId"), { ignorarCache });
    if (!r.ok) return c.json({ error: r.error }, 500);
    return c.json(r);
  } catch (e) { console.error("[ai-resumo]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── F2.7 — KPIs agregados de portfolio Fix and Flip — port de routes.js 4985-5043 ──
app.get("/projetos/portfolio/kpis", async (c: any) => {
  try {
    const u = await resolveCrmUser(c);
    const isRestricted = u && RECORD_RESTRICTED_ROLES.has(u.role);

    const categoria = (c.req.query("categoria") || "").trim();  // '' = todos os modelos de negócio
    const regiaoActiva = c.get("regiaoActiva");
    const conds: string[] = [];
    const params: any[] = [];
    if (isRestricted) {
      params.push(u.id);
      conds.push(`n.id IN (SELECT entidade_id FROM acessos WHERE entidade = 'negocio' AND user_id = $${params.length})`);
    }
    if (categoria) {
      params.push(categoria);
      conds.push(`n.categoria = $${params.length}`);
    }
    if (regiaoActiva) {
      params.push(regiaoActiva);
      conds.push(`n.regiao = $${params.length}`);
    }
    const filterNegocio = conds.length ? conds.join(" AND ") : "1=1";

    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE n.fase <> 'Vendido') AS ativos,
         COALESCE(SUM(n.lucro_estimado), 0) AS lucro_estimado_total,
         COALESCE(SUM(n.lucro_real), 0) AS lucro_real_total,
         COALESCE(SUM(n.capital_total), 0) AS capital_total
       FROM negocios n WHERE ${filterNegocio}`,
      params,
    );

    const { rows: faseStats } = await pool.query(
      `SELECT estado, COUNT(*) AS c FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE ${filterNegocio}
       GROUP BY estado`,
      params,
    );
    const { rows: atrasos } = await pool.query(
      `SELECT f.id, f.nome, f.data_fim_prevista, n.id AS negocio_id, n.movimento, n.categoria,
              (CURRENT_DATE - f.data_fim_prevista::date)::int AS dias_atraso
       FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE f.data_fim_prevista IS NOT NULL
         AND f.data_fim_prevista::date < CURRENT_DATE
         AND f.estado <> 'concluida'
         AND ${filterNegocio}
       ORDER BY dias_atraso DESC
       LIMIT 5`,
      params,
    );
    const { rows: distribuicao } = await pool.query(
      `SELECT f.fase_key, f.nome, COUNT(*) AS projetos
       FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE f.estado = 'em_curso' AND ${filterNegocio}
       GROUP BY f.fase_key, f.nome ORDER BY projetos DESC`,
      params,
    );

    return c.json({
      totais: stats[0],
      fases: Object.fromEntries(faseStats.map((r: any) => [r.estado, Number(r.c)])),
      topAtrasos: atrasos,
      distribuicaoFases: distribuicao,
    });
  } catch (e) { console.error("[portfolio/kpis]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── Vista agregada por negocio — port de routes.js 5047-5075 ──
app.get("/projetos/:negocioId/resumo", async (c: any) => {
  try {
    const { rows: negRows } = await pool.query("SELECT * FROM negocios WHERE id = $1", [c.req.param("negocioId")]);
    if (!negRows.length) return c.json({ error: "Negócio não encontrado" }, 404);
    const negocio = negRows[0];

    const { rows: fases } = await pool.query(
      `SELECT id, fase_key, nome, ordem, estado, perc_execucao, data_inicio_prevista, data_fim_prevista,
              data_inicio_real, data_fim_real, orcamento_alocado, custo_real
       FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`,
      [c.req.param("negocioId")],
    );

    let imovel = null;
    if (negocio.imovel_id) {
      const { rows: imRows } = await pool.query("SELECT id, nome, zona, tipologia, fotos FROM imoveis WHERE id = $1", [negocio.imovel_id]);
      imovel = imRows[0] || null;
    }

    const orcAlocado = fases.reduce((s: number, f: any) => s + (Number(f.orcamento_alocado) || 0), 0);
    const custoReal = fases.reduce((s: number, f: any) => s + (Number(f.custo_real) || 0), 0);
    const percGlobal = fases.length > 0
      ? Math.round(fases.reduce((s: number, f: any) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
      : 0;
    const faseAtual = fases.find((f: any) => f.estado === "em_curso") || fases.find((f: any) => f.estado === "pendente") || fases[fases.length - 1];

    return c.json({ negocio, imovel, fases, orcAlocado, custoReal, percGlobal, faseAtual });
  } catch (e) { console.error("[projetos/resumo]", (e as Error).message); return c.json({ error: (e as Error).message }, 500); }
});

// ── Routers portados (analises, orcamento-obra, regiao) — port dos sub-routers Express ──
// Estes registam apenas paths especificos (/regiao/*, /analises/*, /analises-kpis,
// /imoveis/:imovelId/analises, /imoveis/:imovelId/orcamento-obra) que nao colidem
// com os crudRoutes/:id ja registados. Replica a ordem de montagem do Express.
registerAnaliseRoutes(app);
registerOrcamentoRoutes(app);
registerRegiaoRoutes(app);

// ── Auditoria · historico de alteracoes (admin only) ──────────────
async function requireAdminAudit(c: any): Promise<Response | null> {
  // Em dev sem service-role, deixa passar
  if (!_crmAuthClient) return null;
  const u = await resolveCrmUser(c);
  if (!u) return c.json({ error: "Nao autenticado" }, 401);
  if (u.role !== "admin") return c.json({ error: "So administradores" }, 403);
  return null;
}

app.get("/auditoria", async (c) => {
  const denied = await requireAdminAudit(c);
  if (denied) return denied;
  try {
    const entidade = c.req.query("entidade");
    const entidadeId = c.req.query("entidade_id");
    const userEmail = c.req.query("user_email");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const limit = Math.min(parseInt(c.req.query("limit") || "100"), 500);
    const offset = parseInt(c.req.query("offset") || "0");

    const where: string[] = [];
    const params: any[] = [];
    if (entidade) { params.push(entidade); where.push(`a.entidade = $${params.length}`); }
    if (entidadeId) { params.push(entidadeId); where.push(`a.entidade_id = $${params.length}`); }
    if (userEmail) { params.push(`%${userEmail}%`); where.push(`a.user_email ILIKE $${params.length}`); }
    if (from) { params.push(from); where.push(`a.created_at >= $${params.length}`); }
    if (to) { params.push(to); where.push(`a.created_at <= $${params.length}`); }
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT a.id, a.entidade, a.entidade_id, a.operacao, a.user_email, a.alteracoes, a.created_at,
                CASE
                  WHEN a.entidade = 'imoveis' THEN (SELECT nome FROM imoveis WHERE id = a.entidade_id)
                  WHEN a.entidade = 'investidores' THEN (SELECT nome FROM investidores WHERE id = a.entidade_id)
                  WHEN a.entidade = 'negocios' THEN (SELECT COALESCE(NULLIF(notas,''), id::text) FROM negocios WHERE id = a.entidade_id)
                END AS entidade_nome
         FROM audit_log a
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM audit_log a ${whereClause}`, params),
    ]);

    return c.json({ rows, total: countRows[0]?.total || 0, limit, offset });
  } catch (e) {
    console.error("[auditoria]", (e as Error).message);
    return c.json({ error: "Erro a obter auditoria" }, 500);
  }
});

app.get("/auditoria/utilizadores", async (c) => {
  const denied = await requireAdminAudit(c);
  if (denied) return denied;
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT user_email FROM audit_log WHERE user_email IS NOT NULL ORDER BY user_email`,
    );
    return c.json(rows.map((r: any) => r.user_email));
  } catch (e) {
    console.error("[auditoria/utilizadores]", (e as Error).message);
    return c.json({ error: "Erro" }, 500);
  }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "crm" }));

Deno.serve(app.fetch);
