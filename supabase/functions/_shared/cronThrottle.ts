import pool from "./pg.ts";

// Impõe um intervalo mínimo entre execuções, para os crons "sempre-ligados"
// (sem janela horária — pg_cron corre-os a cada 15-17min: sync-calendar,
// sync-fireflies). Sem isto, se INTERNAL_API_KEY não estiver
// definida em produção, ficam invocáveis sem limite por quem souber o URL,
// multiplicando pedidos às APIs externas (Google Calendar, Fireflies) a cada
// chamada.
// Uma linha por cron em cron_execucoes (migração 0081); antes escrevia uma
// linha no audit_log a cada execução, o que enchia o histórico de ruído (D13).
// O UPDATE condicional é atómico: duas chamadas ao mesmo tempo não correm ambas.
export async function throttled(fnName: string, minIntervalMs: number): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO cron_execucoes (nome, ultima_execucao) VALUES ($1, NOW())
     ON CONFLICT (nome) DO UPDATE SET ultima_execucao = NOW()
       WHERE cron_execucoes.ultima_execucao < NOW() - ($2::int * INTERVAL '1 millisecond')
     RETURNING nome`,
    [fnName, minIntervalMs],
  );
  return rows.length > 0;
}
