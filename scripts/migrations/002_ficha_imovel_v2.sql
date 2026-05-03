-- ============================================================
-- Migration 002 — Ficha do Imóvel v2
--   • Adiciona campo `tese_investimento` (parágrafo executivo)
--   • Reduz lookup `tipo_oportunidade` a Off-Market / Market
-- ============================================================

ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tese_investimento text;

-- Desactivar valores legados de tipo_oportunidade fora do par
UPDATE lookups SET ativo = false
 WHERE categoria = 'tipo_oportunidade'
   AND valor NOT IN ('Off-Market', 'Market');

-- Garantir que os 2 valores actuais existem e estão ordenados
INSERT INTO lookups (categoria, valor, ordem) VALUES
  ('tipo_oportunidade', 'Off-Market', 1),
  ('tipo_oportunidade', 'Market', 2)
ON CONFLICT (categoria, valor) DO UPDATE SET ordem = EXCLUDED.ordem, ativo = true;
