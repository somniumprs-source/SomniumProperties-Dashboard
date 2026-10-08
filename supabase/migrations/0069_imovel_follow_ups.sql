-- Registo dos follow-ups feitos a um imóvel (bloco "Próximos passos" da ficha).
-- Cada linha é um follow-up feito num dia: com sucesso ('Feito') ou sem sucesso
-- (não atendeu, pediu para voltar a ligar...), neste caso com o motivo e a data
-- para que ficou reagendado. O que está por fazer continua a viver nas tarefas
-- (origem_tipo = 'imovel', origem_campo = 'data_follow_up').
CREATE TABLE IF NOT EXISTS imovel_follow_ups (
  id            TEXT PRIMARY KEY,
  imovel_id     TEXT NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  data          DATE NOT NULL,                 -- dia em que o follow-up foi feito
  resultado     TEXT NOT NULL CHECK (resultado IN ('Feito', 'Sem sucesso')),
  motivo        TEXT,
  proxima_data  DATE,                          -- para quando ficou reagendado
  autor         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imovel_follow_ups_imovel ON imovel_follow_ups (imovel_id, data DESC);

-- Sem políticas: só o backend (pool pg) acede. Nunca o browser directamente.
ALTER TABLE imovel_follow_ups ENABLE ROW LEVEL SECURITY;
