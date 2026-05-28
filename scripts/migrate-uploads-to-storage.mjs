/**
 * Migração dos uploads em disco (public/uploads/, ~448MB) para Supabase Storage.
 *
 * O que faz:
 *  1. Descobre TODAS as colunas text/varchar/jsonb do schema public que contêm
 *     a string "/uploads/".
 *  2. Para cada ocorrência "/uploads/<sub>/<ficheiro>": faz upload do ficheiro
 *     local (public/uploads/<sub>/<ficheiro>) para o bucket Storage derivado do
 *     primeiro segmento (imoveis -> "Imoveis", etc.; público), uma única vez por
 *     ficheiro (cache old_path -> new_url), e substitui o caminho pela URL pública.
 *  3. UPDATE da linha com o texto/JSON já reescrito.
 *
 * Seguro: DRY-RUN por defeito (não escreve nada). Correr com --apply para gravar.
 * Idempotente: caminhos que já são URLs (http) ou cujo ficheiro local não existe
 * são deixados intactos (com aviso).
 *
 * Uso:
 *   node --env-file=.env scripts/migrate-uploads-to-storage.mjs           # dry-run
 *   node --env-file=.env scripts/migrate-uploads-to-storage.mjs --apply   # grava
 *
 * Env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY.
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFile, access } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = join(__dirname, "..", "public", "uploads");
const APPLY = process.argv.includes("--apply");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mjgusjuougzoeiyavsor.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_KEY em falta — necessário para Storage.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Primeiro segmento de /uploads/<seg>/... -> nome do bucket (público).
function bucketForSegment(seg) {
  if (seg === "imoveis") return "Imoveis";
  return seg; // comprovativos, despesas, projetos, projetos-docs, stress_tests...
}

const EXT_CT = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".heic": "image/heic", ".pdf": "application/pdf", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
function contentType(path) {
  const m = path.toLowerCase().match(/\.[a-z0-9]+$/);
  return (m && EXT_CT[m[0]]) || "application/octet-stream";
}

const ensuredBuckets = new Set();
async function ensureBucket(bucket) {
  if (ensuredBuckets.has(bucket)) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!(buckets || []).some((b) => b.name === bucket)) {
    if (APPLY) await supabase.storage.createBucket(bucket, { public: true });
    console.log(`  [bucket] ${bucket} ${APPLY ? "criado" : "(criaria)"} `);
  }
  ensuredBuckets.add(bucket);
}

// cache: webPath ("/uploads/imoveis/x.jpg") -> publicUrl (ou null se falhou)
const urlCache = new Map();
const stats = { files: 0, uploaded: 0, missing: 0, skipped: 0, cells: 0, updates: 0 };

async function migrateWebPath(webPath) {
  if (urlCache.has(webPath)) return urlCache.get(webPath);
  const rel = webPath.replace(/^\/uploads\//, ""); // imoveis/x.jpg
  const seg = rel.split("/")[0];
  const bucket = bucketForSegment(seg);
  const objectPath = rel; // preserva estrutura: imoveis/x.jpg
  const localPath = join(UPLOADS_ROOT, rel);

  let url = null;
  try {
    await access(localPath);
  } catch {
    stats.missing++;
    console.warn(`  [missing] ${webPath} (sem ficheiro local — deixado intacto)`);
    urlCache.set(webPath, null);
    return null;
  }

  stats.files++;
  if (APPLY) {
    try {
      await ensureBucket(bucket);
      const bytes = await readFile(localPath);
      const { error } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
        contentType: contentType(localPath), upsert: true,
      });
      if (error) throw new Error(error.message);
      url = supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
      stats.uploaded++;
    } catch (e) {
      console.error(`  [erro upload] ${webPath}: ${e.message}`);
      urlCache.set(webPath, null);
      return null;
    }
  } else {
    await ensureBucket(bucket);
    url = supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
    stats.uploaded++;
    console.log(`  [upload?] ${webPath} -> ${url}`);
  }
  urlCache.set(webPath, url);
  return url;
}

// Substitui todas as ocorrências /uploads/<...> num texto pela URL Storage.
const UPLOADS_RE = /\/uploads\/[A-Za-z0-9._\-\/]+/g;
async function rewriteText(text) {
  const matches = [...new Set(text.match(UPLOADS_RE) || [])];
  if (matches.length === 0) return { text, changed: false };
  let out = text;
  let changed = false;
  for (const webPath of matches) {
    const url = await migrateWebPath(webPath);
    if (url) {
      out = out.split(webPath).join(url);
      changed = true;
    }
  }
  return { text: out, changed };
}

async function getColumns() {
  const { rows } = await pool.query(`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND data_type IN ('text','character varying','jsonb','json')
     ORDER BY table_name, column_name`);
  return rows;
}

async function main() {
  console.log(`=== Migração uploads -> Storage (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  let cols = await getColumns();

  // Filtro opcional: MIGRATE_ONLY="tabela.coluna,tabela.coluna" limita as colunas a reescrever.
  // Sem a variavel, comportamento original (todas as colunas).
  const only = (process.env.MIGRATE_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (only.length) {
    const set = new Set(only);
    cols = cols.filter((c) => set.has(`${c.table_name}.${c.column_name}`));
    console.log(`Filtro MIGRATE_ONLY activo: ${only.join(", ")} -> ${cols.length} coluna(s)`);
  }

  for (const { table_name, column_name, data_type } of cols) {
    // Procurar linhas cuja coluna contém /uploads/
    let rows;
    try {
      const r = await pool.query(
        `SELECT id, "${column_name}"::text AS val FROM "${table_name}"
          WHERE "${column_name}"::text LIKE '%/uploads/%'`,
      );
      rows = r.rows;
    } catch (e) {
      // tabela sem coluna id ou outro problema — ignorar
      continue;
    }
    if (rows.length === 0) continue;
    console.log(`\n[${table_name}.${column_name}] ${rows.length} linha(s) com /uploads/`);

    for (const row of rows) {
      stats.cells++;
      const { text, changed } = await rewriteText(row.val);
      if (!changed) {
        stats.skipped++;
        continue;
      }
      if (APPLY) {
        const cast = (data_type === "jsonb" || data_type === "json") ? `$1::${data_type}` : `$1`;
        await pool.query(`UPDATE "${table_name}" SET "${column_name}" = ${cast} WHERE id = $2`, [text, row.id]);
        stats.updates++;
      }
    }
  }

  console.log(`\n=== Resumo ===`);
  console.log(stats);
  console.log(APPLY ? "Concluído (gravado)." : "Dry-run — nada gravado. Correr com --apply para aplicar.");
  await pool.end();
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
