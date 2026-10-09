-- Parceiro com edição: por omissão os parceiros só consultam o que lhes foi
-- partilhado (guard "Acesso só de consulta" em /api/crm). Com pode_editar = true
-- o parceiro edita os imóveis a que tem acesso (tabela `acessos`) — ficha, obra,
-- análises e visitas — sem criar nem apagar imóveis.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pode_editar BOOLEAN NOT NULL DEFAULT false;

-- Primeiro parceiro com edição: Luís Pedro.
UPDATE users SET pode_editar = true WHERE id = '69e246d1-bdc7-4405-b902-783e2520b578';
