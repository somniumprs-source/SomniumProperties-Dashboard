-- Aba "Documentos" do investidor passa a distinguir documentos enviados
-- (propostas, NDAs, dossiers) de documentos recebidos (identificacao,
-- comprovativos, contratos assinados). Default 'enviado' preserva os
-- registos existentes sem alterar o seu significado.
ALTER TABLE documentos_investidor ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'enviado';

DO $$ BEGIN
  ALTER TABLE documentos_investidor ADD CONSTRAINT documentos_investidor_direcao_check
    CHECK (direcao IN ('enviado', 'recebido'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
