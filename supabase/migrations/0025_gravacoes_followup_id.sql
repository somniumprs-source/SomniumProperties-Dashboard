-- Liga cada gravacao de chamada a uma entrada do historico de follow-ups do
-- consultor. O upload do audio passa a ser feito a partir do formulario de
-- follow-up (ao registar a conversa anexa-se logo a gravacao). Gravacoes
-- antigas, sem follow-up associado, ficam com followup_id NULL.
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS followup_id TEXT;
CREATE INDEX IF NOT EXISTS idx_gravacoes_followup ON consultor_gravacoes(followup_id);
