import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  `SELECT MIN(created_at) min, MAX(created_at) max, COUNT(*) n
     FROM tarefas WHERE tarefa LIKE 'Follow-up pendente — %'`,
);
console.log("Tarefas follow-up:", rows[0]);
const { rows: recentes } = await pool.query(
  `SELECT id, tarefa, created_at FROM tarefas
    WHERE tarefa LIKE 'Follow-up pendente — %'
    ORDER BY created_at DESC LIMIT 3`,
);
console.log("Mais recentes:", recentes);

try {
  const { rows: jobs } = await pool.query(
    `SELECT jobname, schedule, command, active FROM cron.job WHERE jobname LIKE 'cron-followup%' OR command ILIKE '%followup%'`,
  );
  console.log("\npg_cron jobs:", jobs);
  const { rows: hist } = await pool.query(
    `SELECT j.jobname, r.start_time, r.end_time, r.status, r.return_message
       FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid
      WHERE j.jobname LIKE 'cron-followup%'
      ORDER BY r.start_time DESC LIMIT 10`,
  );
  console.log("\nUltimas execucoes:", hist);
} catch (e) {
  console.log("cron schema indisponivel:", e.message);
}
await pool.end();
