-- Contactos com consultores: finalidade (Follow Up / Discovery), como já
-- existia nos investidores, para um registo poder ser "Follow Up" e ter
-- imóveis falados ao mesmo tempo. Registos antigos ficam a NULL.
ALTER TABLE consultor_interacoes ADD COLUMN IF NOT EXISTS finalidade TEXT;

-- Reverte a 0087: o follow-up regista-se no contacto, não no registo SOP 2.
ALTER TABLE consultor_gravacoes DROP COLUMN IF EXISTS fu_follow_up;
