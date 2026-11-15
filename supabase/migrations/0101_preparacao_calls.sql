-- Preparação automática das calls com investidores (SOP 4).
--
-- Cada tarefa de call com investidor (origem_tipo = 'investidor', categorias
-- "Cold Call / Follow-up / Discovery Call a Investidores") tem um documento de
-- preparação: dados do CRM montados pelo código (secoes_base) e o texto gerado
-- pelo Claude no Mac (fila IA, plano Claude, sem API paga) em conteudo_json.
--
-- O tipo de call (cold_call | follow_up) é calculado a partir do histórico;
-- tipo_origem = 'manual' quando alguém o corrigiu à mão (nunca é recalculado).
-- reunioes.resumo_ia guarda o resumo estruturado das transcrições, para não
-- voltar a resumir a mesma reunião.
--
-- Criada também em runtime (ensurePreparacaoTables), porque as migrações não
-- são auto-aplicadas em produção.
--
-- REVERTER:
--   DROP TABLE IF EXISTS preparacao_calls;
--   ALTER TABLE reunioes DROP COLUMN IF EXISTS resumo_ia, DROP COLUMN IF EXISTS resumo_ia_em;
--   SELECT cron.unschedule('cron-preparacao-calls');

CREATE TABLE IF NOT EXISTS preparacao_calls (
  id TEXT PRIMARY KEY,
  tarefa_id TEXT NOT NULL UNIQUE,
  investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
  tipo_agendado TEXT,          -- cold_call | follow_up | discovery_call (categoria quando foi agendada)
  tipo_calculado TEXT,         -- cold_call | follow_up | a_confirmar
  tipo_final TEXT,             -- cold_call | follow_up | discovery_call
  tipo_origem TEXT NOT NULL DEFAULT 'calculado', -- calculado | manual
  lead_quente BOOLEAN NOT NULL DEFAULT false,
  motivo_classificacao TEXT,
  tipo_corrigido_em TEXT,      -- quando o sistema mudou o tipo da tarefa (aviso na UI)
  secoes_base JSONB,
  conteudo_json JSONB,
  conteudo_md TEXT,
  fontes_usadas JSONB,
  fontes_hash TEXT,
  hash_gerado TEXT,
  modelo TEXT,
  estado TEXT NOT NULL DEFAULT 'pendente', -- pendente | aguarda_resumos | a_gerar | gerado | desatualizado | erro
  erro TEXT,
  gerado_em TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_preparacao_calls_investidor ON preparacao_calls(investidor_id);
CREATE INDEX IF NOT EXISTS idx_preparacao_calls_estado ON preparacao_calls(estado);
ALTER TABLE public.preparacao_calls ENABLE ROW LEVEL SECURITY;

ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS resumo_ia JSONB;
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS resumo_ia_em TEXT;

-- Cron horário (a Edge Function decide o que fazer). Copia os headers do job
-- cron-followup para não escrever a chave interna neste ficheiro.
SELECT cron.unschedule('cron-preparacao-calls') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-preparacao-calls');
SELECT cron.schedule('cron-preparacao-calls', '20 * * * *', replace(command, '/cron-followup', '/cron-preparacao-calls'))
FROM cron.job WHERE jobname = 'cron-followup';
