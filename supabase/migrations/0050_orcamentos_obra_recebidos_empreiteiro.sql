-- Liga cada orçamento recebido ao Construtor (empreiteiro) do pipeline de
-- Construtores, quando o fornecedor já lá está identificado — permite cruzar
-- orçamentos recebidos com o histórico do construtor em análises internas.
ALTER TABLE orcamentos_obra_recebidos
  ADD COLUMN IF NOT EXISTS empreiteiro_id TEXT REFERENCES empreiteiros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_obra_recebidos_empreiteiro ON orcamentos_obra_recebidos(empreiteiro_id);
