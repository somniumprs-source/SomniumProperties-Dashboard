-- O default da coluna ainda era o formato antigo ('Passivo', string simples),
-- porque o ADD COLUMN IF NOT EXISTS de pg.js não altera colunas já existentes.
-- Um investidor criado sem tipo ficava com 'Passivo' e o filtro da lista
-- (LIKE '%"Passivo"%') escondia-o das abas Passivo e Ativo.
ALTER TABLE investidores ALTER COLUMN tipo_principal SET DEFAULT '["Passivo"]';

UPDATE investidores
  SET tipo_principal = CASE
      WHEN tipo_principal IS NULL OR tipo_principal = '' THEN '["Passivo"]'
      ELSE json_build_array(tipo_principal)::text
    END
  WHERE tipo_principal IS NULL OR tipo_principal !~ '^\s*\[';
