-- Análise Financeira guardada como final no projeto: cópia congelada dos
-- valores (análise + cálculos) no momento em que se guarda. O Estimado do
-- projeto passa a usar esta cópia, e deixa de mexer quando a Análise do
-- imóvel é editada depois. Guardar de novo substitui a cópia.
--   { analise_id, versao, guardada_em, guardada_por, snapshot: {...} }
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS analise_final JSONB;
