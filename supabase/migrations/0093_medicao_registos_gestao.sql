-- Entrega 2 do Dashboard, fase 2: registos de gestão (03/11/2026).
-- Só acrescenta colunas e uma tabela; nada se apaga.

-- Confirmação de capital (I02, I04, I09): quanto o investidor confirmou ter
-- disponível e quando. A validade (30 dias) vive no código, não na BD.
-- A data não começa por "capital": o CRUD converte esses campos em número.
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS capital_confirmado REAL;
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS data_capital_confirmado TEXT;

-- Bloqueios e prazos contratuais de cada projeto (O09, W04).
-- tipo 'bloqueio': algo de que o projeto está à espera (ex.: certidão ARU).
-- tipo 'prazo': data contratual a cumprir (CPCV, cedência, condição).
CREATE TABLE IF NOT EXISTS projeto_bloqueios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('bloqueio', 'prazo')),
  descricao TEXT NOT NULL,
  depende_de TEXT,
  aberto_em TEXT NOT NULL DEFAULT to_char(current_date, 'YYYY-MM-DD'),
  data_limite TEXT,
  resolvido_em TEXT,
  autor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tipo <> 'prazo' OR data_limite IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS projeto_bloqueios_negocio ON projeto_bloqueios (negocio_id);
-- Fechada à API pública desde a criação, como as restantes (0086).
ALTER TABLE public.projeto_bloqueios ENABLE ROW LEVEL SECURITY;
