import pool from "./pg.ts";

// Impõe um intervalo mínimo entre execuções, para os crons "sempre-ligados"
// (sem janela horária — pg_cron corre-os a cada 15-17min: sync-calendar,
// sync-fireflies, sync-forms). Sem isto, se INTERNAL_API_KEY não estiver
// definida em produção, ficam invocáveis sem limite por quem souber o URL,
// multiplicando pedidos às APIs externas (Google Calendar, Fireflies,
// Google Forms) a cada chamada. Reaproveita a tabela `audit_log` já existente
// em vez de criar uma tabela nova só para isto.
export async function throttled(fnName: string, minIntervalMs: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT created_at FROM audit_log WHERE tabela = 'cron' AND registo_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [fnName],
  );
  const last = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : 0;
  if (Date.now() - last < minIntervalMs) return false;
  await pool.query(
    `INSERT INTO audit_log (tabela, registo_id, acao) VALUES ('cron', $1, 'RUN')`,
    [fnName],
  );
  return true;
}
