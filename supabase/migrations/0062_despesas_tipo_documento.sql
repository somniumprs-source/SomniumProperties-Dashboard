-- Aba "Faturas e Comprovativos" do Projecto: tipo do documento que suporta
-- cada custo. Nem todo o custo tem factura — o preço de compra do imóvel, o
-- IMT e o Imposto do Selo só têm comprovativo de pagamento (transferência incluída) — e
-- têm de contar igualmente no Estimado vs Real.
--   fatura | comprovativo_pagamento
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'fatura';
