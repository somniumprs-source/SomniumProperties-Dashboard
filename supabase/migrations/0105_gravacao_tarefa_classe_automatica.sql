-- SOP 23: gravação ligada à call agendada e classificação automática (17/11/2026).
-- 1. investidor_gravacoes.tarefa_id: a call da Agenda a que a gravação pertence.
-- 2. Classes em estado 'proposta' (modelo antigo com validação pelo outro CEO)
--    passam a definidas: desde 17/11/2026 a classe é automática, sem validação.
--
-- REVERTER:
--   ALTER TABLE investidor_gravacoes DROP COLUMN IF EXISTS tarefa_id;
--   (o passo 2 não se reverte: o histórico fica em classificacao_historico)

ALTER TABLE investidor_gravacoes ADD COLUMN IF NOT EXISTS tarefa_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_tarefa ON investidor_gravacoes(tarefa_id) WHERE tarefa_id IS NOT NULL;

UPDATE investidores
   SET classificacao = classificacao_proposta, classificacao_estado = 'validada', classificacao_origem = 'discovery',
       classificacao_definida_em = COALESCE(classificacao_proposta_em, now()), classificacao_validada_em = now(),
       classificacao_validada_por = 'Automática (migração 0105)'
 WHERE classificacao_estado = 'proposta' AND classificacao_proposta IS NOT NULL
   AND classificacao_proposta_por IS DISTINCT FROM 'Automática (migração 0105)';
