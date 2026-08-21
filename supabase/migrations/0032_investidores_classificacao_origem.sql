-- Hierarquia de classificação do investidor (ver B2 da auditoria): quando a
-- equipa preenche o formulário de classificação (scorecard manual), essa
-- classificação passa a mandar — as automações (score-investidores,
-- reclassificar-investidores, auto-fill IA via Fireflies) deixam de a
-- sobrescrever.
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_origem TEXT DEFAULT 'automatica';
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_definida_em TIMESTAMPTZ;
