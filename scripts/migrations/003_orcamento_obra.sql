-- ============================================================
-- Migration 003 — Orçamento de Obra
--   Tabela 1-para-1 com imoveis para o gestor de obra preencher
--   o orçamento estruturado (replica fluxo Word actual).
-- ============================================================

CREATE TABLE IF NOT EXISTS orcamentos_obra (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id     text NOT NULL UNIQUE REFERENCES imoveis(id) ON DELETE CASCADE,
  pisos         jsonb DEFAULT '[]'::jsonb,
  seccoes       jsonb DEFAULT '{}'::jsonb,
  notas         text,
  iva_perc      real DEFAULT 23,
  total_obra            real DEFAULT 0,
  total_licenciamento   real DEFAULT 0,
  total_geral           real DEFAULT 0,
  criado_por    text,
  created_at    timestamptz DEFAULT NOW(),
  updated_at    timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_obra_imovel ON orcamentos_obra(imovel_id);
