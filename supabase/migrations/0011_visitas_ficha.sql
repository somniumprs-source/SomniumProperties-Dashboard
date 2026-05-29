-- 0011_visitas_ficha.sql — coluna para a ficha de visita preenchivel.
--
-- Porque: a aba Visitas passa a permitir preencher a ficha de visita (checklists
-- B/R/M por elemento, medicoes, estimativa de obra e relatorio com decisao) e
-- guardar tudo associado a cada visita. As respostas vivem num JSONB unico.
--
-- O deploy so publica Edge Functions (nao aplica migracoes); a Edge Function
-- garante a coluna em runtime via crud.ensureColumn no PUT /visitas. Esta
-- migracao mantem o schema correcto num rebuild limpo da BD e em dev.

ALTER TABLE visitas ADD COLUMN IF NOT EXISTS ficha JSONB;
