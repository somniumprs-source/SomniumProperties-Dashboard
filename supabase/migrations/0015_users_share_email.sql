-- 0015_users_share_email.sql — permite varios registos users com o mesmo email.
--
-- Contexto: a equipa partilha a mesma sessao Supabase (somniumprs@gmail.com).
-- Para distinguir quem opera (audit log, selector de perfil), precisamos de
-- multiplos registos em users com o mesmo email — um por pessoa. O auth Supabase
-- nao e afectado: continua a usar o email da sessao. O perfil activo e enviado
-- via X-User-Id (ver src/lib/api.js).

-- Dropar UNIQUE em users.email (nome do constraint pode variar; tentamos os
-- nomes default do Postgres e ignoramos os que nao existirem).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- Inserir Alexandre Mendes como segundo administrador com o mesmo email.
-- Idempotente: so insere se nao existir um registo com este nome + email.
INSERT INTO users (id, email, nome, iniciais, cor, role, ativo)
SELECT 'admin-alex', 'somniumprs@gmail.com', 'Alexandre Mendes', 'AM', '#C9A84C', 'admin', true
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE LOWER(email) = LOWER('somniumprs@gmail.com') AND nome = 'Alexandre Mendes'
);
