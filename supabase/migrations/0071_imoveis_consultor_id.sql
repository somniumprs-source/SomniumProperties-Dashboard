-- Ligação imóvel → consultor por id. Até aqui era só o nome escrito
-- (imoveis.nome_consultor), comparado em minúsculas em cada contagem: com dois
-- consultores do mesmo nome o imóvel contava para os dois, e mudar o nome do
-- consultor partia a ligação.
--
-- consultor_id passa a ser a ligação; nome_consultor continua a ser o que a
-- ficha grava e o que relatórios e exportações leem, mantido em sincronia aqui
-- na BD (um só sítio, vale para qualquer rota que escreva em imoveis).
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS consultor_id TEXT REFERENCES consultores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_imoveis_consultor_id ON imoveis (consultor_id);

-- Ao gravar o nome do consultor no imóvel, resolve o id. Nome que bate com
-- mais do que um consultor (ou com nenhum) fica sem ligação, em vez de ligar
-- ao errado. Um consultor_id que já corresponde ao nome mantém-se.
CREATE OR REPLACE FUNCTION imoveis_ligar_consultor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ids TEXT[];
BEGIN
  IF NEW.nome_consultor IS NULL OR btrim(NEW.nome_consultor) = '' THEN
    NEW.consultor_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.consultor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM consultores c
    WHERE c.id = NEW.consultor_id AND lower(btrim(c.nome)) = lower(btrim(NEW.nome_consultor))
  ) THEN
    RETURN NEW;
  END IF;
  SELECT array_agg(id) INTO v_ids FROM consultores WHERE lower(btrim(nome)) = lower(btrim(NEW.nome_consultor));
  NEW.consultor_id := CASE WHEN array_length(v_ids, 1) = 1 THEN v_ids[1] ELSE NULL END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS imoveis_ligar_consultor ON imoveis;
CREATE TRIGGER imoveis_ligar_consultor
  BEFORE INSERT OR UPDATE OF nome_consultor, consultor_id ON imoveis
  FOR EACH ROW EXECUTE FUNCTION imoveis_ligar_consultor();

-- Consultor criado ou com o nome alterado: os imóveis já ligados acompanham o
-- nome novo, e os que estavam à espera de um consultor com esse nome ligam-se
-- (só se o nome for único).
CREATE OR REPLACE FUNCTION consultores_propagar_nome() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE imoveis SET nome_consultor = NEW.nome
    WHERE consultor_id = NEW.id AND nome_consultor IS DISTINCT FROM NEW.nome;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM consultores c WHERE c.id <> NEW.id AND lower(btrim(c.nome)) = lower(btrim(NEW.nome))
  ) THEN
    UPDATE imoveis SET consultor_id = NEW.id
    WHERE consultor_id IS NULL AND lower(btrim(nome_consultor)) = lower(btrim(NEW.nome));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS consultores_propagar_nome ON consultores;
CREATE TRIGGER consultores_propagar_nome
  AFTER INSERT OR UPDATE OF nome ON consultores
  FOR EACH ROW EXECUTE FUNCTION consultores_propagar_nome();

-- Imóveis existentes: liga os que têm um nome que bate com um único consultor.
UPDATE imoveis i SET consultor_id = c.id
FROM consultores c
WHERE i.consultor_id IS NULL
  AND COALESCE(btrim(i.nome_consultor), '') <> ''
  AND lower(btrim(c.nome)) = lower(btrim(i.nome_consultor))
  AND (SELECT count(*) FROM consultores c2 WHERE lower(btrim(c2.nome)) = lower(btrim(i.nome_consultor))) = 1;
