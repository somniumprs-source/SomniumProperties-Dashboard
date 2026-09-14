-- Aba "Faturas" do Projecto: estado de pagamento por despesa/factura.
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS pago BOOLEAN DEFAULT false;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS data_pagamento TEXT;
