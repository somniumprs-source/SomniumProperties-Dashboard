-- Reuniões de acompanhamento com investidores, por projecto (negócio).
-- Fecha o gap do SOP 13 (Onboarding de Investidores): agendamento já era
-- feito por email (Anexo 4), mas não havia registo consultável no CRM.
-- Nota: aplicada também via CREATE TABLE IF NOT EXISTS em runtime (dev e
-- produção), porque as migrações não são auto-aplicadas em produção.
CREATE TABLE IF NOT EXISTS reunioes_investidor (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  data_hora TIMESTAMPTZ NOT NULL,
  formato TEXT DEFAULT 'Online',
  estado TEXT DEFAULT 'Agendada',
  notas TEXT,
  criado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reunioes_investidor_negocio ON reunioes_investidor(negocio_id);
