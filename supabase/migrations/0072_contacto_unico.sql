-- Contacto único por pessoa. A lead é a pessoa (consultor, investidor); o
-- imóvel é o assunto da conversa.
--
-- O contacto feito continua a ser uma linha nas tabelas de interações que já
-- existiam (consultor_interacoes, investidor_interacoes) — é delas que os
-- dashboards, os alertas de inatividade e o "último contacto" já leem. Ganham
-- o resultado, a data para que ficou marcado o seguinte e quem registou.
ALTER TABLE consultor_interacoes
  ADD COLUMN IF NOT EXISTS resultado TEXT,
  ADD COLUMN IF NOT EXISTS proxima_data TEXT,
  ADD COLUMN IF NOT EXISTS autor TEXT;
ALTER TABLE investidor_interacoes
  ADD COLUMN IF NOT EXISTS resultado TEXT,
  ADD COLUMN IF NOT EXISTS proxima_data TEXT,
  ADD COLUMN IF NOT EXISTS autor TEXT;

-- Assuntos de um contacto: os imóveis a tratar (ou uma nota livre). Enquanto o
-- contacto está por fazer pendem da tarefa da agenda (origem = 'tarefa',
-- origem_campo = 'proximo_contacto', uma por pessoa); depois de feito passam
-- para a interação que o registou. É por aqui que a ficha do imóvel sabe em
-- que contacto vai ser tratado e mostra os contactos em que foi assunto.
CREATE TABLE IF NOT EXISTS contacto_assuntos (
  id          TEXT PRIMARY KEY,
  origem      TEXT NOT NULL CHECK (origem IN ('tarefa', 'consultor_interacao', 'investidor_interacao')),
  origem_id   TEXT NOT NULL,
  imovel_id   TEXT REFERENCES imoveis(id) ON DELETE CASCADE,
  texto       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (imovel_id IS NOT NULL OR COALESCE(btrim(texto), '') <> '')
);

CREATE INDEX IF NOT EXISTS idx_contacto_assuntos_origem ON contacto_assuntos (origem, origem_id);
CREATE INDEX IF NOT EXISTS idx_contacto_assuntos_imovel ON contacto_assuntos (imovel_id);

-- Sem políticas: só o backend (pool pg) acede. Nunca o browser directamente.
ALTER TABLE contacto_assuntos ENABLE ROW LEVEL SECURITY;
