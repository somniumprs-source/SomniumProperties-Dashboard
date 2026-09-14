-- Pesquisa diária de imóveis (Idealista via Apify) — SOP 1, secção 5.2.1.
-- Job horário; a Edge Function filtra a janela exacta (7h Lisboa, mesma hora
-- do antigo LaunchAgent com.somnium.search-properties) e decide se corre.
-- Mesmo padrão de 0041_cron_gerar_agenda_semanal.sql.
--
-- Substituir __INTERNAL_API_KEY__ pelo valor real antes de aplicar.

select cron.schedule(
  'cron-procura-imoveis', '0 * * * *',
  $$ select net.http_post(
       url := 'https://mjgusjuougzoeiyavsor.functions.supabase.co/cron-procura-imoveis',
       headers := jsonb_build_object('x-api-key', '__INTERNAL_API_KEY__'),
       body := '{}'::jsonb
     ) $$
);
