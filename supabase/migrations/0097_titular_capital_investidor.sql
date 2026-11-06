-- Titular do capital quando é diferente do investidor (ex.: o investidor é o
-- representante e o capital pertence a um familiar). Lido pelo Dossiê de
-- Investidor. Também garantido em runtime (ensureColumn na Edge Function crm),
-- porque as migrações não são auto-aplicadas em produção.
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS titular_capital JSONB;
