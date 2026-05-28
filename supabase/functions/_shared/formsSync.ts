/**
 * Sync Google Forms (respostas de investidores) → CRM. Port de src/db/formsSync.js.
 * Lê respostas do Google Sheet, verifica duplicados, cria/actualiza investidores.
 *
 * Mudanças face ao original:
 * - getGoogleAuth()/isGoogleConfigured() (que liam ficheiros JSON em disco) →
 *   cliente OAuth2 construido apenas de env vars (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN),
 *   como na Edge Function `calendar`. Sem leitura de disco.
 * - mappers (investidorMappers.js) inline (nao havia .ts portado).
 */
import { OAuth2Client } from "google-auth-library";
import { sheets } from "@googleapis/sheets";
import pool from "../_shared/pg.ts";
import { Investidores } from "./crud.ts";

const SHEET_ID = Deno.env.get("GOOGLE_FORMS_SHEET_ID") || "1NxsPoLBwLuoCh6SvBOrr_sph8BugwJPuZ4vihriIA1s";

// Cliente OAuth2 (env-only). Sem credenciais -> null.
function getAuth(): any {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new OAuth2Client(clientId, clientSecret, "http://localhost:3333");
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }
  return null;
}

function isGoogleConfigured(): boolean {
  return !!(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") &&
    Deno.env.get("GOOGLE_REFRESH_TOKEN"));
}

export function isConfigured(): boolean {
  return !!SHEET_ID && isGoogleConfigured();
}

/**
 * Sync respostas do Google Forms → investidores no CRM
 */
export async function syncForms() {
  const auth = getAuth();
  if (!auth) throw new Error("Google OAuth não configurado");

  const sheetsClient = sheets({ version: "v4", auth });
  const r = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "A:O",
  });

  const rows = r.data.values || [];
  if (rows.length < 2) return { created: 0, updated: 0, skipped: 0, total: 0 };

  let created = 0, updated = 0, skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[1]?.trim()) continue; // sem nome

    const nome = row[1].trim();
    const email = (row[2] || "").trim().toLowerCase();
    const telemovel = (row[3] || "").trim();
    const prefContacto = (row[4] || "").trim();
    const estrategia = parseEstrategia(row[5]);
    const tipoImovel = mapTipoImovel(row[6]);
    const localizacao = mapLocalizacao(row[7]);
    const equipaObras = mapEquipa(row[8]);
    const roi = mapRoi(row[9]);
    const { capital_min, capital_max } = parseCapital(row[10]);
    const roiAnualizado = (row[11] || "").trim();
    const tipoInvestidor = parseTipoInvestidor(row[12]);
    const experiencia = mapExperiencia(row[13]);
    const origem = parseOrigem(row[14]);
    const timestamp = (row[0] || "").trim();

    // Verificar duplicados por nome, email OU telefone
    const normNome = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const phoneLast9 = telemovel.replace(/[^\d]/g, "").slice(-9);

    // Build parameterized query dynamically
    const params: any[] = [nome, normNome];
    const conditions = [
      "LOWER(TRIM(nome)) = LOWER($1)",
      "LOWER(TRANSLATE(TRIM(nome), 'áàâãéèêíìîóòôõúùûçñ', 'aaaaeeeiiioooouuucn')) = $2",
    ];
    if (email) {
      params.push(email);
      conditions.push(`LOWER(TRIM(email)) = LOWER($${params.length})`);
    }
    if (phoneLast9.length === 9) {
      params.push(phoneLast9);
      conditions.push(`RIGHT(REGEXP_REPLACE(telemovel, '[^0-9]', '', 'g'), 9) = $${params.length}`);
    }

    const { rows: candidates } = await pool.query(
      `SELECT id, nome, email, telemovel, capital_min, capital_max, estrategia, tipo_investidor, tipo_principal,
              preferencia_contacto, tipo_imovel_preferido, localizacao_preferida, equipa_obras,
              roi_pretendido, experiencia_imobiliario, perfil_risco, origem, notas
       FROM investidores
       WHERE ${conditions.join("\n          OR ")}
       LIMIT 1`,
      params,
    );
    const existing = candidates[0];

    // Derivar tipo_principal a partir do tipo_investidor
    const tipoPrincipal = derivarTipoPrincipal(tipoInvestidor);

    if (existing) {
      // Actualizar apenas campos vazios
      const updates: Record<string, unknown> = {};
      if (!existing.email && email) updates.email = email;
      if (!existing.telemovel && telemovel) updates.telemovel = telemovel;
      if (!existing.capital_min && capital_min) updates.capital_min = capital_min;
      if (!existing.capital_max && capital_max) updates.capital_max = capital_max;
      if (!existing.estrategia && estrategia) updates.estrategia = estrategia;
      if (!existing.tipo_investidor && tipoInvestidor) updates.tipo_investidor = tipoInvestidor;
      if (!existing.tipo_principal && tipoPrincipal) updates.tipo_principal = tipoPrincipal;
      if (!existing.preferencia_contacto && prefContacto) updates.preferencia_contacto = prefContacto;
      if (!existing.tipo_imovel_preferido && tipoImovel) updates.tipo_imovel_preferido = tipoImovel;
      if (!existing.localizacao_preferida && localizacao) updates.localizacao_preferida = localizacao;
      if (!existing.equipa_obras && equipaObras && equipaObras !== "Não") updates.equipa_obras = equipaObras;
      if (!existing.roi_pretendido && roi && roi !== ".") updates.roi_pretendido = roi;
      if (!existing.experiencia_imobiliario && experiencia) updates.experiencia_imobiliario = experiencia;
      if (!existing.origem && origem) updates.origem = origem;
      if (!existing.perfil_risco) {
        const perfil = derivarPerfilRisco(roi, roiAnualizado);
        if (perfil) updates.perfil_risco = perfil;
      }

      if (Object.keys(updates).length > 0) {
        await Investidores.update(existing.id, updates);
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Criar novo investidor
      const data: Record<string, unknown> = {
        nome,
        status: "Potencial Investidor",
        data_primeiro_contacto: parseTimestamp(timestamp),
      };
      if (origem) data.origem = origem;
      if (email) data.email = email;
      if (telemovel) data.telemovel = telemovel;
      if (capital_min) data.capital_min = capital_min;
      if (capital_max) data.capital_max = capital_max;
      if (estrategia) data.estrategia = estrategia;
      if (tipoInvestidor) data.tipo_investidor = tipoInvestidor;
      if (tipoPrincipal) data.tipo_principal = tipoPrincipal;
      if (prefContacto) data.preferencia_contacto = prefContacto;
      if (tipoImovel) data.tipo_imovel_preferido = tipoImovel;
      if (localizacao) data.localizacao_preferida = localizacao;
      if (equipaObras && equipaObras !== "Não") data.equipa_obras = equipaObras;
      if (roi && roi !== ".") data.roi_pretendido = roi;
      if (experiencia) data.experiencia_imobiliario = experiencia;
      const perfil = derivarPerfilRisco(roi, roiAnualizado);
      if (perfil) data.perfil_risco = perfil;
      // Auto-detectar `regioes_preferidas` a partir da string localização
      // (campo livre do Google Forms). Procura por palavras-chave de cada
      // região; default ["Coimbra"] se nada bater. Permite múltiplas regiões.
      data.regioes_preferidas = JSON.stringify(detectarRegioes(localizacao));

      await Investidores.create(data);
      created++;
    }
  }

  return { created, updated, skipped, total: rows.length - 1 };
}

// ── Detecção regional a partir de texto livre ────────────────
const REGIAO_KEYWORDS: Record<string, string[]> = {
  AMP: [
    "porto", "gaia", "vila nova de gaia", "amp", "area metropolitana do porto",
    "matosinhos", "maia", "gondomar", "valongo", "espinho", "feira",
    "santa maria da feira", "santo tirso", "trofa", "povoa de varzim",
    "aveiro",
  ],
  Coimbra: [
    "coimbra", "condeixa", "mealhada", "cantanhede", "lousa", "lousã",
    "penacova", "miranda do corvo", "montemor", "figueira da foz", "pampilhosa",
    "tabua", "tábua", "soure", "mira", "gois", "góis", "arganil", "penela",
  ],
};
function detectarRegioes(texto: string | null): string[] {
  if (!texto || typeof texto !== "string") return ["Coimbra"];
  const norm = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const found = new Set<string>();
  for (const [regiao, words] of Object.entries(REGIAO_KEYWORDS)) {
    if (words.some((w) => norm.includes(w))) found.add(regiao);
  }
  return found.size > 0 ? [...found] : ["Coimbra"];
}

// ── Parsers ─────────────────────────────────────────────────

function parseCapital(raw?: string): { capital_min: number | null; capital_max: number | null } {
  if (!raw) return { capital_min: null, capital_max: null };
  const s = raw.toLowerCase().replace(/\s/g, "").replace(/€/g, "").replace(/euros?/g, "");

  const range = s.match(/(\d+)k?\s*[-a]\s*(\d+)k/i);
  if (range) {
    const min = parseInt(range[1]) * (range[1].length <= 3 ? 1000 : 1);
    const max = parseInt(range[2]) * (range[2].length <= 3 ? 1000 : 1);
    return { capital_min: min, capital_max: max };
  }

  const ate = s.match(/at[eé](\d+)k?/i);
  if (ate) {
    const val = parseInt(ate[1]) * (ate[1].length <= 3 ? 1000 : 1);
    return { capital_min: null, capital_max: val };
  }

  const single = s.match(/(\d+)k/i);
  if (single) {
    return { capital_min: null, capital_max: parseInt(single[1]) * 1000 };
  }

  const num = parseInt(s.replace(/[^\d]/g, ""));
  if (num > 1000) return { capital_min: null, capital_max: num };

  return { capital_min: null, capital_max: null };
}

function parseEstrategia(raw?: string): string | null {
  if (!raw) return null;
  const strategies: string[] = [];
  const s = raw.toLowerCase();
  if (s.includes("caep")) strategies.push("CAEP");
  if (s.includes("ced") || s.includes("posição") || s.includes("posicao")) strategies.push("Cedência de posição");
  if (s.includes("fix") || s.includes("flip")) strategies.push("Fix & Flip");
  if (s.includes("wholesal")) strategies.push("Wholesaling");
  if (s.includes("media") || s.includes("mediação")) strategies.push("Mediação");
  if (s.includes("arrend")) strategies.push("Arrendamento");
  if (strategies.length === 0) strategies.push(raw.trim());
  return JSON.stringify(strategies);
}

const ORIGENS_CANONICAS = ["Skool", "Grupos Whatsapp", "Referenciação", "LinkedIn", "Eventos Networking", "Outro"];

function normalizeOrigem(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function parseOrigem(raw?: string): string | null {
  if (!raw) return null;
  const norm = normalizeOrigem(raw);
  if (!norm) return null;
  for (const canon of ORIGENS_CANONICAS) {
    if (normalizeOrigem(canon) === norm) return canon;
  }
  if (norm.includes("whats")) return "Grupos Whatsapp";
  if (norm.includes("referenc") || norm.includes("indica")) return "Referenciação";
  if (norm.includes("linkedin")) return "LinkedIn";
  if (norm.includes("skool")) return "Skool";
  if (norm.includes("event") || norm.includes("network")) return "Eventos Networking";
  return null;
}

function parseTipoInvestidor(raw?: string): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const tipos: string[] = [];
  if (s.includes("passivo")) tipos.push("Passivo");
  if (s.includes("ativo") || s.includes("activo")) tipos.push("Ativo");
  if (tipos.length === 0) tipos.push(raw.trim());
  return JSON.stringify(tipos);
}

function parseTimestamp(ts?: string): string {
  if (!ts) return new Date().toISOString().slice(0, 10);
  return ts.replace(/\//g, "-").slice(0, 10);
}

function derivarTipoPrincipal(tipoInvestidorJson: string | null): string {
  if (!tipoInvestidorJson) return "Passivo";
  try {
    const tipos = JSON.parse(tipoInvestidorJson);
    if (tipos.includes("Ativo")) return "Ativo";
    return "Passivo";
  } catch {
    return "Passivo";
  }
}

function derivarPerfilRisco(roi: string | null, roiAnualizado: string | null): string | null {
  const roiText = (roi || roiAnualizado || "").toLowerCase();
  const numMatch = roiText.match(/(\d+)/);
  if (!numMatch) return null;
  const val = parseInt(numMatch[1]);
  if (val >= 30) return "Agressivo";
  if (val >= 15) return "Moderado";
  if (val > 0) return "Conservador";
  return null;
}

// ── Mappers (inline de src/db/investidorMappers.js) ──────────
const ROI = ["<10%", "10–15%", "15–20%", "20–25%", ">25%"];
const EXPERIENCIA = ["Nenhuma", "1–2 negócios", "3–10 negócios", ">10 negócios"];
const TIPO_IMOVEL = [
  "T0", "T1", "T2", "T3+", "Apartamento", "Moradia", "Edifício", "Comercial", "Terreno", "Ruína", "Indiferente",
];
const DISTRITOS = [
  "Aveiro", "Beja", "Braga", "Bragança", "Castelo Branco", "Coimbra", "Évora", "Faro", "Guarda", "Leiria",
  "Lisboa", "Portalegre", "Porto", "Santarém", "Setúbal", "Viana do Castelo", "Vila Real", "Viseu", "Açores",
  "Madeira",
];
const EQUIPA = ["Própria", "Da Somnium", "Indiferente", "Sem opinião"];

const norm = (s: unknown) =>
  (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function mapRoi(raw?: string): string | null {
  if (!raw) return null;
  if (ROI.includes(raw)) return raw;
  const m = raw.toString().match(/(\d+)/g);
  if (!m) return null;
  const v = parseInt(m[m.length - 1]);
  if (v < 10) return "<10%";
  if (v < 15) return "10–15%";
  if (v < 20) return "15–20%";
  if (v < 25) return "20–25%";
  return ">25%";
}

function mapExperiencia(raw?: string): string | null {
  if (!raw) return null;
  if (EXPERIENCIA.includes(raw)) return raw;
  const n = norm(raw);
  if (/^nao$|^nula$|nenhum|sem experi|primeiro|primeira|^zero$|^0$/.test(n)) return "Nenhuma";
  const m = n.match(/(\d+)/);
  if (m) {
    const v = parseInt(m[1]);
    if (v === 0) return "Nenhuma";
    if (v <= 2) return "1–2 negócios";
    if (v <= 10) return "3–10 negócios";
    return ">10 negócios";
  }
  if (/iniciante|pouca|baixa|alguma|ainda pouca/.test(n)) return "1–2 negócios";
  if (/intermedi|^media$|moderad|com experi|investidor passivo|transformacao/.test(n)) return "3–10 negócios";
  if (/avancada|muita|alta|elevad|expert|profissional|veterano/.test(n)) return ">10 negócios";
  return null;
}

function mapTipoImovel(raw?: string): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return JSON.stringify(v.filter((x: string) => TIPO_IMOVEL.includes(x)));
  } catch { /* nao e JSON */ }
  const tokens = raw.toString().split(/[,;/]| e | ou /i).map((t) => t.trim()).filter(Boolean);
  const out = new Set<string>();
  const all = norm(raw);
  if (/qualquer|indiferente|todo o tipo|sem prefer|flexivel/.test(all)) out.add("Indiferente");
  for (const t of tokens) {
    const n = norm(t);
    if (/^t0|estudio|studio/.test(n)) out.add("T0");
    else if (/^t1\b/.test(n)) out.add("T1");
    else if (/^t2\b/.test(n)) out.add("T2");
    else if (/^t3|^t4|^t5|t3\+/.test(n)) out.add("T3+");
    else if (/moradia/.test(n)) out.add("Moradia");
    else if (/edif[íi]cio|predio/.test(n)) out.add("Edifício");
    else if (/comerci|loja|escrit|armazem/.test(n)) out.add("Comercial");
    else if (/terreno|lote/.test(n)) out.add("Terreno");
    else if (/ruina|recuperac/.test(n)) out.add("Ruína");
    else if (/apartamento|^apart\b/.test(n)) out.add("Apartamento");
  }
  return out.size ? JSON.stringify([...out]) : null;
}

function mapLocalizacao(raw?: string): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return JSON.stringify(v.filter((x: string) => DISTRITOS.includes(x)));
  } catch { /* nao e JSON */ }
  const tokens = raw.toString().split(/[,;/]| e | ou /i).map((t) => t.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const t of tokens) {
    const n = norm(t);
    for (const d of DISTRITOS) {
      if (norm(d) === n || n.includes(norm(d))) {
        out.add(d);
        break;
      }
    }
  }
  return out.size ? JSON.stringify([...out]) : null;
}

function mapEquipa(raw?: string): string | null {
  if (!raw) return null;
  if (EQUIPA.includes(raw)) return raw;
  const n = norm(raw);
  if (/propri|tenho|minha equipa|em casa|^sim$/.test(n)) return "Própria";
  if (/somnium|vossa|da empresa|indicada/.test(n)) return "Da Somnium";
  if (/indiferente|qualquer|tanto faz/.test(n)) return "Indiferente";
  if (/sem opin|nao sei|n\/a|nao tenho preferenc|^nao$/.test(n)) return "Sem opinião";
  return null;
}
