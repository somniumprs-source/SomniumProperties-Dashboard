-- Reunioes com documentos (PDF/PPTX) carregados manualmente pela equipa.
-- Ficheiros vivem no bucket privado "Relatorios" do Storage em <pasta>/<ficheiro>.
CREATE TABLE IF NOT EXISTS reunioes_documentos (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  data TEXT,                          -- ISO date da reuniao
  semana_iso TEXT,                    -- derivada da data (etiqueta/agrupamento)
  notas TEXT,
  pasta TEXT NOT NULL,                -- prefixo no Storage (ex: 'reunioes/<id>' ou '2026-W23' legado)
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_reunioes_documentos_data ON reunioes_documentos(data DESC);
