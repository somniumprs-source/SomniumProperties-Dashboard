-- Preenchimento automático da ficha do investidor a partir das calls e reuniões.
--
-- 1. Campos novos em investidores (o que a análise SOP 4 identificava como
--    "em falta" e não tinha onde ser guardado). Listas em JSONB para se poder
--    acrescentar entradas sem apagar as antigas.
-- 2. investidor_campos_ia: proveniência de cada valor extraído pela IA e as
--    sugestões pendentes (conflito com a ficha, confiança baixa, campo editado
--    à mão, backfill). Guarda o valor anterior para se poder reverter.
--    As escritas na ficha ficam também em historico_alteracoes com o autor
--    "IA" (trigger da migração 0077).
--
-- Criado também em runtime (ensureAutopreenchimento), porque as migrações não
-- são auto-aplicadas em produção.
--
-- REVERTER:
--   DROP TABLE IF EXISTS investidor_campos_ia;
--   ALTER TABLE investidor_gravacoes DROP COLUMN IF EXISTS extracao;
--   ALTER TABLE reunioes DROP COLUMN IF EXISTS extracao_ia;
--   ALTER TABLE investidores
--     DROP COLUMN IF EXISTS capital_disponivel_em, DROP COLUMN IF EXISTS capital_proprio_ou_financiado,
--     DROP COLUMN IF EXISTS ticket_por_operacao, DROP COLUMN IF EXISTS prazo_maximo_retencao_meses,
--     DROP COLUMN IF EXISTS roi_minimo_aceitavel, DROP COLUMN IF EXISTS tolerancia_imprevistos,
--     DROP COLUMN IF EXISTS tolerancia_imprevistos_nota, DROP COLUMN IF EXISTS grau_interferencia,
--     DROP COLUMN IF EXISTS investimentos_atuais, DROP COLUMN IF EXISTS negocios_concluidos,
--     DROP COLUMN IF EXISTS negocios_concluidos_nota, DROP COLUMN IF EXISTS motivacao,
--     DROP COLUMN IF EXISTS objecoes, DROP COLUMN IF EXISTS compromissos, DROP COLUMN IF EXISTS decisores,
--     DROP COLUMN IF EXISTS zona_residencia, DROP COLUMN IF EXISTS horario_contacto,
--     DROP COLUMN IF EXISTS contexto_relacional, DROP COLUMN IF EXISTS data_entrevista_estrategica;

ALTER TABLE investidores ADD COLUMN IF NOT EXISTS capital_disponivel_em TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS capital_proprio_ou_financiado TEXT; -- proprio | financiamento | misto | nao_sabe
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS ticket_por_operacao NUMERIC;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS prazo_maximo_retencao_meses INTEGER;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS roi_minimo_aceitavel TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS tolerancia_imprevistos TEXT;      -- baixa | media | alta
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS tolerancia_imprevistos_nota TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS grau_interferencia TEXT;          -- nenhum | acompanha | quer_decidir
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS investimentos_atuais JSONB;       -- [{ descricao, valor, data, origem }]
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS negocios_concluidos INTEGER;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS negocios_concluidos_nota TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS motivacao TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS objecoes JSONB;                   -- [{ objecao, data, resolvida, origem }]
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS compromissos JSONB;               -- [{ quem, o_que, ate_quando, cumprido, data, origem }]
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS decisores TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS zona_residencia TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS horario_contacto TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS contexto_relacional TEXT;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS data_entrevista_estrategica TEXT;

CREATE TABLE IF NOT EXISTS investidor_campos_ia (
  id TEXT PRIMARY KEY,
  investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor JSONB,
  valor_anterior JSONB,
  confianca TEXT,            -- alta | media | baixa
  evidencia TEXT,
  minuto TEXT,
  origem_tipo TEXT NOT NULL, -- gravacao | reuniao
  origem_id TEXT NOT NULL,
  origem_data TEXT,
  modo TEXT NOT NULL DEFAULT 'auto', -- auto | backfill
  estado TEXT NOT NULL,      -- aplicado | pendente | aceite | rejeitado | revertido
  motivo TEXT,               -- vazio | lista | conflito | confianca_baixa | editado_mao | backfill | classificacao
  decidido_por TEXT,
  decidido_em TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_campos_ia_investidor ON investidor_campos_ia(investidor_id, estado);
CREATE INDEX IF NOT EXISTS idx_campos_ia_origem ON investidor_campos_ia(origem_tipo, origem_id);
ALTER TABLE public.investidor_campos_ia ENABLE ROW LEVEL SECURITY;

-- JSON completo da extração (contradições, citações), para o ecrã "Rever call".
ALTER TABLE investidor_gravacoes ADD COLUMN IF NOT EXISTS extracao JSONB;
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS extracao_ia JSONB;
