-- Unifica os nomes dos modelos de negócio num só valor por modelo.
-- Havia duas grafias para cada um (Wholesaling/Wholesalling, Fix & Flip/
-- Fix and Flip, Mediação/Mediação Imobiliária) entre imóveis e projetos,
-- o que obrigava a remendos como src/lib/modelos.js.
-- Nomes finais: Wholesaling, Fix and Flip, Mediação Imobiliária, CAEP.
-- Idempotente: pode correr mais do que uma vez.

UPDATE negocios SET categoria = 'Wholesaling'           WHERE categoria = 'Wholesalling';

UPDATE imoveis  SET estado = 'Wholesaling'              WHERE estado = 'Wholesalling';
UPDATE imoveis  SET modelo_negocio = 'Fix and Flip'     WHERE modelo_negocio = 'Fix & Flip';
UPDATE imoveis  SET modelo_negocio = 'Mediação Imobiliária' WHERE modelo_negocio = 'Mediação';
UPDATE imoveis  SET tipo_operacao = 'Fix and Flip'      WHERE tipo_operacao = 'Fix & Flip';

UPDATE lookups  SET valor = 'Mediação Imobiliária'
 WHERE categoria = 'modelo_negocio' AND valor = 'Mediação';

-- Estratégias dos investidores: texto com array JSON (ex.: ["CAEP","Fix & Flip"]).
-- Troca com as aspas incluídas para não apanhar "Mediação Imobiliária".
UPDATE investidores SET estrategia = replace(estrategia, '"Fix & Flip"', '"Fix and Flip"')
 WHERE estrategia LIKE '%"Fix & Flip"%';
UPDATE investidores SET estrategia = replace(estrategia, '"Mediação"', '"Mediação Imobiliária"')
 WHERE estrategia LIKE '%"Mediação"%';
UPDATE investidores SET estrategia = replace(estrategia, '"Wholesalling"', '"Wholesaling"')
 WHERE estrategia LIKE '%"Wholesalling"%';

-- Itens de checklist gerados a partir do template antigo.
UPDATE checklist_imovel SET titulo = replace(titulo, 'Wholesalling', 'Wholesaling')
 WHERE titulo LIKE '%Wholesalling%';

-- Histórico (audit_log, backups, historico_alteracoes, snapshots, reuniões,
-- tarefas concluídas) fica como está: é registo do que aconteceu.
