-- Quadro Estimado vs Real (Resumo do Projecto): cada factura liga a uma rubrica
-- da Análise Financeira; 'extra' = custo fora da Análise, com motivo + justificação.
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS rubrica_analise TEXT;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS motivo_extra TEXT;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS justificacao TEXT;
