-- Classificação A–D de investidores pelo scorecard da discovery call
-- (SOP 4 e SOP 23, secção 4.10). Regra em supabase/functions/_shared/classeInvestidor.js.
--
-- 1. Colunas novas em investidores (a pontuacao antiga de 0–100 fica intacta):
--    scorecard_discovery       JSONB    notas por critério { capital: { nota, origem, sugestao_id? }, ... , observacoes, preenchido_por, preenchido_em }
--    pontuacao_discovery       SMALLINT total de 0 a 12 (null enquanto faltar algum critério)
--    classificacao_proposta    TEXT     classe calculada pelo scorecard, por validar (proposta original, nunca reescrita pelos CEO)
--    classificacao_estado      TEXT     'proposta' (à espera dos dois CEO) | 'validada'
--    classificacao_validacoes  JSONB    log [{ por, em, classe, acao: validou|alterou, motivo? }]
--    classificacao_alteracao_motivo TEXT motivo da última alteração da proposta por um CEO
-- 2. classificacao_origem: 'legado' para quem já tinha classe (anterior ao SOP 23).
--    Valor novo 'discovery' quando a classe é validada pelo scorecard novo.
-- 3. Status 'Call marcada' renomeado para 'Discovery call marcada'.
-- 4. investidor_gravacoes.tipo_chamada passa a aceitar 'discovery' (sem CHECK;
--    a lista vive em TIPOS_CHAMADA_INV no código).
--
-- NÃO aplicar sem autorização. Os registos antigos de scorecards e
-- classificacao_historico ficam como estão.
--
-- REVERTER:
--   UPDATE investidores SET status = 'Call marcada' WHERE status = 'Discovery call marcada';
--   UPDATE investidores SET classificacao_origem = 'automatica' WHERE classificacao_origem = 'legado';
--   ALTER TABLE investidores
--     DROP COLUMN IF EXISTS scorecard_discovery, DROP COLUMN IF EXISTS pontuacao_discovery,
--     DROP COLUMN IF EXISTS classificacao_proposta, DROP COLUMN IF EXISTS classificacao_estado,
--     DROP COLUMN IF EXISTS classificacao_validacoes, DROP COLUMN IF EXISTS classificacao_alteracao_motivo;

BEGIN;

ALTER TABLE investidores ADD COLUMN IF NOT EXISTS scorecard_discovery JSONB;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS pontuacao_discovery SMALLINT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_proposta TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_estado TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_validacoes JSONB;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_alteracao_motivo TEXT;

DO $$ BEGIN
  ALTER TABLE investidores ADD CONSTRAINT investidores_pontuacao_discovery_chk
    CHECK (pontuacao_discovery IS NULL OR pontuacao_discovery BETWEEN 0 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE investidores ADD CONSTRAINT investidores_classificacao_proposta_chk
    CHECK (classificacao_proposta IS NULL OR classificacao_proposta IN ('A','B','C','D'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE investidores ADD CONSTRAINT investidores_classificacao_estado_chk
    CHECK (classificacao_estado IS NULL OR classificacao_estado IN ('proposta','validada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Investidores já classificados: classe mantém-se, origem passa a legado.
UPDATE investidores SET classificacao_origem = 'legado'
 WHERE classificacao IS NOT NULL AND COALESCE(classificacao_origem, 'automatica') <> 'discovery';

-- Etapa renomeada (2 registos em 16/11/2026).
UPDATE investidores SET status = 'Discovery call marcada' WHERE status = 'Call marcada';

COMMIT;
