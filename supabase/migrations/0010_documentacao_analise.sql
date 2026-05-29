-- 0010_documentacao_analise.sql — coluna para a análise documental por IA.
--
-- Porque: a feature "importação livre com interpretação por IA" persiste, por
-- imóvel, um array de análises (uma por documento) em imoveis.documentacao_analise.
-- A coluna era criada apenas pelo ALTER do src/db/pg.js (arranque do backend dev);
-- como o deploy só publica Edge Functions (não aplica migrações), em produção a
-- coluna podia não existir e o crud.update descartava o campo em silêncio
-- (filtro tableCols.has) — as análises nunca ficavam guardadas.
--
-- A Edge Function também garante a coluna em runtime (crud.ensureColumn), mas
-- esta migração mantém o schema correcto num rebuild limpo da BD.

ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS documentacao_analise JSONB DEFAULT '[]';
