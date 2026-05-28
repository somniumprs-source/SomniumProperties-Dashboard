-- ============================================================
-- Migration 006 — Foreign keys (organizar schema / integridade)
--
--   Liga ~30 relacoes que existiam apenas como `text` solto.
--   O visualizador do Supabase passa a agrupar as tabelas pelos
--   pais (imoveis, negocios, investidores, consultores, users,
--   projeto_fases, projeto_fracoes, reunioes, scorecards).
--
--   ESTRATEGIA ZERO PERDA DE DADOS:
--     - Todas as FKs sao adicionadas como NOT VALID: nao fazem scan
--       das linhas existentes, nunca falham por orfaos e nunca apagam
--       nada. O visualizador desenha na mesma a relacao e todas as
--       ESCRITAS FUTURAS passam a ser validadas.
--     - Sem ON DELETE CASCADE. Colunas nullable -> SET NULL (apagar o
--       pai mantem o filho, so limpa o link). Colunas NOT NULL ->
--       NO ACTION (apagar o pai fica bloqueado se tiver filhos).
--     - Parte A normaliza '' -> NULL nas colunas FK nullable (resíduos
--       legados; cleanFormData ja faz isto nas escritas novas).
--
--   Para VALIDAR (confirmar integridade dos dados antigos) correr
--   depois 006b_validate_fks.sql, so nas relacoes que a auditoria
--   (scripts/audit-foreign-keys.mjs) mostrar limpas.
--
--   Idempotente: cada FK so e criada se ainda nao existir.
-- ============================================================

-- ── Parte A: normalizar '' -> NULL (colunas FK nullable) ─────
UPDATE negocios                SET imovel_id    = NULL WHERE imovel_id    = '';
UPDATE consultor_interacoes    SET imovel_id    = NULL WHERE imovel_id    = '';
UPDATE documentos_investidor   SET imovel_id    = NULL WHERE imovel_id    = '';
UPDATE projeto_assinaturas     SET investidor_id = NULL WHERE investidor_id = '';
UPDATE investidores            SET duplicado_de = NULL WHERE duplicado_de = '';
UPDATE investidores            SET user_id      = NULL WHERE user_id      = '';
UPDATE despesas                SET negocio_id   = NULL WHERE negocio_id   = '';
UPDATE despesas                SET fase_id      = NULL WHERE fase_id      = '';
UPDATE despesas                SET fracao_id    = NULL WHERE fracao_id    = '';
UPDATE investidor_acessos      SET negocio_id   = NULL WHERE negocio_id   = '';
UPDATE projeto_fases           SET fracao_id    = NULL WHERE fracao_id    = '';
UPDATE projeto_fotos           SET fracao_id    = NULL WHERE fracao_id    = '';
UPDATE scorecards              SET reuniao_id   = NULL WHERE reuniao_id   = '';
UPDATE classificacao_historico SET scorecard_id = NULL WHERE scorecard_id = '';

-- ── Parte B: adicionar FKs (NOT VALID, idempotente) ─────────

-- → imoveis(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'negocios'::regclass AND conname = 'negocios_imovel_id_fkey') THEN
    ALTER TABLE negocios ADD CONSTRAINT negocios_imovel_id_fkey
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'analises'::regclass AND conname = 'analises_imovel_id_fkey') THEN
    ALTER TABLE analises ADD CONSTRAINT analises_imovel_id_fkey
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'checklist_imovel'::regclass AND conname = 'checklist_imovel_imovel_id_fkey') THEN
    ALTER TABLE checklist_imovel ADD CONSTRAINT checklist_imovel_imovel_id_fkey
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'consultor_interacoes'::regclass AND conname = 'consultor_interacoes_imovel_id_fkey') THEN
    ALTER TABLE consultor_interacoes ADD CONSTRAINT consultor_interacoes_imovel_id_fkey
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'documentos_investidor'::regclass AND conname = 'documentos_investidor_imovel_id_fkey') THEN
    ALTER TABLE documentos_investidor ADD CONSTRAINT documentos_investidor_imovel_id_fkey
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- → investidores(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'scorecards'::regclass AND conname = 'scorecards_investidor_id_fkey') THEN
    ALTER TABLE scorecards ADD CONSTRAINT scorecards_investidor_id_fkey
      FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'classificacao_historico'::regclass AND conname = 'classificacao_historico_investidor_id_fkey') THEN
    ALTER TABLE classificacao_historico ADD CONSTRAINT classificacao_historico_investidor_id_fkey
      FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'documentos_investidor'::regclass AND conname = 'documentos_investidor_investidor_id_fkey') THEN
    ALTER TABLE documentos_investidor ADD CONSTRAINT documentos_investidor_investidor_id_fkey
      FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_assinaturas'::regclass AND conname = 'projeto_assinaturas_investidor_id_fkey') THEN
    ALTER TABLE projeto_assinaturas ADD CONSTRAINT projeto_assinaturas_investidor_id_fkey
      FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidores'::regclass AND conname = 'investidores_duplicado_de_fkey') THEN
    ALTER TABLE investidores ADD CONSTRAINT investidores_duplicado_de_fkey
      FOREIGN KEY (duplicado_de) REFERENCES investidores(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- → consultores(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'consultor_interacoes'::regclass AND conname = 'consultor_interacoes_consultor_id_fkey') THEN
    ALTER TABLE consultor_interacoes ADD CONSTRAINT consultor_interacoes_consultor_id_fkey
      FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'consultor_followups'::regclass AND conname = 'consultor_followups_consultor_id_fkey') THEN
    ALTER TABLE consultor_followups ADD CONSTRAINT consultor_followups_consultor_id_fkey
      FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
-- whatsapp_last_seen e estado efemero (so last_seen_at). NO ACTION por defeito;
-- se preferires que apagar um consultor limpe esta linha, troca para ON DELETE CASCADE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'whatsapp_last_seen'::regclass AND conname = 'whatsapp_last_seen_consultor_id_fkey') THEN
    ALTER TABLE whatsapp_last_seen ADD CONSTRAINT whatsapp_last_seen_consultor_id_fkey
      FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;

-- → negocios(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'despesas'::regclass AND conname = 'despesas_negocio_id_fkey') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_audit'::regclass AND conname = 'projeto_audit_negocio_id_fkey') THEN
    ALTER TABLE projeto_audit ADD CONSTRAINT projeto_audit_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_assinaturas'::regclass AND conname = 'projeto_assinaturas_negocio_id_fkey') THEN
    ALTER TABLE projeto_assinaturas ADD CONSTRAINT projeto_assinaturas_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_share_tokens'::regclass AND conname = 'projeto_share_tokens_negocio_id_fkey') THEN
    ALTER TABLE projeto_share_tokens ADD CONSTRAINT projeto_share_tokens_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_comentarios'::regclass AND conname = 'projeto_comentarios_negocio_id_fkey') THEN
    ALTER TABLE projeto_comentarios ADD CONSTRAINT projeto_comentarios_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_documentos'::regclass AND conname = 'projeto_documentos_negocio_id_fkey') THEN
    ALTER TABLE projeto_documentos ADD CONSTRAINT projeto_documentos_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_fotos'::regclass AND conname = 'projeto_fotos_negocio_id_fkey') THEN
    ALTER TABLE projeto_fotos ADD CONSTRAINT projeto_fotos_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidor_acessos'::regclass AND conname = 'investidor_acessos_negocio_id_fkey') THEN
    ALTER TABLE investidor_acessos ADD CONSTRAINT investidor_acessos_negocio_id_fkey
      FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- → users(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'notificacoes'::regclass AND conname = 'notificacoes_user_id_fkey') THEN
    ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidor_acessos'::regclass AND conname = 'investidor_acessos_user_id_fkey') THEN
    ALTER TABLE investidor_acessos ADD CONSTRAINT investidor_acessos_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidores'::regclass AND conname = 'investidores_user_id_fkey') THEN
    ALTER TABLE investidores ADD CONSTRAINT investidores_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- → projeto_fases(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'despesas'::regclass AND conname = 'despesas_fase_id_fkey') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_fase_id_fkey
      FOREIGN KEY (fase_id) REFERENCES projeto_fases(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- → projeto_fracoes(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'despesas'::regclass AND conname = 'despesas_fracao_id_fkey') THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_fracao_id_fkey
      FOREIGN KEY (fracao_id) REFERENCES projeto_fracoes(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_fases'::regclass AND conname = 'projeto_fases_fracao_id_fkey') THEN
    ALTER TABLE projeto_fases ADD CONSTRAINT projeto_fases_fracao_id_fkey
      FOREIGN KEY (fracao_id) REFERENCES projeto_fracoes(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_fotos'::regclass AND conname = 'projeto_fotos_fracao_id_fkey') THEN
    ALTER TABLE projeto_fotos ADD CONSTRAINT projeto_fotos_fracao_id_fkey
      FOREIGN KEY (fracao_id) REFERENCES projeto_fracoes(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- → reunioes(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'scorecards'::regclass AND conname = 'scorecards_reuniao_id_fkey') THEN
    ALTER TABLE scorecards ADD CONSTRAINT scorecards_reuniao_id_fkey
      FOREIGN KEY (reuniao_id) REFERENCES reunioes(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- → scorecards(id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'classificacao_historico'::regclass AND conname = 'classificacao_historico_scorecard_id_fkey') THEN
    ALTER TABLE classificacao_historico ADD CONSTRAINT classificacao_historico_scorecard_id_fkey
      FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
