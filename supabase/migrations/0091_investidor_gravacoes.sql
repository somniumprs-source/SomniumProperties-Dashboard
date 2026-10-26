-- Chamadas gravadas com investidores (Cold Call e Follow-up), avaliadas contra o
-- SOP 4. Audio no bucket privado "Gravacoes" (investidores/<investidor_id>/...),
-- transcricao pelo worker Whisper local, analise pelo Claude em `analise` e
-- nota_sop (0-100). Resultado, proximo_passo, temperatura e data_follow_up sao
-- o registo manual (fonte de verdade); a IA so sugere dentro de `analise`.
-- Nota: criada tambem em runtime (ensureInvestidorGravacoesTable), porque as
-- migracoes nao sao auto-aplicadas em producao.
CREATE TABLE IF NOT EXISTS investidor_gravacoes (
  id TEXT PRIMARY KEY,
  investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
  tipo_chamada TEXT NOT NULL DEFAULT 'cold_call', -- 'cold_call' | 'follow_up'
  titulo TEXT,
  data_chamada TEXT,
  realizada_por TEXT,
  ficheiro_path TEXT,
  ficheiro_nome TEXT,
  duracao_seg INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendente', -- pendente|a_transcrever|transcrito|a_analisar|analisado|erro
  erro TEXT,
  transcricao TEXT,
  analise JSONB,
  nota_sop SMALLINT,
  resultado TEXT,       -- 'atendeu' | 'nao_atendeu' | 'recusou' | 'numero_errado'
  proximo_passo TEXT,   -- 'entrevista_marcada' | 'follow_up_agendado' | 'enviar_forms' | 'sem_interesse' | 'nao_elegivel'
  temperatura TEXT,     -- 'quente' | 'intermedio' | 'frio'
  data_follow_up TEXT,
  notas TEXT,
  registo_fonte TEXT,   -- 'manual' | 'ia_sugestao_confirmada'
  registo_confirmado_em TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_investidor ON investidor_gravacoes(investidor_id);
CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_estado ON investidor_gravacoes(estado);
CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_data ON investidor_gravacoes(data_chamada);
