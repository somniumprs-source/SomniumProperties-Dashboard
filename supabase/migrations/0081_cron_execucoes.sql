-- 0081_cron_execucoes.sql — tira as execuções de crons do audit_log (auditoria D13).
--
-- O travão de frequência dos crons «sempre ligados» (_shared/cronThrottle.ts)
-- escrevia uma linha no audit_log por execução (8 148 até out 2026, ~1 700 por
-- semana), enterrando as alterações feitas por pessoas. Passa a guardar só a
-- última execução de cada cron, numa linha.

CREATE TABLE IF NOT EXISTS cron_execucoes (
  nome TEXT PRIMARY KEY,
  ultima_execucao TIMESTAMPTZ NOT NULL
);

INSERT INTO cron_execucoes (nome, ultima_execucao)
SELECT registo_id, MAX(created_at::timestamptz) FROM audit_log
 WHERE tabela = 'cron' AND registo_id IS NOT NULL GROUP BY registo_id
ON CONFLICT (nome) DO UPDATE SET ultima_execucao = GREATEST(cron_execucoes.ultima_execucao, EXCLUDED.ultima_execucao);

DELETE FROM audit_log WHERE tabela = 'cron';
