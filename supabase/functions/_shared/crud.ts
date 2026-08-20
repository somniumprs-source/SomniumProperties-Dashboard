// CRUD generico para todas as tabelas do CRM (PostgreSQL). Port de src/db/crud.js.
import pool from "./pg.ts";

// ── Validacao de campos obrigatorios ─────────────────────────
const REQUIRED_FIELDS: Record<string, string[]> = {
  imoveis: ["nome"],
  investidores: ["nome"],
  consultores: ["nome"],
  negocios: ["movimento"],
  despesas: ["movimento"],
  tarefas: ["titulo"],
  visitas: ["imovel_id", "data_hora"],
  empreiteiros: ["nome"],
};

function validateRequired(table: string, data: Record<string, any>): string | null {
  const fields = REQUIRED_FIELDS[table];
  if (!fields) return null;
  const missing = fields.filter((f) => !data[f] || (typeof data[f] === "string" && data[f].trim() === ""));
  if (missing.length > 0) return `Campos obrigatórios em falta: ${missing.join(", ")}`;
  return null;
}

// ── Audit log ────────────────────────────────────────────────
async function auditLog(
  tabela: string, registoId: string, acao: string,
  dadosAnteriores: any, dadosNovos: any, regiaoActiva: string | null = null,
) {
  await pool.query(
    `INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos, regiao_activa) VALUES ($1, $2, $3, $4, $5, $6)`,
    [tabela, registoId, acao, dadosAnteriores ? JSON.stringify(dadosAnteriores) : null, dadosNovos ? JSON.stringify(dadosNovos) : null, regiaoActiva || null],
  );
}

// ── Limpar dados do form antes de inserir/actualizar ─────────
// Campos TEXT cujo nome bate no regex de coerção numérica mas que guardam
// strings (selects, gamas). NUNCA passar por parseFloat — '<10%' → NaN → null.
const TEXT_FIELDS_KEEP_STRING = new Set(["roi_pretendido", "roi_anualizado_pretendido"]);

function cleanFormData(data: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = { ...data };
  for (const [key, value] of Object.entries(cleaned)) {
    if (key.startsWith("_")) { delete cleaned[key]; continue; }
    if (value === "" || value === undefined) { cleaned[key] = null; continue; }
    if (typeof value === "string" && !TEXT_FIELDS_KEEP_STRING.has(key) && /^(custo|lucro|capital|ask_price|valor|roi|area|montante|score|comissao|pontuacao|tempo)/.test(key)) {
      const num = parseFloat(value);
      cleaned[key] = isNaN(num) ? null : num;
    }
  }
  return cleaned;
}

// ── Cache de colunas por tabela ──────────────────────────────
const _columnsCache = new Map<string, Set<string>>();
async function getColumns(table: string): Promise<Set<string>> {
  if (_columnsCache.has(table)) return _columnsCache.get(table)!;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const set = new Set<string>(rows.map((r: any) => r.column_name));
  _columnsCache.set(table, set);
  return set;
}

// Colunas JSONB precisam de JSON.stringify antes de irem para o pool.query —
// o GET devolve já parsed (object/array) e deno-postgres não auto-serializa
// para JSONB sem hint. Em contraste, colunas TEXT[] esperam array JS directo.
const _jsonbColsCache = new Map<string, Set<string>>();
async function getJsonbColumns(table: string): Promise<Set<string>> {
  if (_jsonbColsCache.has(table)) return _jsonbColsCache.get(table)!;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('json','jsonb')`,
    [table],
  );
  const set = new Set<string>(rows.map((r: any) => r.column_name));
  _jsonbColsCache.set(table, set);
  return set;
}

function serializeForCol(value: any, isJsonb: boolean): any {
  if (!isJsonb) return value;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// Garante (idempotente) que uma coluna existe. Necessário porque o deploy só
// publica Edge Functions — não aplica supabase/migrations. Colunas adicionadas
// só pelo ALTER do pg.js (dev) podem não existir em produção; sem isto,
// crud.update descarta o campo em silêncio (filtro tableCols.has). DDL é uma
// constante controlada no código (sem input do utilizador).
const _ensured = new Set<string>();
export async function ensureColumn(table: string, columnDdl: string): Promise<void> {
  const key = `${table}.${columnDdl}`;
  if (_ensured.has(key)) return;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${columnDdl}`);
  _ensured.add(key);
  _columnsCache.delete(table); // forçar re-leitura das colunas na próxima escrita
}

interface ListOpts { limit?: number; offset?: number; sort?: string; filter?: Record<string, any> }
interface RegiaoOpt { regiaoActiva?: string | null }

// ── Generic CRUD factory ─────────────────────────────────────
function createCRUD(table: string, { searchFields = ["nome"], defaultSort = "created_at DESC" }: { searchFields?: string[]; defaultSort?: string } = {}) {
  return {
    async list({ limit = 100, offset = 0, sort = defaultSort, filter }: ListOpts = {}) {
      const params: any[] = [];
      const whereParts: string[] = [];
      if (filter) {
        const cols = await getColumns(table);
        if (table === "investidores" && filter.regiao && cols.has("regioes_preferidas")) {
          params.push(`%"${filter.regiao}"%`);
          whereParts.push(`regioes_preferidas LIKE $${params.length}`);
        }
        for (const [k, v] of Object.entries(filter)) {
          if (v === undefined || v === null || v === "") continue;
          if (!cols.has(k)) continue;
          if (table === "investidores" && k === "regiao") continue;
          params.push(v);
          whereParts.push(`${k} = $${params.length}`);
        }
      }
      const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";
      const q = `SELECT *, COUNT(*) OVER() AS __total FROM ${table}${whereSql}
                 ORDER BY ${sort} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      const { rows } = await pool.query(q, params);
      const total = rows.length > 0 ? parseInt(rows[0].__total) : 0;
      const data = rows.map(({ __total, ...r }: any) => r);
      return { data, total, limit, offset };
    },

    async getById(id: string) {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },

    async create(rawData: Record<string, any>, { regiaoActiva = null }: RegiaoOpt = {}) {
      const data = cleanFormData(rawData);
      const validationError = validateRequired(table, data);
      if (validationError) throw new Error(validationError);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const SYSTEM_FIELDS = new Set(["id", "created_at", "updated_at", "synced_at", "notion_id"]);

      if (table === "imoveis" && !data.data_adicionado) data.data_adicionado = today;
      if (table === "investidores" && !data.data_primeiro_contacto) data.data_primeiro_contacto = today;
      if (table === "consultores" && !data.data_inicio) data.data_inicio = today;
      if (table === "negocios" && !data.data) data.data = today;

      // Auto-gerar REF Interna sequencial por regiao (0001, 0002, ...) quando
      // nao vem preenchida do form.
      if (table === "imoveis" && !data.ref_interna) {
        const regiaoRef = data.regiao ?? regiaoActiva ?? null;
        const { rows: maxRows } = await pool.query(
          `SELECT COALESCE(MAX(ref_interna::int), 0) AS max FROM imoveis WHERE regiao IS NOT DISTINCT FROM $1 AND ref_interna ~ '^[0-9]+$'`,
          [regiaoRef]
        );
        data.ref_interna = String(Number(maxRows[0].max) + 1).padStart(4, "0");
      }

      const tableCols = await getColumns(table);
      const jsonbCols = await getJsonbColumns(table);
      const entries = Object.entries(data).filter(([k, v]) => v !== undefined && !SYSTEM_FIELDS.has(k) && tableCols.has(k));
      const cleanData = Object.fromEntries(entries);
      const cols = ["id", ...entries.map(([k]) => k), "created_at", "updated_at"];
      const vals = cols.map((_, i) => `$${i + 1}`);
      const params = [id, ...entries.map(([k, v]) => serializeForCol(v, jsonbCols.has(k))), now, now];
      await pool.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")})`, params);
      auditLog(table, id, "INSERT", null, { id, ...cleanData }, regiaoActiva);
      return { id, ...cleanData, created_at: now, updated_at: now };
    },

    async update(id: string, rawData: Record<string, any>, { regiaoActiva = null }: RegiaoOpt = {}) {
      const data = cleanFormData(rawData);
      const { rows: existing } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      if (!existing[0]) return null;
      const now = new Date().toISOString();
      const SYSTEM_FIELDS = new Set(["id", "created_at", "updated_at", "synced_at", "notion_id"]);

      const tableCols = await getColumns(table);
      const jsonbCols = await getJsonbColumns(table);
      const entries = Object.entries(data).filter(([k, v]) => v !== undefined && !SYSTEM_FIELDS.has(k) && tableCols.has(k));
      const cleanData = Object.fromEntries(entries);
      const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
      sets.push(`updated_at = $${entries.length + 1}`);
      const params = [...entries.map(([k, v]) => serializeForCol(v, jsonbCols.has(k))), now, id];
      await pool.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${entries.length + 2}`, params);
      auditLog(table, id, "UPDATE", existing[0], cleanData, regiaoActiva);
      return { ...existing[0], ...cleanData, updated_at: now };
    },

    async delete(id: string, { regiaoActiva = null }: RegiaoOpt = {}) {
      const { rows: existing } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      if (!existing[0]) return false;
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      auditLog(table, id, "DELETE", existing[0], null, regiaoActiva);
      return true;
    },

    async search(q: string, limit = 20, { regiao }: { regiao?: string } = {}) {
      const conditions = searchFields.map((f) => `${f} ILIKE $1`).join(" OR ");
      const params: any[] = [`%${q}%`];
      let regiaoClause = "";
      if (regiao) {
        const cols = await getColumns(table);
        if (table === "investidores" && cols.has("regioes_preferidas")) {
          params.push(`%"${regiao}"%`);
          regiaoClause = ` AND regioes_preferidas LIKE $${params.length}`;
        } else if (cols.has("regiao")) {
          params.push(regiao);
          regiaoClause = ` AND regiao = $${params.length}`;
        }
      }
      params.push(limit);
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE (${conditions})${regiaoClause} ORDER BY updated_at DESC LIMIT $${params.length}`,
        params,
      );
      return rows;
    },

    async stats({ regiao }: { regiao?: string } = {}) {
      let where = "";
      const params: any[] = [];
      if (regiao) {
        const cols = await getColumns(table);
        if (table === "investidores" && cols.has("regioes_preferidas")) {
          params.push(`%"${regiao}"%`);
          where = `WHERE regioes_preferidas LIKE $1`;
        } else if (cols.has("regiao")) {
          params.push(regiao);
          where = `WHERE regiao = $1`;
        }
      }
      const { rows } = await pool.query(`SELECT COUNT(*) as c, MAX(updated_at) as d FROM ${table} ${where}`, params);
      return { table, total: parseInt(rows[0].c), lastUpdate: rows[0].d };
    },
  };
}

// ── Exported CRUDs ───────────────────────────────────────────
export const Imoveis = createCRUD("imoveis", { searchFields: ["nome", "zona", "tipologia", "origem"], defaultSort: "data_adicionado DESC NULLS LAST" });
export const Investidores = createCRUD("investidores", { searchFields: ["nome", "email", "telemovel", "origem"], defaultSort: "updated_at DESC" });
export const Consultores = createCRUD("consultores", { searchFields: ["nome", "contacto", "email"], defaultSort: "updated_at DESC" });
export const Negocios = createCRUD("negocios", { searchFields: ["movimento", "categoria"], defaultSort: "data DESC NULLS LAST" });
export const Despesas = createCRUD("despesas", { searchFields: ["movimento", "categoria"], defaultSort: "data DESC NULLS LAST" });
export const Tarefas = createCRUD("tarefas", { searchFields: ["tarefa"], defaultSort: "created_at DESC" });
export const ConsultorInteracoes = createCRUD("consultor_interacoes", { searchFields: ["notas"], defaultSort: "data_hora DESC" });
export const InvestidorInteracoes = createCRUD("investidor_interacoes", { searchFields: ["notas"], defaultSort: "data_hora DESC" });
export const ConsultorFollowups = createCRUD("consultor_followups", { searchFields: ["motivo"], defaultSort: "data DESC" });
export const DocumentosInvestidor = createCRUD("documentos_investidor", { searchFields: ["nome", "tipo"], defaultSort: "created_at DESC" });
export const Visitas = createCRUD("visitas", { searchFields: ["notas", "resultado"], defaultSort: "data_hora DESC" });
export const Empreiteiros = createCRUD("empreiteiros", { searchFields: ["nome", "empresa", "contacto", "email", "alvara"], defaultSort: "updated_at DESC" });

export async function getDashboardStats({ regiao }: { regiao?: string } = {}) {
  const opts = { regiao };
  const [imoveis, investidores, consultores, negocios, despesas] = await Promise.all([
    Imoveis.stats(opts), Investidores.stats(opts), Consultores.stats(opts), Negocios.stats(opts), Despesas.stats(opts),
  ]);
  return { imoveis, investidores, consultores, negocios, despesas };
}

export { auditLog };
export default pool;
