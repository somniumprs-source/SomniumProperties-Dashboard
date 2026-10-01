-- Tarefas identificadas automaticamente nas conversas WhatsApp da comunidade
-- (pipeline semanal no Mac, sexta 04:00). O Mac cria/actualiza as tarefas;
-- a equipa marca-as como feitas na Agenda > Tarefas pendentes. Uma tarefa
-- feita deixa de aparecer no relatório seguinte.
CREATE TABLE IF NOT EXISTS tarefas_conversas (
  id                    TEXT PRIMARY KEY,            -- T-0001 (gerado no Mac)
  tarefa                TEXT NOT NULL,
  grupo                 TEXT,                        -- grupo WhatsApp de origem
  responsavel           TEXT,
  prazo                 TEXT,                        -- dd/mm/aaaa ou vazio
  prioridade            TEXT NOT NULL DEFAULT 'Normal',  -- Urgente | Normal
  data_origem           TEXT,                        -- dd/mm da mensagem
  semana_criada         DATE,                        -- sexta em que o relatório foi gerado
  estado                TEXT NOT NULL DEFAULT 'aberta' CHECK (estado IN ('aberta', 'feita')),
  feita_em              TIMESTAMPTZ,
  feita_por             TEXT,
  sugestao_concluida    TEXT,                        -- evidência automática (a confirmar)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_conversas_estado ON tarefas_conversas (estado);

-- Sem políticas: só o backend (pool pg) e o Mac (service key) acedem. Nunca o browser directamente.
ALTER TABLE tarefas_conversas ENABLE ROW LEVEL SECURITY;
