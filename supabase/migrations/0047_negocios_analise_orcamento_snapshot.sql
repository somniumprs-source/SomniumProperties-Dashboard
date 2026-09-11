-- Cópia estática do orçamento de obra (orcamentos_obra) — o do Comercial é
-- meramente ilustrativo; esta cópia, importada a pedido em Projetos
-- ("Importar orçamento interno"), é que conta como o orçamento real do
-- projecto. A análise financeira não tem cópia: é lida ao vivo da análise
-- activa do imóvel (GET /projetos/:id/resumo), contínua ao longo da
-- evolução do imóvel de lead a projecto.
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS orcamento_obra_snapshot JSONB;
