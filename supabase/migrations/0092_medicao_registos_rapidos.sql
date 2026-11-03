-- Entrega 2 do Dashboard, fase 1: registos que faltavam para medir (03/11/2026).
-- Só acrescenta colunas e um gatilho; nada se apaga.

-- Escritura de venda: decisão do CEO, um negócio só está fechado com ela.
-- Texto AAAA-MM-DD, como data_compra e data_venda (DATE chegava ao ecrã com
-- o fuso aplicado e recuava um dia no verão).
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS data_escritura_venda TEXT;

-- Parte da Somnium (%) na quota do negócio. Sem valor, a contribuição da
-- Somnium (P05) fica por calcular. CAEP normal: 66,67 (2/3 da Somnium, 1/3
-- do Luís Pedro). Lages e Condeixa: 100% para a Somnium (decisões de 03/11).
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS parte_somnium_pct REAL;
UPDATE negocios SET parte_somnium_pct = 100
WHERE id IN ('50f119fa-d363-4ebd-aa8d-48f662d10205', '39b8df28-e767-4f67-b588-b7ccf93752af')
  AND parte_somnium_pct IS NULL;

-- Cumprimento de prazos das tarefas (C12). O prazo fica guardado na primeira
-- vez que existe, para que adiar não melhore o indicador. Enquanto a tarefa
-- está "Por aprovar", o prazo ainda é proposta e acompanha as alterações.
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prazo_original TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS concluida_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION tarefas_registo_prazo() RETURNS trigger AS $$
DECLARE
  prazo TEXT := COALESCE(NULLIF(trim(NEW.data_limite), ''), NULLIF(trim(NEW.inicio), ''));
BEGIN
  IF NEW.prazo_original IS NULL OR COALESCE(NEW.por_aprovar, false)
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.por_aprovar, false)) THEN
    NEW.prazo_original := COALESCE(prazo, NEW.prazo_original);
  END IF;
  IF NEW.status IN ('Concluída', 'Concluida') THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.concluida_em := COALESCE(NEW.concluida_em, now());
    END IF;
  ELSE
    NEW.concluida_em := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tarefas_registo_prazo ON tarefas;
CREATE TRIGGER tarefas_registo_prazo BEFORE INSERT OR UPDATE ON tarefas
FOR EACH ROW EXECUTE FUNCTION tarefas_registo_prazo();

-- Tarefas abertas com prazo de hoje em diante: esse prazo passa a contar como
-- o original. As já atrasadas e as concluídas ficam fora: as cumpridas antes
-- não têm data de conclusão, e contar só as falhadas enviesava o indicador.
UPDATE tarefas
SET prazo_original = COALESCE(NULLIF(trim(data_limite), ''), NULLIF(trim(inicio), ''))
WHERE status NOT IN ('Concluída', 'Concluida') AND prazo_original IS NULL
  AND COALESCE(NULLIF(trim(data_limite), ''), NULLIF(trim(inicio), '')) >= to_char(current_date, 'YYYY-MM-DD');
