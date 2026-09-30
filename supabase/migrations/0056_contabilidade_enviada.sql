-- Aba "Contabilidade" (Financeiro): marca faturas já entregues à contabilidade.
-- Também aplicada em runtime por src/db/contabilidade.js / _shared/contabilidade.ts.
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS enviada_contabilidade_em TIMESTAMPTZ;
ALTER TABLE projeto_documentos ADD COLUMN IF NOT EXISTS enviada_contabilidade_em TIMESTAMPTZ;
