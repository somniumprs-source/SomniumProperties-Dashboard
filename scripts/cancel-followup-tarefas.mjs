/**
 * Apaga todas as tarefas "Follow-up pendente — ..." geradas pelo cron de
 * follow-up de consultores (cronJobs.ts/js). Dry-run por defeito.
 *
 * Uso:
 *   node --env-file=.env scripts/cancel-followup-tarefas.mjs           # dry-run
 *   node --env-file=.env scripts/cancel-followup-tarefas.mjs --apply   # grava
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PREFIX = "Follow-up pendente — %";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows: sample } = await pool.query(
  `SELECT id, tarefa, status, created_at
     FROM tarefas
    WHERE tarefa LIKE $1
    ORDER BY created_at DESC
    LIMIT 5`,
  [PREFIX],
);

const { rows: [{ n }] } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM tarefas WHERE tarefa LIKE $1`,
  [PREFIX],
);

const { rows: porStatus } = await pool.query(
  `SELECT status, COUNT(*)::int AS n
     FROM tarefas
    WHERE tarefa LIKE $1
    GROUP BY status
    ORDER BY n DESC`,
  [PREFIX],
);

console.log(`\nTotal a apagar: ${n}`);
console.log("Por status:", porStatus);
console.log("Amostra (5 mais recentes):");
for (const r of sample) console.log(`  - [${r.status}] ${r.tarefa}`);

if (!APPLY) {
  console.log("\nDry-run. Correr com --apply para apagar.");
  await pool.end();
  process.exit(0);
}

const res = await pool.query(
  `DELETE FROM tarefas WHERE tarefa LIKE $1`,
  [PREFIX],
);
console.log(`\nApagadas ${res.rowCount} tarefas.`);
await pool.end();
