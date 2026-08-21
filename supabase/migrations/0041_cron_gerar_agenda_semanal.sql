-- Fase 3 do Sistema de Agenda: pré-gerar a proposta da semana seguinte
-- automaticamente, Domingo às 20h (Europe/Lisbon) — depois de a equipa
-- ter tido o dia para marcar disponibilidade, para a proposta já estar
-- pronta segunda-feira de manhã. Mesmo padrão da migration 0007_pg_cron.sql
-- (job horário; a Edge Function filtra a janela exacta e decide se corre).
--
-- Substituir __INTERNAL_API_KEY__ pelo valor real antes de aplicar.

select cron.schedule(
  'cron-gerar-agenda-semanal', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-gerar-agenda-semanal',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);
