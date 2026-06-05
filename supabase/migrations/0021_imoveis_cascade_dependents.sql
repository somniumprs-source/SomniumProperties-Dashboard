-- 0021_imoveis_cascade_dependents.sql — apagar imóvel limpa análises e checklists.
--
-- Porque: as FKs analises.imovel_id e checklist_imovel.imovel_id estavam com
-- ON DELETE NO ACTION (RESTRICT). Qualquer imóvel que tivesse passado por uma
-- análise ou tivesse checklist gerada (todos os de Wholesaling/CAEP/Fix and Flip)
-- não podia ser apagado: o DELETE FROM imoveis rebentava com
-- "violates foreign key constraint analises_imovel_id_fkey". O frontend mostrava
-- "apagado" na mesma e o imóvel reaparecia na recarga.
--
-- Passa as duas FKs para ON DELETE CASCADE (alinhado com documentos_imovel,
-- orcamentos_obra e visitas, que já cascateiam). negocios/consultor_interacoes/
-- documentos_investidor mantêm ON DELETE SET NULL (histórico financeiro preservado).

-- Limpar linhas órfãs deixadas pela constraint NOT VALID anterior (análises e
-- checklists a apontar para imóveis já inexistentes). São invisíveis na app e
-- impediriam a validação da nova constraint.
DELETE FROM analises a WHERE NOT EXISTS (SELECT 1 FROM imoveis i WHERE i.id = a.imovel_id);
DELETE FROM checklist_imovel c WHERE NOT EXISTS (SELECT 1 FROM imoveis i WHERE i.id = c.imovel_id);

ALTER TABLE analises DROP CONSTRAINT IF EXISTS analises_imovel_id_fkey;
ALTER TABLE analises ADD CONSTRAINT analises_imovel_id_fkey
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE;

ALTER TABLE checklist_imovel DROP CONSTRAINT IF EXISTS checklist_imovel_imovel_id_fkey;
ALTER TABLE checklist_imovel ADD CONSTRAINT checklist_imovel_imovel_id_fkey
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE;
