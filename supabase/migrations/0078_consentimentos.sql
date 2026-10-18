-- 0078_consentimentos.sql — base legal do tratamento de dados pessoais (RGPD,
-- auditoria D4).
--
-- Um registo único para investidores, consultores e proprietários (os dados do
-- proprietário vivem no imóvel: entidade_id = imoveis.id). Cada linha é uma
-- base legal registada (consentimento, execução de contrato, interesse
-- legítimo), com a origem e a prova. Retirar o consentimento (ou opor-se)
-- preenche retirado_em; uma linha só de retirada tem base_legal NULL.
--
-- O investidor num projeto CAEP tem «execução de contrato» calculada a partir
-- de projeto_investidores (src/db/consentimentos.js), sem linha aqui.

CREATE TABLE IF NOT EXISTS consentimentos (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL CHECK (entidade IN ('investidor', 'consultor', 'proprietario')),
  entidade_id TEXT NOT NULL,
  base_legal TEXT CHECK (base_legal IN ('consentimento', 'contrato', 'interesse_legitimo')),
  finalidade TEXT,
  origem TEXT,
  prova TEXT,
  registado_por TEXT,
  registado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retirado_em TIMESTAMPTZ,
  retirado_por TEXT,
  motivo_retirada TEXT
);
CREATE INDEX IF NOT EXISTS idx_consentimentos_entidade ON consentimentos (entidade, entidade_id);

-- Histórico de alterações (0077), como as restantes entidades de negócio.
DROP TRIGGER IF EXISTS historico_consentimentos ON consentimentos;
CREATE TRIGGER historico_consentimentos AFTER INSERT OR UPDATE OR DELETE ON consentimentos
  FOR EACH ROW EXECUTE FUNCTION historico_alteracoes_trigger();
