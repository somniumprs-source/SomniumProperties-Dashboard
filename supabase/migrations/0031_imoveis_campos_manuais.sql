-- Formaliza 3 colunas de imoveis usadas todos os dias (formulários, PDFs,
-- auto-geração de ref_interna em crud.js/whatsappAgent.js) mas criadas
-- manualmente fora do processo de migração — confirmado por
-- information_schema.columns que já existem em produção com estes tipos.
-- Sem isto, um ambiente novo (staging, disaster recovery) perderia estes
-- campos silenciosamente, porque o CRUD dinâmico (crud.js) ignora colunas
-- que não existem em information_schema.
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS ref_interna TEXT;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS imi_anual REAL;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS condominio_mensal_anunciado REAL;
