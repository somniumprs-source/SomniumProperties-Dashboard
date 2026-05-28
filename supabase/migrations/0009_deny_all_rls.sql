-- 0009_deny_all_rls.sql — fecha o acesso publico via PostgREST.
--
-- Porque: apos o cutover, o frontend usa a anon key do Supabase (publica). Sem
-- RLS, qualquer pessoa com a anon key poderia ler/escrever as tabelas CRM via
-- PostgREST (https://<proj>.supabase.co/rest/v1/...). As Edge Functions usam a
-- service-role key, que tem BYPASSRLS — por isso continuam a funcionar mesmo com
-- RLS activo e SEM politicas (deny-all para anon/authenticated).
--
-- PRE-REQUISITO: confirmar que o frontend NAO le tabelas directamente via
-- supabase.from(...).select() — neste projecto todo o acesso passa por apiFetch
-- -> Edge Functions (service role), por isso e seguro. Aplicar no cutover.
--
-- Activa RLS em todas as tabelas do schema public, sem adicionar politicas.

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t.tablename);
  end loop;
end $$;
