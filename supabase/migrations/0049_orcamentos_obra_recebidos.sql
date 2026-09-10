-- Orçamentos recebidos de fornecedores/empreiteiros para um imóvel em obra
-- (distinto de orcamentos_obra, que guarda a estimativa de custo planeada).
CREATE TABLE IF NOT EXISTS orcamentos_obra_recebidos (
  id TEXT PRIMARY KEY,
  imovel_id TEXT NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  fornecedor TEXT NOT NULL,
  valor NUMERIC,
  notas TEXT,
  storage_path TEXT,
  drive_file_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_obra_recebidos_imovel ON orcamentos_obra_recebidos(imovel_id);
