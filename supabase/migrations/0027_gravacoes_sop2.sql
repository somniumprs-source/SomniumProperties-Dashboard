-- SOP 2 (Cold Call, Discovery Call, Close Call, Pivot para Parceria): cada
-- gravacao/registo de chamada passa a indicar um tipo e a guardar os campos
-- manuais estruturados desse tipo. O campo manual e SEMPRE a fonte de verdade
-- (SOP 2, Seccao 7) — a IA so pode escrever sugestoes dentro de `analise`
-- (JSONB), nunca nestas colunas. Historico pre-SOP2 fica com tipo_chamada NULL.
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS tipo_chamada TEXT;
  -- 'cold_call' | 'discovery_call' | 'close_call' | 'pivot_parceria' | NULL

-- Auditoria de quem/quando confirmou o registo manual.
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS registo_fonte TEXT DEFAULT 'manual';
  -- 'manual' | 'ia_sugestao_confirmada'
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS registo_confirmado_em TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS registo_confirmado_por TEXT;

-- Cold Call
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cc_resultado TEXT;
  -- 'atendeu' | 'nao_atendeu' | 'recusou' | 'numero_errado'
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cc_aceita_negociar TEXT;
  -- 'sim' | 'nao' | 'nao_perguntado'

-- Discovery Call — scorecard de qualificacao 0-12 (6 criterios x 0-2)
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_objetivo SMALLINT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_motivo_real SMALLINT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_dor_desafio SMALLINT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_impacto SMALLINT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_urgencia SMALLINT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_tentativas_anteriores SMALLINT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_pontuacao_total SMALLINT; -- soma, calculada sempre no backend
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_onus_verificado BOOLEAN;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_direito_preferencia_esclarecido BOOLEAN;

-- Close Call
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_resultado TEXT;
  -- 'aceite' | 'recusa_definitiva' | 'vou_pensar_com_data' | 'vou_pensar_sem_data'
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_valor_ancora NUMERIC;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_valor_contraproposta NUMERIC;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_deadline TEXT; -- data ISO, so quando 'vou_pensar_com_data'
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_formalizado_escrito_mesmo_dia BOOLEAN;

-- Pivot para Parceria
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS pp_compromisso_confirmado BOOLEAN;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS pp_criterios_pesquisa_enviados BOOLEAN;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS pp_negocios_fechados INTEGER;

CREATE INDEX IF NOT EXISTS idx_gravacoes_tipo_chamada ON consultor_gravacoes(tipo_chamada);
CREATE INDEX IF NOT EXISTS idx_gravacoes_data_chamada ON consultor_gravacoes(data_chamada);
