-- Registo e classificação de consultores (spec v1, 3/11/2026, decisões do João).
-- Esquema também garantido em runtime (ensureClassificacaoTables), porque as
-- migrações não são auto-aplicadas em produção.
--
-- Decisões aplicadas aos dados:
--  * Estatuto passa a Cold Call → Discovery Call → Follow Up → Parceria; entra
--    em Parceria quem enviou alguma oportunidade (imóvel com consultor_id).
--  * As classes A–D escritas pela automação score-prioridade-consultores são
--    limpas: cada consultor é classificado nos próximos contactos.
--  * Estado Avaliação passa a "Estado da relação": Em avaliação → Acompanhamento pontual.
--  * Validação nova: Por validar / Em teste / Validado.
-- Cópia dos valores anteriores: ~/Backups/Somnium/consultores_antes_classificacao_*.csv

ALTER TABLE consultores ADD COLUMN IF NOT EXISTS validacao TEXT DEFAULT 'Por validar';
ALTER TABLE consultores ADD COLUMN IF NOT EXISTS associado_responsavel TEXT;
ALTER TABLE consultores ADD COLUMN IF NOT EXISTS pontuacao REAL;
ALTER TABLE consultores ADD COLUMN IF NOT EXISTS cobertura REAL;
ALTER TABLE consultores ALTER COLUMN estado_avaliacao SET DEFAULT 'Acompanhamento pontual';

ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS etapa_consultor TEXT;       -- cold_call | discovery | acompanhamento
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS realizada_por TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS consentimento_modo TEXT;    -- verbal_gravado | escrito
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS consentimento_em TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS segmentos JSONB;            -- [{ ini, fim, texto }] em segundos
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS analise_consultor JSONB;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS estado_consultor TEXT;      -- a_analisar | analisado | erro
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS erro_consultor TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS audio_apagado_em TEXT;

ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS qualificada BOOLEAN;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS qualificacao_motivo TEXT;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS qualificacao_manual BOOLEAN DEFAULT false;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS causa_perda TEXT;                     -- consultor | somnium | investidor | proprietario | mercado | terceiros

ALTER TABLE classificacao_historico ADD COLUMN IF NOT EXISTS consultor_id TEXT;
ALTER TABLE classificacao_historico ADD COLUMN IF NOT EXISTS autor TEXT;
ALTER TABLE classificacao_historico ALTER COLUMN investidor_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_hist_consultor ON classificacao_historico(consultor_id);

CREATE TABLE IF NOT EXISTS parametros_classificacao (
  id TEXT PRIMARY KEY,
  entidade_tipo TEXT NOT NULL DEFAULT 'consultor',
  versao INTEGER NOT NULL,
  valores JSONB NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_por TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT)
);

-- Genéricas (entidade_tipo): os investidores passam a usar as mesmas numa entrega seguinte.
CREATE TABLE IF NOT EXISTS avaliacoes (
  id TEXT PRIMARY KEY,
  entidade_tipo TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  gravacao_id TEXT,
  motivo TEXT,                 -- discovery | acompanhamento | trimestral
  notas_ia JSONB,
  notas_finais JSONB,
  pontuacao REAL,
  cobertura REAL,
  classe_calculada TEXT,
  bloqueios JSONB,
  versao_parametros INTEGER,
  versao_prompts TEXT,
  modelo TEXT,
  estado TEXT NOT NULL DEFAULT 'proposta',   -- proposta | validada | descartada
  validacao TEXT,
  validado_por TEXT,
  validado_em TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_entidade ON avaliacoes(entidade_tipo, entidade_id);

CREATE TABLE IF NOT EXISTS evidencias (
  id TEXT PRIMARY KEY,
  entidade_tipo TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  avaliacao_id TEXT,
  gravacao_id TEXT,
  imovel_id TEXT,
  criterio TEXT NOT NULL,      -- C1..C5
  citacao TEXT NOT NULL,
  inicio_seg REAL,
  fim_seg REAL,
  tipo TEXT NOT NULL,          -- declaracao | exemplo | observada
  confianca TEXT,
  origem TEXT NOT NULL DEFAULT 'gravacao',   -- gravacao | manual | plataforma
  estado TEXT NOT NULL DEFAULT 'proposta',   -- proposta | aceite | rejeitada
  created_by TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_evidencias_entidade ON evidencias(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_avaliacao ON evidencias(avaliacao_id);

CREATE TABLE IF NOT EXISTS compromissos (
  id TEXT PRIMARY KEY,
  entidade_tipo TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  gravacao_id TEXT,
  quem TEXT NOT NULL,          -- consultor | somnium
  descricao TEXT NOT NULL,
  data_limite TEXT,
  estado TEXT NOT NULL DEFAULT 'pendente',   -- pendente | cumprido | falhado
  causa TEXT,
  tarefa_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_compromissos_entidade ON compromissos(entidade_tipo, entidade_id);

-- Entra em Parceria quem envia uma oportunidade: um só sítio (trigger), seja
-- qual for o caminho que liga o imóvel ao consultor. AFTER sobre a linha
-- final: o consultor_id é muitas vezes posto pelo trigger imoveis_ligar_consultor
-- (a partir de nome_consultor), por isso não se filtra por "UPDATE OF consultor_id".
CREATE OR REPLACE FUNCTION consultor_entra_em_parceria() RETURNS trigger AS $$
BEGIN
  IF NEW.consultor_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.consultor_id IS DISTINCT FROM NEW.consultor_id) THEN
    UPDATE consultores SET estatuto = 'Parceria', updated_at = NOW()::TEXT
     WHERE id = NEW.consultor_id AND estatuto IS DISTINCT FROM 'Parceria';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consultor_parceria ON imoveis;
CREATE TRIGGER trg_consultor_parceria AFTER INSERT OR UPDATE ON imoveis
  FOR EACH ROW WHEN (NEW.consultor_id IS NOT NULL) EXECUTE FUNCTION consultor_entra_em_parceria();

-- Dados
UPDATE consultores SET estatuto = 'Discovery Call' WHERE estatuto = 'Aberto Parcerias';
UPDATE consultores SET estatuto = 'Follow Up' WHERE estatuto IN ('Follow up', 'Acesso imoveis Off market', 'Consultores em Parceria');
UPDATE consultores c SET estatuto = 'Parceria'
 WHERE EXISTS (SELECT 1 FROM imoveis i WHERE i.consultor_id = c.id);
UPDATE consultores SET classificacao = NULL, validacao = 'Por validar', pontuacao = NULL, cobertura = NULL;
UPDATE consultores SET estado_avaliacao = 'Acompanhamento pontual' WHERE estado_avaliacao = 'Em avaliação' OR estado_avaliacao IS NULL;
