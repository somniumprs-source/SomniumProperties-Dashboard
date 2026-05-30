-- 0012_negocios_valor_cedencia.sql — coluna para o valor da cedência de posição.
--
-- Porque: nos negócios de wholesaling, o lucro esperado é cedência − valor de
-- compra do imóvel. O valor da cedência é introduzido pelo utilizador na secção
-- "Valores" da ficha do imóvel e fica guardado no próprio negócio para permitir
-- somar lucro_estimado nos KPIs do portfolio (sem joins extra).
--
-- A coluna fica nullable: negócios não-wholesaling não a usam, e fica vazia
-- enquanto o utilizador não preencher.

ALTER TABLE negocios ADD COLUMN IF NOT EXISTS valor_cedencia_posicao REAL;
