-- Liga uma conversa (follow-up + gravacao) a um imovel especifico. A discovery
-- call e feita com intencao de um imovel concreto, por isso a conversa passa a
-- poder ser espelhada na ficha do imovel (seccao "Notas de Contacto"). Opcional:
-- follow-ups sem imovel_id continuam a aparecer so na ficha do consultor.
ALTER TABLE consultor_followups ADD COLUMN IF NOT EXISTS imovel_id TEXT;
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS imovel_id TEXT;
CREATE INDEX IF NOT EXISTS idx_followups_imovel ON consultor_followups(imovel_id);
CREATE INDEX IF NOT EXISTS idx_gravacoes_imovel ON consultor_gravacoes(imovel_id);
