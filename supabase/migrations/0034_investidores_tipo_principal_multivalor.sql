-- Investidor Activo e Passivo em simultâneo (ver B3+B4 da auditoria): deixa
-- de fazer sentido duplicar a ficha do investidor para ele aparecer nas duas
-- listas — tipo_principal passa a ser multi-valor, guardado como JSON array
-- de texto (ex: '["Ativo"]', '["Passivo"]', '["Ativo","Passivo"]'), seguindo
-- o mesmo padrão já usado em regioes_preferidas (LIKE-based "contains").
-- A coluna mantém o nome e o tipo (TEXT) — só o formato do valor muda.
--
-- Conversão de dados: qualquer valor antigo em formato bare-string
-- ('Ativo'/'Passivo', não um array JSON) é convertido para o array
-- equivalente de um único elemento. Idempotente — não faz nada se já
-- estiver no formato novo.
UPDATE investidores
SET tipo_principal = CASE
    WHEN tipo_principal IS NULL OR tipo_principal = '' THEN '["Passivo"]'
    ELSE json_build_array(tipo_principal)::text
  END
WHERE tipo_principal IS NULL OR tipo_principal !~ '^\s*\[';

-- Duplicar investidor (endpoint /investidores/:id/duplicar) foi removido —
-- fundir manualmente, antes desta migração, os pares já duplicados
-- (ligados por duplicado_de) num único registo com tipo_principal
-- multi-valor, preservando o registo mais antigo.
