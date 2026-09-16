-- Integração Slack: log de mensagens do canal (alimenta o relatório diário
-- e regista os triggers "TAREFA-...") + agendamento do relatório diário.
-- Mesmo padrão de 0041_cron_gerar_agenda_semanal.sql / 0052_cron_procura_imoveis.sql.
--
-- Substituir __INTERNAL_API_KEY__ pelo valor real antes de aplicar.

CREATE TABLE IF NOT EXISTS slack_mensagens (
  id TEXT PRIMARY KEY,
  slack_event_id TEXT UNIQUE,
  channel_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  texto TEXT,
  ts TEXT,
  is_trigger_tarefa BOOLEAN DEFAULT FALSE,
  tarefa_id TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_slack_mensagens_created_at ON slack_mensagens(created_at);

select cron.schedule(
  'cron-relatorio-diario-slack', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-relatorio-diario-slack',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);
