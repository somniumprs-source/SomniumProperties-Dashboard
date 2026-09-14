-- Campos de suporte às 6 métricas do SOP 13 §9 (Framework de Métricas de
-- Onboarding e Obra) — hoje o SOP descreve os indicadores mas nenhum dado
-- existe para os calcular. Esta migração acrescenta os pontos de origem:
-- datas de onboarding por investidor, janela de obra activa por projecto, e
-- snapshot do semáforo de desvio orçamental por vistoria.
--
-- Nota: para negocios/investidores/projeto_investidores (tabelas CRUD
-- genérico) esta migração TEM de ser aplicada manualmente à BD de produção
-- (não há lazy-init para elas em produção). Para vistorias_obra, as mesmas
-- colunas são também acrescentadas via ALTER TABLE IF NOT EXISTS dentro de
-- ensureVistoriasObraTable() em runtime (dev e produção), autocurativo.

ALTER TABLE projeto_investidores ADD COLUMN IF NOT EXISTS onboarding_iniciado_em TIMESTAMPTZ;
ALTER TABLE projeto_investidores ADD COLUMN IF NOT EXISTS email_boas_vindas_enviado_em TIMESTAMPTZ;
ALTER TABLE projeto_investidores ADD COLUMN IF NOT EXISTS confirmacao_contacto_em TIMESTAMPTZ;

ALTER TABLE negocios ADD COLUMN IF NOT EXISTS data_inicio_obra DATE;
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS data_fim_obra DATE;

ALTER TABLE vistorias_obra ADD COLUMN IF NOT EXISTS semaforo_pct NUMERIC;
ALTER TABLE vistorias_obra ADD COLUMN IF NOT EXISTS semaforo_cor TEXT;
ALTER TABLE vistorias_obra ADD COLUMN IF NOT EXISTS relatorio_gerado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vistorias_obra_semaforo_cor ON vistorias_obra(negocio_id, semaforo_cor);
