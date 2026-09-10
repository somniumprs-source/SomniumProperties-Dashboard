-- Cópia congelada (inputs + calculados) da análise financeira activa do imóvel
-- no momento em que o negócio/projecto é criado — nunca recalculada depois.
-- E cópia do orçamento de obra, só actualizada quando o utilizador pede
-- "Importar orçamento interno" em Projetos.
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS analise_snapshot JSONB;
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS orcamento_obra_snapshot JSONB;
