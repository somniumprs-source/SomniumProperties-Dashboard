-- 0059_drop_colunas_cedencia_mortas.sql — remover colunas mortas do modelo
-- antigo de cedência de posição (Wholesaling), substituído pelo fee_cedencia
-- (ver 0019_fee_cedencia.sql). Confirmado sem uso em nenhum cálculo/tela;
-- achado da auditoria transversal — decisão do utilizador de apagar (volume
-- residual: 1 imóvel e 3 negócios com valor antigo preenchido).

ALTER TABLE imoveis  DROP COLUMN IF EXISTS valor_com_cedencia;
ALTER TABLE negocios DROP COLUMN IF EXISTS valor_cedencia_posicao;
