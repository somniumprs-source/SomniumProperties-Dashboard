-- Vistoria semanal do empreiteiro (Template A do documento de optimização do
-- SOP 13) — único input de campo do fluxo semanal. Alimenta o Relatório
-- Semanal de Obra (Template B), gerado a partir daqui + despesas + fotos.
-- Nota: aplicada também via CREATE TABLE IF NOT EXISTS em runtime (dev e
-- produção), porque as migrações não são auto-aplicadas em produção.
CREATE TABLE IF NOT EXISTS vistorias_obra (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  semana_data DATE NOT NULL,
  rubricas JSONB NOT NULL DEFAULT '[]',
  desvio_dias INTEGER,
  desvio_causa TEXT,
  desvio_accao TEXT,
  incidentes TEXT,
  proximos_passos TEXT,
  criado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vistorias_obra_negocio ON vistorias_obra(negocio_id, semana_data DESC);
