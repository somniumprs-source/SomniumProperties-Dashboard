-- 0019_fee_cedencia.sql — fee de cedência do Wholesaling.
--
-- Porque: no Wholesaling a Somnium cede a posição contratual e o seu resultado
-- é um FEE de cedência (valor variável por negócio), não 10% de um F&F nem a
-- diferença "valor com cedência − proposta". Este fee:
--   1) entra na compra apresentada ao investidor (compra = valor_proposta + fee),
--      alimentando IMT/selo/capital/ROI da Análise Financeira (caso do investidor);
--   2) é o lucro expectável da cedência que vai para Projetos
--      (negocios.lucro_estimado).
--
-- Consolida e substitui os modelos contraditórios anteriores baseados em
-- imoveis.valor_com_cedencia e negocios.valor_cedencia_posicao (mantidos por
-- compatibilidade, mas já não alimentam cálculo).
--
-- Nullable: só os imóveis/análises de Wholesaling o preenchem.

ALTER TABLE imoveis  ADD COLUMN IF NOT EXISTS fee_cedencia REAL;
ALTER TABLE analises ADD COLUMN IF NOT EXISTS fee_cedencia REAL;
