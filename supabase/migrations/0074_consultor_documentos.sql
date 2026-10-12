-- Documentos da ficha do consultor (apresentações de parceria, propostas…),
-- opcionalmente associados a uma tarefa da Agenda (tarefa_id) para o ficheiro
-- aparecer também ao abrir essa tarefa. Ficheiros no bucket privado
-- "Relatorios", em consultores-docs/<consultor_id>/<id>/<ficheiro>.
-- Nota: criada também em runtime (dev e produção), porque as migrações não são
-- auto-aplicadas em produção.
CREATE TABLE IF NOT EXISTS consultor_documentos (
  id TEXT PRIMARY KEY,
  consultor_id TEXT NOT NULL,
  tarefa_id TEXT,
  titulo TEXT NOT NULL,
  ficheiro_nome TEXT NOT NULL,
  ficheiro_path TEXT NOT NULL,
  mime TEXT,
  tamanho INTEGER,
  created_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_cons_docs_consultor ON consultor_documentos(consultor_id);
CREATE INDEX IF NOT EXISTS idx_cons_docs_tarefa ON consultor_documentos(tarefa_id);
