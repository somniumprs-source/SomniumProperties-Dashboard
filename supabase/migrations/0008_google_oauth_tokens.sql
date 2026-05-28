-- 0008_google_oauth_tokens.sql — armazenamento do refresh token OAuth Google.
--
-- Contexto: no backend Render o token vivia em ficheiro (google-token.json). Nas
-- Edge Functions não há disco persistente. As funcoes `calendar` e os crons de sync
-- usam por agora GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN por env (mais simples).
-- Esta tabela e a alternativa (multi-conta / rotacao de token sem redeploy): se
-- preferires geri-lo em BD, popula esta tabela e adapta getGcal() para a ler.

create table if not exists google_oauth_tokens (
  id            text primary key default 'default',
  client_id     text,
  client_secret text,
  refresh_token text,
  access_token  text,
  scope         text,
  expiry        timestamptz,
  updated_at    timestamptz not null default now()
);

comment on table google_oauth_tokens is
  'Token OAuth Google (substitui google-token.json). Por defeito as funcoes usam env; esta tabela e opcional.';
