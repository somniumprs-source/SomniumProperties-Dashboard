-- ============================================================
-- Migration 006b — Validar foreign keys (OPCIONAL, pos-auditoria)
--
--   As FKs da 006 foram criadas NOT VALID: enforcam escritas futuras
--   mas nao verificaram as linhas antigas. VALIDATE CONSTRAINT faz essa
--   verificacao agora. NUNCA apaga dados; apenas FALHA (sem alterar nada)
--   se existirem orfaos numa relacao.
--
--   COMO USAR:
--     1. Correr primeiro: node scripts/audit-foreign-keys.mjs
--     2. Correr abaixo SO as linhas das relacoes marcadas LIMPAS.
--        Deixar comentadas as relacoes COM ORFAOS ate decidires o que
--        fazer aos registos pendentes (corrigir o id ou pô-lo a NULL).
--
--   Cada VALIDATE e independente: podes correr uma a uma.
-- ============================================================

-- → imoveis(id)
ALTER TABLE negocios              VALIDATE CONSTRAINT negocios_imovel_id_fkey;
ALTER TABLE analises              VALIDATE CONSTRAINT analises_imovel_id_fkey;
ALTER TABLE checklist_imovel      VALIDATE CONSTRAINT checklist_imovel_imovel_id_fkey;
ALTER TABLE consultor_interacoes  VALIDATE CONSTRAINT consultor_interacoes_imovel_id_fkey;
ALTER TABLE documentos_investidor VALIDATE CONSTRAINT documentos_investidor_imovel_id_fkey;

-- → investidores(id)
ALTER TABLE scorecards              VALIDATE CONSTRAINT scorecards_investidor_id_fkey;
ALTER TABLE classificacao_historico VALIDATE CONSTRAINT classificacao_historico_investidor_id_fkey;
ALTER TABLE documentos_investidor   VALIDATE CONSTRAINT documentos_investidor_investidor_id_fkey;
ALTER TABLE projeto_assinaturas     VALIDATE CONSTRAINT projeto_assinaturas_investidor_id_fkey;
ALTER TABLE investidores            VALIDATE CONSTRAINT investidores_duplicado_de_fkey;

-- → consultores(id)
ALTER TABLE consultor_interacoes VALIDATE CONSTRAINT consultor_interacoes_consultor_id_fkey;
ALTER TABLE consultor_followups  VALIDATE CONSTRAINT consultor_followups_consultor_id_fkey;
ALTER TABLE whatsapp_last_seen   VALIDATE CONSTRAINT whatsapp_last_seen_consultor_id_fkey;

-- → negocios(id)
ALTER TABLE despesas             VALIDATE CONSTRAINT despesas_negocio_id_fkey;
ALTER TABLE projeto_audit        VALIDATE CONSTRAINT projeto_audit_negocio_id_fkey;
ALTER TABLE projeto_assinaturas  VALIDATE CONSTRAINT projeto_assinaturas_negocio_id_fkey;
ALTER TABLE projeto_share_tokens VALIDATE CONSTRAINT projeto_share_tokens_negocio_id_fkey;
ALTER TABLE projeto_comentarios  VALIDATE CONSTRAINT projeto_comentarios_negocio_id_fkey;
ALTER TABLE projeto_documentos   VALIDATE CONSTRAINT projeto_documentos_negocio_id_fkey;
ALTER TABLE projeto_fotos        VALIDATE CONSTRAINT projeto_fotos_negocio_id_fkey;
ALTER TABLE investidor_acessos   VALIDATE CONSTRAINT investidor_acessos_negocio_id_fkey;

-- → users(id)
ALTER TABLE notificacoes       VALIDATE CONSTRAINT notificacoes_user_id_fkey;
ALTER TABLE investidor_acessos VALIDATE CONSTRAINT investidor_acessos_user_id_fkey;
ALTER TABLE investidores       VALIDATE CONSTRAINT investidores_user_id_fkey;

-- → projeto_fases(id)
ALTER TABLE despesas VALIDATE CONSTRAINT despesas_fase_id_fkey;

-- → projeto_fracoes(id)
ALTER TABLE despesas      VALIDATE CONSTRAINT despesas_fracao_id_fkey;
ALTER TABLE projeto_fases VALIDATE CONSTRAINT projeto_fases_fracao_id_fkey;
ALTER TABLE projeto_fotos VALIDATE CONSTRAINT projeto_fotos_fracao_id_fkey;

-- → reunioes(id)
ALTER TABLE scorecards VALIDATE CONSTRAINT scorecards_reuniao_id_fkey;

-- → scorecards(id)
ALTER TABLE classificacao_historico VALIDATE CONSTRAINT classificacao_historico_scorecard_id_fkey;
