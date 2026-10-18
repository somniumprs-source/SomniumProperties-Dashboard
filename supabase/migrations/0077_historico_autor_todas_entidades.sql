-- 0077_historico_autor_todas_entidades.sql — saber quem fez o quê (auditoria D1).
--
-- 1. historico_alteracoes passa a guardar o id do utilizador (users.id), além
--    do email e do nome. A equipa partilha uma sessão: o email não distingue
--    ninguém, o id do perfil escolhido distingue.
-- 2. Escritas sem autor (crons, sincronizações, webhooks) ficam como «Sistema».
--    Desde esta migração o servidor recusa escritas humanas sem perfil, por
--    isso uma linha sem pessoa é sempre do sistema.
-- 3. O histórico passa a cobrir as restantes entidades de negócio (antes só
--    imóveis, investidores e negócios).
-- 4. Campos calculados ou de sincronização deixam de gerar registos.
--
-- O backend envia app.audit_user_id junto com o email e o nome
-- (src/db/audit.js + supabase/functions/_shared/audit.ts).

ALTER TABLE historico_alteracoes ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_historico_user_id ON historico_alteracoes (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION historico_ignored_fields() RETURNS TEXT[] AS $$
  SELECT ARRAY[
    'updated_at', 'created_at', 'pois_atualizado_em', 'data_visita',
    -- sincronizações externas
    'synced_at', 'gcal_synced_at',
    -- valores calculados pela plataforma
    'pontuacao', 'score_prioridade', 'taxa_qualidade', 'tempo_medio_resposta', 'perc_execucao'
  ]::TEXT[];
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION historico_alteracoes_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_user_email TEXT;
  v_user_nome TEXT;
  v_user_id TEXT;
  v_old JSONB;
  v_new JSONB;
  v_diff JSONB := '[]'::jsonb;
  v_key TEXT;
  v_old_val JSONB;
  v_new_val JSONB;
  v_ignored TEXT[];
  v_id TEXT;
BEGIN
  v_user_email := NULLIF(current_setting('app.audit_user_email', true), '');
  v_user_nome := NULLIF(current_setting('app.audit_user_nome', true), '');
  v_user_id := NULLIF(current_setting('app.audit_user_id', true), '');
  IF v_user_email IS NULL AND v_user_nome IS NULL AND v_user_id IS NULL THEN
    v_user_nome := 'Sistema';
  END IF;
  v_ignored := historico_ignored_fields();

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_id := v_new->>'id';
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key = ANY(v_ignored) THEN CONTINUE; END IF;
      v_new_val := v_new->v_key;
      IF v_new_val IS NULL OR v_new_val = 'null'::jsonb OR v_new_val = '""'::jsonb THEN CONTINUE; END IF;
      v_diff := v_diff || jsonb_build_object('campo', v_key, 'antes', null, 'depois', v_new_val);
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_id := v_new->>'id';
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key = ANY(v_ignored) THEN CONTINUE; END IF;
      v_old_val := v_old->v_key;
      v_new_val := v_new->v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_diff := v_diff || jsonb_build_object('campo', v_key, 'antes', v_old_val, 'depois', v_new_val);
      END IF;
    END LOOP;
    IF jsonb_array_length(v_diff) = 0 THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_id := v_old->>'id';
    v_diff := jsonb_build_array(jsonb_build_object('campo', '__delete__', 'antes', v_old, 'depois', null));
  END IF;

  INSERT INTO historico_alteracoes (entidade, entidade_id, operacao, user_email, user_nome, user_id, alteracoes)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_user_email, v_user_nome, v_user_id, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Entidades auditadas. Manter em sync com TABELAS_AUDITADAS em
-- src/db/audit.js e supabase/functions/_shared/audit.ts.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'imoveis', 'investidores', 'negocios',
    'consultores', 'parceiros', 'empreiteiros',
    'despesas', 'tarefas', 'visitas', 'analises', 'orcamentos_obra',
    'projeto_fases', 'projeto_tarefas', 'projeto_investidores', 'projeto_documentos', 'projeto_fracoes',
    'documentos_investidor', 'consultor_documentos',
    'imovel_follow_ups', 'consultor_followups',
    'investidor_interacoes', 'consultor_interacoes', 'parceiro_interacoes',
    'users', 'acessos'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS historico_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER historico_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION historico_alteracoes_trigger()', t);
    END IF;
  END LOOP;
END $$;
