-- Entrega 2 do Dashboard, fase 3: custo final previsto e erosão de lucro (03/11/2026).
-- Só acrescenta colunas; nada se apaga.

-- Lucro de referência (P07): a análise congelada no momento da compra, escrita
-- uma única vez. Rever o orçamento ou guardar outra análise final não a muda.
-- Projetos antigos: a cópia feita ao passar a projeto (analise_snapshot).
-- Projetos novos: a primeira análise guardada como final.
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS analise_referencia JSONB;
UPDATE negocios SET analise_referencia = analise_snapshot
WHERE analise_referencia IS NULL AND analise_snapshot IS NOT NULL;
UPDATE negocios SET analise_referencia = analise_final->'snapshot'
WHERE analise_referencia IS NULL AND analise_final ? 'snapshot';

-- Previsão do custo final das rubricas que vão sendo faturadas (obra, custos
-- mensais): { "<rubrica>": valor }. As restantes usam a fatura como valor final.
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS previsao_rubricas JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS previsao_atualizada_em TIMESTAMPTZ;
