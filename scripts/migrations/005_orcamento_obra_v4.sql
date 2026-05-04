-- ============================================================
-- Migration 005 — Orçamento de Obra v4
--   Substitui regime_fiscal (4 opções) por dois flags simples:
--     - zona_aru BOOLEAN
--     - tipo_obra TEXT ('remodelacao' | 'construcao_nova')
--   regime_fiscal mantido por retrocompatibilidade.
-- ============================================================

ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS zona_aru boolean DEFAULT false;
ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS tipo_obra text DEFAULT 'remodelacao';

-- Migrar valores existentes do regime antigo para os flags novos.
-- aru/habitacao → zona_aru=true; tudo → tipo_obra='remodelacao' (default seguro)
UPDATE orcamentos_obra SET zona_aru = true
  WHERE regime_fiscal IN ('aru', 'habitacao') AND zona_aru = false;
