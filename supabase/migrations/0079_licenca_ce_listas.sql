-- 0079_licenca_ce_listas.sql — licença de utilização e certificado energético
-- com listas fechadas (auditoria D7).
--
-- Antes eram texto livre («Sim», «Isento», «Isenta», «A obter», «239 e 240
-- emitido a 17/05/1963»…). Passam a ser um estado da lista (tabela lookups); o
-- número e a data da licença ficam em licenca_utilizacao_detalhe e o número do
-- CE continua em numero_ce. «Tem» (LU) e uma classe (CE) pedem o documento
-- carregado para o imóvel entrar num modelo de fecho (src/db/dealBreakers.js).

ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS licenca_utilizacao_detalhe TEXT;

-- Licença de utilização
INSERT INTO lookups (categoria, valor, ordem, ativo)
SELECT 'licenca_utilizacao', v.valor, v.ordem, true
  FROM (VALUES ('Tem', 1), ('Isenta (anterior a 1951)', 2), ('Em obtenção', 3), ('Não tem', 4)) AS v(valor, ordem)
 WHERE NOT EXISTS (SELECT 1 FROM lookups l WHERE l.categoria = 'licenca_utilizacao' AND l.valor = v.valor);

UPDATE imoveis SET licenca_utilizacao_detalhe = licenca_utilizacao, licenca_utilizacao = 'Tem'
 WHERE licenca_utilizacao ~ '\d' AND licenca_utilizacao_detalhe IS NULL;
UPDATE imoveis SET licenca_utilizacao = 'Tem' WHERE licenca_utilizacao IN ('Sim', 'Tem LU');
UPDATE imoveis SET licenca_utilizacao = 'Isenta (anterior a 1951)' WHERE licenca_utilizacao IN ('Isenta', 'Isento');
UPDATE imoveis SET licenca_utilizacao = 'Não tem' WHERE licenca_utilizacao IN ('Sem LU', 'Não', 'Nao tem');
UPDATE imoveis SET licenca_utilizacao = 'Em obtenção' WHERE licenca_utilizacao IN ('A obter', 'Em emissão');

-- Certificado energético: classes A+ a F, Isento, Em obtenção, Não tem
UPDATE lookups SET ativo = false WHERE categoria = 'certificado_energetico' AND valor IN ('A obter', 'Em emissão');
INSERT INTO lookups (categoria, valor, ordem, ativo)
SELECT 'certificado_energetico', v.valor, v.ordem, true
  FROM (VALUES ('Isento', 9), ('Em obtenção', 10)) AS v(valor, ordem)
 WHERE NOT EXISTS (SELECT 1 FROM lookups l WHERE l.categoria = 'certificado_energetico' AND l.valor = v.valor);
UPDATE lookups SET ordem = 11 WHERE categoria = 'certificado_energetico' AND valor = 'Não tem';

UPDATE imoveis SET certificado_energetico = 'Em obtenção' WHERE certificado_energetico IN ('A obter', 'Em emissão');
