-- 0019_negocios_soft_delete.sql — coluna de soft delete (lixeira) para negócios.
--
-- Porque: apagar um projecto faz soft delete (UPDATE negocios SET deleted_at = NOW()),
-- com restauro a partir da lixeira. Em dev a coluna é criada pelo src/db/pg.js no boot,
-- mas produção (Supabase) só a tinha via ensureColumn na Edge Function — em falta, o
-- DELETE rebentava com "Erro ao apagar". Esta migração garante a coluna em produção.
--
-- A coluna fica nullable: negócios activos têm deleted_at NULL; os filtros de
-- listagem excluem sempre os preenchidos (deleted_at IS NOT NULL = na lixeira).

ALTER TABLE negocios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_negocios_deleted ON negocios(deleted_at);
