-- Parceiros: prestadores de serviços aos projetos (advogado, solicitadora,
-- contabilista, arquiteto, engenheiro, fotógrafo, home staging, seguradora…).
-- Aba própria no CRM, com o mesmo bloco "Próximos passos" de consultores e
-- investidores (Cold Call, Discovery Call, Follow-up — src/db/contactoPessoa.js).
-- Sem isolamento por região: o mesmo prestador pode servir Coimbra e AMP.
CREATE TABLE IF NOT EXISTS parceiros (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT,
  empresa TEXT,
  nif TEXT,
  contacto TEXT,
  email TEXT,
  morada TEXT,
  zona_atuacao TEXT,
  estado TEXT DEFAULT 'Por contactar',
  classificacao TEXT,
  honorarios TEXT,
  data_primeiro_contacto TEXT,
  data_proximo_contacto TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_parceiros_estado ON parceiros(estado);

CREATE TABLE IF NOT EXISTS parceiro_interacoes (
  id TEXT PRIMARY KEY,
  parceiro_id TEXT NOT NULL,
  data_hora TEXT DEFAULT (NOW()::TEXT),
  canal TEXT,
  direcao TEXT,
  notas TEXT,
  resultado TEXT,
  proxima_data TEXT,
  autor TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_parceiro_interacoes_parceiro ON parceiro_interacoes(parceiro_id);
