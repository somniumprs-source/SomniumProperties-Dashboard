-- 0014_historico_user_nome.sql — adiciona user_nome a historico_alteracoes.
--
-- A equipa partilha a mesma sessao Supabase (somniumprs@gmail.com), por isso
-- so o email nao distingue quem fez a alteracao. O frontend envia X-User-Id
-- com o perfil activo (tabela users) e o backend injecta o nome no GUC
-- app.audit_user_nome antes da query. O trigger le e grava em historico_alteracoes.

ALTER TABLE historico_alteracoes ADD COLUMN IF NOT EXISTS user_nome TEXT;

CREATE INDEX IF NOT EXISTS idx_historico_nome ON historico_alteracoes (user_nome, created_at DESC);

-- Reescrever a funcao do trigger para incluir user_nome
CREATE OR REPLACE FUNCTION historico_alteracoes_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_user_email TEXT;
  v_user_nome TEXT;
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

  INSERT INTO historico_alteracoes (entidade, entidade_id, operacao, user_email, user_nome, alteracoes)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_user_email, v_user_nome, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
