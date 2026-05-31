-- 0013_audit_log.sql — historico de alteracoes em imoveis, investidores, negocios.
--
-- Captura INSERT/UPDATE/DELETE via trigger generico. Para cada UPDATE, regista
-- so os campos que mudaram (jsonb_diff). user_email vem de
-- current_setting('app.audit_user_email', true), injectado pelo backend antes
-- da query (ver src/db/audit.js + supabase/functions/_shared/audit.ts).
-- RLS: nao adicionamos politicas; o acesso e feito sempre pela Edge Function
-- (service-role -> BYPASSRLS) que valida admin via tabela users.

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  entidade TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  operacao TEXT NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  user_email TEXT,
  alteracoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON audit_log (entidade, entidade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Campos ignorados (ruido tecnico, nao interessam ao log)
CREATE OR REPLACE FUNCTION audit_log_ignored_fields() RETURNS TEXT[] AS $$
  SELECT ARRAY['updated_at','created_at','pois_atualizado_em','data_visita']::TEXT[];
$$ LANGUAGE SQL IMMUTABLE;

-- Trigger generico
CREATE OR REPLACE FUNCTION audit_log_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_user TEXT;
  v_old JSONB;
  v_new JSONB;
  v_diff JSONB := '[]'::jsonb;
  v_key TEXT;
  v_old_val JSONB;
  v_new_val JSONB;
  v_ignored TEXT[];
  v_id TEXT;
BEGIN
  v_user := NULLIF(current_setting('app.audit_user_email', true), '');
  v_ignored := audit_log_ignored_fields();

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_id := v_new->>'id';
    -- Para INSERT, regista snapshot inicial (campos nao-vazios)
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
    -- Se nada mudou (ex: UPDATE so a updated_at), nao regista
    IF jsonb_array_length(v_diff) = 0 THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_id := v_old->>'id';
    v_diff := jsonb_build_array(jsonb_build_object('campo', '__delete__', 'antes', v_old, 'depois', null));
  END IF;

  INSERT INTO audit_log (entidade, entidade_id, operacao, user_email, alteracoes)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, v_user, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers
DROP TRIGGER IF EXISTS audit_imoveis ON imoveis;
CREATE TRIGGER audit_imoveis
  AFTER INSERT OR UPDATE OR DELETE ON imoveis
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS audit_investidores ON investidores;
CREATE TRIGGER audit_investidores
  AFTER INSERT OR UPDATE OR DELETE ON investidores
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

DROP TRIGGER IF EXISTS audit_negocios ON negocios;
CREATE TRIGGER audit_negocios
  AFTER INSERT OR UPDATE OR DELETE ON negocios
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
