-- 0007_pg_cron.sql — Agenda dos 12 cron jobs via pg_cron + pg_net.
-- As Edge Functions cron-* sao invocadas por net.http_post; cada funcao filtra a
-- hora/dia/weekday exactos de Lisboa (DST-safe) e usa advisory lock para re-entrancia.
-- pg_cron corre em UTC; por isso os jobs horarios sao agendados de hora a hora ('0 * * * *')
-- e a propria funcao decide se corre (no-op fora da janela).
--
-- Substituir __INTERNAL_API_KEY__ pelo valor real antes de aplicar (ou usar Vault).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Jobs horarios/diarios/semanais/mensais (de hora a hora; a funcao filtra) ──

select cron.schedule(
  'cron-followup', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-followup',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-relatorio-diario', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-relatorio-diario',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-relatorio-semanal', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-relatorio-semanal',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-reclassificacao', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-reclassificacao',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-auto-inactivo', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-auto-inactivo',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-arquivo-obra', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-arquivo-obra',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-arquivo-tarefas', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-arquivo-tarefas',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-despesas', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-despesas',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-backup', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-backup',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

-- ── Jobs de sync (sem janela horaria; correm a cada 15/16/17 min) ──

select cron.schedule(
  'cron-sync-calendar', '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-sync-calendar',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-sync-fireflies', '*/16 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-sync-fireflies',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'cron-sync-forms', '*/17 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-sync-forms',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);
