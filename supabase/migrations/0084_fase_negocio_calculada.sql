-- Auditoria D6: a fase antiga do projeto (negocios.fase: «Fase de obras»,
-- «Fase de venda», «Vendido»), que os Dashboards usam para negócio fechado e
-- receita realizada, passa a ser calculada a partir das fases do projeto.
--
-- • Vendido: a fase de fecho do modelo está concluída (em todas as frações).
--   Wholesaling = CPCV de Cedência; Mediação = Escritura;
--   Consultoria = Fecho e Faturação; Fix and Flip e CAEP = Vendido.
--   A data de venda, se vazia, fica com a data de fim dessa fase; sem ela, no
--   Wholesaling, com a data de compra (a cedência faz-se na escritura). Sem
--   nenhuma das duas fica vazia (não se inventa).
-- • Fase de venda: Wholesaling e Mediação até ao fecho; Fix and Flip e CAEP
--   quando a primeira fase por concluir é a Comercialização ou o Vendido.
-- • Fase de obras: o resto.
-- Projetos sem fases ficam como estão.

CREATE OR REPLACE FUNCTION fase_calculada_negocio(p_negocio TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  cat TEXT;
  fecho TEXT;
  atual TEXT;
BEGIN
  SELECT categoria INTO cat FROM negocios WHERE id = p_negocio;
  IF NOT EXISTS (SELECT 1 FROM projeto_fases WHERE negocio_id = p_negocio) THEN
    RETURN NULL;
  END IF;
  fecho := CASE cat
    WHEN 'Wholesaling' THEN 'cpcv_cedencia'
    WHEN 'Mediação Imobiliária' THEN 'escritura'
    WHEN 'Consultoria/Assessoria' THEN 'cons_fecho'
    ELSE 'vendido'
  END;
  IF EXISTS (SELECT 1 FROM projeto_fases WHERE negocio_id = p_negocio AND fase_key = fecho)
     AND NOT EXISTS (SELECT 1 FROM projeto_fases WHERE negocio_id = p_negocio AND fase_key = fecho AND estado <> 'concluida') THEN
    RETURN 'Vendido';
  END IF;
  IF cat IN ('Wholesaling', 'Mediação Imobiliária') THEN
    RETURN 'Fase de venda';
  END IF;
  SELECT fase_key INTO atual FROM projeto_fases
   WHERE negocio_id = p_negocio AND estado <> 'concluida'
   ORDER BY ordem LIMIT 1;
  IF atual IN ('comercializacao', 'vendido') THEN
    RETURN 'Fase de venda';
  END IF;
  RETURN 'Fase de obras';
END $$;

CREATE OR REPLACE FUNCTION acertar_fase_negocio(p_negocio TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  nova TEXT := fase_calculada_negocio(p_negocio);
  fim TEXT;
BEGIN
  IF nova IS NULL THEN RETURN; END IF;
  IF nova = 'Vendido' THEN
    SELECT LEFT(MAX(data_fim_real::text), 10) INTO fim FROM projeto_fases
     WHERE negocio_id = p_negocio AND estado = 'concluida'
       AND fase_key IN ('cpcv_cedencia', 'escritura', 'cons_fecho', 'vendido');
  END IF;
  UPDATE negocios
     SET fase = nova,
         data_venda = CASE WHEN nova = 'Vendido' AND COALESCE(data_venda, '') = ''
                           THEN COALESCE(fim, CASE WHEN categoria = 'Wholesaling' THEN NULLIF(data_compra, '') END)
                           ELSE data_venda END,
         updated_at = NOW()
   WHERE id = p_negocio AND fase IS DISTINCT FROM nova;
END $$;

CREATE OR REPLACE FUNCTION trg_fase_negocio() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM acertar_fase_negocio(COALESCE(NEW.negocio_id, OLD.negocio_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS fase_negocio_calculada ON projeto_fases;
CREATE TRIGGER fase_negocio_calculada
  AFTER INSERT OR DELETE OR UPDATE OF estado, fase_key, ordem ON projeto_fases
  FOR EACH ROW EXECUTE FUNCTION trg_fase_negocio();

-- Acertar os projetos que já existem.
SELECT acertar_fase_negocio(id) FROM negocios WHERE deleted_at IS NULL;
