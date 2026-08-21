-- Impede entradas duplicadas em mercado_referencia (achado da auditoria:
-- sem esta verificação, actualizar dados de mercado todos os meses sem
-- reparar que já existe uma entrada cria uma linha nova em vez de
-- actualizar a existente, e os cálculos que leem esta tabela ficam
-- enviesados por duplicados).
ALTER TABLE mercado_referencia
  ADD CONSTRAINT mercado_referencia_regiao_concelho_tipologia_key
  UNIQUE (regiao, concelho, tipologia);
