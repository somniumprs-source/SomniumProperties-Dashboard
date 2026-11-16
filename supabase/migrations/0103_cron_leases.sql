-- Exclusão mútua dos crons por lease numa tabela, em vez de pg_try_advisory_lock.
-- Através do pooler (Supavisor, modo transação) o unlock pode correr noutra
-- ligação do servidor e o advisory lock fica preso para sempre. Um lease expira
-- sozinho (ate), por isso nunca bloqueia indefinidamente.
-- Usado por cron-preparacao-calls.
--
-- REVERTER: DROP TABLE IF EXISTS cron_leases;
CREATE TABLE IF NOT EXISTS cron_leases (
  nome TEXT PRIMARY KEY,
  ate TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.cron_leases ENABLE ROW LEVEL SECURITY;
