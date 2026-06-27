-- Gravacoes de chamadas com consultores: upload de audio, transcricao (Whisper
-- local via worker launchd) e analise comercial por IA (Claude) para optimizar
-- os scripts comerciais. O audio vive no bucket privado "Gravacoes" do Supabase
-- Storage; aqui guardamos so o metadata + transcricao + analise.
CREATE TABLE IF NOT EXISTS consultor_gravacoes (
  id TEXT PRIMARY KEY,
  consultor_id TEXT NOT NULL,
  titulo TEXT,
  data_chamada TEXT,
  ficheiro_path TEXT,            -- path no bucket Storage: <consultor_id>/<id>.<ext>
  ficheiro_nome TEXT,            -- nome original do ficheiro carregado
  duracao_seg INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendente', -- pendente|a_transcrever|transcrito|a_analisar|analisado|erro
  erro TEXT,                     -- ultima mensagem de erro (transcricao/analise)
  transcricao TEXT,
  analise JSONB,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_gravacoes_consultor ON consultor_gravacoes(consultor_id);
CREATE INDEX IF NOT EXISTS idx_gravacoes_estado ON consultor_gravacoes(estado);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'consultor_gravacoes'::regclass
      AND conname = 'consultor_gravacoes_consultor_id_fkey'
  ) THEN
    ALTER TABLE consultor_gravacoes
      ADD CONSTRAINT consultor_gravacoes_consultor_id_fkey
      FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE CASCADE NOT VALID;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
