-- Registo de Chamada: marcar a chamada como follow-up ao consultor (5.ª fase,
-- ao lado de Cold/Discovery/Close/Pivot). O imóvel falado usa a coluna
-- imovel_id que já existia.
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS fu_follow_up BOOLEAN;
