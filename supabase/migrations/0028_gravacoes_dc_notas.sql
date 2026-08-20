-- Justificacao por criterio do Scorecard de Qualificacao (Discovery Call,
-- SOP 2) — texto livre ao lado de cada pontuacao 0-2, mesmo padrao que a
-- tabela `scorecards` (c1_notas..c5_notas) ja usa para o perfil de investidor.
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_objetivo TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_motivo_real TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_dor_desafio TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_impacto TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_urgencia TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_tentativas_anteriores TEXT;
