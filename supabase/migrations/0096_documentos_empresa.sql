-- Documentação da empresa (Administração › Documentos): RCBE, certidão
-- permanente, certidões de não dívida, seguros, licenças… Cada linha pode
-- existir sem ficheiro (anexado mais tarde). Ficheiro no bucket privado
-- "Empresa" + espelho no Drive em "Documentação Empresa/<categoria>".
-- Esquema também garantido em runtime (ensureDocumentosEmpresa), porque as
-- migrações não são auto-aplicadas em produção.

CREATE TABLE IF NOT EXISTS documentos_empresa (
  id TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL,
  entidade TEXT,
  codigo_acesso TEXT,
  data_emissao TEXT,
  data_validade TEXT,
  notas TEXT,
  ficheiro_nome TEXT,
  ficheiro_path TEXT,
  mime TEXT,
  tamanho INTEGER,
  drive_file_id TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_docs_empresa_categoria ON documentos_empresa(categoria);
CREATE INDEX IF NOT EXISTS idx_docs_empresa_validade ON documentos_empresa(data_validade);
