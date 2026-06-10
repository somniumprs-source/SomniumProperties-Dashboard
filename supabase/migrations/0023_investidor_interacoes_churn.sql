-- Departamento Comercial — Dashboard.
-- (1) Log de interacções por investidor (espelho de consultor_interacoes).
--     finalidade: 'discovery' (1ª chamada a novo investidor/lead) | 'follow_up'.
-- (2) Churn de investidores: flag explícita de "não vai reinvestir connosco".

CREATE TABLE IF NOT EXISTS investidor_interacoes (
  id TEXT PRIMARY KEY,
  investidor_id TEXT NOT NULL,
  data_hora TEXT NOT NULL DEFAULT (NOW()::TEXT),
  canal TEXT NOT NULL,
  direcao TEXT NOT NULL,
  finalidade TEXT NOT NULL DEFAULT 'follow_up',
  notas TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_inv_interacoes_investidor ON investidor_interacoes(investidor_id);
CREATE INDEX IF NOT EXISTS idx_inv_interacoes_data ON investidor_interacoes(data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_inv_interacoes_finalidade ON investidor_interacoes(finalidade);

-- Churn: investidor em parceria que declarou que NÃO vai reinvestir.
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS nao_reinveste INTEGER DEFAULT 0;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS data_nao_reinveste TEXT;
