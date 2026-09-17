-- 0055_indices_relacoes_quentes.sql — índices em relações muito consultadas
-- sem índice (achado da auditoria transversal, Problema 29). FKs já existiam
-- (006_foreign_keys.sql / migrações posteriores); faltava só o índice.
-- CONCURRENTLY: sem lock de escrita na tabela, seguro correr em produção.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_negocios_imovel_id ON negocios(imovel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tarefas_user_id ON tarefas(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documentos_investidor_imovel_id ON documentos_investidor(imovel_id);
