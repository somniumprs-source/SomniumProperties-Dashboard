-- Adiciona bucket JSONB para dados legais de empresa (firma, NIPC, NISS,
-- capital social, sede, IBAN, socios/representantes legais) na ficha do
-- investidor, para investidores que sejam pessoas colectivas.
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS dados_empresa JSONB;
