-- Chamadas gravadas e reuniões ligadas a um investidor contam como contacto.
--
-- Se há o áudio de uma chamada (investidor_gravacoes) ou uma reunião Fireflies/
-- manual (reunioes com entidade investidores), houve contacto. Os triggers criam
-- o contacto na linha do tempo (investidor_interacoes) e avançam
-- investidores.data_ultimo_contacto. Feito na BD para cobrir todos os caminhos
-- (Express dev, Edge Function, worker Whisper, sync Fireflies) sem duplicar lógica.
--
-- Regras:
--  - cada contacto automático fica ligado à origem por origem_ref
--    ('gravacao:<id>' / 'reuniao:<id>'); apagar a origem apaga o contacto;
--  - se já houver um contacto manual (Chamada/Reunião) nesse dia, não se cria
--    outro; se o manual for registado depois, o automático sai;
--  - registo da chamada "não atendeu"/"número errado" => resultado 'Sem sucesso';
--  - o contacto agendado (tarefa) NÃO é fechado: mantém-se até ser fechado à mão.

ALTER TABLE investidor_interacoes ADD COLUMN IF NOT EXISTS origem_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_interacoes_origem_ref ON investidor_interacoes(origem_ref);

-- Núcleo comum: cria/actualiza (ou remove) o contacto automático de uma origem.
CREATE OR REPLACE FUNCTION contacto_auto_investidor(
  p_ref TEXT, p_investidor TEXT, p_dia TEXT, p_canal TEXT, p_finalidade TEXT,
  p_resultado TEXT, p_notas TEXT, p_autor TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_investidor IS NULL OR p_dia IS NULL OR p_dia !~ '^\d{4}-\d{2}-\d{2}' THEN
    DELETE FROM investidor_interacoes WHERE origem_ref = p_ref;
    RETURN;
  END IF;
  p_dia := left(p_dia, 10);

  -- Já existe contacto manual dessa natureza nesse dia: não duplicar.
  IF EXISTS (
    SELECT 1 FROM investidor_interacoes
    WHERE investidor_id = p_investidor AND origem_ref IS NULL
      AND canal IN ('Chamada', 'Reunião') AND left(data_hora, 10) = p_dia
  ) THEN
    DELETE FROM investidor_interacoes WHERE origem_ref = p_ref;
    RETURN;
  END IF;

  INSERT INTO investidor_interacoes
    (id, investidor_id, data_hora, canal, direcao, finalidade, notas, resultado, autor, origem_ref, created_at, updated_at)
  VALUES
    (gen_random_uuid()::text, p_investidor, p_dia, p_canal, 'Enviado', p_finalidade, p_notas, p_resultado, p_autor, p_ref,
     now()::text, now()::text)
  ON CONFLICT (origem_ref) DO UPDATE SET
    investidor_id = EXCLUDED.investidor_id, data_hora = EXCLUDED.data_hora, canal = EXCLUDED.canal,
    finalidade = EXCLUDED.finalidade, notas = EXCLUDED.notas, resultado = EXCLUDED.resultado,
    autor = COALESCE(EXCLUDED.autor, investidor_interacoes.autor), updated_at = now()::text;

  IF p_resultado = 'Feito' THEN
    UPDATE investidores SET data_ultimo_contacto = p_dia
    WHERE id = p_investidor AND (data_ultimo_contacto IS NULL OR left(data_ultimo_contacto, 10) < p_dia);
  END IF;
END $$;

-- Chamadas gravadas (áudio na aba Reuniões do investidor).
CREATE OR REPLACE FUNCTION trg_contacto_auto_gravacao() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM investidor_interacoes WHERE origem_ref = 'gravacao:' || OLD.id;
    RETURN OLD;
  END IF;
  PERFORM contacto_auto_investidor(
    'gravacao:' || NEW.id, NEW.investidor_id, COALESCE(NEW.data_chamada, left(NEW.created_at, 10)),
    'Chamada', 'follow_up',
    CASE WHEN NEW.resultado IN ('nao_atendeu', 'numero_errado') THEN 'Sem sucesso' ELSE 'Feito' END,
    'Chamada gravada (' || CASE WHEN NEW.tipo_chamada = 'follow_up' THEN 'Follow-up' ELSE 'Cold Call' END
      || '). Áudio e análise na aba Reuniões.',
    NEW.realizada_por
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS contacto_auto_gravacao ON investidor_gravacoes;
CREATE TRIGGER contacto_auto_gravacao
  AFTER INSERT OR UPDATE OF investidor_id, data_chamada, resultado, tipo_chamada OR DELETE ON investidor_gravacoes
  FOR EACH ROW EXECUTE FUNCTION trg_contacto_auto_gravacao();

-- Reuniões (Fireflies ou manuais) ligadas a um investidor.
CREATE OR REPLACE FUNCTION trg_contacto_auto_reuniao() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM investidor_interacoes WHERE origem_ref = 'reuniao:' || OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.entidade_tipo IS DISTINCT FROM 'investidores' OR NEW.entidade_id IS NULL THEN
    DELETE FROM investidor_interacoes WHERE origem_ref = 'reuniao:' || NEW.id;
    RETURN NEW;
  END IF;
  PERFORM contacto_auto_investidor(
    'reuniao:' || NEW.id, NEW.entidade_id, NEW.data, 'Reunião', 'discovery', 'Feito',
    'Reunião gravada: ' || COALESCE(NEW.titulo, '') || '. Resumo na aba Reuniões.',
    NEW.organizador
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS contacto_auto_reuniao ON reunioes;
CREATE TRIGGER contacto_auto_reuniao
  AFTER INSERT OR UPDATE OF entidade_tipo, entidade_id, data, titulo OR DELETE ON reunioes
  FOR EACH ROW EXECUTE FUNCTION trg_contacto_auto_reuniao();

-- Contacto manual registado depois do automático no mesmo dia: fica só o manual.
CREATE OR REPLACE FUNCTION trg_contacto_manual_substitui_auto() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origem_ref IS NULL AND NEW.canal IN ('Chamada', 'Reunião') AND NEW.data_hora ~ '^\d{4}-\d{2}-\d{2}' THEN
    DELETE FROM investidor_interacoes
    WHERE investidor_id = NEW.investidor_id AND origem_ref IS NOT NULL
      AND left(data_hora, 10) = left(NEW.data_hora, 10);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS contacto_manual_substitui_auto ON investidor_interacoes;
CREATE TRIGGER contacto_manual_substitui_auto
  AFTER INSERT ON investidor_interacoes
  FOR EACH ROW EXECUTE FUNCTION trg_contacto_manual_substitui_auto();

-- Retroactivo: chamadas e reuniões já existentes.
SELECT contacto_auto_investidor(
  'gravacao:' || g.id, g.investidor_id, COALESCE(g.data_chamada, left(g.created_at, 10)),
  'Chamada', 'follow_up',
  CASE WHEN g.resultado IN ('nao_atendeu', 'numero_errado') THEN 'Sem sucesso' ELSE 'Feito' END,
  'Chamada gravada (' || CASE WHEN g.tipo_chamada = 'follow_up' THEN 'Follow-up' ELSE 'Cold Call' END
    || '). Áudio e análise na aba Reuniões.',
  g.realizada_por)
FROM investidor_gravacoes g JOIN investidores i ON i.id = g.investidor_id;

SELECT contacto_auto_investidor(
  'reuniao:' || r.id, r.entidade_id, r.data, 'Reunião', 'discovery', 'Feito',
  'Reunião gravada: ' || COALESCE(r.titulo, '') || '. Resumo na aba Reuniões.',
  r.organizador)
FROM reunioes r JOIN investidores i ON i.id = r.entidade_id
WHERE r.entidade_tipo = 'investidores';
