/**
 * Backup pre-migracao: captura TODAS as celulas (tabela, coluna, id, valor, tipo)
 * do schema public que contem a string "/uploads/". E exactamente o conjunto que
 * o migrate-uploads-to-storage.mjs vai reescrever, por isso permite restauro total.
 *
 * Uso: node --env-file=.env scripts/backup-uploads-cells.mjs
 * Output: backups/uploads-cells-<ISO>.json
 *
 * Restauro (se necessario): para cada entrada, UPDATE "<table>" SET "<column>" =
 *   $val[::tipo] WHERE id = $id;  (ver scripts/restore-uploads-cells.mjs se existir,
 *   ou reaplicar manualmente a partir do JSON).
 */
import pg from "pg";
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUPS = join(__dirname, "..", "backups");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await mkdir(BACKUPS, { recursive: true });
  const { rows: cols } = await pool.query(`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND data_type IN ('text','character varying','jsonb','json')
     ORDER BY table_name, column_name`);

  const entries = [];
  for (const { table_name, column_name, data_type } of cols) {
    let rows;
    try {
      const r = await pool.query(
        `SELECT id, "${column_name}"::text AS val FROM "${table_name}"
          WHERE "${column_name}"::text LIKE '%/uploads/%'`,
      );
      rows = r.rows;
    } catch {
      continue; // tabela sem id ou outro problema — ignorar (igual ao migrador)
    }
    for (const row of rows) {
      entries.push({ table: table_name, column: column_name, data_type, id: row.id, value: row.val });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = join(BACKUPS, `uploads-cells-${stamp}.json`);
  await writeFile(out, JSON.stringify({ created_at: new Date().toISOString(), count: entries.length, entries }, null, 2));
  console.log(`Backup escrito: ${out}`);
  console.log(`Celulas com /uploads/: ${entries.length}`);
  const byTable = {};
  for (const e of entries) byTable[`${e.table}.${e.column}`] = (byTable[`${e.table}.${e.column}`] || 0) + 1;
  console.log(byTable);
  await pool.end();
}

main().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
