// Backup automatico das tabelas CRM para a tabela `backups` (JSONB). Port de
// /backup/auto (src/db/routes.js). Usado pelo cron-backup.
import pool from "./pg.ts";

const BACKUP_TABLES = ["imoveis", "investidores", "consultores", "negocios", "despesas", "tarefas"];

export async function runBackup(): Promise<{ ok: boolean; total: number; timestamp: string }> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backups (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      total_registos INT DEFAULT 0,
      created_at TEXT DEFAULT (NOW()::TEXT)
    )
  `);
  const backup: Record<string, any[]> = {};
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
  // Manter so os ultimos 30 backups
  await pool.query(`DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT 30)`);
  return { ok: true, total, timestamp: new Date().toISOString() };
}
