-- Preparação de chamada por investidor (SOP 23 v2.1): botão "Preparar chamada"
-- no painel do investidor. Documento gerado pelo Claude no Mac (fila IA) a
-- partir do prompt supabase/functions/crm/prompts/preparacao_chamada_v1.md.
-- Independente de preparacao_calls (preparação por tarefa da Agenda).
--
-- RLS ligada sem políticas, como investidor_interacoes e preparacao_calls:
-- o servidor liga-se como postgres (BYPASSRLS); anon/authenticated não veem nada.
--
-- Criada também em runtime (ensurePreparacoesChamada), porque as migrações não
-- são auto-aplicadas em produção.
--
-- REVERTER:
--   DROP TABLE IF EXISTS preparacoes_chamada;

CREATE TABLE IF NOT EXISTS preparacoes_chamada (
  id TEXT PRIMARY KEY,
  investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
  tipo_chamada TEXT NOT NULL CHECK (tipo_chamada IN ('qualificacao', 'discovery', 'recontacto', 'fora_sop23')),
  conteudo TEXT,
  alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gerado_por TEXT,
  versao_prompt TEXT
);
CREATE INDEX IF NOT EXISTS idx_preparacoes_chamada_inv ON preparacoes_chamada(investidor_id, gerado_em DESC);
ALTER TABLE public.preparacoes_chamada ENABLE ROW LEVEL SECURITY;
