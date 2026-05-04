-- ============================================================
-- Migration 004 — Orçamento de Obra v2
--   Adiciona regime fiscal e BDI (imprevistos/margem) para
--   conformidade com auditoria contabilística (CIVA, CIRS).
-- ============================================================

ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS regime_fiscal text DEFAULT 'normal';
ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS bdi jsonb DEFAULT '{}'::jsonb;
ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_iva real DEFAULT 0;
ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_iva_autoliquidado real DEFAULT 0;
ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_retencoes_irs real DEFAULT 0;
ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_a_pagar real DEFAULT 0;
